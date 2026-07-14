"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureUser } from "@/lib/auth-guard";
import type { ApprovalRow, ApprovalStepRow } from "@/lib/supabase/database.types";

export interface Result {
  ok: boolean;
  error?: string;
  id?: string;
}

const num = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export interface ApprovalInput {
  company_id: string | null;
  doc_type: string;
  title: string;
  amount?: string | number | null;
  content?: string | null;
  approverIds: string[];
}

/** 결재 상신 — 문서 + 결재선(순차) 생성. */
export async function createApproval(input: ApprovalInput): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  if (!input.title.trim()) return { ok: false, error: "제목을 입력하세요" };
  const approvers = input.approverIds.filter(Boolean);
  if (approvers.length === 0) return { ok: false, error: "결재자를 1명 이상 지정하세요" };

  const db = createAdminClient();
  const { data: profs } = await db.from("profiles").select("id, username, email").in("id", approvers);
  const nameOf = new Map(
    ((profs ?? []) as { id: string; username: string | null; email: string | null }[]).map((p) => [p.id, p.username ?? p.email ?? "결재자"])
  );

  const { data: appr, error } = await db.from("approvals").insert({
    company_id: input.company_id ?? null,
    doc_type: input.doc_type || "GENERAL",
    title: input.title.trim(),
    amount: num(input.amount),
    content: input.content?.trim() || null,
    requester_id: g.profile!.id,
    requester_name: g.profile!.username ?? g.profile!.email ?? "요청자",
    status: "PENDING",
    current_step: 1,
  } as never).select("id").single();
  if (error) return { ok: false, error: error.message };
  const apprId = (appr as { id: string }).id;

  const steps = approvers.map((aid, i) => ({
    approval_id: apprId,
    step_order: i + 1,
    approver_id: aid,
    approver_name: nameOf.get(aid) ?? "결재자",
    status: "WAITING",
  }));
  const { error: sErr } = await db.from("approval_steps").insert(steps as never[]);
  if (sErr) {
    await db.from("approvals").delete().eq("id", apprId); // 롤백
    return { ok: false, error: sErr.message };
  }
  revalidatePath("/approvals");
  return { ok: true, id: apprId };
}

/** 현재 단계 결재자가 승인/반려. */
/** 내 결재 대기 문서 일괄 승인. 각 건 actOnApproval 재사용(내 차례 아닌 건 자동 실패→건너뜀). */
export async function bulkApproveApprovals(ids: string[]): Promise<Result & { count?: number }> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  let count = 0;
  let firstErr: string | null = null;
  for (const id of ids) {
    const r = await actOnApproval(id, "APPROVE", "");
    if (!r.ok) { if (!firstErr) firstErr = r.error ?? null; continue; }
    count++;
  }
  if (count === 0 && firstErr) return { ok: false, error: firstErr };
  return { ok: true, count };
}

export async function actOnApproval(approvalId: string, decision: "APPROVE" | "REJECT", comment?: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();

  const { data: aData } = await db.from("approvals").select("*").eq("id", approvalId).maybeSingle();
  const appr = aData as ApprovalRow | null;
  if (!appr) return { ok: false, error: "결재 문서를 찾을 수 없습니다" };
  if (appr.status !== "PENDING") return { ok: false, error: "이미 종결된 결재입니다" };

  const { data: sData } = await db
    .from("approval_steps")
    .select("*")
    .eq("approval_id", approvalId)
    .eq("step_order", appr.current_step)
    .maybeSingle();
  const step = sData as ApprovalStepRow | null;
  if (!step) return { ok: false, error: "현재 결재 단계를 찾을 수 없습니다" };
  if (step.approver_id !== g.profile!.id) return { ok: false, error: "현재 결재 차례가 아닙니다" };

  const now = new Date().toISOString();
  const c = comment?.trim() || null;

  if (decision === "REJECT") {
    await db.from("approval_steps").update({ status: "REJECTED", comment: c, acted_at: now } as never).eq("id", step.id);
    await db.from("approvals").update({ status: "REJECTED", updated_at: now } as never).eq("id", approvalId);
    revalidatePath("/approvals");
    return { ok: true };
  }

  await db.from("approval_steps").update({ status: "APPROVED", comment: c, acted_at: now } as never).eq("id", step.id);
  const { data: maxData } = await db
    .from("approval_steps")
    .select("step_order")
    .eq("approval_id", approvalId)
    .order("step_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const maxStep = (maxData as { step_order: number } | null)?.step_order ?? appr.current_step;
  if (appr.current_step >= maxStep) {
    await db.from("approvals").update({ status: "APPROVED", updated_at: now } as never).eq("id", approvalId);
  } else {
    await db.from("approvals").update({ current_step: appr.current_step + 1, updated_at: now } as never).eq("id", approvalId);
  }
  revalidatePath("/approvals");
  return { ok: true };
}

/** 상신자(또는 관리자)가 진행 중 결재를 취소(회수). */
export async function cancelApproval(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { data } = await db.from("approvals").select("requester_id, status").eq("id", id).maybeSingle();
  const appr = data as { requester_id: string | null; status: string } | null;
  if (!appr) return { ok: false, error: "문서를 찾을 수 없습니다" };
  if (appr.status !== "PENDING") return { ok: false, error: "진행 중인 결재만 회수할 수 있습니다" };
  if (appr.requester_id !== g.profile!.id && g.profile!.role !== "ADMIN") return { ok: false, error: "본인 상신 문서만 회수할 수 있습니다" };
  await db.from("approvals").update({ status: "CANCELED", updated_at: new Date().toISOString() } as never).eq("id", id);
  revalidatePath("/approvals");
  return { ok: true };
}

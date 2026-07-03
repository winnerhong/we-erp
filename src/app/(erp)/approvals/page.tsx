import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureUser } from "@/lib/auth-guard";
import { getCompanyContext, ALL_COMPANIES } from "@/lib/active-company";
import { ApprovalsClient } from "./approvals-client";
import type { ApprovalRow, ApprovalStepRow } from "@/lib/supabase/database.types";

export const metadata = { title: "전자결재" };

export default async function ApprovalsPage() {
  const g = await ensureUser();
  if (g.error) redirect("/");

  const supabase = await createClient();
  const ctx = await getCompanyContext();
  const activeCompanyId = ctx.activeId === ALL_COMPANIES ? null : ctx.activeId;

  // 활성 사업자로 스코프(공용=company_id null 포함). 전체보기면 전부.
  let apprQ = supabase.from("approvals").select("*").order("created_at", { ascending: false }).limit(300);
  if (activeCompanyId) apprQ = apprQ.or(`company_id.eq.${activeCompanyId},company_id.is.null`);
  const [{ data: apprData, error }, { data: profData }] = await Promise.all([
    apprQ,
    supabase.from("profiles").select("id, username, email, role").eq("is_active", true).order("username"),
  ]);
  if (error) {
    return (
      <p className="text-sm text-amber-700">
        전자결재를 불러오지 못했습니다. 마이그레이션(20260730_approvals) 적용 여부를 확인하세요: {error.message}
      </p>
    );
  }
  const approvals = (apprData ?? []) as ApprovalRow[];

  const ids = approvals.map((a) => a.id);
  const { data: stepData } = ids.length
    ? await supabase.from("approval_steps").select("*").in("approval_id", ids).order("step_order")
    : { data: [] as ApprovalStepRow[] };
  const stepsByApproval: Record<string, ApprovalStepRow[]> = {};
  for (const s of (stepData ?? []) as ApprovalStepRow[]) (stepsByApproval[s.approval_id] ??= []).push(s);

  const users = ((profData ?? []) as { id: string; username: string | null; email: string | null; role: string }[]).map((u) => ({
    id: u.id,
    name: u.username ?? u.email ?? "사용자",
    role: u.role,
  }));

  return (
    <ApprovalsClient
      approvals={approvals}
      stepsByApproval={stepsByApproval}
      users={users}
      meId={g.profile!.id}
      activeCompanyId={activeCompanyId}
    />
  );
}

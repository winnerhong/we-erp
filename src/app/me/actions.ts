"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureSelf } from "@/lib/auth-guard";
import type { LeaveType } from "@/lib/supabase/database.types";

export interface Result {
  ok: boolean;
  error?: string;
}

/** 본인 휴가 신청(PENDING 으로 생성 → 관리자 승인). */
export async function requestLeave(input: {
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
}): Promise<Result> {
  const g = await ensureSelf();
  if (g.error) return { ok: false, error: g.error };
  const emp = g.employee!;
  if (!emp.company_id) return { ok: false, error: "소속 사업자가 지정되지 않았습니다. 관리자에게 문의하세요." };
  if (!input.start_date || !input.end_date) return { ok: false, error: "기간을 입력하세요." };

  const db = createAdminClient();
  const { error } = await db.from("leave_requests").insert({
    company_id: emp.company_id,
    employee_id: emp.id,
    leave_type: input.leave_type,
    start_date: input.start_date,
    end_date: input.end_date,
    days: input.days,
    reason: input.reason,
    status: "PENDING",
  } as never);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/me");
  return { ok: true };
}

/** 본인의 '대기중' 휴가만 취소(삭제). */
export async function cancelMyLeave(id: string): Promise<Result> {
  const g = await ensureSelf();
  if (g.error) return { ok: false, error: g.error };
  const emp = g.employee!;
  const db = createAdminClient();
  const { data: row } = await db
    .from("leave_requests")
    .select("employee_id, status")
    .eq("id", id)
    .maybeSingle();
  const lv = row as { employee_id: string; status: string } | null;
  if (!lv || lv.employee_id !== emp.id) return { ok: false, error: "본인 휴가만 취소할 수 있습니다." };
  if (lv.status !== "PENDING") return { ok: false, error: "이미 처리된 휴가는 취소할 수 없습니다." };
  const { error } = await db.from("leave_requests").delete().eq("id", id).eq("employee_id", emp.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/me");
  return { ok: true };
}

/** 본인 연락 정보·계좌만 수정(화이트리스트 필드). */
const MY_EDITABLE = [
  "phone",
  "email",
  "address",
  "emergency_contact",
  "emergency_relation",
  "bank_name",
  "account_number",
  "account_holder",
] as const;

export async function updateMyInfo(patch: Record<string, string | null>): Promise<Result> {
  const g = await ensureSelf();
  if (g.error) return { ok: false, error: g.error };
  const emp = g.employee!;
  const clean: Record<string, string | null> = {};
  for (const k of MY_EDITABLE) {
    if (k in patch) clean[k] = (patch[k] ?? "").toString().trim() || null;
  }
  if (Object.keys(clean).length === 0) return { ok: true };
  const db = createAdminClient();
  const { error } = await db.from("employees").update(clean as never).eq("id", emp.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/me");
  return { ok: true };
}

/** 본인 재직증명서 발급(발급번호 자동). */
export async function issueMyCertificate(input: {
  purpose?: string | null;
  submit_to?: string | null;
  department?: string | null;
  position?: string | null;
}): Promise<Result> {
  const g = await ensureSelf();
  if (g.error) return { ok: false, error: g.error };
  const emp = g.employee!;
  if (!emp.company_id) return { ok: false, error: "소속 사업자가 지정되지 않았습니다. 관리자에게 문의하세요." };

  const db = createAdminClient();
  const year = new Date().getFullYear();
  const { count } = await db
    .from("employment_certificates")
    .select("*", { count: "exact", head: true })
    .eq("company_id", emp.company_id)
    .gte("issued_on", `${year}-01-01`)
    .lte("issued_on", `${year}-12-31`);
  const certNo = `${year}-${String((count ?? 0) + 1).padStart(3, "0")}`;

  const { error } = await db.from("employment_certificates").insert({
    company_id: emp.company_id,
    employee_id: emp.id,
    cert_no: certNo,
    employee_name: emp.name,
    birth: emp.birth ?? null,
    address: emp.address ?? null,
    department: input.department ?? null,
    position: input.position ?? null,
    employment_type: emp.employment_type ?? null,
    hired_on: emp.hired_on ?? null,
    purpose: input.purpose ?? null,
    submit_to: input.submit_to ?? null,
  } as never);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/me");
  return { ok: true };
}

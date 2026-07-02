"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { estimateInsurance, computeNet } from "@/lib/payroll";
import { ensureUser } from "@/lib/auth-guard";
import type {
  LeaveRequestRow,
  LeaveStatus,
  EmployeeRow,
  LaborContractRow,
  EmployeeDocumentRow,
  EmployeeEventRow,
} from "@/lib/supabase/database.types";

export interface Result {
  ok: boolean;
  error?: string;
}

// ---------- 재직증명서 ----------
export interface NewCertificate {
  company_id: string;
  employee_id: string | null;
  employee_name: string;
  birth?: string | null;
  address?: string | null;
  department?: string | null;
  position?: string | null;
  employment_type?: string | null;
  hired_on?: string | null;
  purpose?: string | null;
  submit_to?: string | null;
}

/** 재직증명서 발급. 발급번호는 사업자·연도별 일련번호 자동 부여. */
export async function createCertificate(v: NewCertificate): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  if (!v.company_id) return { ok: false, error: "소속 사업자가 없는 직원입니다. 직원 화면에서 소속을 지정하세요." };

  const supabase = await createClient();
  const year = new Date().getFullYear();
  // 해당 사업자·올해 발급 건수 → 다음 일련번호
  const { count } = await supabase
    .from("employment_certificates")
    .select("*", { count: "exact", head: true })
    .eq("company_id", v.company_id)
    .gte("issued_on", `${year}-01-01`)
    .lte("issued_on", `${year}-12-31`);
  const certNo = `${year}-${String((count ?? 0) + 1).padStart(3, "0")}`;

  const db = createAdminClient();
  const { error } = await db.from("employment_certificates").insert({
    company_id: v.company_id,
    employee_id: v.employee_id,
    cert_no: certNo,
    employee_name: v.employee_name,
    birth: v.birth ?? null,
    address: v.address ?? null,
    department: v.department ?? null,
    position: v.position ?? null,
    employment_type: v.employment_type ?? null,
    hired_on: v.hired_on ?? null,
    purpose: v.purpose ?? null,
    submit_to: v.submit_to ?? null,
  } as never);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/hr");
  return { ok: true };
}

export async function deleteCertificate(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("employment_certificates").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/hr");
  return { ok: true };
}

// ---------- 휴가 ----------
export async function createLeave(
  v: Partial<LeaveRequestRow> & {
    company_id: string;
    employee_id: string;
    start_date: string;
    end_date: string;
  }
): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("leave_requests").insert(v as never);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/hr");
  return { ok: true };
}

export async function reviewLeave(id: string, status: LeaveStatus): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("leave_requests").update({ status } as never).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/hr");
  return { ok: true };
}

export async function deleteLeave(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("leave_requests").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/hr");
  return { ok: true };
}

// ---------- 급여 ----------
type PayrollInput = {
  base_pay: number;
  allowance: number;
  nontax_allowance: number;
  income_tax: number;
  insurance: number;
  other_deduction: number;
  memo?: string | null;
  nontax_items?: Record<string, number> | null; // 비과세 항목별 금액(있으면 비과세수당=합계)
};

/** 급여 단건 저장(생성/수정). 실지급액은 서버에서 재계산. 비과세 항목이 오면 비과세수당=합계. */
export async function savePayroll(
  companyId: string,
  employeeId: string,
  yearMonth: string,
  input: PayrollInput
): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };

  const { nontax_items, ...rest } = input;
  // 비과세 항목이 주어지면 0 초과 항목만 보관하고, 비과세수당은 그 합계로 강제
  const items =
    nontax_items != null
      ? Object.fromEntries(Object.entries(nontax_items).filter(([, v]) => Number(v) > 0))
      : null;
  const resolved: PayrollInput = items
    ? { ...rest, nontax_allowance: Object.values(items).reduce((s, v) => s + Number(v), 0) }
    : rest;
  const net = computeNet(resolved);

  const db = createAdminClient();
  const base = {
    company_id: companyId,
    employee_id: employeeId,
    year_month: yearMonth,
    ...resolved,
    memo: resolved.memo ?? null,
    net_pay: net,
  };
  const payload = items != null ? { ...base, nontax_items: items } : base;

  let { error } = await db.from("payrolls").upsert(payload as never, { onConflict: "employee_id,year_month" });
  // nontax_items 컬럼 마이그레이션 미적용 시 폴백
  if (error && /nontax_items/.test(error.message)) {
    ({ error } = await db.from("payrolls").upsert(base as never, { onConflict: "employee_id,year_month" }));
  }
  if (error) return { ok: false, error: error.message };
  revalidatePath("/hr");
  return { ok: true };
}

export async function deletePayroll(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("payrolls").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/hr");
  return { ok: true };
}

/** 해당 월 급여대장 자동 생성 — 아직 없는 직원만 기본급·4대보험 추정으로 생성. */
export async function generatePayrolls(
  companyId: string,
  yearMonth: string
): Promise<{ ok: boolean; created: number; error?: string }> {
  const g = await ensureUser();
  if (g.error) return { ok: false, created: 0, error: g.error };
  const supabase = await createClient();
  const [{ data: emps }, { data: existing }] = await Promise.all([
    supabase.from("employees").select("*").eq("company_id", companyId).eq("is_active", true),
    supabase.from("payrolls").select("employee_id").eq("company_id", companyId).eq("year_month", yearMonth),
  ]);
  const employees = (emps ?? []) as EmployeeRow[];
  const have = new Set(((existing ?? []) as { employee_id: string }[]).map((p) => p.employee_id));

  // 시급제 자동계산용: 그 달 근태 실근무시간(분) 합계
  const empIds = employees.map((e) => e.id);
  const workMin = new Map<string, number>();
  if (empIds.length > 0) {
    const { data: att } = await supabase
      .from("attendance")
      .select("employee_id, work_minutes")
      .in("employee_id", empIds)
      .gte("work_date", `${yearMonth}-01`)
      .lte("work_date", `${yearMonth}-31`);
    for (const a of (att ?? []) as { employee_id: string; work_minutes: number | null }[])
      workMin.set(a.employee_id, (workMin.get(a.employee_id) ?? 0) + (a.work_minutes ?? 0));
  }

  const rows = employees
    .filter((e) => !have.has(e.id))
    .map((e) => {
      // 시급제: 근태 실근무시간 × 시급. 그 외: 기본급(시급제 근태 없으면 0 → 검수에서 입력)
      const base =
        e.employment_type === "HOURLY" && e.hourly_wage
          ? Math.round((e.hourly_wage * (workMin.get(e.id) ?? 0)) / 60)
          : e.base_salary ?? 0;
      const insurance = estimateInsurance(base).total;
      return {
        company_id: companyId,
        employee_id: e.id,
        year_month: yearMonth,
        base_pay: base,
        allowance: 0,
        nontax_allowance: 0,
        income_tax: 0,
        insurance,
        other_deduction: 0,
        net_pay: computeNet({
          base_pay: base,
          allowance: 0,
          nontax_allowance: 0,
          income_tax: 0,
          insurance,
          other_deduction: 0,
        }),
      };
    });

  if (rows.length === 0) return { ok: true, created: 0 };
  const db = createAdminClient();
  const { error } = await db.from("payrolls").insert(rows as never[]);
  if (error) return { ok: false, created: 0, error: error.message };
  revalidatePath("/hr");
  return { ok: true, created: rows.length };
}

// ---------- 근로계약서 ----------
export async function createContract(v: Partial<LaborContractRow> & { employee_id: string }): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("labor_contracts").insert(v as never);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/employees");
  return { ok: true };
}

export async function deleteContract(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("labor_contracts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/employees");
  return { ok: true };
}

// ---------- 직원 서류함 ----------
export async function createDocument(v: Partial<EmployeeDocumentRow> & { employee_id: string }): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("employee_documents").insert(v as never);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/employees");
  return { ok: true };
}

export async function deleteDocument(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("employee_documents").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/employees");
  return { ok: true };
}

// ---------- 인사 발령/변동 이력 ----------
export async function createEvent(v: Partial<EmployeeEventRow> & { employee_id: string }): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("employee_events").insert(v as never);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/employees");
  return { ok: true };
}

export async function deleteEvent(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("employee_events").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/employees");
  return { ok: true };
}

/** 퇴사 처리 — 상태·비활성·퇴사일·사유 저장 + 인사이력 자동 기록. */
export async function resignEmployee(employeeId: string, resignedOn: string | null, reason: string | null): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const date = resignedOn || new Date().toISOString().slice(0, 10);
  const { error } = await db.from("employees").update({
    status: "퇴사",
    is_active: false,
    resigned_on: date,
    resign_reason: reason?.trim() || null,
  } as never).eq("id", employeeId);
  if (error) return { ok: false, error: error.message };
  await db.from("employee_events").insert({
    employee_id: employeeId, event_date: date, event_type: "퇴사",
    title: "퇴사 처리", detail: reason?.trim() || null,
  } as never);
  revalidatePath("/employees");
  revalidatePath("/");
  return { ok: true };
}

/** 복직/재입사 — 재직 복귀 + 퇴사정보 해제 + 인사이력 기록. */
export async function reinstateEmployee(employeeId: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await db.from("employees").update({
    status: "재직",
    is_active: true,
    resigned_on: null,
    resign_reason: null,
  } as never).eq("id", employeeId);
  if (error) return { ok: false, error: error.message };
  await db.from("employee_events").insert({
    employee_id: employeeId, event_date: today, event_type: "복직",
    title: "복직/재입사", detail: null,
  } as never);
  revalidatePath("/employees");
  revalidatePath("/");
  return { ok: true };
}

/** 직원 메모 로그 추가(누적). 작성자·시각 기록. */
export async function addEmployeeMemo(employeeId: string, body: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const text = body.trim();
  if (!text) return { ok: false, error: "메모를 입력하세요" };
  const db = createAdminClient();
  const { error } = await db.from("employee_memos").insert({
    employee_id: employeeId,
    body: text,
    author_id: g.profile!.id,
    author_name: g.profile!.username ?? g.profile!.email ?? "관리자",
  } as never);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/employees");
  return { ok: true };
}

export async function deleteEmployeeMemo(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("employee_memos").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/employees");
  return { ok: true };
}

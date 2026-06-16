import { createClient } from "@/lib/supabase/server";
import { getImportCtx } from "@/lib/queries";
import { getCompanyContext, companyFilter } from "@/lib/active-company";
import { EmployeesClient, type AccountInfo } from "./employees-client";
import type {
  EmployeeRow,
  FieldOptionRow,
  ProfileRow,
  PayrollRow,
  LeaveRequestRow,
  EmploymentCertificateRow,
  LaborContractRow,
  EmployeeDocumentRow,
  EmployeeEventRow,
} from "@/lib/supabase/database.types";

function groupBy<T extends { employee_id: string | null }>(rows: T[]): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const r of rows) {
    if (!r.employee_id) continue;
    (out[r.employee_id] ??= []).push(r);
  }
  return out;
}

export const metadata = { title: "직원" };

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const ctxCompany = await getCompanyContext();
  const filter = companyFilter(ctxCompany);

  let query = supabase.from("employees").select("*").order("name");
  if (filter) query = query.eq("company_id", filter);

  const [{ data, error }, ctx, { data: opts }, { data: roleData }] = await Promise.all([
    query,
    getImportCtx(),
    supabase
      .from("field_options")
      .select("*")
      .in("category", ["employment_type", "role", "employee_status"])
      .order("sort_order"),
    supabase.from("roles").select("key, label").order("sort_order"),
  ]);

  if (error) {
    return <p className="text-sm text-red-600">데이터를 불러오지 못했습니다: {error.message}</p>;
  }

  const employees = (data ?? []) as EmployeeRow[];
  const empIds = employees.map((e) => e.id);
  const initialSelectedId = sp.e && employees.some((e) => e.id === sp.e) ? sp.e : null;

  // 급여·휴가·재직증명·계약·서류·이력 (선택 직원 상세 탭용) — 표시 직원들 것만
  let payrollsByEmp: Record<string, PayrollRow[]> = {};
  let leavesByEmp: Record<string, LeaveRequestRow[]> = {};
  let certsByEmp: Record<string, EmploymentCertificateRow[]> = {};
  let contractsByEmp: Record<string, LaborContractRow[]> = {};
  let docsByEmp: Record<string, EmployeeDocumentRow[]> = {};
  let eventsByEmp: Record<string, EmployeeEventRow[]> = {};
  if (empIds.length > 0) {
    const [{ data: pays }, { data: leaves }, { data: certs }, { data: contracts }, { data: docs }, { data: events }] =
      await Promise.all([
        supabase.from("payrolls").select("*").in("employee_id", empIds).order("year_month", { ascending: false }),
        supabase.from("leave_requests").select("*").in("employee_id", empIds).order("start_date", { ascending: false }),
        supabase
          .from("employment_certificates")
          .select("*")
          .in("employee_id", empIds)
          .order("issued_on", { ascending: false }),
        supabase.from("labor_contracts").select("*").in("employee_id", empIds).order("start_date", { ascending: false }),
        supabase.from("employee_documents").select("*").in("employee_id", empIds).order("created_at", { ascending: false }),
        supabase.from("employee_events").select("*").in("employee_id", empIds).order("event_date", { ascending: false }),
      ]);
    payrollsByEmp = groupBy((pays ?? []) as PayrollRow[]);
    leavesByEmp = groupBy((leaves ?? []) as LeaveRequestRow[]);
    certsByEmp = groupBy((certs ?? []) as EmploymentCertificateRow[]);
    contractsByEmp = groupBy((contracts ?? []) as LaborContractRow[]);
    docsByEmp = groupBy((docs ?? []) as EmployeeDocumentRow[]);
    eventsByEmp = groupBy((events ?? []) as EmployeeEventRow[]);
  }

  // 연결된 로그인 계정(profiles) 조회 → 직원ID별 계정정보 맵
  const profileIds = employees.map((e) => e.profile_id).filter((v): v is string => !!v);
  const accounts: Record<string, AccountInfo> = {};
  if (profileIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, username, role, is_active")
      .in("id", profileIds);
    const byId = new Map(((profs ?? []) as ProfileRow[]).map((p) => [p.id, p]));
    for (const e of employees) {
      const p = e.profile_id ? byId.get(e.profile_id) : undefined;
      if (p) accounts[e.id] = { profileId: p.id, username: p.username, role: p.role, isActive: p.is_active };
    }
  }

  return (
    <EmployeesClient
      rows={employees}
      ctx={ctx}
      options={(opts ?? []) as FieldOptionRow[]}
      accounts={accounts}
      roles={(roleData ?? []) as { key: string; label: string }[]}
      payrollsByEmp={payrollsByEmp}
      leavesByEmp={leavesByEmp}
      certsByEmp={certsByEmp}
      contractsByEmp={contractsByEmp}
      docsByEmp={docsByEmp}
      eventsByEmp={eventsByEmp}
      initialSelectedId={initialSelectedId}
      initialTab={sp.tab ?? null}
    />
  );
}

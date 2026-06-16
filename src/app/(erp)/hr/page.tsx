import { createClient } from "@/lib/supabase/server";
import { getCompanyContext, companyFilter, ALL_COMPANIES } from "@/lib/active-company";
import { accruedAnnualLeave } from "@/lib/payroll";
import { deductsAnnual } from "@/lib/labels";
import { HrClient } from "./hr-client";
import type {
  EmployeeRow,
  LeaveRequestRow,
  PayrollRow,
  EmploymentCertificateRow,
  PaybackRow,
  FieldOptionRow,
} from "@/lib/supabase/database.types";

export const metadata = { title: "급여·인사" };

export interface LeaveBalance {
  employee: EmployeeRow;
  accrued: number;
  used: number;
  remaining: number;
}

export default async function HrPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const month = sp.m ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const year = now.getFullYear();

  const supabase = await createClient();
  const ctxCompany = await getCompanyContext();
  const filter = companyFilter(ctxCompany);

  // 이번달 [first, next) — 페이백 지급월 집계용
  const [my, mm] = month.split("-").map(Number);
  const first = `${month}-01`;
  const next = `${mm === 12 ? my + 1 : my}-${String(mm === 12 ? 1 : mm + 1).padStart(2, "0")}-01`;

  let empQ = supabase.from("employees").select("*").eq("is_active", true).order("name");
  let leaveQ = supabase.from("leave_requests").select("*").order("start_date", { ascending: false });
  let payQ = supabase.from("payrolls").select("*").eq("year_month", month);
  let certQ = supabase.from("employment_certificates").select("*").order("created_at", { ascending: false });
  // 이번달 지급완료된 페이백(원천징수 집계용)
  let pbQ = supabase
    .from("paybacks")
    .select("*")
    .eq("status", "PAID")
    .gte("paid_at", first)
    .lt("paid_at", next);
  if (filter) {
    empQ = empQ.eq("company_id", filter);
    leaveQ = leaveQ.eq("company_id", filter);
    payQ = payQ.eq("company_id", filter);
    certQ = certQ.eq("company_id", filter);
    pbQ = pbQ.eq("company_id", filter);
  }

  const [{ data: emps }, { data: leaves }, { data: pays, error }, { data: certs }, { data: pbs }, { data: nontaxOpts }] =
    await Promise.all([
      empQ,
      leaveQ,
      payQ,
      certQ,
      pbQ,
      supabase.from("field_options").select("*").eq("category", "nontax_item").order("sort_order"),
    ]);
  if (error) {
    return <p className="text-sm text-red-600">데이터를 불러오지 못했습니다: {error.message}</p>;
  }

  const employees = (emps ?? []) as EmployeeRow[];
  const leaveRows = (leaves ?? []) as LeaveRequestRow[];
  const payrolls = (pays ?? []) as PayrollRow[];

  // 연차 잔여 계산(올해 승인분만 차감)
  const balances: LeaveBalance[] = employees.map((e) => {
    const accrued = accruedAnnualLeave(e.hired_on, now);
    const used = leaveRows
      .filter(
        (l) =>
          l.employee_id === e.id &&
          l.status === "APPROVED" &&
          deductsAnnual(l.leave_type) &&
          l.start_date.startsWith(String(year))
      )
      .reduce((s, l) => s + Number(l.days), 0);
    return { employee: e, accrued, used, remaining: accrued - used };
  });

  return (
    <HrClient
      employees={employees}
      balances={balances}
      leaves={leaveRows}
      payrolls={payrolls}
      certificates={(certs ?? []) as EmploymentCertificateRow[]}
      paybacks={(pbs ?? []) as PaybackRow[]}
      nontaxItems={(nontaxOpts ?? []) as FieldOptionRow[]}
      month={month}
      activeCompanyId={ctxCompany.activeId === ALL_COMPANIES ? null : ctxCompany.activeId}
    />
  );
}

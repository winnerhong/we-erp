import { createAdminClient } from "@/lib/supabase/admin";
import { ensureSelf } from "@/lib/auth-guard";
import { PayslipView, type PayslipData } from "./payslip-view";
import type { PayrollRow } from "@/lib/supabase/database.types";

export const metadata = { title: "급여명세서" };

/** 직원 셀프 급여명세서 — 본인 급여만 열람. */
export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await ensureSelf();
  if (g.error || !g.employee) {
    return <div className="p-10 text-center text-sm text-neutral-500">{g.error ?? "직원 정보를 찾을 수 없습니다."}</div>;
  }

  const db = createAdminClient();
  const { data } = await db.from("payrolls").select("*").eq("id", id).maybeSingle();
  const pay = data as PayrollRow | null;
  // 본인 급여만 열람 가능
  if (!pay || pay.employee_id !== g.employee.id) {
    return <div className="p-10 text-center text-sm text-neutral-500">급여명세서를 찾을 수 없습니다.</div>;
  }

  const { data: company } = pay.company_id
    ? await db.from("companies").select("name").eq("id", pay.company_id).maybeSingle()
    : { data: null };

  const d: PayslipData = {
    companyName: (company as { name: string } | null)?.name ?? null,
    employeeName: g.employee.name,
    department: g.employee.department ?? null,
    yearMonth: pay.year_month,
    basePay: pay.base_pay,
    allowance: pay.allowance,
    nontaxAllowance: pay.nontax_allowance,
    nontaxItems: pay.nontax_items,
    incomeTax: pay.income_tax,
    insurance: pay.insurance,
    otherDeduction: pay.other_deduction,
    netPay: pay.net_pay,
  };

  return <PayslipView d={d} />;
}

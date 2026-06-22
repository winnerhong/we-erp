import { createAdminClient } from "@/lib/supabase/admin";
import { ensureSelf } from "@/lib/auth-guard";
import { toPaybackBrief, type PaybackBrief } from "@/components/payback-list";
import { MeClient } from "./me-client";
import type {
  PayrollRow,
  LeaveRequestRow,
  EmploymentCertificateRow,
  LaborContractRow,
  EmployeeDocumentRow,
  EmployeeEventRow,
  PaybackRow,
} from "@/lib/supabase/database.types";

export const metadata = { title: "내 정보" };

export default async function MePage() {
  const g = await ensureSelf();
  if (g.error || !g.employee) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-10 text-center text-sm text-amber-800">
        {g.error ?? "직원 정보를 찾을 수 없습니다."}
        <br />
        <span className="text-xs text-amber-600">관리자에게 직원 계정 연결을 요청하세요.</span>
      </div>
    );
  }
  const emp = g.employee;
  const db = createAdminClient();

  const [
    { data: pays },
    { data: leaves },
    { data: certs },
    { data: contracts },
    { data: docs },
    { data: events },
    { data: pbs },
    { data: company },
  ] = await Promise.all([
    db.from("payrolls").select("*").eq("employee_id", emp.id).order("year_month", { ascending: false }),
    db.from("leave_requests").select("*").eq("employee_id", emp.id).order("start_date", { ascending: false }),
    db.from("employment_certificates").select("*").eq("employee_id", emp.id).order("issued_on", { ascending: false }),
    db.from("labor_contracts").select("*").eq("employee_id", emp.id).order("start_date", { ascending: false }),
    db.from("employee_documents").select("*").eq("employee_id", emp.id).order("created_at", { ascending: false }),
    db.from("employee_events").select("*").eq("employee_id", emp.id).order("event_date", { ascending: false }),
    db.from("paybacks").select("*").eq("employee_id", emp.id).order("created_at", { ascending: false }),
    emp.company_id ? db.from("companies").select("name").eq("id", emp.company_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  // 포인트(페이백) — 출처 거래일·적요 보강
  const pbRows = (pbs ?? []) as PaybackRow[];
  const txnIds = [...new Set(pbRows.map((p) => p.bank_transaction_id).filter((v): v is string => !!v))];
  const pbDate = new Map<string, string>();
  const pbDesc = new Map<string, string>();
  if (txnIds.length > 0) {
    const { data: t } = await db.from("bank_transactions").select("id, txn_date, description").in("id", txnIds);
    for (const r of (t ?? []) as { id: string; txn_date: string; description: string | null }[]) {
      pbDate.set(r.id, r.txn_date);
      pbDesc.set(r.id, r.description ?? "");
    }
  }
  const paybacks: PaybackBrief[] = pbRows.map((p) => toPaybackBrief(p, pbDate, pbDesc));

  return (
    <MeClient
      employee={emp}
      companyName={(company as { name: string } | null)?.name ?? null}
      payrolls={(pays ?? []) as PayrollRow[]}
      leaves={(leaves ?? []) as LeaveRequestRow[]}
      certs={(certs ?? []) as EmploymentCertificateRow[]}
      contracts={(contracts ?? []) as LaborContractRow[]}
      docs={(docs ?? []) as EmployeeDocumentRow[]}
      events={(events ?? []) as EmployeeEventRow[]}
      paybacks={paybacks}
    />
  );
}

import { createAdminClient } from "@/lib/supabase/admin";
import { ensureSelf } from "@/lib/auth-guard";
import { toPaybackBrief, type PaybackBrief } from "@/components/payback-list";
import { MeClient } from "./me-client";
import { kstToday } from "@/lib/attendance";
import type { VarCompany, VarLabels } from "@/lib/document-vars";
import type {
  PayrollRow,
  LeaveRequestRow,
  EmploymentCertificateRow,
  LaborContractRow,
  EmployeeDocumentRow,
  EmployeeEventRow,
  PaybackRow,
  DocumentTemplateRow,
  DocumentIssueRow,
  FieldOptionRow,
  AttendanceRow,
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
    emp.company_id
      ? db.from("companies").select("id, name, biz_no, ceo_name, address, biz_type, biz_category").eq("id", emp.company_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // 서류 — 양식(전사 공용) + 본인 발행본 + 변수 라벨
  const [{ data: tpls }, { data: docIssues }, { data: foRows }] = await Promise.all([
    db.from("document_templates").select("*").eq("is_active", true).order("sort_order").order("created_at"),
    db.from("document_issues").select("*").eq("employee_id", emp.id).order("created_at", { ascending: false }),
    db.from("field_options").select("*").in("category", ["employment_type", "job_rank", "job_title", "department"]),
  ]);
  const labelOf = (cat: string): Record<string, string> =>
    Object.fromEntries(((foRows ?? []) as FieldOptionRow[]).filter((o) => o.category === cat).map((o) => [o.value, o.label]));
  const docLabels: VarLabels = {
    employment_type: labelOf("employment_type"),
    job_rank: labelOf("job_rank"),
    job_title: labelOf("job_title"),
  };
  // 프로필 표시용 라벨 + 로그인 아이디
  const empTypeLabel = labelOf("employment_type")[emp.employment_type ?? ""] ?? emp.employment_type ?? "";
  const deptLabel = labelOf("department")[emp.department ?? ""] ?? emp.department ?? "";
  const titleLabel = labelOf("job_title")[emp.job_title ?? ""] ?? emp.job_title ?? "";
  const rankLabel = labelOf("job_rank")[emp.job_rank ?? ""] ?? emp.job_rank ?? "";
  const username = g.profile?.username ?? null;

  // 근태 — 최근 8주 출퇴근 기록(주간/월간 뷰 공용) + 오늘
  const today = kstToday();
  const windowStart = new Date(`${today}T00:00:00`);
  windowStart.setDate(windowStart.getDate() - 56);
  const winStart = windowStart.toISOString().slice(0, 10);
  const { data: attRows } = await db
    .from("attendance")
    .select("*")
    .eq("employee_id", emp.id)
    .gte("work_date", winStart)
    .order("work_date", { ascending: false });
  const attendance = (attRows ?? []) as AttendanceRow[];
  const todayAtt = attendance.find((a) => a.work_date === today) ?? null;

  // 최근 8주 승인 휴가 날짜(근태에 '휴가'로 표시)
  const leaveDates: string[] = [];
  for (const l of (leaves ?? []) as LeaveRequestRow[]) {
    if (l.status !== "APPROVED") continue;
    const s = l.start_date < winStart ? winStart : l.start_date;
    const ed = l.end_date > today ? today : l.end_date;
    for (let dt = new Date(`${s}T00:00:00`); dt <= new Date(`${ed}T00:00:00`); dt.setDate(dt.getDate() + 1))
      leaveDates.push(dt.toISOString().slice(0, 10));
  }

  const co = company as ({ id: string } & VarCompany) | null;
  const docCompany: VarCompany | null = co
    ? { name: co.name, biz_no: co.biz_no, ceo_name: co.ceo_name, address: co.address, biz_type: co.biz_type, biz_category: co.biz_category }
    : null;

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
      templates={(tpls ?? []) as DocumentTemplateRow[]}
      issues={(docIssues ?? []) as DocumentIssueRow[]}
      company={docCompany}
      labels={docLabels}
      attendance={attendance}
      todayAtt={todayAtt}
      today={today}
      leaveDates={leaveDates}
      profile={{ username, empTypeLabel, deptLabel, titleLabel, rankLabel }}
    />
  );
}

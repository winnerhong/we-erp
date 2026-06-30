import { createAdminClient } from "@/lib/supabase/admin";
import { ensureSelf } from "@/lib/auth-guard";
import { toPaybackBrief, type PaybackBrief } from "@/components/payback-list";
import { MeClient, type MyTask } from "./me-client";
import type { OrgEmployee } from "@/components/org-chart";
import type { LibFile, LibFolder } from "@/components/library-browser";
import { fileVisibleTo } from "@/lib/library";
import type { LibraryFileRow, LibraryFolderRow, LibraryFavoriteRow, TransactionRow } from "@/lib/supabase/database.types";
import type { MyClassSession } from "./me-client";
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
  TaskRow,
  TaskChecklistRow,
  TaskCommentRow,
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

  // ---- 기간 prep(순수 계산) ----
  const today = kstToday();
  const windowStart = new Date(`${today}T00:00:00`);
  windowStart.setDate(windowStart.getDate() - 56);
  const winStart = windowStart.toISOString().slice(0, 10);
  const sFrom = new Date(`${today}T00:00:00`); sFrom.setDate(sFrom.getDate() - 14);
  const sTo = new Date(`${today}T00:00:00`); sTo.setDate(sTo.getDate() + 30);
  const sFromY = sFrom.toISOString().slice(0, 10);
  const sToY = sTo.toISOString().slice(0, 10);

  // ---- 1차 병렬: emp/profile/기간만 의존하는 모든 쿼리 한 번에 ----
  const [
    { data: pays }, { data: leaves }, { data: certs }, { data: contracts }, { data: docs }, { data: events }, { data: pbs }, { data: company },
    { data: tpls }, { data: docIssues }, { data: foRows },
    { data: attRows },
    { data: asg }, { data: taskCats },
    { data: coworkers },
    { data: libFolders }, { data: libFilesRaw }, { data: libFavs },
    { data: sessRaw },
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
    db.from("document_templates").select("*").eq("is_active", true).order("sort_order").order("created_at"),
    db.from("document_issues").select("*").eq("employee_id", emp.id).order("created_at", { ascending: false }),
    db.from("field_options").select("*").in("category", ["employment_type", "job_rank", "job_title", "department"]),
    db.from("attendance").select("*").eq("employee_id", emp.id).gte("work_date", winStart).order("work_date", { ascending: false }),
    db.from("task_assignees").select("task_id").eq("employee_id", emp.id),
    db.from("field_options").select("value, label, color").eq("category", "task_category").eq("is_active", true).order("sort_order"),
    emp.company_id
      ? db.from("employees").select("id, name, company_id, department, job_rank, job_title, is_manager, photo_url, phone, email, hired_on").eq("is_active", true).eq("company_id", emp.company_id).order("name")
      : Promise.resolve({ data: [] }),
    db.from("library_folders").select("*").order("sort_order"),
    db.from("library_files").select("*").eq("is_active", true).order("created_at", { ascending: false }),
    db.from("library_favorites").select("file_id").eq("profile_id", g.profile!.id),
    db.from("transactions").select("*").eq("instructor_id", emp.id).eq("type", "CLASS").gte("txn_date", sFromY).lte("txn_date", sToY).order("txn_date"),
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

  // 근태(1차 배치에서 로드) — 최근 8주
  const attendance = (attRows ?? []) as AttendanceRow[];
  const todayAtt = attendance.find((a) => a.work_date === today) ?? null;

  // ---- 2차 병렬: 1차 결과(pbs/asg/sessRaw)에 의존하는 조회 ----
  const pbRows = (pbs ?? []) as PaybackRow[];
  const txnIds = [...new Set(pbRows.map((p) => p.bank_transaction_id).filter((v): v is string => !!v))];
  const myTaskIds = [...new Set(((asg ?? []) as { task_id: string }[]).map((a) => a.task_id))];
  const sessRows = (sessRaw ?? []) as TransactionRow[];
  const sessPartnerIds = [...new Set(sessRows.map((s) => s.partner_id))];
  const [{ data: pbTxnData }, { data: tk }, { data: ck }, { data: cm }, { data: sessPs }] = await Promise.all([
    txnIds.length ? db.from("bank_transactions").select("id, txn_date, description").in("id", txnIds) : Promise.resolve({ data: [] }),
    myTaskIds.length ? db.from("tasks").select("*").in("id", myTaskIds).order("due_date", { nullsFirst: false }) : Promise.resolve({ data: [] }),
    myTaskIds.length ? db.from("task_checklist").select("*").in("task_id", myTaskIds).order("sort_order") : Promise.resolve({ data: [] }),
    myTaskIds.length ? db.from("task_comments").select("*").in("task_id", myTaskIds).order("created_at") : Promise.resolve({ data: [] }),
    sessPartnerIds.length ? db.from("partners").select("id, name").in("id", sessPartnerIds) : Promise.resolve({ data: [] }),
  ]);

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
  const pbDate = new Map<string, string>();
  const pbDesc = new Map<string, string>();
  for (const r of (pbTxnData ?? []) as { id: string; txn_date: string; description: string | null }[]) {
    pbDate.set(r.id, r.txn_date);
    pbDesc.set(r.id, r.description ?? "");
  }
  const paybacks: PaybackBrief[] = pbRows.map((p) => toPaybackBrief(p, pbDate, pbDesc));

  // 내 업무(담당 배정된 업무) + 체크리스트·댓글 (2차 배치 결과)
  let myTasks: MyTask[] = [];
  if (myTaskIds.length > 0) {
    const chkBy = new Map<string, TaskChecklistRow[]>();
    for (const c of (ck ?? []) as TaskChecklistRow[]) { const a = chkBy.get(c.task_id) ?? []; a.push(c); chkBy.set(c.task_id, a); }
    const cmtBy = new Map<string, TaskCommentRow[]>();
    for (const c of (cm ?? []) as TaskCommentRow[]) { const a = cmtBy.get(c.task_id) ?? []; a.push(c); cmtBy.set(c.task_id, a); }
    myTasks = ((tk ?? []) as TaskRow[]).map((t) => ({
      id: t.id, title: t.title, description: t.description, category: t.category,
      status: t.status, priority: t.priority, start_date: t.start_date, due_date: t.due_date, progress: t.progress,
      checklist: (chkBy.get(t.id) ?? []).map((c) => ({ id: c.id, label: c.label, done: c.done })),
      comments: (cmtBy.get(t.id) ?? []).map((c) => ({ id: c.id, author_id: c.author_id, author_name: c.author_name, body: c.body, created_at: c.created_at })),
    }));
  }

  // 조직도 — 같은 사업자 동료(1차 배치에서 로드)
  let orgEmployees: OrgEmployee[] = [];
  if (emp.company_id) {
    const fo = (foRows ?? []) as FieldOptionRow[];
    const lbl = (cat: string, v: string | null) => (v ? fo.find((o) => o.category === cat && o.value === v)?.label ?? v : null);
    const rankSort = (v: string | null) => (v ? fo.find((o) => o.category === "job_rank" && o.value === v)?.sort_order ?? 999 : 999);
    orgEmployees = ((coworkers ?? []) as typeof emp[]).map((e) => ({
      id: e.id, name: e.name, photoUrl: e.photo_url ?? null, companyId: e.company_id ?? null,
      deptValue: e.department ?? null, deptLabel: lbl("department", e.department ?? null),
      rankLabel: lbl("job_rank", e.job_rank ?? null), rankSort: rankSort(e.job_rank ?? null),
      titleLabel: lbl("job_title", e.job_title ?? null), isManager: e.is_manager,
      phone: e.phone ?? null, email: e.email ?? null, hiredOn: e.hired_on ?? null,
    }));
  }

  // 자료실 — 이 직원에게 보이는 파일(1차 배치에서 로드)
  const empScope = { company_id: emp.company_id, department: emp.department };
  const orgCoName = (company as { name: string } | null)?.name ?? null;
  const libFiles: LibFile[] = ((libFilesRaw ?? []) as LibraryFileRow[])
    .filter((f) => emp.is_manager || fileVisibleTo(f, empScope))
    .map((f) => ({
      id: f.id, folderId: f.folder_id, title: f.title, description: f.description,
      fileName: f.file_name, mime: f.mime, size: f.size_bytes, version: f.version,
      visibility: f.visibility, companyId: f.company_id,
      companyName: f.company_id && f.company_id === emp.company_id ? orgCoName : null,
      department: f.department, departmentLabel: f.department ? labelOf("department")[f.department] ?? f.department : null,
      uploaderName: f.uploader_name, downloadCount: f.download_count, createdAt: f.created_at, updatedAt: f.updated_at,
    }));
  const libFolderRows: LibFolder[] = ((libFolders ?? []) as LibraryFolderRow[]).map((f) => ({ id: f.id, name: f.name, parentId: f.parent_id }));
  const libFavorites = ((libFavs ?? []) as LibraryFavoriteRow[]).map((f) => f.file_id);

  // 현장 수집 — 강사 본인 수업 회차(1차 배치 로드) + 기관명(2차 배치)
  const sessPartnerName = new Map<string, string>();
  for (const p of (sessPs ?? []) as { id: string; name: string }[]) sessPartnerName.set(p.id, p.name);
  const mySessions: MyClassSession[] = sessRows.map((s) => ({
    id: s.id, date: s.txn_date, title: s.title, partnerName: sessPartnerName.get(s.partner_id) ?? "",
    status: s.status, presentCount: s.present_count, progressNote: s.progress_note,
  }));

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
      myTasks={myTasks}
      taskCategories={(taskCats ?? []) as { value: string; label: string; color: string | null }[]}
      meIds={{ employeeId: emp.id, profileId: g.profile?.id ?? null }}
      orgEmployees={orgEmployees}
      orgCompanyName={(company as { name: string } | null)?.name ?? "우리 회사"}
      libFiles={libFiles}
      libFolders={libFolderRows}
      libFavorites={libFavorites}
      mySessions={mySessions}
    />
  );
}

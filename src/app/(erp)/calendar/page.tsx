import { createClient } from "@/lib/supabase/server";
import { getCompanyContext, companyFilter } from "@/lib/active-company";
import { getCurrentProfile } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { kstToday } from "@/lib/attendance";
import { addDays } from "@/lib/tasks";
import { CalendarClient, type CalTask, type CalEmployee, type CalCategory, type Overlay } from "./calendar-client";
import type { TaskRow, TaskAssigneeRow, TaskCommentRow, TaskChecklistRow, EmployeeRow } from "@/lib/supabase/database.types";

export const metadata = { title: "업무캘린더" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const today = kstToday();
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : today.slice(0, 7);
  const monthStart = `${month}-01`;
  const winStart = addDays(monthStart, -7);
  const winEnd = addDays(`${month}-28`, 14); // 다음 달 초까지 여유

  const supabase = await createClient();
  const ctx = await getCompanyContext();
  const filter = companyFilter(ctx);

  // 직원·카테고리·내 정보
  const profile = await getCurrentProfile();
  let empQ = supabase
    .from("employees")
    .select("id, name, company_id, department, photo_url, profile_id")
    .eq("is_active", true)
    .order("name");
  if (filter) empQ = empQ.eq("company_id", filter);

  const [{ data: empData }, { data: catOpts }, { data: deptOpts }] = await Promise.all([
    empQ,
    supabase.from("field_options").select("value, label, color").eq("category", "task_category").eq("is_active", true).order("sort_order"),
    supabase.from("field_options").select("value, label").eq("category", "department"),
  ]);
  const empRows = (empData ?? []) as (Pick<EmployeeRow, "id" | "name" | "company_id" | "department" | "photo_url"> & { profile_id: string | null })[];
  const deptLabel = new Map(((deptOpts ?? []) as { value: string; label: string }[]).map((o) => [o.value, o.label]));
  const employees: CalEmployee[] = empRows.map((e) => ({
    id: e.id,
    name: e.name,
    department: e.department ? deptLabel.get(e.department) ?? e.department : null,
    photoUrl: e.photo_url ?? null,
    companyId: e.company_id ?? null,
  }));
  const categories: CalCategory[] = ((catOpts ?? []) as CalCategory[]);

  // 내 권한(관리자만 타인 배정)
  const me = empRows.find((e) => e.profile_id && profile && e.profile_id === profile.id) ?? null;
  const isAdmin = profile?.role === "ADMIN";
  const meCtx = {
    profileId: profile?.id ?? null,
    employeeId: me?.id ?? null,
    isAdmin,
    canAssign: isAdmin,
  };

  // 업무 — 창(window)에 걸치거나 + 미완료(백로그) 전부
  let openQ = supabase.from("tasks").select("*").neq("status", "DONE").order("due_date", { nullsFirst: false });
  let winQ = supabase.from("tasks").select("*").lte("start_date", winEnd).gte("due_date", winStart);
  let winQ2 = supabase.from("tasks").select("*").is("start_date", null).lte("due_date", winEnd).gte("due_date", winStart);
  if (filter) {
    openQ = openQ.eq("company_id", filter);
    winQ = winQ.eq("company_id", filter);
    winQ2 = winQ2.eq("company_id", filter);
  }
  const [{ data: openT }, { data: winT }, { data: winT2 }] = await Promise.all([openQ, winQ, winQ2]);
  const taskMap = new Map<string, TaskRow>();
  for (const t of [...(openT ?? []), ...(winT ?? []), ...(winT2 ?? [])] as TaskRow[]) taskMap.set(t.id, t);
  const taskRows = [...taskMap.values()];
  const taskIds = taskRows.map((t) => t.id);

  // 담당자·체크리스트·댓글 (admin 클라이언트로 한번에)
  const db = createAdminClient();
  let assignees: TaskAssigneeRow[] = [];
  let checklist: TaskChecklistRow[] = [];
  let comments: TaskCommentRow[] = [];
  if (taskIds.length > 0) {
    const [{ data: a }, { data: c }, { data: cm }] = await Promise.all([
      db.from("task_assignees").select("*").in("task_id", taskIds),
      db.from("task_checklist").select("*").in("task_id", taskIds).order("sort_order"),
      db.from("task_comments").select("*").in("task_id", taskIds).order("created_at"),
    ]);
    assignees = (a ?? []) as TaskAssigneeRow[];
    checklist = (c ?? []) as TaskChecklistRow[];
    comments = (cm ?? []) as TaskCommentRow[];
  }
  const asgBy = new Map<string, string[]>();
  for (const a of assignees) {
    const arr = asgBy.get(a.task_id) ?? [];
    arr.push(a.employee_id);
    asgBy.set(a.task_id, arr);
  }
  const chkBy = new Map<string, TaskChecklistRow[]>();
  for (const c of checklist) {
    const arr = chkBy.get(c.task_id) ?? [];
    arr.push(c);
    chkBy.set(c.task_id, arr);
  }
  const cmtBy = new Map<string, TaskCommentRow[]>();
  for (const c of comments) {
    const arr = cmtBy.get(c.task_id) ?? [];
    arr.push(c);
    cmtBy.set(c.task_id, arr);
  }

  const tasks: CalTask[] = taskRows.map((t) => ({
    id: t.id,
    company_id: t.company_id,
    title: t.title,
    description: t.description,
    category: t.category,
    status: t.status,
    priority: t.priority,
    start_date: t.start_date,
    due_date: t.due_date,
    all_day: t.all_day,
    start_time: t.start_time,
    end_time: t.end_time,
    progress: t.progress,
    created_by: t.created_by,
    assigneeIds: asgBy.get(t.id) ?? [],
    checklist: (chkBy.get(t.id) ?? []).map((c) => ({ id: c.id, label: c.label, done: c.done })),
    comments: (cmtBy.get(t.id) ?? []).map((c) => ({
      id: c.id, author_id: c.author_id, author_name: c.author_name, body: c.body, created_at: c.created_at,
    })),
  }));

  // 오버레이 — 승인 휴가 + 비사무실 근무(재택/외근/출장)
  const empIds = employees.map((e) => e.id);
  let overlay: Overlay = { leaves: [], workModes: [] };
  if (empIds.length > 0) {
    const [{ data: lv }, { data: att }] = await Promise.all([
      supabase
        .from("leave_requests")
        .select("employee_id, start_date, end_date, leave_type")
        .in("employee_id", empIds)
        .eq("status", "APPROVED")
        .lte("start_date", winEnd)
        .gte("end_date", winStart),
      supabase
        .from("attendance")
        .select("employee_id, work_date, work_mode")
        .in("employee_id", empIds)
        .neq("work_mode", "OFFICE")
        .gte("work_date", winStart)
        .lte("work_date", winEnd),
    ]);
    overlay = {
      leaves: ((lv ?? []) as { employee_id: string; start_date: string; end_date: string; leave_type: string }[]).map((l) => ({
        employeeId: l.employee_id, start: l.start_date, end: l.end_date, type: l.leave_type,
      })),
      workModes: ((att ?? []) as { employee_id: string; work_date: string; work_mode: string }[]).map((w) => ({
        employeeId: w.employee_id, date: w.work_date, mode: w.work_mode,
      })),
    };
  }

  return (
    <CalendarClient
      month={month}
      today={today}
      companyId={ctx.activeId}
      companies={ctx.companies}
      employees={employees}
      categories={categories}
      tasks={tasks}
      overlay={overlay}
      me={meCtx}
    />
  );
}

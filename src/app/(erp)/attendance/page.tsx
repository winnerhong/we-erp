import { createClient } from "@/lib/supabase/server";
import { getCompanyContext, companyFilter } from "@/lib/active-company";
import { kstToday } from "@/lib/attendance";
import { AttendanceClient, type AttRow } from "./attendance-client";
import type { EmployeeRow, AttendanceRow } from "@/lib/supabase/database.types";

export const metadata = { title: "근태현황" };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const sp = await searchParams;
  const date = sp.d ?? kstToday();
  const month = date.slice(0, 7);
  const monthStart = `${month}-01`;

  const supabase = await createClient();
  const ctx = await getCompanyContext();
  const filter = companyFilter(ctx);

  let empQ = supabase.from("employees").select("id, name, company_id, work_start, work_end, department").eq("is_active", true).order("name");
  if (filter) empQ = empQ.eq("company_id", filter);
  const [{ data: empData }, { data: deptOpts }] = await Promise.all([
    empQ,
    supabase.from("field_options").select("value, label").eq("category", "department"),
  ]);
  const employees = (empData ?? []) as Pick<EmployeeRow, "id" | "name" | "company_id" | "work_start" | "work_end" | "department">[];
  const deptLabel = new Map(((deptOpts ?? []) as { value: string; label: string }[]).map((o) => [o.value, o.label]));

  const monthEnd = `${month}-31`;
  const empIds = employees.map((e) => e.id);
  let attMonth: AttendanceRow[] = [];
  let leaves: { employee_id: string; start_date: string; end_date: string }[] = [];
  if (empIds.length > 0) {
    const [{ data: att }, { data: lv }] = await Promise.all([
      supabase.from("attendance").select("*").in("employee_id", empIds).gte("work_date", monthStart).lte("work_date", monthEnd),
      supabase
        .from("leave_requests")
        .select("employee_id, start_date, end_date")
        .in("employee_id", empIds)
        .eq("status", "APPROVED")
        .lte("start_date", monthEnd)
        .gte("end_date", monthStart),
    ]);
    attMonth = (att ?? []) as AttendanceRow[];
    leaves = (lv ?? []) as typeof leaves;
  }

  // 직원별 승인 휴가 구간
  const leaveBy = new Map<string, { start: string; end: string }[]>();
  for (const l of leaves) {
    const arr = leaveBy.get(l.employee_id) ?? [];
    arr.push({ start: l.start_date, end: l.end_date });
    leaveBy.set(l.employee_id, arr);
  }
  const onLeave = (empId: string, d: string) => (leaveBy.get(empId) ?? []).some((r) => r.start <= d && d <= r.end);
  // 그 달 휴가 일수(월 범위로 클립)
  const leaveDays = (empId: string) => {
    let n = 0;
    for (const r of leaveBy.get(empId) ?? []) {
      const s = r.start < monthStart ? monthStart : r.start;
      const e = r.end > monthEnd ? monthEnd : r.end;
      for (let dt = new Date(`${s}T00:00:00`); dt <= new Date(`${e}T00:00:00`); dt.setDate(dt.getDate() + 1)) n++;
    }
    return n;
  };

  // 그날 근태 맵
  const byEmpToday = new Map(attMonth.filter((a) => a.work_date === date).map((a) => [a.employee_id, a]));
  // 월 통계(직원별 정상/지각/결근/누적분)
  const stat = new Map<string, { normal: number; late: number; absent: number; minutes: number }>();
  for (const a of attMonth) {
    const s = stat.get(a.employee_id) ?? { normal: 0, late: 0, absent: 0, minutes: 0 };
    if (a.status === "LATE" || a.status === "LATE_EARLY") s.late++;
    else if (a.status === "ABSENT") s.absent++;
    else if (a.check_in) s.normal++;
    s.minutes += a.work_minutes ?? 0;
    stat.set(a.employee_id, s);
  }

  const rows: AttRow[] = employees.map((e) => {
    const t = byEmpToday.get(e.id) ?? null;
    const m = stat.get(e.id) ?? { normal: 0, late: 0, absent: 0, minutes: 0 };
    // 출근 기록이 없고 그날 승인 휴가면 '휴가'로 표시
    const status = t?.status ?? (onLeave(e.id, date) ? "LEAVE" : null);
    return {
      employeeId: e.id, name: e.name,
      department: e.department ? deptLabel.get(e.department) ?? e.department : null,
      checkIn: t?.check_in ?? null, checkOut: t?.check_out ?? null,
      workMinutes: t?.work_minutes ?? null, status, workMode: t?.work_mode ?? null,
      monthNormal: m.normal, monthLate: m.late, monthAbsent: m.absent, monthMinutes: m.minutes,
      monthLeave: leaveDays(e.id),
    };
  });

  return <AttendanceClient date={date} rows={rows} />;
}

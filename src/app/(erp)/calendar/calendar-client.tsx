"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui";
import {
  TASK_STATUS_LABEL, TASK_STATUS_TONE, TASK_PRIORITY_LABEL, TASK_PRIORITY_TONE,
  TASK_STATUSES, TASK_PRIORITIES, KANBAN_COLUMNS, toneChip, toneBar, taskRange, addDays, isOverdue, isDueSoon,
  monthDays, dowOf, shiftMonth, DOW_KR,
} from "@/lib/tasks";
import type { TaskStatus } from "@/lib/supabase/database.types";
import {
  createTask, updateTask, deleteTask, setTaskStatus,
  addTaskComment, deleteTaskComment, addChecklistItem, toggleChecklistItem, deleteChecklistItem,
  type TaskInput,
} from "./actions";

// ---------- 타입(page.tsx 공유) ----------
export interface CalEmployee {
  id: string;
  name: string;
  department: string | null;
  photoUrl: string | null;
  companyId: string | null;
  isManager: boolean;
}
export interface CalCategory { value: string; label: string; color: string | null }
export interface CalTask {
  id: string;
  company_id: string | null;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  priority: string;
  start_date: string | null;
  due_date: string | null;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  progress: number;
  created_by: string | null;
  assigneeIds: string[];
  checklist: { id: string; label: string; done: boolean }[];
  comments: { id: string; author_id: string | null; author_name: string | null; body: string; created_at: string }[];
}
export interface Overlay {
  leaves: { employeeId: string; start: string; end: string; type: string }[];
  workModes: { employeeId: string; date: string; mode: string }[];
}
interface Me {
  profileId: string | null;
  employeeId: string | null;
  isAdmin: boolean;
  canAssign: boolean;
}
type Company = { id: string; name: string; tax_type?: string };

const WORKMODE_LABEL: Record<string, string> = { REMOTE: "재택", FIELD: "외근", TRIP: "출장", OFFICE: "사무실" };

export function CalendarClient({
  month, today, companyId, companies, employees, categories, tasks, overlay, me,
}: {
  month: string;
  today: string;
  companyId: string;
  companies: Company[];
  employees: CalEmployee[];
  categories: CalCategory[];
  tasks: CalTask[];
  overlay: Overlay;
  me: Me;
}) {
  const router = useRouter();
  const [view, setView] = useState<"month" | "timeline" | "kanban">("month");
  const [editing, setEditing] = useState<CalTask | "new" | null>(null);
  const [newDefaults, setNewDefaults] = useState<Partial<TaskInput>>({});

  // 필터
  const [fEmp, setFEmp] = useState<Set<string>>(new Set());
  const [fCat, setFCat] = useState<Set<string>>(new Set());
  const [fStatus, setFStatus] = useState<Set<string>>(new Set());
  const [mineOnly, setMineOnly] = useState(false);

  const catColor = useMemo(() => new Map(categories.map((c) => [c.value, c.color ?? "neutral"])), [categories]);
  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const canCreate = me.canAssign || !!me.employeeId;
  const canManage = (t: CalTask) => me.canAssign || (!!me.profileId && t.created_by === me.profileId);
  const canProgress = (t: CalTask) => canManage(t) || (!!me.employeeId && t.assigneeIds.includes(me.employeeId));

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (fEmp.size > 0 && !t.assigneeIds.some((id) => fEmp.has(id))) return false;
      if (fCat.size > 0 && !(t.category && fCat.has(t.category))) return false;
      if (fStatus.size > 0 && !fStatus.has(t.status)) return false;
      if (mineOnly && !(me.employeeId && t.assigneeIds.includes(me.employeeId))) return false;
      return true;
    });
  }, [tasks, fEmp, fCat, fStatus, mineOnly, me.employeeId]);

  const openNew = (defaults: Partial<TaskInput> = {}) => {
    setNewDefaults({ company_id: companyId !== "ALL" ? companyId : null, ...defaults });
    setEditing("new");
  };

  function toggle(set: Set<string>, key: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    setter(next);
  }

  // 통계
  const overdueCount = filtered.filter((t) => isOverdue(t.due_date, t.status, today)).length;
  const soonCount = filtered.filter((t) => isDueSoon(t.due_date, t.status, today)).length;
  const doingCount = filtered.filter((t) => t.status === "DOING").length;
  const openCount = filtered.filter((t) => t.status !== "DONE").length;

  return (
    <div>
      <PageHeader
        title="📆 업무캘린더"
        description="직원별·업무별 할 일을 한눈에 — 캘린더 · 타임라인 · 칸반"
        actions={
          canCreate ? (
            <button onClick={() => openNew()} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">
              + 새 업무
            </button>
          ) : null
        }
      />

      {/* 요약 + 월 이동 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white p-1">
          <button onClick={() => router.push(`/calendar?m=${shiftMonth(month, -1)}`)} className="rounded px-2 py-1 text-sm hover:bg-neutral-100">‹</button>
          <button onClick={() => router.push(`/calendar?m=${today.slice(0, 7)}`)} className="rounded px-2 py-1 text-sm font-semibold tabular-nums hover:bg-neutral-100">{month.replace("-", ".")}</button>
          <button onClick={() => router.push(`/calendar?m=${shiftMonth(month, 1)}`)} className="rounded px-2 py-1 text-sm hover:bg-neutral-100">›</button>
        </div>
        <StatPill label="진행중" value={doingCount} tone="blue" />
        <StatPill label="미완료" value={openCount} tone="neutral" />
        <StatPill label="임박" value={soonCount} tone="amber" />
        <StatPill label="지연" value={overdueCount} tone="rose" />
        <div className="ml-auto flex rounded-lg border border-neutral-200 bg-white p-1 text-sm">
          {([["month", "📅 캘린더"], ["timeline", "👥 타임라인"], ["kanban", "✅ 칸반"]] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setView(k)} className={`rounded-md px-3 py-1.5 font-medium ${view === k ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>{lbl}</button>
          ))}
        </div>
      </div>

      {/* 필터바 */}
      <FilterBar
        employees={employees} categories={categories}
        fEmp={fEmp} fCat={fCat} fStatus={fStatus} mineOnly={mineOnly} showMine={!!me.employeeId}
        onEmp={(id) => toggle(fEmp, id, setFEmp)}
        onCat={(v) => toggle(fCat, v, setFCat)}
        onStatus={(v) => toggle(fStatus, v, setFStatus)}
        onMine={() => setMineOnly((v) => !v)}
        onClear={() => { setFEmp(new Set()); setFCat(new Set()); setFStatus(new Set()); setMineOnly(false); }}
      />

      <div className="mt-4">
        {view === "month" && (
          <MonthView month={month} today={today} tasks={filtered} catColor={catColor}
            onTask={(t) => setEditing(t)} onDay={(d) => canCreate && openNew({ start_date: d, due_date: d })} />
        )}
        {view === "timeline" && (
          <TimelineView month={month} today={today} employees={employees} tasks={filtered} overlay={overlay}
            catColor={catColor} onTask={(t) => setEditing(t)} />
        )}
        {view === "kanban" && (
          <KanbanView tasks={filtered} empById={empById} catColor={catColor} today={today}
            canProgress={canProgress} onTask={(t) => setEditing(t)} onStatus={(id, s) => setTaskStatus(id, s)} />
        )}
      </div>

      {editing && (
        <TaskModal
          key={editing === "new" ? "new" : editing.id}
          task={editing === "new" ? null : editing}
          defaults={newDefaults}
          companies={companies} employees={employees} categories={categories}
          me={me}
          readOnly={editing !== "new" && !canManage(editing)}
          canProgress={editing === "new" ? true : canProgress(editing)}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

// ---------- 요약 칩 ----------
function StatPill({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm ${toneChip(tone)}`}>
      <span className="font-bold tabular-nums">{value}</span>
      <span className="text-xs opacity-80">{label}</span>
    </span>
  );
}

// ---------- 필터바 ----------
function FilterBar({
  employees, categories, fEmp, fCat, fStatus, mineOnly, showMine, onEmp, onCat, onStatus, onMine, onClear,
}: {
  employees: CalEmployee[]; categories: CalCategory[];
  fEmp: Set<string>; fCat: Set<string>; fStatus: Set<string>; mineOnly: boolean; showMine: boolean;
  onEmp: (id: string) => void; onCat: (v: string) => void; onStatus: (v: string) => void; onMine: () => void; onClear: () => void;
}) {
  const active = fEmp.size + fCat.size + fStatus.size + (mineOnly ? 1 : 0);
  return (
    <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-semibold text-neutral-400">상태</span>
        {TASK_STATUSES.map((s) => (
          <Chip key={s} active={fStatus.has(s)} tone={TASK_STATUS_TONE[s]} onClick={() => onStatus(s)}>{TASK_STATUS_LABEL[s]}</Chip>
        ))}
        {showMine && (
          <button onClick={onMine} className={`ml-2 rounded-full border px-2.5 py-1 text-xs font-medium ${mineOnly ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"}`}>
            ⭐ 내 업무만
          </button>
        )}
        {active > 0 && (
          <button onClick={onClear} className="ml-auto rounded-full px-2.5 py-1 text-xs text-neutral-500 hover:bg-neutral-100">필터 해제 ({active})</button>
        )}
      </div>
      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold text-neutral-400">분류</span>
          {categories.map((c) => (
            <Chip key={c.value} active={fCat.has(c.value)} tone={c.color ?? "neutral"} onClick={() => onCat(c.value)}>{c.label}</Chip>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-semibold text-neutral-400">담당</span>
        {employees.map((e) => (
          <button key={e.id} onClick={() => onEmp(e.id)}
            className={`inline-flex items-center gap-1 rounded-full border py-0.5 pl-0.5 pr-2 text-xs font-medium ${fEmp.has(e.id) ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"}`}>
            <Avatar emp={e} size={18} />
            {e.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function Chip({ active, tone, onClick, children }: { active: boolean; tone: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${active ? toneChip(tone) + " ring-1 ring-neutral-400" : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"}`}>
      {children}
    </button>
  );
}

function Avatar({ emp, size = 24 }: { emp: CalEmployee; size?: number }) {
  const s = { width: size, height: size };
  // eslint-disable-next-line @next/next/no-img-element
  if (emp.photoUrl) return <img src={emp.photoUrl} alt={emp.name} style={s} className="rounded-full object-cover" />;
  return (
    <span style={s} className="inline-flex items-center justify-center rounded-full bg-neutral-200 text-[10px] font-bold text-neutral-600">
      {emp.name.slice(0, 1)}
    </span>
  );
}

// ---------- 월 캘린더 ----------
function MonthView({
  month, today, tasks, catColor, onTask, onDay,
}: {
  month: string; today: string; tasks: CalTask[]; catColor: Map<string, string>;
  onTask: (t: CalTask) => void; onDay: (d: string) => void;
}) {
  const days = monthDays(month);
  const lead = dowOf(days[0]);
  const cells: (string | null)[] = [...Array(lead).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);

  const byDay = useMemo(() => {
    const m = new Map<string, CalTask[]>();
    for (const t of tasks) {
      const r = taskRange(t.start_date, t.due_date);
      if (!r) continue;
      for (let d = r.start; d <= r.end; d = addDays(d, 1)) {
        if (d.slice(0, 7) !== month) continue;
        const arr = m.get(d) ?? [];
        arr.push(t);
        m.set(d, arr);
      }
    }
    return m;
  }, [tasks, month]);

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="grid grid-cols-7 border-b border-neutral-100 text-center text-xs font-semibold text-neutral-400">
        {DOW_KR.map((d, i) => (
          <div key={d} className={`py-2 ${i === 0 ? "text-rose-400" : i === 6 ? "text-blue-400" : ""}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="min-h-[104px] border-b border-r border-neutral-50 bg-neutral-50/40" />;
          const list = byDay.get(d) ?? [];
          const isToday = d === today;
          const wd = i % 7;
          return (
            <div key={i} onClick={() => onDay(d)}
              className="group min-h-[104px] cursor-pointer border-b border-r border-neutral-50 p-1.5 hover:bg-neutral-50/60">
              <div className={`mb-1 text-right text-xs font-semibold tabular-nums ${isToday ? "inline-block rounded-full bg-neutral-900 px-1.5 text-white" : wd === 0 ? "text-rose-400" : wd === 6 ? "text-blue-400" : "text-neutral-500"}`}>
                {Number(d.slice(8))}
              </div>
              <div className="space-y-1">
                {list.slice(0, 4).map((t) => (
                  <button key={t.id} onClick={(e) => { e.stopPropagation(); onTask(t); }}
                    className={`block w-full truncate rounded border px-1.5 py-0.5 text-left text-[11px] font-medium ${toneChip(catColor.get(t.category ?? "") ?? "neutral")} ${t.status === "DONE" ? "line-through opacity-50" : ""}`}>
                    {t.priority === "URGENT" && "🔴 "}{t.title}
                  </button>
                ))}
                {list.length > 4 && <div className="px-1 text-[10px] text-neutral-400">+{list.length - 4}건 더</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- 직원별 타임라인(간트) ----------
function TimelineView({
  month, today, employees, tasks, overlay, catColor, onTask,
}: {
  month: string; today: string; employees: CalEmployee[]; tasks: CalTask[]; overlay: Overlay;
  catColor: Map<string, string>; onTask: (t: CalTask) => void;
}) {
  const days = monthDays(month);
  const cellW = 38;
  const idxOf = (d: string) => days.indexOf(d);

  // (React Compiler 자동 메모이제이션 — days 가 로컬 배열이라 수동 useMemo 미사용)
  const leaveBy = (() => {
    const m = new Map<string, Set<string>>();
    for (const l of overlay.leaves) {
      for (let d = l.start < days[0] ? days[0] : l.start; d <= l.end && d <= days[days.length - 1]; d = addDays(d, 1)) {
        if (!m.has(l.employeeId)) m.set(l.employeeId, new Set());
        m.get(l.employeeId)!.add(d);
      }
    }
    return m;
  })();
  const modeBy = (() => {
    const m = new Map<string, Map<string, string>>();
    for (const w of overlay.workModes) {
      if (!m.has(w.employeeId)) m.set(w.employeeId, new Map());
      m.get(w.employeeId)!.set(w.date, w.mode);
    }
    return m;
  })();

  // 직원 → 그 직원 담당 업무(월 범위 내)
  const tasksByEmp = (() => {
    const m = new Map<string, CalTask[]>();
    for (const t of tasks) {
      const r = taskRange(t.start_date, t.due_date);
      if (!r || r.end < days[0] || r.start > days[days.length - 1]) continue;
      for (const eid of t.assigneeIds) {
        const arr = m.get(eid) ?? [];
        arr.push(t);
        m.set(eid, arr);
      }
    }
    return m;
  })();

  const rowEmployees = employees.filter((e) => (tasksByEmp.get(e.id)?.length ?? 0) > 0 || leaveBy.has(e.id) || modeBy.has(e.id));
  const shown = rowEmployees.length > 0 ? rowEmployees : employees;

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <div style={{ minWidth: 150 + days.length * cellW }}>
        {/* 헤더 날짜 */}
        <div className="flex border-b border-neutral-100">
          <div className="sticky left-0 z-10 w-[150px] shrink-0 border-r border-neutral-100 bg-white px-3 py-2 text-xs font-semibold text-neutral-400">직원</div>
          <div className="flex">
            {days.map((d) => {
              const wd = dowOf(d);
              return (
                <div key={d} style={{ width: cellW }} className={`border-r border-neutral-50 py-1 text-center text-[10px] tabular-nums ${d === today ? "bg-neutral-900 font-bold text-white" : wd === 0 ? "text-rose-400" : wd === 6 ? "text-blue-400" : "text-neutral-400"}`}>
                  <div>{Number(d.slice(8))}</div>
                  <div className="opacity-70">{DOW_KR[wd]}</div>
                </div>
              );
            })}
          </div>
        </div>
        {/* 직원 행 */}
        {shown.map((e) => {
          const list = (tasksByEmp.get(e.id) ?? []).slice().sort((a, b) => (a.start_date ?? a.due_date ?? "").localeCompare(b.start_date ?? b.due_date ?? ""));
          // 행 높이: 막대 겹침 방지 위해 라인별 배치(단순 stack)
          const lanes: CalTask[][] = [];
          for (const t of list) {
            const r = taskRange(t.start_date, t.due_date)!;
            let placed = false;
            for (const lane of lanes) {
              if (lane.every((o) => { const ro = taskRange(o.start_date, o.due_date)!; return r.end < ro.start || r.start > ro.end; })) {
                lane.push(t); placed = true; break;
              }
            }
            if (!placed) lanes.push([t]);
          }
          const rowH = Math.max(1, lanes.length) * 26 + 12;
          const leaves = leaveBy.get(e.id) ?? new Set<string>();
          const modes = modeBy.get(e.id) ?? new Map<string, string>();
          return (
            <div key={e.id} className="flex border-b border-neutral-50">
              <div className="sticky left-0 z-10 flex w-[150px] shrink-0 items-center gap-2 border-r border-neutral-100 bg-white px-3 py-2">
                <Avatar emp={e} size={26} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-neutral-800">{e.name}</div>
                  {e.department && <div className="truncate text-[10px] text-neutral-400">{e.department}</div>}
                </div>
              </div>
              <div className="relative" style={{ width: days.length * cellW, height: rowH }}>
                {/* 배경 그리드 + 휴가/근무 음영 */}
                {days.map((d, di) => {
                  const onLeave = leaves.has(d);
                  const mode = modes.get(d);
                  return (
                    <div key={d} style={{ left: di * cellW, width: cellW }}
                      className={`absolute top-0 h-full border-r border-neutral-50 ${d === today ? "bg-amber-50/40" : ""} ${onLeave ? "bg-rose-50" : ""}`}
                      title={onLeave ? "휴가" : mode ? WORKMODE_LABEL[mode] : undefined}>
                      {!onLeave && mode && <div className="absolute bottom-0 left-0 right-0 h-1 bg-violet-300" />}
                    </div>
                  );
                })}
                {/* 업무 막대 */}
                {lanes.map((lane, li) => lane.map((t) => {
                  const r = taskRange(t.start_date, t.due_date)!;
                  const s = r.start < days[0] ? days[0] : r.start;
                  const en = r.end > days[days.length - 1] ? days[days.length - 1] : r.end;
                  const left = idxOf(s) * cellW;
                  const width = (idxOf(en) - idxOf(s) + 1) * cellW - 4;
                  return (
                    <button key={t.id} onClick={() => onTask(t)} style={{ left: left + 2, width, top: li * 26 + 6 }}
                      className={`absolute h-[22px] truncate rounded px-2 text-left text-[11px] font-medium text-white shadow-sm ${toneBar(catColor.get(t.category ?? "") ?? "neutral")} ${t.status === "DONE" ? "opacity-50" : ""}`}>
                      {t.title}
                    </button>
                  );
                }))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- 칸반 ----------
function KanbanView({
  tasks, empById, catColor, today, canProgress, onTask, onStatus,
}: {
  tasks: CalTask[]; empById: Map<string, CalEmployee>; catColor: Map<string, string>; today: string;
  canProgress: (t: CalTask) => boolean; onTask: (t: CalTask) => void; onStatus: (id: string, s: string) => void;
}) {
  const router = useRouter();
  const [drag, setDrag] = useState<CalTask | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const cols: TaskStatus[] = [...KANBAN_COLUMNS, "HOLD"];
  const byStatus = (s: string) => tasks.filter((t) => t.status === s);

  const drop = (s: TaskStatus) => {
    setOver(null);
    if (drag && drag.status !== s && canProgress(drag)) {
      onStatus(drag.id, s);
      router.refresh();
    }
    setDrag(null);
  };

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {cols.map((s) => {
        const list = byStatus(s);
        return (
          <div key={s} onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver((o) => (o === s ? null : o))} onDrop={() => drop(s)}
            className={`rounded-xl border bg-neutral-50/60 p-2 ${over === s ? "border-neutral-900 ring-1 ring-neutral-300" : "border-neutral-200"}`}>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${toneChip(TASK_STATUS_TONE[s])}`}>
                {TASK_STATUS_LABEL[s]} <span className="tabular-nums opacity-70">{list.length}</span>
              </span>
            </div>
            <div className="space-y-2">
              {list.map((t) => (
                <KanbanCard key={t.id} t={t} empById={empById} catColor={catColor} today={today}
                  draggable={canProgress(t)} onDragStart={() => setDrag(t)} onClick={() => onTask(t)} />
              ))}
              {list.length === 0 && <div className="px-1 py-6 text-center text-xs text-neutral-300">없음</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({
  t, empById, catColor, today, draggable, onDragStart, onClick,
}: {
  t: CalTask; empById: Map<string, CalEmployee>; catColor: Map<string, string>; today: string;
  draggable: boolean; onDragStart: () => void; onClick: () => void;
}) {
  const overdue = isOverdue(t.due_date, t.status, today);
  const soon = isDueSoon(t.due_date, t.status, today);
  const done = t.checklist.filter((c) => c.done).length;
  return (
    <div draggable={draggable} onDragStart={onDragStart} onClick={onClick}
      className={`cursor-pointer rounded-lg border border-neutral-200 bg-white p-2.5 shadow-sm hover:border-neutral-300 ${draggable ? "active:cursor-grabbing" : ""}`}>
      <div className="mb-1.5 flex items-center gap-1.5">
        {t.category && <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${toneChip(catColor.get(t.category) ?? "neutral")}`}>{t.category}</span>}
        {t.priority !== "NORMAL" && <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${toneChip(TASK_PRIORITY_TONE[t.priority as keyof typeof TASK_PRIORITY_TONE] ?? "neutral")}`}>{TASK_PRIORITY_LABEL[t.priority as keyof typeof TASK_PRIORITY_LABEL]}</span>}
      </div>
      <div className={`text-sm font-medium text-neutral-800 ${t.status === "DONE" ? "line-through opacity-50" : ""}`}>{t.title}</div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex -space-x-1.5">
          {t.assigneeIds.slice(0, 4).map((id) => { const e = empById.get(id); return e ? <span key={id} className="ring-2 ring-white rounded-full"><Avatar emp={e} size={20} /></span> : null; })}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-neutral-400">
          {t.checklist.length > 0 && <span>☑ {done}/{t.checklist.length}</span>}
          {t.comments.length > 0 && <span>💬 {t.comments.length}</span>}
          {t.due_date && <span className={`tabular-nums font-medium ${overdue ? "text-rose-500" : soon ? "text-amber-500" : ""}`}>~{t.due_date.slice(5).replace("-", "/")}</span>}
        </div>
      </div>
      {t.status !== "DONE" && t.progress > 0 && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full bg-blue-400" style={{ width: `${t.progress}%` }} />
        </div>
      )}
    </div>
  );
}

// ---------- 업무 모달(생성·수정·상세) ----------
function TaskModal({
  task, defaults, companies, employees, categories, me, readOnly, canProgress, onClose, onSaved,
}: {
  task: CalTask | null;
  defaults: Partial<TaskInput>;
  companies: Company[]; employees: CalEmployee[]; categories: CalCategory[];
  me: Me; readOnly: boolean; canProgress: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  const isNew = !task;
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(task?.title ?? "");
  const [desc, setDesc] = useState(task?.description ?? "");
  const [category, setCategory] = useState(task?.category ?? defaults.category ?? "");
  const [status, setStatus] = useState<string>(task?.status ?? "TODO");
  const [priority, setPriority] = useState<string>(task?.priority ?? "NORMAL");
  const [start, setStart] = useState(task?.start_date ?? defaults.start_date ?? "");
  const [due, setDue] = useState(task?.due_date ?? defaults.due_date ?? "");
  const [allDay, setAllDay] = useState(task?.all_day ?? true);
  const [startTime, setStartTime] = useState(task?.start_time ?? "");
  const [endTime, setEndTime] = useState(task?.end_time ?? "");
  const [companyId, setCompanyId] = useState(task?.company_id ?? defaults.company_id ?? (companies[0]?.id ?? ""));
  const [assignees, setAssignees] = useState<Set<string>>(new Set(task?.assigneeIds ?? (me.employeeId && !me.canAssign ? [me.employeeId] : [])));

  const editable = isNew || !readOnly;
  const companyEmployees = employees.filter((e) => !companyId || !e.companyId || e.companyId === companyId);

  function save() {
    if (!title.trim()) { alert("제목을 입력하세요"); return; }
    const input: TaskInput = {
      title, description: desc, category: category || null, status, priority,
      start_date: start || null, due_date: due || null, all_day: allDay,
      start_time: startTime || null, end_time: endTime || null,
      company_id: companyId || null,
      assigneeIds: me.canAssign ? [...assignees] : undefined,
    };
    startTransition(async () => {
      const r = isNew ? await createTask(input) : await updateTask(task!.id, input);
      if (!r.ok) { alert(r.error ?? "저장 실패"); return; }
      onSaved();
    });
  }
  function remove() {
    if (!task) return;
    if (!confirm("이 업무를 삭제할까요?")) return;
    startTransition(async () => {
      const r = await deleteTask(task.id);
      if (!r.ok) { alert(r.error ?? "삭제 실패"); return; }
      onSaved();
    });
  }
  function changeStatus(s: string) {
    setStatus(s);
    if (task) startTransition(async () => { await setTaskStatus(task.id, s); onSaved(); });
  }

  const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none disabled:bg-neutral-50 disabled:text-neutral-500";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={onClose}>
      <div className="my-auto w-full max-w-2xl rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
          <h3 className="font-semibold text-neutral-800">{isNew ? "새 업무" : readOnly ? "업무 상세" : "업무 수정"}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
          {/* 상태 빠른 변경(기존 업무) */}
          {!isNew && canProgress && (
            <div className="flex flex-wrap gap-1.5">
              {TASK_STATUSES.map((s) => (
                <button key={s} onClick={() => changeStatus(s)} disabled={pending}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${status === s ? toneChip(TASK_STATUS_TONE[s]) + " ring-1 ring-neutral-400" : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"}`}>
                  {TASK_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">제목</span>
            <input className={inputCls} value={title} disabled={!editable} onChange={(e) => setTitle(e.target.value)} placeholder="업무 제목" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-500">분류</span>
              <select className={inputCls} value={category} disabled={!editable} onChange={(e) => setCategory(e.target.value)}>
                <option value="">없음</option>
                {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-500">우선순위</span>
              <select className={inputCls} value={priority} disabled={!editable} onChange={(e) => setPriority(e.target.value)}>
                {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-500">시작일</span>
              <input type="date" className={inputCls} value={start} disabled={!editable} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-500">마감일</span>
              <input type="date" className={inputCls} value={due} disabled={!editable} onChange={(e) => setDue(e.target.value)} />
            </label>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-neutral-600">
              <input type="checkbox" checked={allDay} disabled={!editable} onChange={(e) => setAllDay(e.target.checked)} />
              종일
            </label>
            {!allDay && (
              <div className="flex items-center gap-2">
                <input type="time" className={inputCls + " w-auto"} value={startTime} disabled={!editable} onChange={(e) => setStartTime(e.target.value)} />
                <span className="text-neutral-400">~</span>
                <input type="time" className={inputCls + " w-auto"} value={endTime} disabled={!editable} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            )}
          </div>

          {companies.length > 1 && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-500">사업자</span>
              <select className={inputCls} value={companyId} disabled={!editable} onChange={(e) => setCompanyId(e.target.value)}>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}

          {/* 담당자 — 매니저·관리자만 편집 */}
          <div>
            <span className="mb-1 block text-xs font-medium text-neutral-500">담당자{!me.canAssign && " (본인)"}</span>
            <div className="flex flex-wrap gap-1.5">
              {companyEmployees.map((e) => {
                const on = assignees.has(e.id);
                return (
                  <button key={e.id} type="button" disabled={!me.canAssign || !editable}
                    onClick={() => { const n = new Set(assignees); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); setAssignees(n); }}
                    className={`inline-flex items-center gap-1 rounded-full border py-0.5 pl-0.5 pr-2 text-xs font-medium disabled:opacity-60 ${on ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"}`}>
                    <Avatar emp={e} size={18} />{e.name}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">설명</span>
            <textarea className={inputCls + " min-h-[80px]"} value={desc} disabled={!editable} onChange={(e) => setDesc(e.target.value)} placeholder="업무 상세 내용" />
          </label>

          {/* 체크리스트 + 댓글(기존 업무만) */}
          {task && <Checklist task={task} canEdit={canProgress} onChange={onSaved} />}
          {task && <Comments task={task} me={me} onChange={onSaved} />}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-neutral-100 px-5 py-3">
          {task && !readOnly ? (
            <button onClick={remove} disabled={pending} className="rounded-lg px-3 py-2 text-sm font-medium text-rose-500 hover:bg-rose-50">삭제</button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50">닫기</button>
            {editable && (
              <button onClick={save} disabled={pending} className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
                {pending ? "저장 중…" : isNew ? "만들기" : "저장"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Checklist({ task, canEdit, onChange }: { task: CalTask; canEdit: boolean; onChange: () => void }) {
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const done = task.checklist.filter((c) => c.done).length;
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => { const r = await fn(); if (!r.ok) alert(r.error); else onChange(); });
  return (
    <div className="rounded-xl border border-neutral-200 p-3">
      <div className="mb-2 text-xs font-semibold text-neutral-500">체크리스트 {task.checklist.length > 0 && <span className="text-neutral-400">({done}/{task.checklist.length})</span>}</div>
      <div className="space-y-1">
        {task.checklist.map((c) => (
          <div key={c.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={c.done} disabled={!canEdit || pending} onChange={(e) => run(() => toggleChecklistItem(c.id, e.target.checked))} />
            <span className={c.done ? "text-neutral-400 line-through" : "text-neutral-700"}>{c.label}</span>
            {canEdit && <button onClick={() => run(() => deleteChecklistItem(c.id))} className="ml-auto text-xs text-neutral-300 hover:text-rose-500">✕</button>}
          </div>
        ))}
      </div>
      {canEdit && (
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (label.trim()) { run(() => addChecklistItem(task.id, label)); setLabel(""); } }}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="+ 항목 추가" className="flex-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm" />
        </form>
      )}
    </div>
  );
}

function Comments({ task, me, onChange }: { task: CalTask; me: Me; onChange: () => void }) {
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => { const r = await fn(); if (!r.ok) alert(r.error); else onChange(); });
  return (
    <div className="rounded-xl border border-neutral-200 p-3">
      <div className="mb-2 text-xs font-semibold text-neutral-500">댓글 {task.comments.length > 0 && <span className="text-neutral-400">({task.comments.length})</span>}</div>
      <div className="space-y-2">
        {task.comments.map((c) => (
          <div key={c.id} className="rounded-lg bg-neutral-50 px-3 py-2 text-sm">
            <div className="mb-0.5 flex items-center gap-2">
              <span className="font-medium text-neutral-700">{c.author_name ?? "사용자"}</span>
              <span className="text-[10px] text-neutral-400">{c.created_at.slice(5, 16).replace("T", " ")}</span>
              {(me.isAdmin || c.author_id === me.profileId) && (
                <button onClick={() => run(() => deleteTaskComment(c.id))} className="ml-auto text-xs text-neutral-300 hover:text-rose-500">삭제</button>
              )}
            </div>
            <div className="whitespace-pre-wrap text-neutral-700">{c.body}</div>
          </div>
        ))}
        {task.comments.length === 0 && <div className="py-2 text-center text-xs text-neutral-300">아직 댓글이 없습니다</div>}
      </div>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (body.trim()) { run(() => addTaskComment(task.id, body)); setBody(""); } }}>
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="댓글 입력…" className="flex-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm" />
        <button disabled={pending} className="rounded-lg bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50">등록</button>
      </form>
    </div>
  );
}

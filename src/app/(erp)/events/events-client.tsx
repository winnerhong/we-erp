"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { krw } from "@/lib/labels";
import { assignStaff, removeStaff, setEventStatus, bulkSetEventStatus } from "./actions";
import { useTableSelection, BulkBar, BulkButton } from "@/components/bulk-select";

interface Staff { id: string; employeeId: string | null; employeeName: string; role: string | null }
export interface EventItem {
  id: string; name: string; partnerName: string;
  eventDate: string | null; place: string | null; headcount: number | null; programs: string | null;
  amount: number | null; status: string; staff: Staff[];
}
type Emp = { id: string; name: string };

const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "준비", cls: "bg-neutral-100 text-neutral-600" },
  ACTIVE: { label: "진행", cls: "bg-blue-100 text-blue-700" },
  ENDED: { label: "완료", cls: "bg-emerald-100 text-emerald-700" },
};

export function EventsClient({ items, employees, today }: { items: EventItem[]; employees: Emp[]; today: string }) {
  const router = useRouter();
  const [bulkPending, startBulk] = useTransition();
  const upcoming = items.filter((e) => !e.eventDate || e.eventDate >= today);
  const past = items.filter((e) => e.eventDate && e.eventDate < today);
  const sel = useTableSelection(items);
  const runBulk = (status: string) =>
    startBulk(async () => {
      const r = await bulkSetEventStatus(sel.selected, status);
      if (!r.ok) { alert(r.error); return; }
      sel.clear();
      router.refresh();
    });

  return (
    <div>
      <PageHeader title="🎪 행사 관리" description="체육행사 일정 · 투입 인력 배정 · 진행상태" />
      <BulkBar count={sel.count} onClear={sel.clear}>
        <span className="text-xs text-neutral-500">상태 일괄변경:</span>
        <BulkButton onClick={() => runBulk("DRAFT")} disabled={bulkPending}>준비</BulkButton>
        <BulkButton onClick={() => runBulk("ACTIVE")} disabled={bulkPending}>진행</BulkButton>
        <BulkButton onClick={() => runBulk("ENDED")} disabled={bulkPending}>완료</BulkButton>
      </BulkBar>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-200 px-4 py-16 text-center text-sm text-neutral-400">
          등록된 행사가 없습니다. 거래처 상세 → 계약 탭에서 <b>체육행사</b> 계약을 등록하면 여기에 표시됩니다.
        </p>
      ) : (
        <div className="space-y-5">
          {upcoming.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-neutral-500">예정 행사 <span className="text-neutral-400">{upcoming.length}</span></h3>
              {upcoming.map((e) => <EventCard key={e.id} e={e} employees={employees} today={today} selected={sel.isSelected(e.id)} onToggle={() => sel.toggle(e.id)} />)}
            </section>
          )}
          {past.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-neutral-500">지난 행사 <span className="text-neutral-400">{past.length}</span></h3>
              {past.map((e) => <EventCard key={e.id} e={e} employees={employees} today={today} selected={sel.isSelected(e.id)} onToggle={() => sel.toggle(e.id)} />)}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function EventCard({ e, employees, today, selected, onToggle }: { e: EventItem; employees: Emp[]; today: string; selected: boolean; onToggle: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [empId, setEmpId] = useState("");
  const [role, setRole] = useState("");
  const st = STATUS[e.status] ?? STATUS.DRAFT;
  const dday = e.eventDate ? Math.round((new Date(`${e.eventDate}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000) : null;
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => { const r = await fn(); if (!r.ok) alert(r.error); else router.refresh(); });

  return (
    <div className={`rounded-2xl border bg-white p-4 ${selected ? "border-indigo-300 ring-1 ring-indigo-200" : "border-neutral-200"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label="선택"
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-neutral-300 accent-indigo-500"
          />
          <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg">🎪</span>
            <h4 className="font-bold text-neutral-800">{e.name}</h4>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
            {dday !== null && dday >= 0 && dday <= 14 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">{dday === 0 ? "오늘" : `D-${dday}`}</span>}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-neutral-500">
            <span>🏢 {e.partnerName}</span>
            {e.eventDate && <span>📅 {e.eventDate}</span>}
            {e.place && <span>📍 {e.place}</span>}
            {e.headcount != null && <span>👥 {e.headcount.toLocaleString()}명</span>}
            {e.amount != null && <span>💰 {krw(e.amount)}</span>}
          </div>
          {e.programs && <p className="mt-1.5 rounded-lg bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-600">{e.programs}</p>}
          </div>
        </div>
        <select value={e.status} disabled={pending} onChange={(ev) => run(() => setEventStatus(e.id, ev.target.value))} className="rounded-lg border border-neutral-300 px-2 py-1 text-xs">
          {Object.entries(STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
        </select>
      </div>

      {/* 투입 인력 */}
      <div className="mt-3 border-t border-neutral-100 pt-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-neutral-500">투입 인력 {e.staff.length > 0 && <span className="text-neutral-400">{e.staff.length}명</span>}</span>
          {e.staff.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-neutral-100 py-0.5 pl-2.5 pr-1 text-xs text-neutral-700">
              {s.employeeName}{s.role ? <span className="text-neutral-400">· {s.role}</span> : null}
              <button onClick={() => run(() => removeStaff(s.id))} disabled={pending} className="ml-0.5 rounded-full px-1 text-neutral-400 hover:bg-neutral-200 hover:text-rose-500">✕</button>
            </span>
          ))}
          {e.staff.length === 0 && <span className="text-xs text-neutral-400">배정된 인력이 없습니다</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={empId} onChange={(ev) => setEmpId(ev.target.value)} className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm">
            <option value="">직원 선택</option>
            {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
          <input value={role} onChange={(ev) => setRole(ev.target.value)} placeholder="역할(메인/보조/진행)" className="w-40 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm" />
          <button onClick={() => { if (!empId) { alert("직원을 선택하세요"); return; } run(() => assignStaff(e.id, empId, role)); setEmpId(""); setRole(""); }} disabled={pending}
            className="rounded-lg bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50">+ 배정</button>
        </div>
      </div>
    </div>
  );
}

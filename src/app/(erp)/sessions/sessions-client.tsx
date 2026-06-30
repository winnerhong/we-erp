"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { managerSetSessionDone } from "@/app/(erp)/partners/crm-actions";

export interface SessionItem {
  id: string;
  partnerName: string;
  title: string | null;
  instructorName: string | null;
  status: string;
  presentCount: number | null;
  progressNote: string | null;
  completedAt: string | null;
}

function shiftDate(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export function SessionsClient({ date, sessions }: { date: string; sessions: SessionItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [instF, setInstF] = useState("ALL");
  const [statusF, setStatusF] = useState("ALL");

  const instructors = useMemo(() => [...new Set(sessions.map((s) => s.instructorName).filter((v): v is string => !!v))].sort(), [sessions]);

  const shown = sessions.filter((s) => {
    if (instF !== "ALL" && s.instructorName !== instF) return false;
    if (statusF === "DONE" && s.status !== "DONE") return false;
    if (statusF === "PLANNED" && s.status === "DONE") return false;
    return true;
  });

  const done = sessions.filter((s) => s.status === "DONE").length;
  const totalPresent = sessions.reduce((sum, s) => sum + (s.presentCount ?? 0), 0);
  const rate = sessions.length > 0 ? Math.round((done / sessions.length) * 100) : 0;

  function toggle(s: SessionItem) {
    startTransition(async () => {
      const r = await managerSetSessionDone(s.id, s.status !== "DONE");
      if (!r.ok) { alert(r.error); return; }
      router.refresh();
    });
  }

  return (
    <div>
      <PageHeader title="🤸 수업 현황" description="오늘 진행되는 체육수업 — 강사·기관별 완료·출석 모니터링" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white p-1">
          <button onClick={() => router.push(`/sessions?d=${shiftDate(date, -1)}`)} className="rounded px-2 py-1 text-sm hover:bg-neutral-100">‹</button>
          <input type="date" value={date} onChange={(e) => router.push(`/sessions?d=${e.target.value}`)} className="rounded px-2 py-1 text-sm tabular-nums" />
          <button onClick={() => router.push(`/sessions?d=${shiftDate(date, 1)}`)} className="rounded px-2 py-1 text-sm hover:bg-neutral-100">›</button>
        </div>
        <StatPill label="총 수업" value={`${sessions.length}`} />
        <StatPill label="완료" value={`${done}`} tone="emerald" />
        <StatPill label="예정" value={`${sessions.length - done}`} tone="amber" />
        <StatPill label="완료율" value={`${rate}%`} tone="blue" />
        <StatPill label="총 출석" value={`${totalPresent}명`} />
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <select value={instF} onChange={(e) => setInstF(e.target.value)} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm">
          <option value="ALL">전체 강사</option>
          {instructors.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm">
          <option value="ALL">전체 상태</option>
          <option value="PLANNED">예정</option>
          <option value="DONE">완료</option>
        </select>
      </div>

      {sessions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-200 px-4 py-16 text-center text-sm text-neutral-400">이 날짜에 등록된 수업이 없습니다.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-100 bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="px-3 py-2">강사</th><th className="px-3 py-2">기관</th><th className="px-3 py-2">반</th>
                <th className="px-3 py-2 text-right">출석</th><th className="px-3 py-2">진도·특이사항</th><th className="px-3 py-2">상태</th><th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {shown.map((s) => (
                <tr key={s.id} className={s.status === "DONE" ? "bg-emerald-50/30" : ""}>
                  <td className="px-3 py-2 font-medium text-neutral-800">{s.instructorName ?? "미배정"}</td>
                  <td className="px-3 py-2 text-neutral-700">{s.partnerName}</td>
                  <td className="px-3 py-2 text-neutral-500">{s.title || "-"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.presentCount != null ? `${s.presentCount}명` : "-"}</td>
                  <td className="max-w-[260px] truncate px-3 py-2 text-neutral-500" title={s.progressNote ?? ""}>{s.progressNote || "-"}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.status === "DONE" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{s.status === "DONE" ? "완료" : "예정"}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => toggle(s)} disabled={pending} className={`rounded-lg px-2.5 py-1 text-xs font-medium ${s.status === "DONE" ? "text-neutral-400 hover:bg-neutral-100" : "bg-emerald-600 text-white hover:bg-emerald-500"} disabled:opacity-50`}>
                      {s.status === "DONE" ? "취소" : "완료"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatPill({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const cls = tone === "emerald" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : tone === "amber" ? "bg-amber-50 text-amber-700 border-amber-200"
    : tone === "blue" ? "bg-blue-50 text-blue-700 border-blue-200"
    : "bg-white text-neutral-700 border-neutral-200";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm ${cls}`}>
      <span className="font-bold tabular-nums">{value}</span>
      <span className="text-xs opacity-80">{label}</span>
    </span>
  );
}

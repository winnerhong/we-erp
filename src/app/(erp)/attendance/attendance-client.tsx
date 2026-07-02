"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { ATT_STATUS_LABEL, ATT_STATUS_TONE, WORK_MODE_LABEL, fmtDuration } from "@/lib/attendance";

export interface AttRow {
  employeeId: string;
  name: string;
  department: string | null;
  checkIn: string | null;
  checkOut: string | null;
  workMinutes: number | null;
  status: string | null;
  workMode: string | null;
  monthNormal: number;
  monthLate: number;
  monthAbsent: number;
  monthMinutes: number;
  monthLeave: number;
}

function shiftDate(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
function dayLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const wd = ["일", "월", "화", "수", "목", "금", "토"][new Date(y, m - 1, d).getDay()];
  return `${y}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")} (${wd})`;
}

export function AttendanceClient({ date, rows }: { date: string; rows: AttRow[] }) {
  const router = useRouter();
  const go = (d: string) => router.push(`/attendance?d=${d}`);

  const allDepts = Array.from(new Set(rows.map((r) => r.department ?? "미지정")));
  const [dept, setDept] = useState<string>("");
  const view = dept ? rows.filter((r) => (r.department ?? "미지정") === dept) : rows;

  // 부서별 그룹(미지정은 맨 뒤)
  const groups = new Map<string, AttRow[]>();
  for (const r of view) {
    const k = r.department ?? "미지정";
    const arr = groups.get(k) ?? [];
    arr.push(r);
    groups.set(k, arr);
  }
  const groupKeys = [...groups.keys()].sort((a, b) => (a === "미지정" ? 1 : b === "미지정" ? -1 : a.localeCompare(b, "ko")));

  const worked = view.filter((r) => r.checkIn).length;
  const late = view.filter((r) => r.status === "LATE" || r.status === "LATE_EARLY").length;
  const out = view.filter((r) => r.checkOut).length;
  const notYet = view.length - worked;

  function exportCsv() {
    const head = ["부서", "직원", "출근", "퇴근", "근무시간(분)", "상태", "근무형태", "월정상", "월지각", "월결근", "월휴가", "월누적(분)"];
    const lines = view.map((r) => [
      r.department ?? "미지정", r.name, r.checkIn ?? "", r.checkOut ?? "", r.workMinutes ?? "",
      r.status ? ATT_STATUS_LABEL[r.status] ?? r.status : "미출근",
      r.workMode ? WORK_MODE_LABEL[r.workMode] ?? r.workMode : "",
      r.monthNormal, r.monthLate, r.monthAbsent, r.monthLeave, r.monthMinutes,
    ]);
    const csv = [head, ...lines].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `근태_${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">근태현황</h1>
          <p className="mt-1 text-sm text-neutral-500">직원별 출퇴근·지각·근무시간을 확인합니다.</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={exportCsv} className="mr-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">⬇ CSV</button>
          <button onClick={() => go(shiftDate(date, -1))} className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50">◀</button>
          <input type="date" value={date} onChange={(e) => e.target.value && go(e.target.value)} className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm" />
          <button onClick={() => go(shiftDate(date, 1))} className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50">▶</button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-neutral-700">{dayLabel(date)}</p>
        {allDepts.length > 1 && (
          <div className="ml-2 flex flex-wrap gap-1">
            <button onClick={() => setDept("")} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${dept === "" ? "bg-indigo-600 text-white" : "border border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"}`}>전체</button>
            {allDepts.map((d) => (
              <button key={d} onClick={() => setDept(d)} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${dept === d ? "bg-indigo-600 text-white" : "border border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"}`}>{d}</button>
            ))}
          </div>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4"><p className="text-xs text-neutral-500">출근</p><p className="mt-1 text-lg font-bold text-emerald-600">{worked}<span className="text-sm text-neutral-400">/{rows.length}명</span></p></Card>
        <Card className="p-4"><p className="text-xs text-neutral-500">퇴근</p><p className="mt-1 text-lg font-bold text-neutral-800">{out}명</p></Card>
        <Card className="p-4"><p className="text-xs text-neutral-500">지각</p><p className="mt-1 text-lg font-bold text-amber-600">{late}명</p></Card>
        <Card className="p-4"><p className="text-xs text-neutral-500">미출근</p><p className="mt-1 text-lg font-bold text-rose-500">{notYet}명</p></Card>
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2.5">직원</th>
              <th className="px-4 py-2.5">출근</th>
              <th className="px-4 py-2.5">퇴근</th>
              <th className="px-4 py-2.5">근무시간</th>
              <th className="px-4 py-2.5">근무형태</th>
              <th className="px-4 py-2.5">상태</th>
              <th className="px-4 py-2.5 text-right">이번 달 (정상/지각/결근/휴가 · 누적)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {view.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-neutral-400">직원이 없습니다.</td></tr>
            ) : (
              groupKeys.flatMap((gk) => [
                <tr key={`h-${gk}`} className="bg-neutral-50/70">
                  <td colSpan={7} className="px-4 py-1.5 text-xs font-semibold text-neutral-500">
                    📁 {gk} <span className="font-normal text-neutral-400">· {groups.get(gk)!.length}명</span>
                  </td>
                </tr>,
                ...groups.get(gk)!.map((r) => (
                <tr key={r.employeeId} className="hover:bg-neutral-50">
                  <td className="px-4 py-2.5 font-medium text-neutral-800">{r.name}</td>
                  <td className="px-4 py-2.5 tabular">{r.checkIn ?? <span className="text-neutral-300">-</span>}</td>
                  <td className="px-4 py-2.5 tabular">{r.checkOut ?? <span className="text-neutral-300">-</span>}</td>
                  <td className="px-4 py-2.5 tabular">{fmtDuration(r.workMinutes)}</td>
                  <td className="px-4 py-2.5 text-neutral-500">{r.workMode ? WORK_MODE_LABEL[r.workMode] ?? r.workMode : "-"}</td>
                  <td className="px-4 py-2.5">
                    {r.status ? (
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${ATT_STATUS_TONE[r.status] ?? "bg-neutral-100 text-neutral-600"}`}>
                        {ATT_STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    ) : (
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-400">미출근</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-neutral-500">
                    <span className="text-emerald-600">{r.monthNormal}</span> / <span className="text-amber-600">{r.monthLate}</span> / <span className="text-rose-500">{r.monthAbsent}</span> / <span className="text-blue-600">{r.monthLeave}</span>
                    <span className="ml-2 text-neutral-400">{fmtDuration(r.monthMinutes)}</span>
                  </td>
                </tr>
                ))
              ])
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

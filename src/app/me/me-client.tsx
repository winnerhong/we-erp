"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TextInput, SelectInput, Badge } from "@/components/ui";
import { PaybackList, type PaybackBrief } from "@/components/payback-list";
import { krw, LEAVE_TYPE_LABEL, LEAVE_STATUS_LABEL } from "@/lib/labels";
import type {
  EmployeeRow,
  PayrollRow,
  LeaveRequestRow,
  LeaveType,
  EmploymentCertificateRow,
  LaborContractRow,
  EmployeeDocumentRow,
  EmployeeEventRow,
  DocumentTemplateRow,
  DocumentIssueRow,
  AttendanceRow,
} from "@/lib/supabase/database.types";
import type { VarCompany, VarLabels } from "@/lib/document-vars";
import { DocumentIssuePanel } from "@/components/document-issue-panel";
import {
  ATT_STATUS_LABEL, ATT_STATUS_TONE, WORK_MODE_LABEL, WORK_MODES, fmtDuration, calcAttendance,
} from "@/lib/attendance";
import { requestLeave, cancelMyLeave, issueMyCertificate, clockIn, clockOut, setWorkMode, saveMyHrCard, updateMyPhoto } from "./actions";
import { createMyIssue, saveMySignedFile, deleteMyIssue } from "@/app/(erp)/documents/actions";
import { HrCardEditor } from "@/components/hr-card-editor";
import { normalizeHrExtra, HR_SCALAR_FIELDS, type HrScalarField } from "@/lib/hr-card";

type Tab = "att" | "info" | "pay" | "point" | "leave" | "docs" | "history";

export function MeClient({
  employee,
  companyName,
  payrolls,
  leaves,
  certs,
  contracts,
  docs,
  events,
  paybacks,
  templates,
  issues,
  company,
  labels,
  attendance,
  todayAtt,
  today,
  leaveDates,
  profile,
}: {
  employee: EmployeeRow;
  companyName: string | null;
  payrolls: PayrollRow[];
  leaves: LeaveRequestRow[];
  certs: EmploymentCertificateRow[];
  contracts: LaborContractRow[];
  docs: EmployeeDocumentRow[];
  events: EmployeeEventRow[];
  paybacks: PaybackBrief[];
  templates: DocumentTemplateRow[];
  issues: DocumentIssueRow[];
  company: VarCompany | null;
  labels: VarLabels;
  attendance: AttendanceRow[];
  todayAtt: AttendanceRow | null;
  today: string;
  leaveDates: string[];
  profile: MeProfile;
}) {
  const [tab, setTab] = useState<Tab>("att");
  const emp = employee;
  const todayLeave = leaveDates.includes(today) && !todayAtt?.check_in;

  return (
    <div className="space-y-4">
      {/* 상단 가로 메뉴 */}
      <nav className="sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto rounded-2xl border border-neutral-200 bg-white/90 p-1.5 backdrop-blur">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition ${
              tab === t.key ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
        {/* 좌측 패널 */}
        <aside className="space-y-3 lg:sticky lg:top-16 lg:self-start">
          <ProfileCard emp={emp} companyName={companyName} profile={profile} />
          <ClockWidget emp={emp} today={today} todayAtt={todayAtt} todayLeave={todayLeave} />
        </aside>

        {/* 우측 콘텐츠 */}
        <main className="min-w-0 space-y-4">
        {tab === "att" && <AttendanceContent today={today} rows={attendance} leaveDates={leaveDates} />}
        {tab === "info" && (
          <HrCardEditor
            initialScalars={hrScalars(emp)}
            initialExtra={normalizeHrExtra(emp.hr_extra)}
            onSave={(sc, ex) => saveMyHrCard(sc, ex)}
          />
        )}
        {tab === "pay" && <PayTab payrolls={payrolls} />}
        {tab === "point" && <PaybackList rows={paybacks} title="⭐ 포인트" term="포인트" />}
        {tab === "leave" && <LeaveTab emp={emp} leaves={leaves} />}
        {tab === "docs" && (
          <DocsTab certs={certs} contracts={contracts} docs={docs} employee={emp} templates={templates} issues={issues} company={company} labels={labels} />
        )}
        {tab === "history" && <HistoryTab events={events} />}
        </main>
      </div>
    </div>
  );
}

interface MeProfile {
  username: string | null;
  empTypeLabel: string;
  deptLabel: string;
  titleLabel: string;
  rankLabel: string;
}

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "att", label: "근태", icon: "🕘" },
  { key: "info", label: "내 정보", icon: "🧾" },
  { key: "pay", label: "급여 명세", icon: "💰" },
  { key: "point", label: "포인트", icon: "⭐" },
  { key: "leave", label: "휴가·연차", icon: "🌴" },
  { key: "docs", label: "서류", icon: "📄" },
  { key: "history", label: "인사이력", icon: "📌" },
];

// 이미지 파일 → 정사각 축소 data URL(JPEG)
function resizeImage(file: File, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const c = document.createElement("canvas");
      c.width = max;
      c.height = max;
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error("canvas"));
      ctx.drawImage(img, sx, sy, side, side, 0, 0, max, max);
      resolve(c.toDataURL("image/jpeg", 0.85));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// 프로필 사진 — 촬영/파일선택/붙여넣기 업로드
function AvatarUploader({ emp }: { emp: EmployeeRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = (dataUrl: string | null) =>
    startTransition(async () => {
      const r = await updateMyPhoto(dataUrl);
      if (!r.ok) alert(r.error ?? "오류");
      setOpen(false);
      router.refresh();
    });
  async function handleFile(file: File) {
    try {
      save(await resizeImage(file, 256));
    } catch {
      alert("이미지를 처리할 수 없습니다.");
    }
  }
  async function pasteFromClipboard() {
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = it.types.find((t) => t.startsWith("image/"));
        if (type) {
          const blob = await it.getType(type);
          handleFile(new File([blob], "paste.png", { type }));
          return;
        }
      }
      alert("클립보드에 이미지가 없습니다. 이미지를 복사한 뒤 다시 시도하세요.");
    } catch {
      alert("브라우저에서 붙여넣기를 막았습니다. 팝업을 연 상태로 Ctrl+V 하거나 파일 선택을 이용하세요.");
    }
  }
  // 팝업 열려 있을 때 Ctrl+V 로 붙여넣기
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"))?.getAsFile();
      if (f) {
        e.preventDefault();
        handleFile(f);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} disabled={pending} className="group relative block" title="프로필 사진 변경">
        {emp.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={emp.photo_url} alt={emp.name} className="h-20 w-20 rounded-full object-cover shadow-sm" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-2xl font-bold text-white shadow-sm">
            {emp.name?.[0] ?? "?"}
          </div>
        )}
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
          {pending ? "저장 중…" : "📷 변경"}
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-1/2 z-50 mt-2 w-48 -translate-x-1/2 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl">
            <MenuRow icon="📷" label="사진 찍기" onClick={() => camRef.current?.click()} />
            <MenuRow icon="📁" label="파일 선택" onClick={() => fileRef.current?.click()} />
            <MenuRow icon="📋" label="붙여넣기" onClick={pasteFromClipboard} />
            {emp.photo_url && <MenuRow icon="🗑" label="사진 삭제" danger onClick={() => save(null)} />}
            <p className="px-2 py-1 text-[11px] text-neutral-400">이미지 복사 후 Ctrl+V 도 가능</p>
          </div>
        </>
      )}
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
    </div>
  );
}
function MenuRow({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-neutral-100 ${danger ? "text-rose-600" : "text-neutral-700"}`}>
      <span className="w-5 text-center">{icon}</span>
      {label}
    </button>
  );
}

// ---------- 좌측: 프로필 카드 ----------
function ProfileCard({ emp, companyName, profile }: { emp: EmployeeRow; companyName: string | null; profile: MeProfile }) {
  const subtitle = [profile.deptLabel, profile.titleLabel || profile.rankLabel].filter(Boolean).join(" · ");
  const info: [string, string][] = [
    ["아이디", profile.username ?? "-"],
    ["회사", companyName ?? "미배정"],
    ["고용형태", profile.empTypeLabel || "-"],
    ["입사일", emp.hired_on ?? "-"],
    ["연락처", emp.phone ?? "-"],
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <div className="flex flex-col items-center bg-gradient-to-b from-indigo-50 to-white px-5 pb-4 pt-6">
        <AvatarUploader emp={emp} />
        <h2 className="mt-3 text-lg font-bold text-neutral-900">{emp.name}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>}
      </div>
      <dl className="divide-y divide-neutral-50 px-5 py-1 text-sm">
        {info.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 py-2">
            <dt className="shrink-0 text-xs text-neutral-400">{k}</dt>
            <dd className="truncate text-right font-medium text-neutral-700">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
        <h3 className="font-semibold text-neutral-800">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

// EmployeeRow → 인사카드 신상 스칼라 초기값
function hrScalars(emp: EmployeeRow): Partial<Record<HrScalarField, string>> {
  const o: Partial<Record<HrScalarField, string>> = {};
  for (const k of HR_SCALAR_FIELDS) o[k] = (emp[k as keyof EmployeeRow] as string | null) ?? "";
  return o;
}

// ---------- 근태(출퇴근) ----------
function LiveWork({ checkIn }: { checkIn: string }) {
  const [min, setMin] = useState<number | null>(null);
  useEffect(() => {
    const calc = () => {
      const now = new Date();
      const [h, m] = checkIn.split(":").map(Number);
      setMin(Math.max(0, now.getHours() * 60 + now.getMinutes() - (h * 60 + m)));
    };
    calc();
    const t = setInterval(calc, 20000);
    return () => clearInterval(t);
  }, [checkIn]);
  return <>{fmtDuration(min)}</>;
}

// 날짜 헬퍼('YYYY-MM-DD')
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(s: string, n: number) {
  const d = new Date(`${s}T00:00:00`);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
function startOfWeek(s: string) {
  const d = new Date(`${s}T00:00:00`);
  d.setDate(d.getDate() - d.getDay()); // 일요일 시작
  return ymd(d);
}
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

// ---------- 좌측: 출퇴근 클럭 위젯 ----------
function ClockWidget({ emp, today, todayAtt, todayLeave }: { emp: EmployeeRow; today: string; todayAtt: AttendanceRow | null; todayLeave: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const ci = todayAtt?.check_in ?? null;
  const co = todayAtt?.check_out ?? null;
  const calc = calcAttendance(ci, co, emp.work_start, emp.work_end);
  const todayStatus = todayLeave ? "LEAVE" : calc.status;
  const dow = DOW[new Date(`${today}T00:00:00`).getDay()];
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) alert(r.error ?? "오류");
      router.refresh();
    });

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-500">오늘 {today.slice(5).replace("-", ".")} ({dow})</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ATT_STATUS_TONE[todayStatus] ?? "bg-neutral-100 text-neutral-600"}`}>
          {ATT_STATUS_LABEL[todayStatus] ?? todayStatus}
        </span>
      </div>
      <div className="mb-3 rounded-xl bg-gradient-to-br from-emerald-50 to-white py-4 text-center">
        <p className="text-[11px] text-emerald-500">근무시간</p>
        <p className="mt-0.5 text-2xl font-extrabold tabular text-emerald-700">
          {co ? fmtDuration(calc.workMinutes) : ci ? <LiveWork checkIn={ci} /> : "00:00"}
        </p>
        <p className="mt-1 text-[11px] text-neutral-400">출근 {ci ?? "-"} · 퇴근 {co ?? "-"}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => act(clockIn)} disabled={pending || !!ci}
          className="rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:bg-neutral-200 disabled:text-neutral-400">
          {ci ? "출근 완료" : "출근하기"}
        </button>
        <button onClick={() => act(clockOut)} disabled={pending || !ci || !!co}
          className="rounded-xl bg-neutral-900 px-3 py-2.5 text-sm font-bold text-white hover:bg-neutral-700 disabled:bg-neutral-200 disabled:text-neutral-400">
          {co ? "퇴근 완료" : "퇴근하기"}
        </button>
      </div>
      <select value={todayAtt?.work_mode ?? "OFFICE"} onChange={(ev) => act(() => setWorkMode(ev.target.value))} disabled={pending}
        className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm" title="근무상태 변경">
        {WORK_MODES.map((m) => <option key={m} value={m}>근무상태 · {WORK_MODE_LABEL[m]}</option>)}
      </select>
      {todayLeave && <p className="mt-2 text-center text-xs text-blue-600">오늘은 승인된 휴가일입니다.</p>}
    </div>
  );
}

// ---------- 우측: 근태 현황(주간 스트립 + 월간) ----------
function AttendanceContent({ today, rows, leaveDates }: { today: string; rows: AttendanceRow[]; leaveDates: string[] }) {
  const [view, setView] = useState<"week" | "month">("week");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const byDate = new Map(rows.map((a) => [a.work_date, a]));
  const leaveSet = new Set(leaveDates);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekMin = weekDays.reduce((s, d) => s + (byDate.get(d)?.work_minutes ?? 0), 0);
  const weekEnd = addDays(weekStart, 6);
  const targetMin = 40 * 60; // 주 40시간 기준
  const pct = Math.min(100, Math.round((weekMin / targetMin) * 100));

  // 월간 병합(현재 달)
  const month = today.slice(0, 7);
  const monthRows = rows.filter((a) => a.work_date.slice(0, 7) === month);
  const monthMin = monthRows.reduce((s, a) => s + (a.work_minutes ?? 0), 0);
  const monthLate = monthRows.filter((a) => a.status === "LATE" || a.status === "LATE_EARLY").length;
  const attDates = new Set(monthRows.map((a) => a.work_date));
  type MRow = { id: string; work_date: string; check_in: string | null; check_out: string | null; work_minutes: number | null; status: string; work_mode: string | null };
  const merged: MRow[] = [
    ...monthRows.map((a) => a as MRow),
    ...leaveDates.filter((d) => d.slice(0, 7) === month && !attDates.has(d)).map((d) => ({ id: `lv-${d}`, work_date: d, check_in: null, check_out: null, work_minutes: null, status: "LEAVE", work_mode: null })),
  ].sort((a, b) => (a.work_date < b.work_date ? 1 : -1));

  return (
    <div className="space-y-4">
      {/* 통계 카드 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="이번 주 근무" value={fmtDuration(weekMin)} tone="emerald" />
        <StatCard label="이번 달 누적" value={fmtDuration(monthMin)} tone="indigo" />
        <StatCard label="이번 달 출근" value={`${monthRows.filter((a) => a.check_in).length}일`} tone="neutral" />
        <StatCard label="이번 달 지각" value={`${monthLate}회`} tone={monthLate > 0 ? "amber" : "neutral"} />
      </div>

      {/* 근태 현황 카드 */}
      <Section
        title="내 근태현황"
        action={
          <div className="inline-flex rounded-lg border border-neutral-300 bg-white p-0.5 text-xs">
            <button onClick={() => setView("week")} className={`rounded-md px-2.5 py-1 font-medium ${view === "week" ? "bg-neutral-900 text-white" : "text-neutral-500"}`}>주간</button>
            <button onClick={() => setView("month")} className={`rounded-md px-2.5 py-1 font-medium ${view === "month" ? "bg-neutral-900 text-white" : "text-neutral-500"}`}>월간</button>
          </div>
        }
      >
        {view === "week" ? (
          <div className="p-4">
            {/* 주 네비 + 주간누적 */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">◀</button>
                <span className="px-1 text-sm font-medium text-neutral-700">{weekStart.replaceAll("-", ".")} ~ {weekEnd.slice(5).replace("-", ".")}</span>
                <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">▶</button>
                <button onClick={() => setWeekStart(startOfWeek(today))} className="ml-1 rounded-md px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50">오늘</button>
              </div>
              <span className="text-sm text-neutral-500">주간누적 <b className="text-emerald-600">{fmtDuration(weekMin)}</b></span>
            </div>
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
            </div>
            {/* 7일 스트립 */}
            <div className="grid grid-cols-7 gap-1.5">
              {weekDays.map((d, i) => {
                const a = byDate.get(d);
                const isLeave = !a?.check_in && leaveSet.has(d);
                const isToday = d === today;
                const dnum = Number(d.slice(8));
                return (
                  <div key={d} className={`rounded-xl border p-2 text-center ${isToday ? "border-emerald-400 bg-emerald-50/50" : "border-neutral-100"}`}>
                    <p className={`text-[11px] ${i === 0 ? "text-rose-400" : i === 6 ? "text-blue-400" : "text-neutral-400"}`}>{DOW[i]}</p>
                    <p className={`text-sm font-bold ${isToday ? "text-emerald-700" : "text-neutral-700"}`}>{dnum}</p>
                    {a?.work_minutes ? (
                      <p className="mt-1 text-[10px] font-semibold tabular text-emerald-600">{fmtDuration(a.work_minutes)}</p>
                    ) : a?.check_in ? (
                      <p className="mt-1 text-[10px] text-neutral-400">근무중</p>
                    ) : isLeave ? (
                      <p className="mt-1 text-[10px] font-medium text-blue-500">휴가</p>
                    ) : (
                      <p className="mt-1 text-[10px] text-neutral-300">-</p>
                    )}
                    {a?.check_in && <p className="text-[9px] text-neutral-400">{a.check_in}~{a.check_out ?? ""}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        ) : merged.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-400">이번 달 기록이 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
              <tr>
                <th className="px-4 py-2">날짜</th><th className="px-4 py-2">출근</th><th className="px-4 py-2">퇴근</th>
                <th className="px-4 py-2">근무시간</th><th className="px-4 py-2">근무형태</th><th className="px-4 py-2">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {merged.map((a) => (
                <tr key={a.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2 text-neutral-700">{a.work_date.slice(5).replace("-", ".")}</td>
                  <td className="px-4 py-2 tabular">{a.check_in ?? "-"}</td>
                  <td className="px-4 py-2 tabular">{a.check_out ?? "-"}</td>
                  <td className="px-4 py-2 tabular">{fmtDuration(a.work_minutes)}</td>
                  <td className="px-4 py-2 text-neutral-500">{a.work_mode ? WORK_MODE_LABEL[a.work_mode] ?? a.work_mode : "-"}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${ATT_STATUS_TONE[a.status] ?? "bg-neutral-100 text-neutral-600"}`}>
                      {ATT_STATUS_LABEL[a.status] ?? a.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: "emerald" | "indigo" | "amber" | "neutral" }) {
  const t = {
    emerald: "text-emerald-600",
    indigo: "text-indigo-600",
    amber: "text-amber-600",
    neutral: "text-neutral-800",
  }[tone];
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular ${t}`}>{value}</p>
    </div>
  );
}

// ---------- 급여 명세 ----------
function PayTab({ payrolls }: { payrolls: PayrollRow[] }) {
  return (
    <Section title="💰 급여 명세">
      {payrolls.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-neutral-400">급여 내역이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-100 text-xs text-neutral-500">
              <tr>
                <th className="px-5 py-2">월</th>
                <th className="px-3 py-2 text-right">기본급</th>
                <th className="px-3 py-2 text-right">수당</th>
                <th className="px-3 py-2 text-right">공제</th>
                <th className="px-5 py-2 text-right">실수령</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {payrolls.map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-2 font-medium">{p.year_month}</td>
                  <td className="px-3 py-2 text-right tabular">{krw(p.base_pay)}</td>
                  <td className="px-3 py-2 text-right tabular">{krw(p.allowance + p.nontax_allowance)}</td>
                  <td className="px-3 py-2 text-right tabular text-rose-600">−{krw(p.income_tax + p.insurance + p.other_deduction)}</td>
                  <td className="px-5 py-2 text-right tabular font-semibold">{krw(p.net_pay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-neutral-50 px-5 py-2 text-xs text-neutral-400">공제는 추정치가 포함될 수 있습니다. 정확한 내역은 관리자에게 문의하세요.</p>
    </Section>
  );
}

// ---------- 휴가·연차 ----------
function LeaveTab({ emp, leaves }: { emp: EmployeeRow; leaves: LeaveRequestRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [d, setD] = useState({ leave_type: "ANNUAL" as LeaveType, start_date: "", end_date: "", reason: "" });

  const usedAnnual = leaves
    .filter((l) => l.status === "APPROVED" && (l.leave_type === "ANNUAL" || l.leave_type === "HALF_DAY"))
    .reduce((s, l) => s + (l.days ?? 0), 0);

  function daysBetween(a: string, b: string) {
    const diff = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1;
    return diff > 0 ? diff : 1;
  }
  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await requestLeave({
        leave_type: d.leave_type,
        start_date: d.start_date,
        end_date: d.end_date,
        days: d.leave_type === "HALF_DAY" ? 0.5 : daysBetween(d.start_date, d.end_date),
        reason: d.reason || null,
      });
      if (res.ok) {
        setAdding(false);
        setD({ leave_type: "ANNUAL", start_date: "", end_date: "", reason: "" });
        router.refresh();
      } else setError(res.error ?? "오류");
    });
  }

  return (
    <Section
      title={`🌴 휴가·연차 (승인 사용 ${usedAnnual}일)`}
      action={
        <button
          onClick={() => setAdding((v) => !v)}
          disabled={!emp.company_id}
          title={emp.company_id ? "" : "소속 사업자가 없어 신청할 수 없습니다"}
          className="rounded-lg bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          + 휴가 신청
        </button>
      }
    >
      {adding && (
        <div className="space-y-2 border-b border-neutral-100 bg-neutral-50 p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SelectInput value={d.leave_type} onChange={(e) => setD({ ...d, leave_type: e.target.value as LeaveType })}>
              {Object.entries(LEAVE_TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </SelectInput>
            <TextInput type="date" value={d.start_date} onChange={(e) => setD({ ...d, start_date: e.target.value })} />
            <TextInput type="date" value={d.end_date} onChange={(e) => setD({ ...d, end_date: e.target.value })} />
            <TextInput value={d.reason} onChange={(e) => setD({ ...d, reason: e.target.value })} placeholder="사유" />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button
            onClick={submit}
            disabled={pending || !d.start_date || !d.end_date}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            신청
          </button>
        </div>
      )}
      {leaves.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-neutral-400">휴가 신청 내역이 없습니다.</p>
      ) : (
        <div className="divide-y divide-neutral-50">
          {leaves.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
              <div>
                <span className="font-medium">{LEAVE_TYPE_LABEL[l.leave_type]}</span>
                <span className="ml-2 text-neutral-500">
                  {l.start_date}
                  {l.end_date !== l.start_date ? ` ~ ${l.end_date}` : ""} · {l.days}일
                </span>
                {l.reason && <span className="ml-2 text-xs text-neutral-400">{l.reason}</span>}
              </div>
              <div className="flex items-center gap-1.5">
                <Badge tone={l.status === "APPROVED" ? "green" : l.status === "REJECTED" ? "red" : "neutral"}>
                  {LEAVE_STATUS_LABEL[l.status]}
                </Badge>
                {l.status === "PENDING" && (
                  <button
                    onClick={() => {
                      if (confirm("이 휴가 신청을 취소할까요?"))
                        startTransition(async () => {
                          await cancelMyLeave(l.id);
                          router.refresh();
                        });
                    }}
                    className="rounded-md px-1.5 py-0.5 text-xs text-rose-500 hover:bg-rose-50"
                  >
                    취소
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ---------- 서류 ----------
function DocsTab({
  certs,
  contracts,
  docs,
  employee,
  templates,
  issues,
  company,
  labels,
}: {
  certs: EmploymentCertificateRow[];
  contracts: LaborContractRow[];
  docs: EmployeeDocumentRow[];
  employee: EmployeeRow;
  templates: DocumentTemplateRow[];
  issues: DocumentIssueRow[];
  company: VarCompany | null;
  labels: VarLabels;
}) {
  const router = useRouter();
  const meToday = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  })();
  const [pending, startTransition] = useTransition();
  const [issuing, setIssuing] = useState(false);
  const [form, setForm] = useState({ purpose: "", submit_to: "", department: "", position: "" });
  const [error, setError] = useState<string | null>(null);

  function issue() {
    setError(null);
    startTransition(async () => {
      const res = await issueMyCertificate({
        purpose: form.purpose || null,
        submit_to: form.submit_to || null,
        department: form.department || null,
        position: form.position || null,
      });
      if (res.ok) {
        setIssuing(false);
        setForm({ purpose: "", submit_to: "", department: "", position: "" });
        router.refresh();
      } else setError(res.error ?? "오류");
    });
  }

  return (
    <div className="space-y-4">
      {/* 내 서류 — 서명 필요 건을 위로, 다운로드·서명본 업로드. 양식 자가발행은 막고(관리자 발행) 재직증명서만 셀프. */}
      <DocumentIssuePanel
        employee={employee}
        company={company}
        labels={labels}
        today={meToday}
        templates={templates}
        issues={issues}
        companyId={employee.company_id ?? null}
        canIssue={false}
        unsignedFirst
        title="📁 내 서류"
        actions={{
          create: (input) => createMyIssue({ template_id: input.template_id, company_id: input.company_id, title: input.title, rendered_body: input.rendered_body, field_values: input.field_values }),
          saveSigned: saveMySignedFile,
          remove: deleteMyIssue,
        }}
      />

      <Section
        title="📄 재직증명서"
        action={
          <button onClick={() => setIssuing((v) => !v)} className="rounded-lg bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-700">
            + 발급
          </button>
        }
      >
        {issuing && (
          <div className="space-y-2 border-b border-neutral-100 bg-neutral-50 p-3">
            <div className="grid grid-cols-2 gap-2">
              <TextInput value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="부서(선택)" />
              <TextInput value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="직위(선택)" />
              <TextInput value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="용도(선택)" />
              <TextInput value={form.submit_to} onChange={(e) => setForm({ ...form, submit_to: e.target.value })} placeholder="제출처(선택)" />
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button onClick={issue} disabled={pending} className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50">
              발급
            </button>
          </div>
        )}
        {certs.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-400">발급 이력이 없습니다.</p>
        ) : (
          <div className="divide-y divide-neutral-50">
            {certs.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                <div>
                  <span className="font-medium">{c.cert_no}</span>
                  <span className="ml-2 text-neutral-500">{c.issued_on}</span>
                  {c.purpose && <span className="ml-2 text-xs text-neutral-400">{c.purpose}</span>}
                </div>
                <Link href={`/cert/${c.id}`} target="_blank" className="text-xs text-indigo-600 underline">
                  보기/인쇄
                </Link>
              </div>
            ))}
          </div>
        )}
      </Section>

      {contracts.length > 0 && (
        <Section title="📝 근로계약서(이력)">
          <div className="divide-y divide-neutral-50">
            {contracts.map((ct) => (
              <div key={ct.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                <span>
                  <span className="font-medium">{ct.contract_type || "근로계약"}</span>
                  <span className="ml-2 text-neutral-500">
                    {ct.start_date || "?"}
                    {ct.end_date ? ` ~ ${ct.end_date}` : ""}
                  </span>
                </span>
                {ct.file_url && (
                  <a href={ct.file_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 underline">
                    첨부보기
                  </a>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="🗂 첨부 보관함">
        {docs.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-400">첨부된 서류가 없습니다. (통장사본·스캔본 등은 관리자에게 문의)</p>
        ) : (
          <div className="divide-y divide-neutral-50">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                <span>
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">{d.doc_type || "서류"}</span>
                  <span className="ml-2 font-medium">{d.title || "-"}</span>
                </span>
                {d.file_url && (
                  <a href={d.file_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 underline">
                    보기
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ---------- 인사이력 ----------
function HistoryTab({ events }: { events: EmployeeEventRow[] }) {
  return (
    <Section title="📌 인사 발령·변동 이력">
      {events.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-neutral-400">등록된 인사 이력이 없습니다.</p>
      ) : (
        <div className="divide-y divide-neutral-50">
          {events.map((ev) => (
            <div key={ev.id} className="flex items-center gap-2 px-5 py-2.5 text-sm">
              <span className="text-neutral-500">{ev.event_date || "-"}</span>
              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700">{ev.event_type || "-"}</span>
              {ev.title && <span className="font-medium">{ev.title}</span>}
              {ev.detail && <span className="text-xs text-neutral-400">{ev.detail}</span>}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

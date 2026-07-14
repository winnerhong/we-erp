"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EntityWorkspace, KpiCard, type EwItem, type EwTab } from "@/components/entity-workspace";
import { importStudentsFromWks, bulkSetStudentStatus, bulkDeleteStudents } from "./actions";
import { useTableSelection, SelectAllCell, SelectRowCell, BulkBar, BulkButton } from "@/components/bulk-select";

export interface StudentRow {
  id: string;
  name: string;
  gender: string | null;
  birthday: string | null;
  school: string | null;
  grade: string | null;
  class_name: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  student_phone: string | null;
  address: string | null;
  status: string | null; // 재원 | 휴원 | 퇴원
  enrollment_date: string | null;
  homeroom_teacher: string | null;
  memo: string | null;
}

const STATUS_TONE: Record<string, string> = { 재원: "green", 휴원: "amber", 퇴원: "red" };

function monthsSince(date: string | null): string {
  if (!date) return "-";
  const start = new Date(date);
  if (Number.isNaN(start.getTime())) return "-";
  const now = new Date();
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (months < 0) return "-";
  if (months < 12) return `${months}개월`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m ? `${y}년 ${m}개월` : `${y}년`;
}

function StudentSyncButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const running = useRef(false);

  async function sync() {
    if (running.current) return;
    running.current = true;
    try {
      const res = await importStudentsFromWks();
      if (!res.ok) alert(res.error);
      else alert(`동기화 완료: 원생 ${res.counts["원생"] ?? res.total}명`);
      router.refresh();
    } finally {
      running.current = false;
    }
  }

  return (
    <button
      onClick={() => startTransition(sync)}
      disabled={pending}
      className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
    >
      {pending ? "동기화 중…" : "🔄 원생 가져오기"}
    </button>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-neutral-100 py-2 text-sm last:border-0">
      <span className="w-28 shrink-0 text-neutral-400">{label}</span>
      <span className="font-medium text-neutral-800">{value || "-"}</span>
    </div>
  );
}

export function StudentsClient({ rows, selectedId }: { rows: StudentRow[]; selectedId: string | null }) {
  const [view, setView] = useState<"card" | "grid">("card");
  const gridRouter = useRouter();
  const [bulkPending, startBulk] = useTransition();
  const sel = useTableSelection(rows);
  const runBulk = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startBulk(async () => {
      const r = await fn();
      if (!r.ok) { alert(r.error); return; }
      sel.clear();
      gridRouter.refresh();
    });

  const items: EwItem[] = rows.map((r) => ({
    id: r.id,
    title: r.name,
    badge: r.status ? { label: r.status, tone: STATUS_TONE[r.status] } : null,
    sub: [r.school, r.class_name].filter(Boolean).join(" · ") || (r.guardian_phone ?? ""),
    search: [r.name, r.school, r.class_name, r.guardian_name, r.guardian_phone, r.student_phone]
      .filter(Boolean)
      .join(" "),
    filterKey: r.status ?? undefined,
    preview: {
      initial: r.name?.[0] ?? "?",
      title: r.name,
      subtitle: [r.school, r.grade, r.class_name].filter(Boolean).join(" · "),
      badge: r.status ? { label: r.status, tone: STATUS_TONE[r.status] } : null,
      fields: [
        { label: "학교·학년", value: [r.school, r.grade].filter(Boolean).join(" ") },
        { label: "반", value: r.class_name || "" },
        { label: "보호자", value: r.guardian_name || "" },
        { label: "보호자연락처", value: r.guardian_phone || "" },
        { label: "학생연락처", value: r.student_phone || "" },
        { label: "등록일", value: r.enrollment_date || "" },
      ],
    },
  }));

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const actions = (
    <>
      <div className="inline-flex rounded-lg border border-neutral-300 bg-white p-0.5 text-sm">
        <button
          onClick={() => setView("card")}
          className={`rounded-md px-2.5 py-1 font-medium ${view === "card" ? "bg-indigo-500 text-white" : "text-neutral-500 hover:text-neutral-800"}`}
        >
          🗂 카드형
        </button>
        <button
          onClick={() => setView("grid")}
          className={`rounded-md px-2.5 py-1 font-medium ${view === "grid" ? "bg-indigo-500 text-white" : "text-neutral-500 hover:text-neutral-800"}`}
        >
          ▦ 엑셀형
        </button>
      </div>
      <StudentSyncButton />
    </>
  );

  if (view === "grid") {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-neutral-900">원생 관리</h1>
          <div className="flex items-center gap-1.5">{actions}</div>
        </div>
        <BulkBar count={sel.count} onClear={sel.clear}>
          <span className="text-xs text-neutral-500">상태 일괄변경:</span>
          <BulkButton onClick={() => runBulk(() => bulkSetStudentStatus(sel.selected, "재원"))} disabled={bulkPending}>재원</BulkButton>
          <BulkButton onClick={() => runBulk(() => bulkSetStudentStatus(sel.selected, "휴원"))} disabled={bulkPending}>휴원</BulkButton>
          <BulkButton onClick={() => runBulk(() => bulkSetStudentStatus(sel.selected, "퇴원"))} disabled={bulkPending}>퇴원</BulkButton>
          <BulkButton tone="danger" disabled={bulkPending} onClick={() => { if (confirm(`선택한 ${sel.count}명을 삭제할까요? 되돌릴 수 없습니다.`)) runBulk(() => bulkDeleteStudents(sel.selected)); }}>🗑 삭제</BulkButton>
        </BulkBar>
        <div className="overflow-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500">
              <tr>
                <SelectAllCell checked={sel.allChecked} someChecked={sel.someChecked} onToggle={sel.toggleAll} />
                {["이름", "상태", "학교", "학년", "반", "보호자", "보호자연락처", "등록일"].map((h) => (
                  <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((r) => (
                <tr key={r.id} className={`hover:bg-neutral-50 ${sel.isSelected(r.id) ? "bg-indigo-50/50" : ""}`}>
                  <SelectRowCell checked={sel.isSelected(r.id)} onToggle={() => sel.toggle(r.id)} />
                  <td className="px-3 py-2 font-medium text-neutral-800">{r.name}</td>
                  <td className="px-3 py-2">{r.status ?? "-"}</td>
                  <td className="px-3 py-2 text-neutral-600">{r.school ?? "-"}</td>
                  <td className="px-3 py-2 text-neutral-600">{r.grade ?? "-"}</td>
                  <td className="px-3 py-2 text-neutral-600">{r.class_name ?? "-"}</td>
                  <td className="px-3 py-2 text-neutral-600">{r.guardian_name ?? "-"}</td>
                  <td className="px-3 py-2 text-neutral-600">{r.guardian_phone ?? "-"}</td>
                  <td className="px-3 py-2 text-neutral-400">{r.enrollment_date ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const header = selected
    ? {
        name: selected.name,
        badge: selected.status,
        subtitle: [selected.school, selected.class_name].filter(Boolean).join(" · ") || undefined,
        fields: [
          { label: "생년월일", value: selected.birthday || "-" },
          { label: "성별", value: selected.gender || "-" },
          { label: "학교", value: selected.school || "-" },
          { label: "학년·반", value: [selected.grade, selected.class_name].filter(Boolean).join(" ") || "-" },
          { label: "보호자", value: selected.guardian_name || "-" },
          { label: "보호자 연락처", value: selected.guardian_phone || "-" },
        ],
      }
    : undefined;

  const kpis = selected ? (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <KpiCard label="상태" value={selected.status ?? "-"} tone={selected.status === "퇴원" ? "text-red-600" : selected.status === "휴원" ? "text-amber-600" : "text-green-600"} />
      <KpiCard label="재원기간" value={monthsSince(selected.enrollment_date)} />
      <KpiCard label="등록일" value={selected.enrollment_date ?? "-"} />
      <KpiCard label="학교" value={selected.school ?? "-"} />
      <KpiCard label="반" value={selected.class_name ?? "-"} />
      <KpiCard label="담임" value={selected.homeroom_teacher ?? "-"} />
    </div>
  ) : null;

  const tabs: EwTab[] = selected
    ? [
        {
          key: "info",
          label: "기본정보",
          content: (
            <div className="rounded-2xl border border-neutral-200 bg-white p-5">
              <Row label="이름" value={selected.name} />
              <Row label="성별" value={selected.gender} />
              <Row label="생년월일" value={selected.birthday} />
              <Row label="학교" value={selected.school} />
              <Row label="학년" value={selected.grade} />
              <Row label="반" value={selected.class_name} />
              <Row label="담임" value={selected.homeroom_teacher} />
              <Row label="학생 연락처" value={selected.student_phone} />
              <Row label="보호자" value={selected.guardian_name} />
              <Row label="보호자 연락처" value={selected.guardian_phone} />
              <Row label="주소" value={selected.address} />
              <Row label="등록일" value={selected.enrollment_date} />
              <Row label="상태" value={selected.status} />
            </div>
          ),
        },
        {
          key: "memo",
          label: "메모",
          content: (
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-neutral-700">
              {selected.memo ? <p className="whitespace-pre-wrap">{selected.memo}</p> : <p className="text-neutral-400">메모가 없습니다.</p>}
            </div>
          ),
        },
      ]
    : [];

  return (
    <EntityWorkspace
      title="원생 관리"
      accent="from-sky-500 to-blue-500"
      basePath="/students"
      items={items}
      selectedId={selectedId}
      searchPlaceholder="🔍 이름·학교·반·보호자·연락처"
      filters={[
        { value: "재원", label: "재원" },
        { value: "휴원", label: "휴원" },
        { value: "퇴원", label: "퇴원" },
      ]}
      header={header}
      kpis={kpis}
      tabs={tabs}
      actions={actions}
      emptyText="왼쪽에서 원생을 선택하세요. (없으면 ‘🔄 원생 가져오기’)"
    />
  );
}

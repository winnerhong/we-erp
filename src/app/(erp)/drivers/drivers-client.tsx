"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EntityWorkspace, KpiCard, type EwItem, type EwTab } from "@/components/entity-workspace";
import { importDriversFromWks } from "./actions";

export interface DriverRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  address: string | null;
  license_number: string | null;
  license_type: string | null;
  license_expiry: string | null;
  hire_date: string | null;
  employment_type: string | null;
  status: string | null; // 근무중 | 휴직 | 퇴사
  bank_name: string | null;
  bank_account: string | null;
  memo: string | null;
}

const STATUS_TONE: Record<string, string> = { 근무중: "green", 휴직: "amber", 퇴사: "red" };

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

/** 면허 만료 D-day — 경과(빨강)/임박 30일(주황)/그 외(날짜) */
function expiryInfo(date: string | null): { label: string; tone: string } {
  if (!date) return { label: "-", tone: "text-neutral-900" };
  const target = new Date(date);
  if (Number.isNaN(target.getTime())) return { label: "-", tone: "text-neutral-900" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((target.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { label: `만료 ${-diff}일 경과`, tone: "text-red-600" };
  if (diff <= 30) return { label: `D-${diff} (${date})`, tone: "text-amber-600" };
  return { label: date, tone: "text-neutral-900" };
}

function DriverSyncButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const running = useRef(false);

  async function sync() {
    if (running.current) return;
    running.current = true;
    try {
      const res = await importDriversFromWks();
      if (!res.ok) alert(res.error);
      else alert(`동기화 완료: 기사 ${res.counts["기사"] ?? res.total}명`);
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
      {pending ? "동기화 중…" : "🔄 기사 가져오기"}
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

export function DriversClient({ rows, selectedId }: { rows: DriverRow[]; selectedId: string | null }) {
  const [view, setView] = useState<"card" | "grid">("card");

  const items: EwItem[] = rows.map((r) => ({
    id: r.id,
    title: r.name,
    badge: r.status ? { label: r.status, tone: STATUS_TONE[r.status] } : null,
    sub: [r.license_type, r.phone].filter(Boolean).join(" · ") || "",
    search: [r.name, r.phone, r.license_type, r.license_number, r.employment_type].filter(Boolean).join(" "),
    filterKey: r.status ?? undefined,
  }));

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const actions = (
    <>
      <div className="inline-flex rounded-lg border border-neutral-300 bg-white p-0.5 text-sm">
        <button
          onClick={() => setView("card")}
          className={`rounded-md px-2.5 py-1 font-medium ${view === "card" ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-800"}`}
        >
          🗂 카드형
        </button>
        <button
          onClick={() => setView("grid")}
          className={`rounded-md px-2.5 py-1 font-medium ${view === "grid" ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-800"}`}
        >
          ▦ 엑셀형
        </button>
      </div>
      <DriverSyncButton />
    </>
  );

  if (view === "grid") {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-neutral-900">기사 관리</h1>
          <div className="flex items-center gap-1.5">{actions}</div>
        </div>
        <div className="overflow-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500">
              <tr>
                {["이름", "상태", "연락처", "면허종류", "면허만료", "고용형태", "입사일"].map((h) => (
                  <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((r) => {
                const ex = expiryInfo(r.license_expiry);
                return (
                  <tr key={r.id} className="hover:bg-neutral-50">
                    <td className="px-3 py-2 font-medium text-neutral-800">{r.name}</td>
                    <td className="px-3 py-2">{r.status ?? "-"}</td>
                    <td className="px-3 py-2 text-neutral-600">{r.phone ?? "-"}</td>
                    <td className="px-3 py-2 text-neutral-600">{r.license_type ?? "-"}</td>
                    <td className={`px-3 py-2 ${ex.tone}`}>{ex.label}</td>
                    <td className="px-3 py-2 text-neutral-600">{r.employment_type ?? "-"}</td>
                    <td className="px-3 py-2 text-neutral-400">{r.hire_date ?? "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const ex = selected ? expiryInfo(selected.license_expiry) : null;

  const header = selected
    ? {
        name: selected.name,
        badge: selected.status,
        subtitle: [selected.license_type, selected.employment_type].filter(Boolean).join(" · ") || undefined,
        fields: [
          { label: "연락처", value: selected.phone || "-" },
          { label: "면허종류", value: selected.license_type || "-" },
          { label: "면허만료", value: ex?.label || "-" },
          { label: "고용형태", value: selected.employment_type || "-" },
          { label: "입사일", value: selected.hire_date || "-" },
          { label: "은행", value: selected.bank_name || "-" },
        ],
      }
    : undefined;

  const kpis = selected ? (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <KpiCard label="상태" value={selected.status ?? "-"} tone={selected.status === "퇴사" ? "text-red-600" : selected.status === "휴직" ? "text-amber-600" : "text-green-600"} />
      <KpiCard label="근속" value={monthsSince(selected.hire_date)} />
      <KpiCard label="입사일" value={selected.hire_date ?? "-"} />
      <KpiCard label="면허종류" value={selected.license_type ?? "-"} />
      <KpiCard label="면허만료" value={ex?.label ?? "-"} tone={ex?.tone} />
      <KpiCard label="고용형태" value={selected.employment_type ?? "-"} />
    </div>
  ) : null;

  const tabs: EwTab[] = selected
    ? [
        {
          key: "info",
          label: "기본정보·면허",
          content: (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                <h3 className="mb-2 text-sm font-semibold text-neutral-700">기본 정보</h3>
                <Row label="이름" value={selected.name} />
                <Row label="연락처" value={selected.phone} />
                <Row label="이메일" value={selected.email} />
                <Row label="생년월일" value={selected.birth_date} />
                <Row label="주소" value={selected.address} />
                <Row label="입사일" value={selected.hire_date} />
                <Row label="고용형태" value={selected.employment_type} />
                <Row label="상태" value={selected.status} />
              </div>
              <div className="space-y-4">
                <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                  <h3 className="mb-2 text-sm font-semibold text-neutral-700">면허</h3>
                  <Row label="면허번호" value={selected.license_number} />
                  <Row label="면허종류" value={selected.license_type} />
                  <Row label="면허만료" value={ex ? <span className={ex.tone}>{ex.label}</span> : "-"} />
                </div>
                <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                  <h3 className="mb-2 text-sm font-semibold text-neutral-700">계좌</h3>
                  <Row label="은행명" value={selected.bank_name} />
                  <Row label="계좌번호" value={selected.bank_account} />
                </div>
              </div>
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
      title="기사 관리"
      accent="from-orange-500 to-amber-500"
      basePath="/drivers"
      items={items}
      selectedId={selectedId}
      searchPlaceholder="🔍 이름·연락처·면허·고용형태"
      filters={[
        { value: "근무중", label: "근무중" },
        { value: "휴직", label: "휴직" },
        { value: "퇴사", label: "퇴사" },
      ]}
      header={header}
      kpis={kpis}
      tabs={tabs}
      actions={actions}
      emptyText="왼쪽에서 기사를 선택하세요. (없으면 ‘🔄 기사 가져오기’)"
    />
  );
}

"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { HoverPreview, type PreviewData } from "@/components/hover-preview";

/* ────────────────────────────────────────────────────────────
 *  EntityWorkspace — 거래처(파트너) 카드 마스터-디테일 패턴을 일반화한
 *  재사용 셸. 좌측 리스트(검색·필터) + 우측 상세(그라데이션 헤더카드 +
 *  KPI 행 + 탭). 엔티티별 콘텐츠는 부모가 ReactNode 로 주입한다.
 *  원생/강사/기사/기관에 config 만 바꿔 동일 UI 를 적용하기 위한 컴포넌트.
 * ──────────────────────────────────────────────────────────── */

export interface EwItem {
  id: string;
  title: string;
  badge?: { label: string; tone?: string } | null;
  sub?: string;
  /** 검색 매칭용 합본 문자열 */
  search: string;
  /** 필터 매칭 키 (status/category 등) */
  filterKey?: string;
  /** 마우스오버 미리보기(사진·주요정보). 있으면 팝오버 표시. */
  preview?: PreviewData;
}

export interface EwFilter {
  value: string; // "ALL" 은 전체
  label: string;
}

export interface EwField {
  label: string;
  value: ReactNode;
}

export interface EwTab {
  key: string;
  label: string;
  content: ReactNode;
}

export interface EwHeader {
  name: string;
  badge?: string | null;
  subtitle?: string;
  fields: EwField[];
}

export interface EntityWorkspaceProps {
  title: string;
  /** 헤더 카드 그라데이션 (예: "from-sky-500 to-blue-500") */
  accent: string;
  /** 선택 시 라우팅 기준 경로 (예: "/students") */
  basePath: string;
  items: EwItem[];
  selectedId: string | null;
  searchPlaceholder?: string;
  /** 필터 배지 목록 (전체는 자동 추가) */
  filters?: EwFilter[];
  header?: EwHeader;
  kpis?: ReactNode;
  tabs?: EwTab[];
  /** 헤더 우측 액션 (동기화·등록 버튼 등) */
  actions?: ReactNode;
  /** 헤더 카드 우측 액션 (수정·삭제 등) */
  detailActions?: ReactNode;
  emptyText?: string;
}

function badgeTone(tone?: string) {
  switch (tone) {
    case "green": return "bg-green-100 text-green-700 border-green-200";
    case "red": return "bg-red-100 text-red-700 border-red-200";
    case "blue": return "bg-blue-100 text-blue-700 border-blue-200";
    case "amber": return "bg-amber-100 text-amber-700 border-amber-200";
    case "indigo": return "bg-indigo-100 text-indigo-700 border-indigo-200";
    default: return "bg-neutral-100 text-neutral-600 border-neutral-200";
  }
}

export function EntityWorkspace({
  title,
  accent,
  basePath,
  items,
  selectedId,
  searchPlaceholder = "🔍 검색",
  filters,
  header,
  kpis,
  tabs,
  actions,
  detailActions,
  emptyText = "왼쪽에서 항목을 선택하세요.",
}: EntityWorkspaceProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [tab, setTab] = useState(tabs?.[0]?.key ?? "");

  const filtered = useMemo(() => {
    const q = search.trim();
    return items.filter((it) => {
      const matchFilter = filter === "ALL" || it.filterKey === filter;
      const matchSearch = !q || it.search.includes(q);
      return matchFilter && matchSearch;
    });
  }, [items, search, filter]);

  const filterTabs: EwFilter[] = [
    { value: "ALL", label: `전체 ${items.length}` },
    ...(filters ?? []).map((f) => ({
      value: f.value,
      label: `${f.label} ${items.filter((it) => it.filterKey === f.value).length}`,
    })),
  ];

  const select = (id: string) => router.push(`${basePath}?p=${id}`);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-neutral-900">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        {/* 좌측 목록 */}
        <div className="rounded-2xl border border-neutral-200 bg-white">
          <div className="space-y-2 border-b border-neutral-100 p-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            />
            {filterTabs.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {filterTabs.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setFilter(t.value)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      filter === t.value
                        ? "bg-indigo-600 text-white"
                        : "border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="max-h-[68vh] divide-y divide-neutral-100 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-neutral-400">항목이 없습니다.</p>
            ) : (
              filtered.map((it) => {
                const on = selectedId === it.id;
                const btn = (
                  <button
                    onClick={() => select(it.id)}
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition ${
                      on ? "bg-indigo-50" : "hover:bg-neutral-50"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-semibold text-neutral-800">{it.title}</span>
                        {it.badge && (
                          <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[11px] ${badgeTone(it.badge.tone)}`}>
                            {it.badge.label}
                          </span>
                        )}
                      </span>
                      {it.sub && <span className="block truncate text-xs text-neutral-400">{it.sub}</span>}
                    </span>
                  </button>
                );
                return it.preview ? (
                  <HoverPreview key={it.id} data={it.preview}>{btn}</HoverPreview>
                ) : (
                  <div key={it.id}>{btn}</div>
                );
              })
            )}
          </div>
        </div>

        {/* 우측 상세 */}
        {!header ? (
          <div className="flex items-center justify-center rounded-2xl border border-neutral-200 bg-white p-10 text-sm text-neutral-400">
            {emptyText}
          </div>
        ) : (
          <div className="space-y-4">
            {/* 헤더 카드 */}
            <div className={`rounded-2xl bg-gradient-to-br ${accent} p-6 text-white shadow-sm`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold">{header.name}</h2>
                    {header.badge && (
                      <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">{header.badge}</span>
                    )}
                  </div>
                  {header.subtitle && <p className="mt-0.5 text-sm text-white/70">{header.subtitle}</p>}
                  <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                    {header.fields.map((f, i) => (
                      <div key={i}>
                        <p className="text-xs text-white/60">{f.label}</p>
                        <p className="font-medium">{f.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
                {detailActions && <div className="flex gap-2">{detailActions}</div>}
              </div>
            </div>

            {/* KPI 행 */}
            {kpis}

            {/* 탭 */}
            {tabs && tabs.length > 0 && (
              <div>
                <div className="flex flex-wrap gap-1 border-b border-neutral-200">
                  {tabs.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                        tab === t.key
                          ? "border-neutral-900 text-neutral-900"
                          : "border-transparent text-neutral-400 hover:text-neutral-700"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="pt-4">{tabs.find((t) => t.key === tab)?.content ?? tabs[0]?.content}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** KPI 카드 한 칸 — 거래처 CrmKpis 와 동일 룩앤필 */
export function KpiCard({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <p className="text-xs text-neutral-400">{label}</p>
      <p className={`mt-1 text-lg font-bold ${tone ?? "text-neutral-900"}`}>{value}</p>
    </div>
  );
}

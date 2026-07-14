"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { OptionsManager } from "@/components/options-manager";
import { BulkImport } from "@/components/bulk-import";
import { ExcelGrid, type GridCol } from "@/components/excel-grid";
import { PaybackList, type PaybackBrief } from "@/components/payback-list";
import { Card, Field, TextInput, NumberInput, SelectInput, Badge, EmptyState, FormSection } from "@/components/ui";
import { krw } from "@/lib/labels";
import { toneClass } from "@/lib/field-tones";
import type { PartnerRow, FieldOptionRow, ContractRow, TransactionRow, SettlementRow, PartnerAttachmentRow, PartnerMemoRow } from "@/lib/supabase/database.types";
import type { ImportCtx } from "@/lib/import-specs";
import { createRow, updateRow, deleteRow, bulkSetRowActive, bulkDeleteRows } from "@/app/(erp)/actions";
import { importPartnersFromWks, bulkAssignCompany } from "./actions";
import { addPartnerMemo, deletePartnerMemo } from "./crm-actions";
import { createPartnerAccount, resetPartnerPassword, deletePartnerAccount } from "./portal-actions";
import { CrmKpis, ContractsTab, TransactionsTab, SettlementsTab, AttachmentsTab } from "./crm-panel";
import { HoverPreview, type PreviewData } from "@/components/hover-preview";
import { PARTNER_KIND_LABEL, TAX_CATEGORY_LABEL, PAYMENT_TERMS_LABEL, PAYMENT_CYCLE_LABEL, EVIDENCE_TYPE_LABEL } from "@/lib/crm";
import type { SyncKind } from "@/lib/wks-sync";

export interface LedgerEntry {
  id: string;
  date: string;
  source: "세금계산서" | "영수증" | "통장" | "구매";
  direction: "IN" | "OUT";
  amount: number;
  status: string;
  pending: boolean;
  note: string;
}

const AUTO_KEY = "erp_wks_autosync";
const AUTO_INTERVAL_MS = 5 * 60 * 1000; // 5분

// 거래처 상세 탭 — 순서 변경 가능(localStorage 저장)
type PartnerTab = "info" | "contract" | "txn" | "settle" | "files" | "memo" | "ledger" | "payback";
const TAB_ORDER_KEY = "erp_partner_taborder";
const DEFAULT_TAB_ORDER: PartnerTab[] = ["txn", "contract", "settle", "files", "info", "memo", "ledger", "payback"];

function WksSyncControls() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [auto, setAuto] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const running = useRef(false);

  // 저장된 자동동기화 상태 복원
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (typeof window !== "undefined" && localStorage.getItem(AUTO_KEY) === "1") setAuto(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  async function sync(kinds?: SyncKind[], silent = false) {
    if (running.current) return;
    running.current = true;
    try {
      const res = await importPartnersFromWks(kinds);
      if (!res.ok) {
        if (!silent) alert(res.error);
      } else {
        setLastSync(new Date().toLocaleTimeString("ko-KR"));
        if (!silent) {
          const c = res.counts ?? {};
          const skip = res.skipped?.length
            ? `\n(건너뜀: ${res.skipped.join(", ")} — 소스에 데이터 없음)`
            : "";
          alert(
            `동기화 완료: 총 ${res.total}건\n협력사 ${c.협력사 ?? 0} · 기관 ${c.기관 ?? 0} · 장소 ${c.장소 ?? 0}${skip}`
          );
        }
      }
      router.refresh();
    } finally {
      running.current = false;
    }
  }

  // 자동 동기화 폴링
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => {
      void sync(undefined, true);
    }, AUTO_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  function toggleAuto() {
    const next = !auto;
    setAuto(next);
    try {
      localStorage.setItem(AUTO_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (next) void sync(undefined, true); // 켜는 즉시 1회
  }

  const btn =
    "rounded-lg border border-neutral-300 bg-white px-2.5 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-neutral-400">동기화:</span>
      <button className={btn} disabled={pending} onClick={() => startTransition(() => sync(["협력사"]))}>협력사</button>
      <button className={btn} disabled={pending} onClick={() => startTransition(() => sync(["기관"]))}>기관</button>
      <button className={btn} disabled={pending} onClick={() => startTransition(() => sync(["장소"]))}>장소</button>
      <button
        className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
        disabled={pending}
        onClick={() => startTransition(() => sync())}
      >
        {pending ? "동기화 중…" : "🧒 전체 가져오기"}
      </button>
      <label className="ml-1 flex items-center gap-1 text-xs text-neutral-600">
        <input type="checkbox" checked={auto} onChange={toggleAuto} />
        자동
      </label>
      {auto && lastSync && <span className="text-xs text-green-600">↻ {lastSync}</span>}
    </div>
  );
}

export function PartnersClient({
  rows,
  ctx,
  activeCompanyId,
  options,
  selectedId,
  entries,
  paybacks,
  contracts,
  transactions,
  settlements,
  attachments,
  memos,
  employees,
  receivable,
  payable,
  isAdmin,
  portalAccount,
}: {
  rows: PartnerRow[];
  ctx: ImportCtx;
  activeCompanyId: string | null;
  options: FieldOptionRow[];
  selectedId: string | null;
  entries: LedgerEntry[];
  paybacks: PaybackBrief[];
  contracts: ContractRow[];
  transactions: TransactionRow[];
  settlements: SettlementRow[];
  attachments: PartnerAttachmentRow[];
  memos: PartnerMemoRow[];
  employees: { id: string; name: string }[];
  receivable: number;
  payable: number;
  isAdmin: boolean;
  portalAccount: { email: string | null; active: boolean } | null;
}) {
  const router = useRouter();
  const [mgrOpen, setMgrOpen] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("ALL");
  // 진행중 기본. 단, 선택된 거래처가 종료 상태면 목록에서 보이도록 '전체'로 시작(하이라이트 유지)
  const [seg, setSeg] = useState<"active" | "ended" | "all">(() =>
    selectedId && rows.some((r) => r.id === selectedId && !r.is_active) ? "all" : "active"
  );
  const [tab, setTab] = useState<PartnerTab>("txn");
  // 탭 순서(사용자 지정 · localStorage) + 순서변경 팝오버
  const [tabOrder, setTabOrder] = useState<PartnerTab[]>(DEFAULT_TAB_ORDER);
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const [ledgerFilter, setLedgerFilter] = useState<"ALL" | LedgerEntry["source"]>("ALL");
  const [view, setView] = useState<"card" | "grid">("card");
  // 사업자 일괄배정 모드
  const [selectMode, setSelectMode] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [assignTo, setAssignTo] = useState<string>(activeCompanyId ?? "");
  const [assigning, startAssign] = useTransition();

  // 저장된 탭 순서 로드(신규 탭은 뒤에 자동 병합, 사라진 탭은 제거)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TAB_ORDER_KEY);
      if (!raw) return;
      const saved = (JSON.parse(raw) as string[]).filter((k): k is PartnerTab => (DEFAULT_TAB_ORDER as string[]).includes(k));
      const merged = [...saved, ...DEFAULT_TAB_ORDER.filter((k) => !saved.includes(k))];
      /* eslint-disable react-hooks/set-state-in-effect */
      setTabOrder(merged);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      /* ignore */
    }
  }, []);
  function persistTabOrder(next: PartnerTab[]) {
    setTabOrder(next);
    try { localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  const accountLabel = new Map(ctx.accounts.map((a) => [a.id, `${a.code} ${a.name}`]));
  const companyName = (id: string | null) => (id ? ctx.companies.find((c) => c.id === id)?.name ?? "?" : "공용");
  const catActive = options.filter((o) => o.category === "partner_category" && o.is_active);
  const catSel = catActive.map((o) => ({ value: o.value, label: o.label }));
  const catColor = Object.fromEntries(
    options.filter((o) => o.category === "partner_category").map((o) => [o.value, o.color ?? ""])
  ) as Record<string, string>;
  const catLabel = Object.fromEntries(
    options.filter((o) => o.category === "partner_category").map((o) => [o.value, o.label])
  ) as Record<string, string>;

  // 진행중/종료 세그먼트 — is_active=true 진행중(신규 거래·드롭다운 대상), false 종료(목록·이력엔 유지)
  const activeCount = rows.filter((r) => r.is_active).length;
  const endedCount = rows.filter((r) => !r.is_active).length;
  const segRows = rows.filter((r) => (seg === "all" ? true : seg === "active" ? r.is_active : !r.is_active));

  const q = search.trim().toLowerCase();
  const filtered = segRows.filter((r) => {
    if (catFilter !== "ALL" && r.category !== catFilter) return false;
    if (!q) return true;
    return `${r.name} ${r.category ?? ""} ${r.biz_no ?? ""} ${r.contact_name ?? ""} ${r.phone ?? ""}`
      .toLowerCase()
      .includes(q);
  });
  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const go = (id: string) => router.push(`/partners?p=${id}`);

  // 일괄배정: 선택 토글 / 필터 전체선택 / 실행
  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allFilteredPicked = filtered.length > 0 && filtered.every((r) => picked.has(r.id));
  const toggleAllFiltered = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (allFilteredPicked) filtered.forEach((r) => next.delete(r.id));
      else filtered.forEach((r) => next.add(r.id));
      return next;
    });
  const exitSelect = () => {
    setSelectMode(false);
    setPicked(new Set());
  };
  const runAssign = () => {
    const ids = [...picked];
    if (ids.length === 0) return;
    const label = assignTo ? ctx.companies.find((c) => c.id === assignTo)?.name ?? "" : "공용";
    if (!confirm(`선택한 ${ids.length}개 거래처를 '${label}'(으)로 배정할까요?`)) return;
    startAssign(async () => {
      const res = await bulkAssignCompany(ids, assignTo || null);
      if (!res.ok) {
        alert(res.error ?? "배정 실패");
        return;
      }
      exitSelect();
      router.refresh();
    });
  };
  const runBulkStatus = (active: boolean) => {
    const ids = [...picked];
    if (ids.length === 0) return;
    if (!confirm(`선택한 ${ids.length}개 거래처를 ${active ? "거래재개" : "거래종료"} 처리할까요?`)) return;
    startAssign(async () => {
      const res = await bulkSetRowActive("partners", ids, active);
      if (!res.ok) { alert(res.error ?? "처리 실패"); return; }
      exitSelect();
      router.refresh();
    });
  };
  const runBulkDelete = () => {
    const ids = [...picked];
    if (ids.length === 0) return;
    if (!confirm(`선택한 ${ids.length}개 거래처를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    startAssign(async () => {
      const res = await bulkDeleteRows("partners", ids);
      if (!res.ok) { alert(res.error ?? "삭제 실패"); return; }
      exitSelect();
      router.refresh();
    });
  };

  const ledger = ledgerFilter === "ALL" ? entries : entries.filter((e) => e.source === ledgerFilter);
  const totalIn = ledger.filter((e) => e.direction === "IN").reduce((s, e) => s + e.amount, 0);
  const totalOut = ledger.filter((e) => e.direction === "OUT").reduce((s, e) => s + e.amount, 0);
  const sourceTone = (s: string): "blue" | "neutral" | "green" | "red" =>
    s === "세금계산서" ? "blue" : s === "영수증" ? "neutral" : s === "구매" ? "red" : "green";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-neutral-900">거래처 관리</h1>
          {/* 보기 전환: 카드형(상세) ↔ 엑셀형(빠른 입력) */}
          <div className="inline-flex rounded-lg border border-neutral-300 bg-white p-0.5 text-sm">
            <button
              onClick={() => setView("card")}
              className={`rounded-md px-2.5 py-1 font-medium ${
                view === "card" ? "bg-indigo-500 text-white" : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              🗂 카드형
            </button>
            <button
              onClick={() => setView("grid")}
              className={`rounded-md px-2.5 py-1 font-medium ${
                view === "grid" ? "bg-indigo-500 text-white" : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              ▦ 엑셀형
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setMgrOpen(true)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            ⚙ 항목
          </button>
          <button
            onClick={() => setCsvOpen(true)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            📄 CSV
          </button>
          <WksSyncControls />
          {view === "card" && (
            <button
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
              className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                selectMode ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              🏢 사업자 배정
            </button>
          )}
          <button
            onClick={() => setAddOpen(true)}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
          >
            ＋ 거래처 등록
          </button>
        </div>
      </div>

      {view === "grid" ? (
        <PartnerGrid
          rows={rows}
          ctx={ctx}
          catSel={catSel}
          catLabel={catLabel}
          accountLabel={accountLabel}
          defaultCompanyId={activeCompanyId}
          onOpenDetail={go}
          onChanged={() => router.refresh()}
        />
      ) : (
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[300px_1fr]">
        {/* 좌측 목록 — 화면 높이만큼 고정(sticky)해 우측이 길어져도 항상 꽉 찬 스크롤 영역 */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white lg:sticky lg:top-24 lg:h-[calc(100vh-7rem)]">
          <div className="space-y-2 border-b border-neutral-100 p-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 상호·구분·사업자번호·담당자"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            />
            {/* 진행중 / 종료 / 전체 세그먼트 */}
            <div className="flex gap-1">
              {([
                ["active", "진행중", activeCount],
                ["ended", "종료", endedCount],
                ["all", "전체", rows.length],
              ] as const).map(([k, label, n]) => (
                <button
                  key={k}
                  onClick={() => {
                    setSeg(k);
                    setCatFilter("ALL"); // 세그먼트 바꾸면 카테고리 필터 초기화(빈 목록 방지)
                  }}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                    seg === k ? "bg-indigo-500 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                >
                  {label} <span className={seg === k ? "text-neutral-300" : "text-neutral-400"}>{n}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {[{ value: "ALL", label: `전체 ${segRows.length}` }, ...catActive.map((o) => ({
                value: o.value,
                label: `${o.label} ${segRows.filter((r) => r.category === o.value).length}`,
              }))].map((t) => (
                <button
                  key={t.value}
                  onClick={() => setCatFilter(t.value)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    catFilter === t.value ? "bg-indigo-500 text-white" : "border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  {t.label}
                </button>
              ))}
              <button
                onClick={() => setMgrOpen(true)}
                title="거래처 유형 추가·수정·삭제"
                className="rounded-full border border-dashed border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-50"
              >
                + 유형
              </button>
            </div>
          </div>
          {/* 일괄배정 모드: 전체선택 줄 */}
          {selectMode && (
            <div className="flex items-center justify-between gap-2 border-b border-neutral-100 bg-indigo-50/50 px-3 py-2 text-xs">
              <label className="flex items-center gap-1.5 font-medium text-neutral-700">
                <input type="checkbox" checked={allFilteredPicked} onChange={toggleAllFiltered} />
                전체 선택 ({filtered.length})
              </label>
              <span className="font-semibold text-indigo-700">{picked.size}개 선택됨</span>
            </div>
          )}
          <div className="min-h-0 flex-1 divide-y divide-neutral-100 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-neutral-400">거래처가 없습니다.</p>
            ) : (
              filtered.map((r) => {
                const on = selected?.id === r.id;
                const checked = picked.has(r.id);
                const preview: PreviewData = {
                  photoUrl: r.photo_url ?? undefined,
                  initial: r.name?.[0] ?? "?",
                  title: r.name,
                  subtitle: companyName(r.company_id),
                  badge: r.category ? { label: catLabel[r.category] ?? r.category, tone: catColor[r.category] || "neutral" } : null,
                  fields: [
                    { label: "상태", value: r.is_active ? "진행중" : "종료" },
                    { label: "사업자번호", value: r.biz_no || "" },
                    { label: "대표자", value: r.rep_name || "" },
                    { label: "담당자", value: r.contact_name || "" },
                    { label: "연락처", value: r.phone || "" },
                    { label: "이메일", value: r.email || "" },
                    { label: "소속", value: companyName(r.company_id) },
                  ],
                };
                return (
                  <HoverPreview key={r.id} data={preview}>
                  <button
                    onClick={() => (selectMode ? togglePick(r.id) : go(r.id))}
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition ${
                      selectMode ? (checked ? "bg-indigo-50" : "hover:bg-neutral-50") : on ? "bg-indigo-50" : "hover:bg-neutral-50"
                    } ${!r.is_active ? "opacity-60" : ""}`}
                  >
                    {selectMode && (
                      <input type="checkbox" checked={checked} readOnly className="pointer-events-none shrink-0" />
                    )}
                    <PartnerMiniAvatar partner={r} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-semibold text-neutral-800">{r.name}</span>
                        {r.category && (
                          <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[11px] ${toneClass(catColor[r.category])}`}>
                            {catLabel[r.category] ?? r.category}
                          </span>
                        )}
                        {!r.is_active && (
                          <span className="shrink-0 rounded-full bg-neutral-200 px-1.5 py-0.5 text-[11px] font-medium text-neutral-500">종료</span>
                        )}
                        {selectMode && (
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${r.company_id ? "bg-teal-100 text-teal-700" : "bg-amber-100 text-amber-700"}`}>
                            {companyName(r.company_id)}
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-neutral-400">
                        {r.contact_name || "담당자 없음"}
                        {r.phone ? ` · ${r.phone}` : ""}
                      </span>
                    </span>
                  </button>
                  </HoverPreview>
                );
              })
            )}
          </div>
          {/* 일괄배정 실행 바 */}
          {selectMode && (
            <div className="space-y-2 border-t border-neutral-200 bg-white p-3">
              <p className="text-xs text-neutral-500">선택한 거래처를 어느 사업자로 배정할까요?</p>
              <div className="flex items-center gap-2">
                <SelectInput value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className="flex-1">
                  <option value="">공용(모든 사업자에 표시)</option>
                  {ctx.companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </SelectInput>
                <button
                  onClick={runAssign}
                  disabled={assigning || picked.size === 0}
                  className="shrink-0 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-40"
                >
                  {assigning ? "배정 중…" : `${picked.size}개 배정`}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-2">
                <span className="text-xs text-neutral-500">기타 일괄:</span>
                <button onClick={() => runBulkStatus(false)} disabled={assigning || picked.size === 0} className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40">🚫 거래종료</button>
                <button onClick={() => runBulkStatus(true)} disabled={assigning || picked.size === 0} className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40">♻ 거래재개</button>
                <button onClick={runBulkDelete} disabled={assigning || picked.size === 0} className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-100 disabled:opacity-40">🗑 삭제</button>
              </div>
            </div>
          )}
        </div>

        {/* 우측 상세 */}
        {!selected ? (
          <div className="flex items-center justify-center rounded-2xl border border-neutral-200 bg-white p-10 text-sm text-neutral-400">
            왼쪽에서 거래처를 선택하세요. (없으면 ‘＋ 거래처 등록’)
          </div>
        ) : (
          <div className="space-y-4">
            {/* 헤더 카드 — 사진 + 정보. 진행중=틸, 종료=그레이 */}
            <div className={`rounded-2xl p-6 text-white shadow-sm ${selected.is_active ? "bg-gradient-to-br from-teal-500 to-emerald-500" : "bg-gradient-to-br from-neutral-500 to-neutral-600"}`}>
              <div className="flex flex-wrap items-center gap-5">
                <PartnerAvatarUpload partner={selected} onChanged={() => router.refresh()} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold">{selected.name}</h2>
                    {selected.category && (
                      <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">
                        {catLabel[selected.category] ?? selected.category}
                      </span>
                    )}
                    {!selected.is_active && (
                      <span className="rounded-full bg-black/25 px-2 py-0.5 text-xs font-medium">🚫 거래종료</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-white/70">{companyName(selected.company_id)}</p>
                  <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                    <HeaderField label="사업자번호" value={selected.biz_no || "-"} />
                    <HeaderField label="담당자" value={selected.contact_name || "-"} />
                    <HeaderField label="연락처" value={selected.phone || "-"} />
                    <HeaderField label="이메일" value={selected.email || "-"} />
                    <HeaderField label="받을 돈" value={krw(receivable)} />
                    <HeaderField label="줄 돈" value={krw(payable)} />
                  </div>
                </div>
                <div className="flex gap-2">
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => window.open(`/partners/portal-login/${selected.id}`, "_blank")}
                        title="이 거래처로 자동 로그인된 포털을 새 창에서 열기 (계정 없으면 자동 발급)"
                        className="rounded-lg bg-white/30 px-3 py-1.5 text-sm font-medium backdrop-blur ring-1 ring-white/50 hover:bg-white/40"
                      >
                        🔑 포털 ↗
                      </button>
                      {portalAccount && (
                        <button
                          onClick={() => setPortalOpen(true)}
                          title="포털 계정 관리 (비밀번호·삭제)"
                          className="rounded-lg bg-white/20 px-2.5 py-1.5 text-sm font-medium backdrop-blur hover:bg-white/30"
                        >
                          ⚙
                        </button>
                      )}
                    </>
                  )}
                  <button onClick={() => setEditOpen(true)} className="rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium backdrop-blur hover:bg-white/30">
                    ✏️ 수정
                  </button>
                  <button
                    onClick={() => {
                      const ending = selected.is_active;
                      if (
                        !confirm(
                          ending
                            ? `${selected.name} 거래처를 '종료' 처리할까요?\n신규 거래·계약·알림 대상에서 제외됩니다. (목록·거래이력은 유지, 언제든 재개 가능)`
                            : `${selected.name} 거래처를 다시 '진행중'으로 되돌릴까요?`
                        )
                      )
                        return;
                      void updateRow("partners", selected.id, { is_active: !ending }).then(() => router.refresh());
                    }}
                    className="rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium backdrop-blur hover:bg-white/30"
                  >
                    {selected.is_active ? "🚫 거래종료" : "♻ 거래재개"}
                  </button>
                  <button
                    onClick={() => {
                      if (!confirm(`${selected.name} 거래처를 삭제할까요?`)) return;
                      void deleteRow("partners", selected.id).then(() => router.push("/partners"));
                    }}
                    className="rounded-lg bg-rose-500/90 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-600"
                  >
                    🗑 삭제
                  </button>
                </div>
              </div>
            </div>

            {/* KPI (거래 실적 360°) */}
            <CrmKpis transactions={transactions} />

            {/* 탭 (순서 변경 가능) */}
            {(() => {
              const tabLabel: Record<PartnerTab, string> = {
                txn: `📊 거래내역 ${transactions.length}`,
                contract: `📑 계약 ${contracts.length}`,
                settle: `🧾 정산 ${settlements.length}`,
                files: `📎 문서함 ${attachments.length}`,
                info: "🧾 기본정보",
                memo: `📝 메모 ${memos.length}`,
                ledger: `📒 거래원장 ${entries.length}`,
                payback: `💸 페이백 ${paybacks.length}`,
              };
              return (
                <div className="flex flex-wrap items-center gap-1 border-b border-neutral-200">
                  {tabOrder.map((k) => (
                    <button
                      key={k}
                      onClick={() => setTab(k)}
                      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                        tab === k ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-800"
                      }`}
                    >
                      {tabLabel[k]}
                    </button>
                  ))}
                  {/* 순서 변경 아이콘 — 오른쪽 끝 */}
                  <div className="relative ml-auto">
                    <button
                      onClick={() => setTabMenuOpen((v) => !v)}
                      title="탭 순서 변경"
                      className={`-mb-px rounded-md px-2 py-2 text-base leading-none ${tabMenuOpen ? "text-neutral-800" : "text-neutral-400 hover:text-neutral-700"}`}
                    >
                      ⇅
                    </button>
                    {tabMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setTabMenuOpen(false)} />
                        <TabReorderMenu
                          order={tabOrder}
                          labels={tabLabel}
                          onReorder={persistTabOrder}
                          onReset={() => persistTabOrder(DEFAULT_TAB_ORDER)}
                        />
                      </>
                    )}
                  </div>
                </div>
              );
            })()}

            {tab === "txn" ? (
              <TransactionsTab
                partnerId={selected.id}
                companyId={selected.company_id}
                contracts={contracts}
                transactions={transactions}
                employees={employees}
                onChanged={() => router.refresh()}
              />
            ) : tab === "contract" ? (
              <ContractsTab
                partnerId={selected.id}
                companyId={selected.company_id}
                contracts={contracts}
                employees={employees}
                onChanged={() => router.refresh()}
              />
            ) : tab === "settle" ? (
              <SettlementsTab
                partnerId={selected.id}
                settlements={settlements}
                transactions={transactions}
                onChanged={() => router.refresh()}
              />
            ) : tab === "files" ? (
              <AttachmentsTab
                partnerId={selected.id}
                companyId={selected.company_id}
                attachments={attachments}
                onChanged={() => router.refresh()}
              />
            ) : tab === "info" ? (
              <div className="space-y-4">
                {/* 📍 기본 정보 */}
                <InfoSection icon="📍" title="기본 정보" onEdit={() => setEditOpen(true)}>
                  <InfoRow label="상호">{selected.name || "-"}</InfoRow>
                  <InfoRow label="구분">{selected.category ? catLabel[selected.category] ?? selected.category : "-"}</InfoRow>
                  <InfoRow label="지역·그룹">{selected.partner_group || "-"}</InfoRow>
                  <InfoRow label="대표자">{selected.rep_name || "-"}</InfoRow>
                  <InfoRow label="사업자번호">{selected.biz_no || "-"}</InfoRow>
                  <InfoRow label="연락처">{selected.phone || "-"}</InfoRow>
                  <InfoRow label="이메일">{selected.email || "-"}</InfoRow>
                  <InfoRow label="소속">{companyName(selected.company_id)}</InfoRow>
                  <InfoRow label="주소">
                    {selected.address ? (
                      <span className="inline-flex items-center gap-2">
                        <span>{[selected.address, selected.address_detail].filter(Boolean).join(" ")}</span>
                        <a
                          href={`https://map.naver.com/p/search/${encodeURIComponent(selected.address)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 whitespace-nowrap text-xs font-medium text-teal-600 hover:underline"
                        >
                          🗺 지도
                        </a>
                      </span>
                    ) : (
                      "-"
                    )}
                  </InfoRow>
                </InfoSection>

                {/* 🏢 시설 정보 */}
                <InfoSection icon="🏢" title="시설 정보" hint="장소·기관 거래처용" onEdit={() => setEditOpen(true)}>
                  <InfoRow label="담당자">{selected.contact_name || "-"}</InfoRow>
                  <InfoRow label="직급">{selected.contact_title || "-"}</InfoRow>
                  <InfoRow label="주차대수">{selected.parking_count != null ? `${selected.parking_count.toLocaleString("ko-KR")}대` : "-"}</InfoRow>
                  <InfoRow label="최대 수용인원">{selected.max_capacity != null ? `${selected.max_capacity.toLocaleString("ko-KR")}명` : "-"}</InfoRow>
                  <InfoRow label="적정 인원">{selected.ideal_capacity != null ? `${selected.ideal_capacity.toLocaleString("ko-KR")}명` : "-"}</InfoRow>
                  <InfoRow label="이용료">{selected.usage_fee != null ? krw(selected.usage_fee) : "-"}</InfoRow>
                  <InfoRow label="비고">{selected.facility_note || "-"}</InfoRow>
                </InfoSection>

                {/* 🏦 사업자·결제 정보 */}
                <InfoSection icon="🏦" title="사업자·결제 정보" onEdit={() => setEditOpen(true)}>
                  <InfoRow label="업태">{selected.biz_type || "-"}</InfoRow>
                  <InfoRow label="종목">{selected.biz_item || "-"}</InfoRow>
                  <InfoRow label="과세 유형">{selected.tax_category ? TAX_CATEGORY_LABEL[selected.tax_category] ?? selected.tax_category : "-"}</InfoRow>
                  <InfoRow label="거래처 구분">{selected.partner_kind ? PARTNER_KIND_LABEL[selected.partner_kind] ?? selected.partner_kind : "-"}</InfoRow>
                  <InfoRow label="결제 조건">{selected.payment_terms ? PAYMENT_TERMS_LABEL[selected.payment_terms] ?? selected.payment_terms : "-"}</InfoRow>
                  <InfoRow label="결제 주기">{selected.payment_cycle ? PAYMENT_CYCLE_LABEL[selected.payment_cycle] ?? selected.payment_cycle : "-"}</InfoRow>
                  <InfoRow label="증빙 발행">{selected.evidence_type ? EVIDENCE_TYPE_LABEL[selected.evidence_type] ?? selected.evidence_type : "-"}</InfoRow>
                  <InfoRow label="여신 한도">{selected.credit_limit != null ? krw(selected.credit_limit) : "-"}</InfoRow>
                  <InfoRow label="거래 은행">{selected.bank_name || "-"}</InfoRow>
                  <InfoRow label="계좌번호">{selected.account_no || "-"}</InfoRow>
                  <InfoRow label="예금주">{selected.account_holder || "-"}</InfoRow>
                  <InfoRow label="세금계산서 이메일">{selected.tax_email || "-"}</InfoRow>
                  <InfoRow label="영업담당">{employees.find((e) => e.id === selected.sales_rep_id)?.name || "-"}</InfoRow>
                  <InfoRow label="기본 계정과목">{selected.default_account_id ? accountLabel.get(selected.default_account_id) ?? "-" : "-"}</InfoRow>
                  <InfoRow label="기본 부가세율">{selected.default_tax_rate != null ? `${selected.default_tax_rate}%` : "10% (기본)"}</InfoRow>
                  <InfoRow label="팝빌 CorpNum">{selected.popbill_corpnum || "-"}</InfoRow>
                </InfoSection>
              </div>
            ) : tab === "memo" ? (
              <PartnerMemoTab partnerId={selected.id} memos={memos} onChanged={() => router.refresh()} />
            ) : tab === "payback" ? (
              <PaybackList rows={paybacks} />
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <Card className="p-4">
                    <p className="text-xs text-neutral-500">총 입금</p>
                    <p className="mt-1 text-lg font-bold tabular text-emerald-600">+{krw(totalIn)}</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-xs text-neutral-500">총 출금</p>
                    <p className="mt-1 text-lg font-bold tabular text-rose-600">−{krw(totalOut)}</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-xs text-neutral-500">거래 건수</p>
                    <p className="mt-1 text-lg font-bold tabular text-neutral-700">{ledger.length}건</p>
                  </Card>
                </div>
                <div className="flex flex-wrap gap-1 rounded-lg bg-neutral-100 p-1">
                  {(["ALL", "세금계산서", "영수증", "통장", "구매"] as const).map((k) => {
                    const n = k === "ALL" ? entries.length : entries.filter((e) => e.source === k).length;
                    return (
                      <button
                        key={k}
                        onClick={() => setLedgerFilter(k)}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                          ledgerFilter === k ? "bg-white shadow-sm" : "text-neutral-500"
                        }`}
                      >
                        {k === "ALL" ? "전체" : k} <span className="text-neutral-400">{n}</span>
                      </button>
                    );
                  })}
                </div>
                <Card>
                  {ledger.length === 0 ? (
                    <EmptyState message="거래 내역이 없습니다." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-neutral-200 text-xs text-neutral-500">
                          <tr>
                            <th className="px-4 py-3">날짜</th>
                            <th className="px-4 py-3">출처</th>
                            <th className="px-4 py-3 text-right">입금</th>
                            <th className="px-4 py-3 text-right">출금</th>
                            <th className="px-4 py-3">비고</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                          {ledger.map((e) => (
                            <tr key={e.id} className={e.pending ? "opacity-60" : ""}>
                              <td className="px-4 py-3 text-neutral-500">{e.date || "-"}</td>
                              <td className="px-4 py-3"><Badge tone={sourceTone(e.source)}>{e.source}</Badge></td>
                              <td className="px-4 py-3 text-right tabular font-semibold text-emerald-600">
                                {e.direction === "IN" ? `+${krw(e.amount)}` : ""}
                              </td>
                              <td className="px-4 py-3 text-right tabular font-semibold text-rose-600">
                                {e.direction === "OUT" ? `−${krw(e.amount)}` : ""}
                              </td>
                              <td className="px-4 py-3 text-neutral-500">
                                {e.status && (
                                  <span className={`mr-2 text-xs ${e.pending ? "text-amber-600" : "text-neutral-400"}`}>{e.status}</span>
                                )}
                                {e.note}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {mgrOpen && (
        <OptionsManager
          options={options}
          cats={[{ key: "partner_category", title: "거래처 유형", hint: "협력사·기관·장소 등 — 추가·이름변경·색상·순서·삭제" }]}
          onClose={() => {
            setMgrOpen(false);
            router.refresh();
          }}
        />
      )}
      {csvOpen && (
        <PartnerModal title="거래처 CSV 일괄등록" onClose={() => setCsvOpen(false)}>
          <div className="p-5">
            <BulkImport kind="partners" ctx={ctx} />
          </div>
        </PartnerModal>
      )}
      {(addOpen || (editOpen && selected)) && (
        <PartnerEditModal
          partner={editOpen ? selected : null}
          companies={ctx.companies}
          accounts={ctx.accounts}
          catSel={catSel}
          employees={employees}
          defaultCompanyId={activeCompanyId}
          onClose={() => {
            setAddOpen(false);
            setEditOpen(false);
          }}
          onSaved={(id) => {
            setAddOpen(false);
            setEditOpen(false);
            if (id) go(id);
            else router.refresh();
          }}
        />
      )}
      {portalOpen && selected && (
        <PartnerPortalModal
          partnerId={selected.id}
          partnerName={selected.name}
          account={portalAccount}
          onClose={() => setPortalOpen(false)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}

// ---------- 거래처 포털 계정 관리(관리자) ----------
function PartnerPortalModal({
  partnerId,
  partnerName,
  account,
  onClose,
  onChanged,
}: {
  partnerId: string;
  partnerName: string;
  account: { email: string | null; active: boolean } | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);

  function create() {
    setError(null);
    startTransition(async () => {
      const r = await createPartnerAccount(partnerId, email, pw);
      if (!r.ok) { setError(r.error ?? "발급 실패"); return; }
      onChanged();
      onClose();
    });
  }
  function reset() {
    if (pw.length < 6) { setError("새 비밀번호(6자 이상)를 입력하세요"); return; }
    setError(null);
    startTransition(async () => {
      const r = await resetPartnerPassword(partnerId, pw);
      if (!r.ok) { setError(r.error ?? "재설정 실패"); return; }
      alert("비밀번호가 재설정되었습니다.");
      setPw("");
    });
  }
  function remove() {
    if (!confirm(`${partnerName} 포털 계정을 삭제할까요? 거래처는 더 이상 로그인할 수 없습니다.`)) return;
    startTransition(async () => {
      const r = await deletePartnerAccount(partnerId);
      if (!r.ok) { setError(r.error ?? "삭제 실패"); return; }
      onChanged();
      onClose();
    });
  }

  return (
    <PartnerModal title={`🔑 포털 계정 — ${partnerName}`} onClose={onClose}>
      <div className="space-y-3 p-5">
        <p className="rounded-lg bg-neutral-50 p-3 text-xs text-neutral-500">
          거래처가 직접 로그인해 <b>수업 진도·거래/정산·세금계산서·문서/공지</b>를 조회하는 계정입니다.
          발급 후 이메일·비밀번호를 거래처에 전달하세요. (거래처는 조회만 가능)
        </p>
        {account ? (
          <>
            <Field label="현재 계정(이메일)">
              <TextInput value={account.email ?? ""} readOnly className="bg-neutral-50" />
            </Field>
            <Field label="비밀번호 재설정 (6자 이상)">
              <TextInput value={pw} onChange={(e) => setPw(e.target.value)} placeholder="새 임시 비밀번호" />
            </Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-between gap-2 pt-1">
              <button onClick={remove} disabled={pending} className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-100 disabled:opacity-50">
                계정 삭제
              </button>
              <button onClick={reset} disabled={pending} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50">
                {pending ? "처리 중…" : "비밀번호 재설정"}
              </button>
            </div>
          </>
        ) : (
          <>
            <Field label="로그인 이메일" required>
              <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="거래처 로그인 이메일" />
            </Field>
            <Field label="임시 비밀번호 (6자 이상)" required>
              <TextInput value={pw} onChange={(e) => setPw(e.target.value)} placeholder="임시 비밀번호" />
            </Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end pt-1">
              <button onClick={create} disabled={pending || !email.trim() || pw.length < 6} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-50">
                {pending ? "발급 중…" : "포털 계정 발급"}
              </button>
            </div>
          </>
        )}
      </div>
    </PartnerModal>
  );
}

// ---------- 엑셀형 일괄입력 그리드 ----------
// 셀 클릭→바로 편집(updateRow), 맨 아래 +행 추가로 빈 거래처 즉시 생성. winner 엑셀리스트 사용감.
function PartnerGrid({
  rows,
  ctx,
  catSel,
  catLabel,
  accountLabel,
  defaultCompanyId,
  onOpenDetail,
  onChanged,
}: {
  rows: PartnerRow[];
  ctx: ImportCtx;
  catSel: { value: string; label: string }[];
  catLabel: Record<string, string>;
  accountLabel: Map<string, string>;
  defaultCompanyId: string | null;
  onOpenDetail: (id: string) => void;
  onChanged: () => void;
}) {
  const [, startTransition] = useTransition();

  // 셀 편집 커밋 → 모달 저장과 동일한 변환 규칙
  function handleEdit(id: string, key: string, raw: string) {
    let value: unknown;
    if (key === "default_tax_rate") value = raw.trim() === "" ? null : Number(raw.replace(/[^\d.-]/g, ""));
    else if (key === "name") value = raw.trim();
    else value = raw.trim() === "" ? null : raw.trim();
    startTransition(async () => {
      await updateRow("partners", id, { [key]: value });
      onChanged();
    });
  }

  // +행 추가 → 빈 거래처 즉시 생성. 활성 사업자 우선, 없으면 모든 행이 같은 사업자일 때 그 사업자.
  const soleCompany =
    rows.length > 0 && rows.every((r) => r.company_id === rows[0].company_id) ? rows[0].company_id : null;
  const addCompany = defaultCompanyId ?? soleCompany;
  function handleAdd() {
    startTransition(async () => {
      await createRow("partners", { name: "", company_id: addCompany });
      onChanged();
    });
  }

  const companyNameOf = (id: string | null) => (id ? ctx.companies.find((c) => c.id === id)?.name ?? "" : "공용");
  const companyOpts = [{ value: "", label: "공용" }, ...ctx.companies.map((c) => ({ value: c.id, label: c.name }))];
  const catOpts = [{ value: "", label: "미지정" }, ...catSel];
  const accountOpts = [
    { value: "", label: "미지정" },
    ...ctx.accounts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` })),
  ];

  const columns: GridCol<PartnerRow>[] = [
    { key: "name", label: "상호", width: 160, edit: "text", text: (r) => r.name ?? "" },
    {
      key: "category",
      label: "구분",
      width: 90,
      edit: "select",
      options: catOpts,
      text: (r) => (r.category ? catLabel[r.category] ?? r.category : ""),
    },
    { key: "biz_no", label: "사업자번호", width: 130, edit: "text", text: (r) => r.biz_no ?? "" },
    { key: "contact_name", label: "담당자", width: 90, edit: "text", text: (r) => r.contact_name ?? "" },
    { key: "phone", label: "연락처", width: 130, edit: "text", text: (r) => r.phone ?? "" },
    { key: "email", label: "이메일", width: 160, edit: "text", text: (r) => r.email ?? "" },
    {
      key: "company_id",
      label: "소속",
      width: 130,
      edit: "select",
      options: companyOpts,
      text: (r) => companyNameOf(r.company_id),
    },
    {
      key: "default_tax_rate",
      label: "부가세율(%)",
      width: 90,
      align: "right",
      edit: "number",
      text: (r) => (r.default_tax_rate != null ? String(r.default_tax_rate) : ""),
    },
    {
      key: "default_account_id",
      label: "기본 계정과목",
      width: 160,
      edit: "select",
      options: accountOpts,
      text: (r) => (r.default_account_id ? accountLabel.get(r.default_account_id) ?? "" : ""),
    },
    { key: "memo", label: "메모", width: 160, edit: "text", text: (r) => r.memo ?? "" },
    {
      key: "_open",
      label: "상세",
      width: 64,
      align: "center",
      render: (r) => (
        <button
          onClick={() => onOpenDetail(r.id)}
          className="rounded-md border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-50"
        >
          열기 ↗
        </button>
      ),
    },
  ];

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3">
      <p className="mb-2 px-1 text-xs text-neutral-400">
        셀을 클릭하면 바로 수정됩니다 · 맨 아래 <b>+ 거래처 행 추가</b>로 연속 입력 · 헤더 드래그로 순서 변경, 우측 경계 드래그로 폭 조정
      </p>
      <ExcelGrid
        storageKey="erp_partners_grid"
        columns={columns}
        rows={rows}
        rowId={(r) => r.id}
        onEdit={handleEdit}
        onAddRow={handleAdd}
        addLabel="+ 거래처 행 추가"
        accent={(r) => !r.name?.trim()}
        empty="거래처가 없습니다. ‘+ 거래처 행 추가’로 시작하세요."
        pageSize={30}
        searchPlaceholder="🔍 상호·구분·사업자번호·담당자 검색"
      />
    </div>
  );
}

function HeaderField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-white/60">{label}</p>
      <p className="truncate font-semibold">{value}</p>
    </div>
  );
}

// 거래처 사진(로고) 업로드 — 클릭·드래그·붙여넣기, 256px로 리사이즈해 photo_url(data URL) 저장. 직원 아바타와 동일 방식(버킷 미사용).
function PartnerAvatarUpload({ partner, onChanged }: { partner: PartnerRow; onChanged: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [drag, setDrag] = useState(false);

  function resizeAndSave(file: File) {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const max = 256;
        let w = img.width;
        let h = img.height;
        if (w > h && w > max) {
          h = Math.round((h * max) / w);
          w = max;
        } else if (h > max) {
          w = Math.round((w * max) / h);
          h = max;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const cx = canvas.getContext("2d");
        if (!cx) return;
        cx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        startTransition(async () => {
          await updateRow("partners", partner.id, { photo_url: dataUrl });
          onChanged();
        });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  async function pasteFromClipboard() {
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = it.types.find((t) => t.startsWith("image/"));
        if (type) {
          const blob = await it.getType(type);
          resizeAndSave(new File([blob], "paste.png", { type }));
          return;
        }
      }
      alert("클립보드에 이미지가 없습니다.");
    } catch {
      alert("붙여넣기를 사용할 수 없습니다. 클릭하거나 드래그로 올려주세요.");
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) resizeAndSave(f);
          e.target.value = "";
        }}
      />
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) resizeAndSave(f);
        }}
        title="클릭 또는 드래그해서 사진 업로드"
        className={`group/av relative h-28 w-28 shrink-0 cursor-pointer overflow-hidden rounded-3xl shadow-lg ring-4 ring-white/40 ${
          drag ? "opacity-70 ring-white" : ""
        }`}
      >
        {partner.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={partner.photo_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-white/90 text-4xl font-bold text-neutral-400">
            {partner.name?.[0] ?? "?"}
          </div>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-center text-[10px] leading-tight text-white opacity-0 transition group-hover/av:opacity-100">
          {pending ? "저장중…" : "클릭·드래그"}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={pasteFromClipboard}
          className="rounded-md bg-white/20 px-2 py-0.5 text-[11px] text-white hover:bg-white/30"
        >
          📋 붙여넣기
        </button>
        {partner.photo_url && (
          <button
            onClick={() =>
              startTransition(async () => {
                await updateRow("partners", partner.id, { photo_url: null });
                onChanged();
              })
            }
            className="rounded-md px-1 py-0.5 text-[11px] text-white/70 hover:text-white"
          >
            삭제
          </button>
        )}
      </div>
    </div>
  );
}

// 목록 행 아바타(사진 or 이니셜) — 작게
function PartnerMiniAvatar({ partner }: { partner: PartnerRow }) {
  if (partner.photo_url)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={partner.photo_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-bold text-neutral-500">
      {partner.name?.[0] ?? "?"}
    </span>
  );
}

// 기본정보 탭 섹션 카드(제목 + 수정버튼 + 2열 필드 그리드)
function InfoSection({
  icon,
  title,
  hint,
  onEdit,
  children,
}: {
  icon: string;
  title: string;
  hint?: string;
  onEdit?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50/60 px-5 py-3">
        <h3 className="flex items-center gap-2 font-semibold text-neutral-800">
          <span>{icon}</span>
          <span>{title}</span>
          {hint && <span className="text-xs font-normal text-neutral-400">{hint}</span>}
        </h3>
        {onEdit && (
          <button onClick={onEdit} className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50">
            ✏️ 수정
          </button>
        )}
      </div>
      <dl className="grid grid-cols-1 gap-x-10 px-5 py-1 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-neutral-50 py-2.5 text-sm">
      <dt className="shrink-0 text-neutral-400">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-neutral-800">{children}</dd>
    </div>
  );
}

// 거래처 메모 로그 탭 — 직원 메모처럼 누적(작성자·시각 기록)
function PartnerMemoTab({ partnerId, memos, onChanged }: { partnerId: string; memos: PartnerMemoRow[]; onChanged: () => void }) {
  const [pending, startTransition] = useTransition();
  const [memo, setMemo] = useState("");

  function save() {
    const text = memo.trim();
    if (!text) return;
    startTransition(async () => {
      const r = await addPartnerMemo(partnerId, text);
      if (!r.ok) {
        alert(r.error);
        return;
      }
      setMemo("");
      onChanged();
    });
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
        <h3 className="font-semibold text-neutral-800">
          📝 메모 <span className="ml-1 text-xs font-normal text-neutral-400">{memos.length}건</span>
        </h3>
      </div>
      <div className="space-y-3 p-5">
        {/* 새 메모 입력 → 누적 기록 */}
        <div className="space-y-2">
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save();
            }}
            rows={3}
            placeholder="메모를 입력하면 시각·작성자와 함께 계속 기록됩니다… (Ctrl+Enter로 저장)"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
          />
          <div className="text-right">
            <button
              onClick={save}
              disabled={pending || !memo.trim()}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-40"
            >
              기록 추가
            </button>
          </div>
        </div>

        {/* 누적 메모 로그(최신순) */}
        {memos.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-400">기록된 메모가 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {memos.map((m) => (
              <li key={m.id} className="group rounded-xl border border-neutral-100 bg-neutral-50/60 px-3.5 py-2.5">
                <div className="mb-1 flex items-center gap-2 text-[11px] text-neutral-400">
                  <span className="font-medium text-neutral-500">{m.author_name ?? "작성자"}</span>
                  <span className="tabular-nums">{m.created_at.slice(0, 16).replace("T", " ")}</span>
                  <button
                    onClick={() => {
                      if (confirm("이 메모를 삭제할까요?")) startTransition(async () => { await deletePartnerMemo(m.id); onChanged(); });
                    }}
                    className="ml-auto text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-rose-500"
                  >
                    🗑
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-sm text-neutral-700">{m.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// 탭 순서 변경 팝오버 — 드래그 또는 ▲▼
function TabReorderMenu({
  order,
  labels,
  onReorder,
  onReset,
}: {
  order: PartnerTab[];
  labels: Record<PartnerTab, string>;
  onReorder: (next: PartnerTab[]) => void;
  onReset: () => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  function drop(target: number) {
    if (dragIdx === null || dragIdx === target) { setDragIdx(null); return; }
    const next = order.slice();
    const [moved] = next.splice(dragIdx, 1);
    next.splice(target, 0, moved);
    onReorder(next);
    setDragIdx(null);
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = order.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onReorder(next);
  }
  return (
    <div className="absolute right-0 top-full z-40 mt-1 w-60 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-xs font-semibold text-neutral-500">탭 순서 변경 · 드래그</span>
        <button onClick={onReset} className="text-[11px] text-neutral-400 hover:text-neutral-700">초기화</button>
      </div>
      <ul className="space-y-0.5">
        {order.map((k, i) => (
          <li
            key={k}
            draggable
            onDragStart={() => setDragIdx(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => drop(i)}
            onDragEnd={() => setDragIdx(null)}
            className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${
              dragIdx === i ? "border-dashed border-neutral-300 bg-neutral-50 opacity-60" : "border-transparent hover:bg-neutral-50"
            }`}
          >
            <span className="cursor-grab select-none text-neutral-300 active:cursor-grabbing">⋮⋮</span>
            <span className="flex-1 truncate">{labels[k]}</span>
            <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded px-1 text-xs text-neutral-400 hover:bg-neutral-100 disabled:opacity-30">▲</button>
            <button onClick={() => move(i, 1)} disabled={i === order.length - 1} className="rounded px-1 text-xs text-neutral-400 hover:bg-neutral-100 disabled:opacity-30">▼</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PartnerModal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <div className={`mt-12 w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-xl border border-neutral-200 bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PartnerEditModal({
  partner,
  companies,
  accounts,
  catSel,
  employees,
  defaultCompanyId,
  onClose,
  onSaved,
}: {
  partner: PartnerRow | null;
  companies: { id: string; name: string }[];
  accounts: { id: string; code: string; name: string }[];
  catSel: { value: string; label: string }[];
  employees: { id: string; name: string }[];
  defaultCompanyId: string | null;
  onClose: () => void;
  onSaved: (id?: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [d, setD] = useState({
    name: partner?.name ?? "",
    category: partner?.category ?? "",
    biz_no: partner?.biz_no ?? "",
    contact_name: partner?.contact_name ?? "",
    phone: partner?.phone ?? "",
    email: partner?.email ?? "",
    company_id: partner ? partner.company_id ?? "" : defaultCompanyId ?? "",
    default_account_id: partner?.default_account_id ?? "",
    default_tax_rate: partner?.default_tax_rate?.toString() ?? "",
    memo: partner?.memo ?? "",
    // CRM 확장(핵심)
    rep_name: partner?.rep_name ?? "",
    biz_type: partner?.biz_type ?? "",
    biz_item: partner?.biz_item ?? "",
    address: partner?.address ?? "",
    address_detail: partner?.address_detail ?? "",
    tax_email: partner?.tax_email ?? "",
    partner_kind: partner?.partner_kind ?? "SALES",
    tax_category: partner?.tax_category ?? "TAXABLE",
    payment_terms: partner?.payment_terms ?? "",
    payment_cycle: partner?.payment_cycle ?? "",
    evidence_type: partner?.evidence_type ?? "",
    credit_limit: partner?.credit_limit?.toString() ?? "",
    bank_name: partner?.bank_name ?? "",
    account_no: partner?.account_no ?? "",
    account_holder: partner?.account_holder ?? "",
    sales_rep_id: partner?.sales_rep_id ?? "",
    partner_group: partner?.partner_group ?? "",
    popbill_corpnum: partner?.popbill_corpnum ?? "",
    // 시설 정보
    contact_title: partner?.contact_title ?? "",
    parking_count: partner?.parking_count?.toString() ?? "",
    max_capacity: partner?.max_capacity?.toString() ?? "",
    ideal_capacity: partner?.ideal_capacity?.toString() ?? "",
    usage_fee: partner?.usage_fee?.toString() ?? "",
    facility_note: partner?.facility_note ?? "",
  });

  function save() {
    if (!d.name.trim()) {
      setError("상호는 필수입니다");
      return;
    }
    const rate = d.default_tax_rate.trim();
    const limit = d.credit_limit.trim();
    const value = {
      name: d.name.trim(),
      category: d.category || null,
      biz_no: d.biz_no.trim() || null,
      contact_name: d.contact_name.trim() || null,
      phone: d.phone.trim() || null,
      email: d.email.trim() || null,
      company_id: d.company_id || null,
      default_account_id: d.default_account_id || null,
      default_tax_rate: rate === "" ? null : Number(rate),
      memo: d.memo.trim() || null,
      rep_name: d.rep_name.trim() || null,
      biz_type: d.biz_type.trim() || null,
      biz_item: d.biz_item.trim() || null,
      address: d.address.trim() || null,
      address_detail: d.address_detail.trim() || null,
      tax_email: d.tax_email.trim() || null,
      partner_kind: d.partner_kind || null,
      tax_category: d.tax_category || null,
      payment_terms: d.payment_terms || null,
      payment_cycle: d.payment_cycle || null,
      evidence_type: d.evidence_type || null,
      credit_limit: limit === "" ? null : Number(limit.replace(/[^\d.-]/g, "")),
      bank_name: d.bank_name.trim() || null,
      account_no: d.account_no.trim() || null,
      account_holder: d.account_holder.trim() || null,
      sales_rep_id: d.sales_rep_id || null,
      partner_group: d.partner_group.trim() || null,
      popbill_corpnum: d.popbill_corpnum.trim() || null,
      contact_title: d.contact_title.trim() || null,
      // 정수 컬럼 — 소수 입력해도 반올림해 정수로 저장(DB 타입오류 방지)
      parking_count: d.parking_count.trim() === "" ? null : Math.round(Number(d.parking_count.replace(/[^\d.-]/g, ""))),
      max_capacity: d.max_capacity.trim() === "" ? null : Math.round(Number(d.max_capacity.replace(/[^\d.-]/g, ""))),
      ideal_capacity: d.ideal_capacity.trim() === "" ? null : Math.round(Number(d.ideal_capacity.replace(/[^\d.-]/g, ""))),
      usage_fee: d.usage_fee.trim() === "" ? null : Number(d.usage_fee.replace(/[^\d.-]/g, "")),
      facility_note: d.facility_note.trim() || null,
    };
    startTransition(async () => {
      const res = partner ? await updateRow("partners", partner.id, value) : await createRow("partners", value);
      if (res.ok) onSaved(partner?.id);
      else setError(res.error ?? "오류");
    });
  }

  return (
    <PartnerModal title={partner ? "거래처 수정" : "거래처 등록"} onClose={onClose} wide>
      <div className="space-y-3 bg-neutral-50 p-4">
        {/* 1. 기본 정보 */}
        <FormSection no={1} title="기본 정보">
          <div className="col-span-2">
            <Field label="상호" required><TextInput value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="거래처 상호" /></Field>
          </div>
          <Field label="구분">
            <SelectInput value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })}>
              <option value="">미지정</option>
              {catSel.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </SelectInput>
          </Field>
          <Field label="사업자번호"><TextInput value={d.biz_no} onChange={(e) => setD({ ...d, biz_no: e.target.value })} placeholder="000-00-00000" /></Field>
        </FormSection>

        {/* 2. 담당자·연락처 */}
        <FormSection no={2} title="담당자 · 연락처">
          <Field label="담당자"><TextInput value={d.contact_name} onChange={(e) => setD({ ...d, contact_name: e.target.value })} placeholder="담당자명" /></Field>
          <div />
          <Field label="연락처"><TextInput value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} placeholder="010-0000-0000" /></Field>
          <Field label="이메일"><TextInput value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} placeholder="name@example.com" /></Field>
        </FormSection>

        {/* 3. 회계 설정 */}
        <FormSection no={3} title="회계 설정" desc="세금계산서·계정 자동입력에 사용">
          <Field label="소속 사업자 (미선택=공용)">
            <SelectInput value={d.company_id} onChange={(e) => setD({ ...d, company_id: e.target.value })}>
              <option value="">공용</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectInput>
          </Field>
          <Field label="기본 부가세율(%)">
            <NumberInput value={d.default_tax_rate} onChange={(v) => setD({ ...d, default_tax_rate: v })} placeholder="비우면 10%, 면세는 0" />
          </Field>
          <div className="col-span-2">
            <Field label="기본 계정과목">
              <SelectInput value={d.default_account_id} onChange={(e) => setD({ ...d, default_account_id: e.target.value })}>
                <option value="">미지정</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
              </SelectInput>
            </Field>
          </div>
        </FormSection>

        {/* 4. 사업자 상세 */}
        <FormSection no={4} title="사업자 상세" desc="세금계산서·CRM용(선택)">
          <Field label="대표자명"><TextInput value={d.rep_name} onChange={(e) => setD({ ...d, rep_name: e.target.value })} /></Field>
          <Field label="거래처 구분">
            <SelectInput value={d.partner_kind} onChange={(e) => setD({ ...d, partner_kind: e.target.value })}>
              {Object.entries(PARTNER_KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </SelectInput>
          </Field>
          <Field label="업태"><TextInput value={d.biz_type} onChange={(e) => setD({ ...d, biz_type: e.target.value })} placeholder="서비스" /></Field>
          <Field label="종목"><TextInput value={d.biz_item} onChange={(e) => setD({ ...d, biz_item: e.target.value })} placeholder="교육" /></Field>
          <Field label="과세 유형">
            <SelectInput value={d.tax_category} onChange={(e) => setD({ ...d, tax_category: e.target.value })}>
              {Object.entries(TAX_CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </SelectInput>
          </Field>
          <Field label="팝빌 CorpNum"><TextInput value={d.popbill_corpnum} onChange={(e) => setD({ ...d, popbill_corpnum: e.target.value })} placeholder="발행 주체(2차)" /></Field>
          <div className="col-span-2"><Field label="주소"><TextInput value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} placeholder="사업장 주소" /></Field></div>
          <div className="col-span-2"><Field label="상세주소"><TextInput value={d.address_detail} onChange={(e) => setD({ ...d, address_detail: e.target.value })} /></Field></div>
          <Field label="세금계산서 이메일"><TextInput value={d.tax_email} onChange={(e) => setD({ ...d, tax_email: e.target.value })} placeholder="tax@example.com" /></Field>
          <Field label="영업담당">
            <SelectInput value={d.sales_rep_id} onChange={(e) => setD({ ...d, sales_rep_id: e.target.value })}>
              <option value="">미지정</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </SelectInput>
          </Field>
        </FormSection>

        {/* 5. 시설 정보 */}
        <FormSection no={5} title="시설 정보" desc="장소·기관 거래처용(선택)">
          <Field label="담당자 직급"><TextInput value={d.contact_title} onChange={(e) => setD({ ...d, contact_title: e.target.value })} placeholder="예: 원장·팀장" /></Field>
          <Field label="이용료(원)"><NumberInput value={d.usage_fee} onChange={(v) => setD({ ...d, usage_fee: v })} placeholder="대관·이용료" /></Field>
          <Field label="주차대수"><NumberInput value={d.parking_count} onChange={(v) => setD({ ...d, parking_count: v })} placeholder="대" /></Field>
          <Field label="최대 수용인원"><NumberInput value={d.max_capacity} onChange={(v) => setD({ ...d, max_capacity: v })} placeholder="명" /></Field>
          <Field label="적정 인원"><NumberInput value={d.ideal_capacity} onChange={(v) => setD({ ...d, ideal_capacity: v })} placeholder="명" /></Field>
          <div />
          <div className="col-span-2"><Field label="시설 비고"><TextInput value={d.facility_note} onChange={(e) => setD({ ...d, facility_note: e.target.value })} placeholder="시설 특이사항" /></Field></div>
        </FormSection>

        {/* 6. 결제·금융 */}
        <FormSection no={6} title="결제 · 금융" desc="정산·증빙 기준(선택)">
          <Field label="결제 조건">
            <SelectInput value={d.payment_terms} onChange={(e) => setD({ ...d, payment_terms: e.target.value })}>
              <option value="">미지정</option>
              {Object.entries(PAYMENT_TERMS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </SelectInput>
          </Field>
          <Field label="결제 주기">
            <SelectInput value={d.payment_cycle} onChange={(e) => setD({ ...d, payment_cycle: e.target.value })}>
              <option value="">미지정</option>
              {Object.entries(PAYMENT_CYCLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </SelectInput>
          </Field>
          <Field label="증빙 발행">
            <SelectInput value={d.evidence_type} onChange={(e) => setD({ ...d, evidence_type: e.target.value })}>
              <option value="">미지정</option>
              {Object.entries(EVIDENCE_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </SelectInput>
          </Field>
          <Field label="여신 한도"><NumberInput value={d.credit_limit} onChange={(v) => setD({ ...d, credit_limit: v })} placeholder="외상 한도" /></Field>
          <Field label="거래 은행"><TextInput value={d.bank_name} onChange={(e) => setD({ ...d, bank_name: e.target.value })} /></Field>
          <Field label="계좌번호"><TextInput value={d.account_no} onChange={(e) => setD({ ...d, account_no: e.target.value })} /></Field>
          <Field label="예금주"><TextInput value={d.account_holder} onChange={(e) => setD({ ...d, account_holder: e.target.value })} /></Field>
          <Field label="그룹/지역"><TextInput value={d.partner_group} onChange={(e) => setD({ ...d, partner_group: e.target.value })} placeholder="필터용" /></Field>
        </FormSection>

        {/* 7. 메모 */}
        <FormSection no={7} title="메모">
          <div className="col-span-2">
            <textarea
              value={d.memo}
              onChange={(e) => setD({ ...d, memo: e.target.value })}
              rows={3}
              placeholder="거래처 메모…"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            />
          </div>
        </FormSection>
      </div>
      {error && <p className="bg-neutral-50 px-5 pb-1 text-sm text-rose-600">{error}</p>}
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-neutral-200 bg-white px-5 py-3">
        <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">취소</button>
        <button onClick={save} disabled={pending} className="rounded-lg bg-indigo-500 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50">
          {pending ? "저장 중…" : "저장"}
        </button>
      </div>
    </PartnerModal>
  );
}

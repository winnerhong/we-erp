"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { InlineSelect } from "@/components/inline-select";
import { OptionsManager } from "@/components/options-manager";
import { BulkImport } from "@/components/bulk-import";
import { ExcelGrid, type GridCol } from "@/components/excel-grid";
import { PaybackList, type PaybackBrief } from "@/components/payback-list";
import { Card, Field, TextInput, SelectInput, Badge, EmptyState, FormSection } from "@/components/ui";
import { krw } from "@/lib/labels";
import { toneClass } from "@/lib/field-tones";
import type { PartnerRow, FieldOptionRow } from "@/lib/supabase/database.types";
import type { ImportCtx } from "@/lib/import-specs";
import { createRow, updateRow, deleteRow } from "@/app/(erp)/actions";
import { importPartnersFromWks } from "./actions";
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
        className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
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
  options,
  selectedId,
  entries,
  paybacks,
  receivable,
  payable,
}: {
  rows: PartnerRow[];
  ctx: ImportCtx;
  options: FieldOptionRow[];
  selectedId: string | null;
  entries: LedgerEntry[];
  paybacks: PaybackBrief[];
  receivable: number;
  payable: number;
}) {
  const router = useRouter();
  const [mgrOpen, setMgrOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("ALL");
  const [tab, setTab] = useState<"info" | "ledger" | "payback">("info");
  const [ledgerFilter, setLedgerFilter] = useState<"ALL" | LedgerEntry["source"]>("ALL");
  const [view, setView] = useState<"card" | "grid">("card");

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
  const withCurrent = (sel: { value: string; label: string }[], value: string) =>
    !value || sel.some((o) => o.value === value) ? sel : [{ value, label: catLabel[value] ?? value }, ...sel];

  const q = search.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (catFilter !== "ALL" && r.category !== catFilter) return false;
    if (!q) return true;
    return `${r.name} ${r.category ?? ""} ${r.biz_no ?? ""} ${r.contact_name ?? ""} ${r.phone ?? ""}`
      .toLowerCase()
      .includes(q);
  });
  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const go = (id: string) => router.push(`/partners?p=${id}`);

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
                view === "card" ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              🗂 카드형
            </button>
            <button
              onClick={() => setView("grid")}
              className={`rounded-md px-2.5 py-1 font-medium ${
                view === "grid" ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-800"
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
          <button
            onClick={() => setAddOpen(true)}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700"
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
          onOpenDetail={go}
          onChanged={() => router.refresh()}
        />
      ) : (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        {/* 좌측 목록 */}
        <div className="rounded-2xl border border-neutral-200 bg-white">
          <div className="space-y-2 border-b border-neutral-100 p-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 상호·구분·사업자번호·담당자"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            />
            <div className="flex flex-wrap gap-1">
              {[{ value: "ALL", label: `전체 ${rows.length}` }, ...catActive.map((o) => ({
                value: o.value,
                label: `${o.label} ${rows.filter((r) => r.category === o.value).length}`,
              }))].map((t) => (
                <button
                  key={t.value}
                  onClick={() => setCatFilter(t.value)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    catFilter === t.value ? "bg-neutral-900 text-white" : "border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
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
          <div className="max-h-[68vh] divide-y divide-neutral-100 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-neutral-400">거래처가 없습니다.</p>
            ) : (
              filtered.map((r) => {
                const on = selected?.id === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => go(r.id)}
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition ${
                      on ? "bg-indigo-50" : "hover:bg-neutral-50"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-semibold text-neutral-800">{r.name}</span>
                        {r.category && (
                          <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[11px] ${toneClass(catColor[r.category])}`}>
                            {catLabel[r.category] ?? r.category}
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-neutral-400">
                        {r.contact_name || "담당자 없음"}
                        {r.phone ? ` · ${r.phone}` : ""}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* 우측 상세 */}
        {!selected ? (
          <div className="flex items-center justify-center rounded-2xl border border-neutral-200 bg-white p-10 text-sm text-neutral-400">
            왼쪽에서 거래처를 선택하세요. (없으면 ‘＋ 거래처 등록’)
          </div>
        ) : (
          <div className="space-y-4">
            {/* 헤더 카드 */}
            <div className="rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-500 p-6 text-white shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold">{selected.name}</h2>
                    {selected.category && (
                      <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">
                        {catLabel[selected.category] ?? selected.category}
                      </span>
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
                  <button onClick={() => setEditOpen(true)} className="rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium backdrop-blur hover:bg-white/30">
                    ✏️ 수정
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

            {/* 탭 */}
            <div className="flex gap-1 border-b border-neutral-200">
              {([
                ["info", "🧾 기본정보"],
                ["ledger", `📒 거래원장 ${entries.length}`],
                ["payback", `💸 페이백 ${paybacks.length}`],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                    tab === k ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "info" ? (
              <section className="rounded-2xl border border-neutral-200 bg-white">
                <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
                  <h3 className="font-semibold text-neutral-800">🧾 기본 정보</h3>
                  <button onClick={() => setEditOpen(true)} className="rounded-lg border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50">
                    수정
                  </button>
                </div>
                <dl className="divide-y divide-neutral-50 px-5 py-1 text-sm">
                  <Row label="상호">{selected.name}</Row>
                  <Row label="구분">
                    <InlineSelect
                      kind="partners"
                      id={selected.id}
                      field="category"
                      value={selected.category ?? ""}
                      placeholder="미지정"
                      options={withCurrent(catSel, selected.category ?? "")}
                      tone={selected.category ? toneClass(catColor[selected.category]) : undefined}
                    />
                  </Row>
                  <Row label="사업자번호">{selected.biz_no || "-"}</Row>
                  <Row label="담당자">{selected.contact_name || "-"}</Row>
                  <Row label="연락처">{selected.phone || "-"}</Row>
                  <Row label="이메일">{selected.email || "-"}</Row>
                  <Row label="소속">
                    <InlineSelect
                      kind="partners"
                      id={selected.id}
                      field="company_id"
                      value={selected.company_id ?? ""}
                      placeholder="공용"
                      options={ctx.companies.map((c) => ({ value: c.id, label: c.name }))}
                      tone={selected.company_id ? toneClass("teal") : toneClass("blue")}
                    />
                  </Row>
                  <Row label="기본 계정과목">
                    {selected.default_account_id ? accountLabel.get(selected.default_account_id) ?? "-" : "-"}
                  </Row>
                  <Row label="기본 부가세율">
                    {selected.default_tax_rate != null ? `${selected.default_tax_rate}%` : "10% (기본)"}
                  </Row>
                  <Row label="메모">{selected.memo || "-"}</Row>
                </dl>
              </section>
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
    </div>
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
  onOpenDetail,
  onChanged,
}: {
  rows: PartnerRow[];
  ctx: ImportCtx;
  catSel: { value: string; label: string }[];
  catLabel: Record<string, string>;
  accountLabel: Map<string, string>;
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

  // +행 추가 → 빈 거래처 즉시 생성. 모든 행이 같은 사업자면 그 사업자로 자동 배정.
  const soleCompany =
    rows.length > 0 && rows.every((r) => r.company_id === rows[0].company_id) ? rows[0].company_id : null;
  function handleAdd() {
    startTransition(async () => {
      await createRow("partners", { name: "", company_id: soleCompany });
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-neutral-400">{label}</dt>
      <dd className="text-right font-medium text-neutral-800">{children}</dd>
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
  onClose,
  onSaved,
}: {
  partner: PartnerRow | null;
  companies: { id: string; name: string }[];
  accounts: { id: string; code: string; name: string }[];
  catSel: { value: string; label: string }[];
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
    company_id: partner?.company_id ?? "",
    default_account_id: partner?.default_account_id ?? "",
    default_tax_rate: partner?.default_tax_rate?.toString() ?? "",
    memo: partner?.memo ?? "",
  });

  function save() {
    if (!d.name.trim()) {
      setError("상호는 필수입니다");
      return;
    }
    const rate = d.default_tax_rate.trim();
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
            <TextInput inputMode="numeric" value={d.default_tax_rate} onChange={(e) => setD({ ...d, default_tax_rate: e.target.value })} placeholder="비우면 10%, 면세는 0" />
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

        {/* 4. 메모 */}
        <FormSection no={4} title="메모">
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
        <button onClick={save} disabled={pending} className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
          {pending ? "저장 중…" : "저장"}
        </button>
      </div>
    </PartnerModal>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, TextInput, NumberInput, SelectInput, EmptyState, Badge } from "@/components/ui";
import { krw } from "@/lib/labels";
import type { TaxInvoiceRow } from "@/lib/supabase/database.types";
import { createTrade, updateTrade, deleteTrade, linkInvoiceToBankTxn, unlinkInvoiceBank } from "./actions";
import { BankTradeTabs } from "@/components/bank-trade-tabs";

type Account = { id: string; code: string; name: string };

export interface SettleInfo {
  amount: number;
  count: number;
  lastDate: string;
}
export interface UnlinkedTxn {
  id: string;
  txn_date: string;
  direction: string;
  amount: number;
  counterparty: string | null;
  partner_id: string | null;
}

type TradeType = "SALES" | "PURCHASE";
const EVIDENCE = ["세금계산서", "카드", "현금", "무증빙"];

const num = (s: string) => {
  const n = Number(s.replace(/[^\d.-]/g, ""));
  return s.trim() === "" || !Number.isFinite(n) ? 0 : n;
};
const daysBetween = (a: string | null, b: string | null) => {
  if (!a || !b) return 999;
  return Math.round(
    (new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000
  );
};

interface Props {
  invoices: TaxInvoiceRow[];
  settle: Record<string, SettleInfo>;
  unlinked: UnlinkedTxn[];
  partners: { id: string; name: string }[];
  accounts: Account[];
  month: string;
  activeCompanyId: string | null;
}

export function TradeClient({ invoices, settle, unlinked, partners, accounts, month, activeCompanyId }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<TradeType>("SALES");
  const [settleFor, setSettleFor] = useState<TaxInvoiceRow | null>(null);
  const [adding, setAdding] = useState(false);

  const partnerName = new Map(partners.map((p) => [p.id, p.name]));

  const today = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  })();
  const isOverdue = (r: TaxInvoiceRow) => !settle[r.id] && !!r.due_date && r.due_date < today;

  const rows = invoices.filter((r) => r.type === tab);
  const total = rows.reduce((s, r) => s + r.total_amount, 0);
  const settledTotal = rows.filter((r) => settle[r.id]).reduce((s, r) => s + r.total_amount, 0);
  const unsettled = total - settledTotal;
  const overdueRows = rows.filter(isOverdue);
  const overdueAmt = overdueRows.reduce((s, r) => s + r.total_amount, 0);

  const salesVat = invoices.filter((r) => r.type === "SALES").reduce((s, r) => s + r.vat_amount, 0);
  const purchaseVat = invoices.filter((r) => r.type === "PURCHASE").reduce((s, r) => s + r.vat_amount, 0);
  const payable = salesVat - purchaseVat;

  const isSales = tab === "SALES";
  const unsettledLabel = isSales ? "미수금" : "미지급";
  const settledLabel = isSales ? "입금완료" : "지급완료";

  return (
    <div>
      <BankTradeTabs active="trade" />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">매입/매출</h1>
          <p className="mt-1 text-sm text-neutral-500">
            매출·매입을 기록하고 통장 입출금과 정산합니다. (세금계산서·부가세와 같은 데이터)
          </p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => router.push(`/trade?m=${e.target.value}`)}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
        />
      </div>

      {/* 요약 */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-neutral-500">{isSales ? "총매출" : "총매입"} ({month})</p>
          <p className="mt-1 text-lg font-bold tabular">{krw(total)}</p>
        </Card>
        <Card className={`p-4 ${unsettled > 0 ? "bg-rose-50" : ""}`}>
          <p className="text-xs text-neutral-500">{unsettledLabel}(미정산)</p>
          <p className={`mt-1 text-lg font-bold tabular ${unsettled > 0 ? "text-rose-700" : "text-neutral-400"}`}>
            {krw(unsettled)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-neutral-500">{settledLabel}</p>
          <p className="mt-1 text-lg font-bold tabular text-emerald-700">{krw(settledTotal)}</p>
        </Card>
        <Card className={`p-4 ${payable >= 0 ? "bg-neutral-900 text-white" : "bg-emerald-50"}`}>
          <p className={`text-xs ${payable >= 0 ? "text-neutral-300" : "text-neutral-500"}`}>예상 부가세</p>
          <p className="mt-1 text-lg font-bold tabular">
            {payable >= 0 ? "납부 " : "환급 "}
            {krw(Math.abs(payable))}
          </p>
        </Card>
      </div>

      {/* 탭 + 추가 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
          {([["SALES", "매출"], ["PURCHASE", "매입"]] as [TradeType, string][]).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium ${tab === k ? "bg-white shadow-sm" : "text-neutral-500"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <button
          onClick={() => setAdding(true)}
          disabled={!activeCompanyId}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          + {isSales ? "매출" : "매입"} 추가
        </button>
      </div>

      {!activeCompanyId && (
        <Card className="mb-3 border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          추가하려면 상단에서 사업자를 선택하세요. (현재 전체보기)
        </Card>
      )}

      {overdueRows.length > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          ⏰ 결제예정일 경과 <b>{overdueRows.length}건</b> · {krw(overdueAmt)}
          <span className="text-rose-400">— {isSales ? "수금" : "지급"} 확인이 필요합니다</span>
        </div>
      )}

      <Card>
        {rows.length === 0 ? (
          <EmptyState message={`${month} ${isSales ? "매출" : "매입"} 거래가 없습니다.`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 text-xs text-neutral-500">
                <tr>
                  <th className="px-4 py-3">일자</th>
                  <th className="px-4 py-3">거래처</th>
                  <th className="px-4 py-3">증빙</th>
                  <th className="px-4 py-3">계정과목</th>
                  <th className="px-4 py-3 text-right">공급가</th>
                  <th className="px-4 py-3 text-right">세액</th>
                  <th className="px-4 py-3 text-right">합계</th>
                  <th className="px-4 py-3">정산</th>
                  <th className="px-4 py-3">결제예정</th>
                  <th className="px-4 py-3 text-right">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((r) => {
                  const s = settle[r.id];
                  const od = isOverdue(r);
                  return (
                    <tr key={r.id} className={od ? "bg-rose-50/50 hover:bg-rose-50" : "hover:bg-neutral-50"}>
                      <td className="px-4 py-3 text-neutral-500">{r.doc_date ?? "-"}</td>
                      <td className="px-4 py-3 font-medium">
                        {r.partner_id ? partnerName.get(r.partner_id) ?? "거래처" : "미지정"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500">{r.evidence}</span>
                      </td>
                      <td className="px-4 py-3">
                        <RowAccountSelect id={r.id} value={r.account_id} accounts={accounts} onDone={() => router.refresh()} />
                      </td>
                      <td className="px-4 py-3 text-right tabular">{krw(r.supply_amount)}</td>
                      <td className="px-4 py-3 text-right tabular">{krw(r.vat_amount)}</td>
                      <td className="px-4 py-3 text-right tabular font-medium">{krw(r.total_amount)}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => setSettleFor(r)}>
                          {s ? (
                            <Badge tone="green">{settledLabel}</Badge>
                          ) : od ? (
                            <Badge tone="red">연체</Badge>
                          ) : (
                            <Badge tone="red">{unsettledLabel}</Badge>
                          )}
                        </button>
                      </td>
                      <td className={`px-4 py-3 ${od ? "font-medium text-rose-600" : "text-neutral-500"}`}>
                        {r.due_date ? (od ? `${r.due_date} · D+${daysBetween(r.due_date, today)}` : r.due_date) : "-"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DeleteBtn id={r.id} onDone={() => router.refresh()} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-neutral-200 text-sm font-semibold">
                <tr>
                  <td className="px-4 py-3" colSpan={6}>
                    합계 ({rows.length}건) · {unsettledLabel} {krw(unsettled)}
                  </td>
                  <td className="px-4 py-3 text-right tabular">{krw(total)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {settleFor && (
        <SettleModal
          invoice={settleFor}
          settled={settle[settleFor.id]}
          unlinked={unlinked}
          partnerName={partnerName}
          onClose={() => setSettleFor(null)}
          onSaved={() => {
            setSettleFor(null);
            router.refresh();
          }}
        />
      )}
      {adding && activeCompanyId && (
        <AddTradeModal
          type={tab}
          companyId={activeCompanyId}
          partners={partners}
          accounts={accounts}
          defaultDate={`${month}-01`}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function RowAccountSelect({
  id,
  value,
  accounts,
  onDone,
}: {
  id: string;
  value: string | null;
  accounts: Account[];
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      value={value ?? ""}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          await updateTrade(id, { account_id: e.target.value || null });
          onDone();
        })
      }
      className="rounded border border-neutral-300 bg-white px-1.5 py-1 text-xs"
    >
      <option value="">미분류</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>{a.code} {a.name}</option>
      ))}
    </select>
  );
}

function DeleteBtn({ id, onDone }: { id: string; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!confirm("이 거래를 삭제할까요? (연결된 통장 정산도 해제됩니다)")) return;
        startTransition(async () => {
          await deleteTrade(id);
          onDone();
        });
      }}
      className="text-rose-500 hover:text-rose-700"
    >
      삭제
    </button>
  );
}

// ---------- 통장 정산 매칭 ----------
function SettleModal({
  invoice,
  settled,
  unlinked,
  partnerName,
  onClose,
  onSaved,
}: {
  invoice: TaxInvoiceRow;
  settled?: SettleInfo;
  unlinked: UnlinkedTxn[];
  partnerName: Map<string, string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const isSales = invoice.type === "SALES";
  const needDir = isSales ? "IN" : "OUT";

  const candidates = useMemo(() => {
    const list = unlinked.filter((t) => t.direction === needDir);
    const scored = list.map((t) => {
      let score = 0;
      if (invoice.partner_id && invoice.partner_id === t.partner_id) score += 100;
      if (t.amount === invoice.total_amount) score += 60;
      else score += Math.max(0, 30 - Math.abs(t.amount - invoice.total_amount) / 10000);
      score += Math.max(0, 20 - Math.abs(daysBetween(invoice.doc_date, t.txn_date)));
      return { t, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }, [unlinked, needDir, invoice]);

  function link(txnId: string) {
    startTransition(async () => {
      const res = await linkInvoiceToBankTxn(invoice.id, txnId);
      if (!res.ok) alert(res.error);
      onSaved();
    });
  }
  function unlink() {
    startTransition(async () => {
      const res = await unlinkInvoiceBank(invoice.id);
      if (!res.ok) alert(res.error);
      onSaved();
    });
  }

  return (
    <Modal title={`${isSales ? "매출 입금" : "매입 지급"} 정산 — ${invoice.total_amount.toLocaleString()}원`} onClose={onClose}>
      {settled ? (
        <div className="space-y-3">
          <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
            ✓ 정산됨 — 통장 {settled.count}건 연결 · 합계 {krw(settled.amount)}
          </div>
          <button onClick={unlink} disabled={pending} className="text-sm text-rose-500 hover:text-rose-700">
            정산 연결 해제
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-neutral-500">
            {isSales ? "입금" : "출금"} 통장 거래를 선택해 연결하면 정산완료됩니다. (거래처·금액·날짜가 맞는 건을 위에 추천)
          </p>
          {candidates.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-400">
              연결할 미정산 통장 {isSales ? "입금" : "출금"} 거래가 없습니다. 통장원장에서 거래를 먼저 올리세요.
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-lg border border-neutral-200">
              {candidates.map(({ t, score }, i) => (
                <button
                  key={t.id}
                  onClick={() => link(t.id)}
                  disabled={pending}
                  className={`flex w-full items-center justify-between border-b border-neutral-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-neutral-50 ${
                    i < 3 && score >= 60 ? "bg-indigo-50/40" : ""
                  }`}
                >
                  <span>
                    {i < 3 && score >= 60 && <span className="mr-1 text-[10px] font-bold text-indigo-600">추천</span>}
                    <span className="font-medium">
                      {t.counterparty || (t.partner_id ? partnerName.get(t.partner_id) : null) || "(적요 없음)"}
                    </span>
                    <span className="ml-2 text-xs text-neutral-400">{t.txn_date}</span>
                  </span>
                  <span className={`tabular ${isSales ? "text-emerald-600" : "text-rose-600"}`}>
                    {isSales ? "+" : "−"}
                    {krw(t.amount)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ---------- 거래 추가 ----------
function AddTradeModal({
  type,
  companyId,
  partners,
  accounts,
  defaultDate,
  onClose,
  onSaved,
}: {
  type: TradeType;
  companyId: string;
  partners: { id: string; name: string }[];
  accounts: Account[];
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [d, setD] = useState({
    partner_id: "",
    doc_date: defaultDate,
    supply: "",
    vat: "",
    total: "",
    evidence: "세금계산서",
    due_date: "",
    memo: "",
    account_id: "",
  });

  function onSupply(v: string) {
    const supply = num(v);
    const vatEmpty = d.vat.trim() === "";
    const vat = vatEmpty ? Math.round(supply * 0.1) : num(d.vat);
    setD((p) => ({ ...p, supply: v, vat: vatEmpty ? String(vat) : p.vat, total: String(supply + vat) }));
  }

  function save() {
    setError(null);
    const supply = num(d.supply);
    const vat = num(d.vat);
    if (supply + vat <= 0) {
      setError("금액을 입력하세요");
      return;
    }
    startTransition(async () => {
      const res = await createTrade({
        company_id: companyId,
        type,
        partner_id: d.partner_id || null,
        doc_date: d.doc_date || null,
        supply_amount: supply,
        vat_amount: vat,
        total_amount: num(d.total) || supply + vat,
        evidence: d.evidence,
        due_date: d.due_date || null,
        memo: d.memo.trim() || null,
        account_id: d.account_id || null,
      });
      if (res.ok) onSaved();
      else setError(res.error ?? "오류");
    });
  }

  return (
    <Modal title={`${type === "SALES" ? "매출" : "매입"} 추가`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field label="거래처">
            <SelectInput value={d.partner_id} onChange={(e) => setD({ ...d, partner_id: e.target.value })}>
              <option value="">미지정</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </SelectInput>
          </Field>
        </div>
        <Field label="거래일자"><TextInput type="date" value={d.doc_date} onChange={(e) => setD({ ...d, doc_date: e.target.value })} /></Field>
        <Field label="증빙구분">
          <SelectInput value={d.evidence} onChange={(e) => setD({ ...d, evidence: e.target.value })}>
            {EVIDENCE.map((x) => <option key={x} value={x}>{x}</option>)}
          </SelectInput>
        </Field>
        <div className="col-span-2">
          <Field label="계정과목">
            <SelectInput value={d.account_id} onChange={(e) => setD({ ...d, account_id: e.target.value })}>
              <option value="">미분류</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
            </SelectInput>
          </Field>
        </div>
        <Field label="공급가액"><NumberInput value={d.supply} onChange={(v) => onSupply(v)} /></Field>
        <Field label="세액"><NumberInput value={d.vat} onChange={(v) => setD({ ...d, vat: v })} /></Field>
        <Field label="합계"><NumberInput value={d.total} onChange={(v) => setD({ ...d, total: v })} /></Field>
        <Field label="결제예정일"><TextInput type="date" value={d.due_date} onChange={(e) => setD({ ...d, due_date: e.target.value })} /></Field>
        <div className="col-span-2">
          <Field label="메모"><TextInput value={d.memo} onChange={(e) => setD({ ...d, memo: e.target.value })} /></Field>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">취소</button>
        <button onClick={save} disabled={pending} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
          {pending ? "저장 중…" : "저장"}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4" onClick={onClose}>
      <div className="mt-12 w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

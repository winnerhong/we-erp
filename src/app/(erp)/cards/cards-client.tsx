"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, TextInput, SelectInput } from "@/components/ui";
import { ExcelGrid, type GridCol } from "@/components/excel-grid";
import { BankTradeTabs } from "@/components/bank-trade-tabs";
import { OptionsManager } from "@/components/options-manager";
import { krw } from "@/lib/labels";
import { buildCSV } from "@/lib/csv";
import { parseSpreadsheetFile, parsePastedText, parseClipboard, downloadXlsx } from "@/lib/sheet";
import {
  parseCardRow,
  CARD_TEMPLATE_HEADERS,
  CARD_TEMPLATE_SAMPLE,
} from "@/lib/card-import";
import type { CardRow, CardTransactionRow, FieldOptionRow } from "@/lib/supabase/database.types";
import { createCard, updateCard, deleteCard, addCardTxn, updateCardTxn, deleteCardTxn, bulkImportCardTxns } from "./actions";
import { setTxnCardSettlement } from "@/app/(erp)/bank/actions";

export interface SettleBankTxn {
  id: string;
  txn_date: string;
  amount: number;
  label: string;
  bankAlias: string;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
function fmtDateK(s: string): string {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return s;
  const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${y}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}(${wd})`;
}
function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const numOrZero = (s: string) => {
  const n = Number(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function CardsClient({
  cards,
  companyNames,
  selectedId,
  activeCompanyId,
  month,
  monthTxns,
  cardTxnCount,
  cardLatestDate,
  partners,
  accountOptions,
  categoryOptions,
  bankAccounts,
  settledTxns,
  candidateTxns,
}: {
  cards: CardRow[];
  companyNames: { id: string; name: string }[];
  selectedId: string | null;
  activeCompanyId: string | null;
  month: string;
  monthTxns: CardTransactionRow[];
  cardTxnCount: number;
  cardLatestDate: string | null;
  partners: { id: string; name: string }[];
  accountOptions: { id: string; code: string; name: string }[];
  categoryOptions: FieldOptionRow[];
  employees: { id: string; name: string; company_id: string | null }[];
  bankAccounts: { id: string; alias: string; company_id: string }[];
  settledTxns: SettleBankTxn[];
  candidateTxns: SettleBankTxn[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [cardModal, setCardModal] = useState<CardRow | "new" | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [optsOpen, setOptsOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);

  const compName = new Map(companyNames.map((c) => [c.id, c.name]));
  const pName = new Map(partners.map((p) => [p.id, p.name]));
  const acctMap = new Map(accountOptions.map((a) => [a.id, a]));
  const catLabel = new Map(categoryOptions.map((c) => [c.value, c.label]));
  const card = cards.find((c) => c.id === selectedId) ?? null;
  const refresh = () => router.refresh();

  const go = (params: { c?: string; m?: string }) => {
    const q = new URLSearchParams({
      m: params.m ?? month,
      ...(params.c ?? selectedId ? { c: params.c ?? selectedId! } : {}),
    });
    router.push(`/cards?${q.toString()}`);
  };

  // 합계
  const outSum = monthTxns.filter((t) => t.direction === "OUT").reduce((s, t) => s + t.amount, 0);
  const inSum = monthTxns.filter((t) => t.direction === "IN").reduce((s, t) => s + t.amount, 0);
  const spend = outSum - inSum;

  // 셀 인라인 편집 → updateCardTxn
  function onCellEdit(id: string, key: string, value: string) {
    const patch: Partial<CardTransactionRow> = {};
    if (key === "txn_date") patch.txn_date = value;
    else if (key === "counterparty") patch.counterparty = value.trim() || null;
    else if (key === "memo") patch.memo = value.trim() || null;
    else if (key === "category") patch.category = value || null;
    else if (key === "partner_id") patch.partner_id = value || null;
    else if (key === "account_id") patch.account_id = value || null;
    else if (key === "direction") patch.direction = value === "IN" ? "IN" : "OUT";
    else if (key === "amount") patch.amount = numOrZero(value);
    else if (key === "installment_months") patch.installment_months = numOrZero(value);
    else return;
    startTransition(async () => {
      await updateCardTxn(id, patch);
      refresh();
    });
  }

  function addRow() {
    if (!card) return;
    startTransition(async () => {
      await addCardTxn({
        card_id: card.id,
        company_id: card.company_id,
        txn_date: `${month}-01`,
        direction: "OUT",
        amount: 0,
      });
      refresh();
    });
  }

  const catOpts = [{ value: "", label: "미지정" }, ...categoryOptions.map((c) => ({ value: c.value, label: c.label }))];
  const partnerOpts = [{ value: "", label: "-" }, ...partners.map((p) => ({ value: p.id, label: p.name }))];
  const accountOpts = [
    { value: "", label: "미지정" },
    ...accountOptions.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` })),
  ];

  const gridCols: GridCol<CardTransactionRow>[] = [
    {
      key: "txn_date",
      label: "이용일",
      width: 150,
      edit: "date",
      editableRow: (t) => !t.source_ref,
      text: (t) => t.txn_date,
      render: (t) => (
        <span className="whitespace-nowrap text-neutral-700">
          {fmtDateK(t.txn_date)}
          {t.txn_time && <span className="ml-1 text-neutral-400">{t.txn_time}</span>}
        </span>
      ),
    },
    {
      key: "counterparty",
      label: "가맹점",
      width: 200,
      edit: "text",
      editableRow: (t) => !t.source_ref,
      text: (t) => t.counterparty ?? "",
    },
    {
      key: "direction",
      label: "유형",
      width: 76,
      align: "center",
      edit: "select",
      options: [
        { value: "OUT", label: "사용" },
        { value: "IN", label: "취소" },
      ],
      text: (t) => (t.direction === "IN" ? "취소" : "사용"),
      render: (t) =>
        t.direction === "IN" ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">취소</span>
        ) : (
          <span className="text-xs text-neutral-500">사용</span>
        ),
    },
    {
      key: "category",
      label: "구분",
      width: 100,
      align: "center",
      edit: "select",
      options: catOpts,
      text: (t) => (t.category ? catLabel.get(t.category) ?? t.category : ""),
    },
    {
      key: "partner_id",
      label: "거래처",
      width: 140,
      edit: "select",
      options: partnerOpts,
      text: (t) => (t.partner_id ? pName.get(t.partner_id) ?? "" : ""),
    },
    {
      key: "amount",
      label: "금액",
      width: 120,
      align: "right",
      edit: "number",
      editableRow: (t) => !t.source_ref,
      text: (t) => String(t.amount),
      render: (t) =>
        t.direction === "IN" ? (
          <span className="tabular font-semibold text-emerald-600">+{krw(t.amount)}</span>
        ) : (
          <span className="tabular font-semibold text-rose-600">−{krw(t.amount)}</span>
        ),
    },
    {
      key: "installment_months",
      label: "할부",
      width: 80,
      align: "center",
      edit: "number",
      editableRow: (t) => !t.source_ref,
      text: (t) => (t.installment_months > 0 ? `${t.installment_months}` : ""),
      render: (t) =>
        t.installment_months > 1 ? (
          <span className="text-xs text-neutral-500" title={`월 ${krw(Math.round(t.amount / t.installment_months))} × ${t.installment_months}개월`}>
            {t.installment_months}개월
            <span className="ml-1 text-neutral-400">·월{krw(Math.round(t.amount / t.installment_months))}</span>
          </span>
        ) : (
          <span className="text-xs text-neutral-400">일시불</span>
        ),
    },
    {
      key: "account_id",
      label: "계정과목",
      width: 160,
      edit: "select",
      options: accountOpts,
      text: (t) => {
        const a = t.account_id ? acctMap.get(t.account_id) : undefined;
        return a ? `${a.code} ${a.name}` : "";
      },
    },
    { key: "memo", label: "메모", width: 150, edit: "text", text: (t) => t.memo ?? "" },
    {
      key: "_actions",
      label: "",
      width: 50,
      align: "center",
      render: (t) => (
        <button
          onClick={() => {
            if (confirm("이 카드 사용내역을 삭제할까요?"))
              startTransition(async () => {
                await deleteCardTxn(t.id);
                refresh();
              });
          }}
          title="삭제"
          className="rounded-md px-1.5 py-1 text-neutral-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
        >
          🗑
        </button>
      ),
    },
  ];

  function exportMonth() {
    if (!card) return;
    const rows = monthTxns.map((t) => [
      t.txn_date,
      t.counterparty ?? "",
      t.direction === "IN" ? "취소" : "사용",
      t.category ? catLabel.get(t.category) ?? t.category : "",
      t.partner_id ? pName.get(t.partner_id) ?? "" : "",
      t.amount,
      t.installment_months > 0 ? `${t.installment_months}개월` : "일시불",
      t.account_id ? (acctMap.get(t.account_id) ? `${acctMap.get(t.account_id)!.code} ${acctMap.get(t.account_id)!.name}` : "") : "",
      t.memo ?? "",
    ]);
    downloadXlsx(
      `카드사용내역_${card.alias}_${month}`,
      ["이용일", "가맹점", "유형", "구분", "거래처", "금액", "할부", "계정과목", "메모"],
      rows,
      month
    );
  }

  return (
    <div>
      <BankTradeTabs active="card" />
      <div className="mb-4">
        <h1 className="text-xl font-bold text-neutral-900">카드원장</h1>
      </div>

      {/* 카드 선택 칩 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {cards.map((c) => {
          const on = c.id === selectedId;
          return (
            <button
              key={c.id}
              onClick={() => go({ c: c.id })}
              className={`group flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                on ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-300" : "border-neutral-200 bg-white hover:bg-neutral-50"
              }`}
            >
              <span className="text-lg">💳</span>
              <span>
                <span className="block font-semibold text-neutral-800">{c.alias}</span>
                <span className="block text-xs text-neutral-400">
                  {[c.card_company, c.card_no_last4 ? `****${c.card_no_last4}` : null, c.card_type === "CHECK" ? "체크" : "신용"]
                    .filter(Boolean)
                    .join(" · ")}
                  {!activeCompanyId && compName.get(c.company_id) ? ` · ${compName.get(c.company_id)}` : ""}
                </span>
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  setCardModal(c);
                }}
                className="ml-1 rounded-md px-1.5 py-0.5 text-xs text-neutral-400 opacity-0 hover:bg-neutral-200 group-hover:opacity-100"
              >
                ⚙
              </span>
            </button>
          );
        })}
        <button
          onClick={() => setCardModal("new")}
          disabled={!activeCompanyId}
          title={activeCompanyId ? "" : "상단에서 사업자를 먼저 선택하세요"}
          className="rounded-xl border border-dashed border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-500 hover:bg-neutral-50 disabled:opacity-40"
        >
          + 카드 추가
        </button>
      </div>

      {cards.length === 0 ? (
        <Card className="border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-800">
          {activeCompanyId
            ? "등록된 카드가 없습니다. ‘+ 카드 추가’로 시작하세요."
            : "상단에서 사업자를 선택한 뒤 카드를 추가할 수 있습니다."}
        </Card>
      ) : !card ? null : (
        <>
          {/* 요약 + 월 네비게이터 */}
          <Card className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => go({ m: shiftMonth(month, -1) })}
                  className="rounded-lg px-2 py-1.5 text-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                  aria-label="이전 달"
                >
                  ‹
                </button>
                <input
                  type="month"
                  value={month}
                  onChange={(e) => go({ m: e.target.value })}
                  className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-center text-base font-semibold focus:border-neutral-400 focus:outline-none"
                />
                <button
                  onClick={() => go({ m: shiftMonth(month, 1) })}
                  className="rounded-lg px-2 py-1.5 text-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                  aria-label="다음 달"
                >
                  ›
                </button>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xs text-neutral-500">월 사용액</span>
                <span className="text-2xl font-bold tabular text-neutral-900">{krw(spend)}</span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-rose-600">사용 −{krw(outSum)}</span>
              {inSum > 0 && <span className="text-emerald-600">취소 +{krw(inSum)}</span>}
              <span className="text-neutral-500">{monthTxns.length}건</span>
            </div>
          </Card>

          {monthTxns.length === 0 && cardTxnCount > 0 && cardLatestDate && (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              이 달({month})엔 사용내역이 없지만, 이 카드에 <b>{cardTxnCount.toLocaleString()}건</b>이 다른 달에 있습니다.
              <button
                onClick={() => go({ m: cardLatestDate.slice(0, 7) })}
                className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
              >
                최근 사용 달({cardLatestDate.slice(0, 7)}) 보기 →
              </button>
            </div>
          )}

          {/* 카드대금 정산 — 통장 출금 매칭 */}
          {(() => {
            const settledSum = settledTxns.reduce((s, t) => s + t.amount, 0);
            const diff = settledSum - spend;
            return (
              <div
                className={`mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-2.5 text-sm ${
                  settledTxns.length === 0
                    ? "border-neutral-200 bg-neutral-50"
                    : Math.abs(diff) < 1
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-amber-300 bg-amber-50"
                }`}
              >
                <span className="font-semibold text-neutral-700">💳 {month} 카드대금 정산</span>
                <span className="text-neutral-500">
                  사용합계 <b className="text-neutral-800">{krw(spend)}</b>
                </span>
                {settledTxns.length === 0 ? (
                  <span className="text-neutral-400">통장 결제 미연결</span>
                ) : (
                  <>
                    <span className="text-neutral-500">
                      통장 결제 <b className="text-neutral-800">{krw(settledSum)}</b> ({settledTxns.length}건)
                    </span>
                    {Math.abs(diff) < 1 ? (
                      <span className="font-medium text-emerald-700">✓ 일치</span>
                    ) : (
                      <span className="font-medium text-amber-700">
                        차이 {diff > 0 ? "+" : "−"}
                        {krw(Math.abs(diff))}
                      </span>
                    )}
                  </>
                )}
                <button
                  onClick={() => setSettleOpen(true)}
                  className="ml-auto rounded-lg border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  {settledTxns.length === 0 ? "통장 카드대금 연결" : "정산 관리"}
                </button>
              </div>
            );
          })()}

          <div className="mb-3 flex flex-wrap items-center justify-end gap-1.5">
            <button
              onClick={() => setImportOpen(true)}
              title="카드 명세서 올리기 (자동 병합)"
              className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              ⬆ 올리기
            </button>
            <button
              onClick={exportMonth}
              disabled={monthTxns.length === 0}
              className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
            >
              ⬇ 내보내기
            </button>
            <button
              onClick={() => setOptsOpen(true)}
              title="구분 항목 관리"
              className="rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-neutral-500 hover:bg-neutral-50"
            >
              ⚙
            </button>
            <button
              onClick={addRow}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700"
            >
              ＋ 사용 추가
            </button>
          </div>

          <p className="mb-1 text-xs text-neutral-400">셀 클릭=수정 · 헤더 드래그=순서 · 끝 드래그=너비 · 단위: 원</p>
          <ExcelGrid
            storageKey="card_grid1"
            columns={gridCols}
            rows={monthTxns}
            rowId={(t) => t.id}
            onEdit={onCellEdit}
            accent={(t) => !t.account_id}
            onAddRow={addRow}
            addLabel="+ 사용 추가 (빈 행)"
            empty={monthTxns.length === 0 ? `${month} 카드 사용내역이 없습니다. 올리거나 아래에서 추가하세요.` : "조건에 맞는 내역이 없습니다 👍"}
            searchPlaceholder="🔍 가맹점·거래처·금액 검색"
          />
        </>
      )}

      {optsOpen && (
        <OptionsManager
          options={categoryOptions}
          cats={[{ key: "bank_category", title: "구분", hint: "카드/통장 공용 구분 — 분류 + 연동 대상", linkable: true }]}
          onClose={() => {
            setOptsOpen(false);
            refresh();
          }}
        />
      )}
      {cardModal && (
        <CardModal
          card={cardModal === "new" ? null : cardModal}
          companyId={activeCompanyId}
          companyNames={companyNames}
          bankAccounts={bankAccounts}
          onClose={() => setCardModal(null)}
          onSaved={(id) => {
            setCardModal(null);
            if (id) go({ c: id });
            else refresh();
          }}
        />
      )}
      {importOpen && card && (
        <ImportModal
          card={card}
          onClose={() => setImportOpen(false)}
          onDone={(gotoMonth) => {
            setImportOpen(false);
            go({ m: gotoMonth ?? month });
          }}
        />
      )}
      {settleOpen && card && (
        <SettlementModal
          cardId={card.id}
          cardAlias={card.alias}
          month={month}
          spend={spend}
          settled={settledTxns}
          candidates={candidateTxns}
          onClose={() => setSettleOpen(false)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

// ---------- 카드대금 정산 매칭 모달 ----------
function SettlementModal({
  cardId,
  cardAlias,
  month,
  spend,
  settled,
  candidates,
  onClose,
  onChanged,
}: {
  cardId: string;
  cardAlias: string;
  month: string;
  spend: number;
  settled: SettleBankTxn[];
  candidates: SettleBankTxn[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const settledIds = new Set(settled.map((t) => t.id));
  const settledSum = settled.reduce((s, t) => s + t.amount, 0);

  function link(id: string) {
    startTransition(async () => {
      await setTxnCardSettlement(id, cardId, month);
      onChanged();
    });
  }
  function unlink(id: string) {
    startTransition(async () => {
      await setTxnCardSettlement(id, null, null);
      onChanged();
    });
  }

  const ql = q.trim().toLowerCase();
  const list = candidates.filter(
    (c) => !settledIds.has(c.id) && (!ql || c.label.toLowerCase().includes(ql) || String(c.amount).includes(ql))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4" onClick={onClose}>
      <div className="mt-12 w-full max-w-xl rounded-xl border border-neutral-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="font-semibold">
            💳 {cardAlias} · {month} 카드대금 정산
          </h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
        </div>
        <div className="space-y-4 p-5">
          <div className="rounded-lg bg-indigo-50 p-3 text-xs text-indigo-700">
            이 카드의 <b>{month} 사용합계 {krw(spend)}</b>를 결제한 <b>통장 출금</b>을 연결하세요. 연결하면 그 출금이
            ‘카드대금(정산)’으로 표시되어 카드 사용액과 매칭됩니다. (통장의 다른 집계에는 영향 없음)
          </div>

          {/* 연결된 통장 출금 */}
          <div>
            <p className="mb-1 text-xs font-semibold text-neutral-500">연결된 통장 카드대금 ({settled.length}건 · {krw(settledSum)})</p>
            {settled.length === 0 ? (
              <p className="rounded-lg border border-dashed border-neutral-200 px-3 py-3 text-center text-xs text-neutral-400">아직 연결된 출금이 없습니다.</p>
            ) : (
              <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                {settled.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="text-neutral-500">{t.txn_date}</span>
                      <span className="ml-2 truncate font-medium">{t.label || t.bankAlias}</span>
                      <span className="ml-2 text-xs text-neutral-400">{t.bankAlias}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tabular font-semibold text-rose-600">−{krw(t.amount)}</span>
                      <button
                        onClick={() => unlink(t.id)}
                        disabled={pending}
                        className="rounded-md border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-50"
                      >
                        해제
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 후보 통장 출금 */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-semibold text-neutral-500">통장 출금에서 연결</p>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="🔍 내용·금액"
                className="w-40 rounded-lg border border-neutral-300 px-2.5 py-1 text-xs focus:border-neutral-500 focus:outline-none"
              />
            </div>
            <div className="max-h-64 divide-y divide-neutral-100 overflow-y-auto rounded-lg border border-neutral-200">
              {list.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-neutral-400">연결할 통장 출금이 없습니다.</p>
              ) : (
                list.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-neutral-50">
                    <span className="min-w-0">
                      <span className="text-neutral-500">{t.txn_date}</span>
                      <span className="ml-2 truncate font-medium">{t.label || t.bankAlias}</span>
                      <span className="ml-2 text-xs text-neutral-400">{t.bankAlias}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tabular text-rose-600">−{krw(t.amount)}</span>
                      <button
                        onClick={() => link(t.id)}
                        disabled={pending}
                        className="rounded-md bg-neutral-900 px-2.5 py-0.5 text-xs font-medium text-white hover:bg-neutral-700"
                      >
                        연결
                      </button>
                    </span>
                  </div>
                ))
              )}
            </div>
            <p className="mt-1 text-xs text-neutral-400">최근 출금 중 미연결 건만 표시됩니다(최대 80건).</p>
          </div>
        </div>
        <div className="flex justify-end border-t border-neutral-200 px-5 py-3">
          <button onClick={onClose} className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium hover:bg-neutral-200">완료</button>
        </div>
      </div>
    </div>
  );
}

// ---------- 카드 등록/수정 ----------
function CardModal({
  card,
  companyId,
  companyNames,
  bankAccounts,
  onClose,
  onSaved,
}: {
  card: CardRow | null;
  companyId: string | null;
  companyNames: { id: string; name: string }[];
  bankAccounts: { id: string; alias: string; company_id: string }[];
  onClose: () => void;
  onSaved: (id?: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [d, setD] = useState({
    company_id: card?.company_id ?? companyId ?? companyNames[0]?.id ?? "",
    card_company: card?.card_company ?? "",
    alias: card?.alias ?? "",
    card_no_last4: card?.card_no_last4 ?? "",
    card_type: card?.card_type ?? "CREDIT",
    settlement_bank_account_id: card?.settlement_bank_account_id ?? "",
    billing_day: card?.billing_day?.toString() ?? "",
  });

  function save() {
    if (!d.alias.trim()) return setError("카드 별칭은 필수입니다");
    if (!d.company_id) return setError("사업자를 선택하세요");
    const value = {
      company_id: d.company_id,
      card_company: d.card_company.trim() || null,
      alias: d.alias.trim(),
      card_no_last4: d.card_no_last4.trim() || null,
      card_type: d.card_type as "CREDIT" | "CHECK",
      settlement_bank_account_id: d.settlement_bank_account_id || null,
      billing_day: d.billing_day.trim() ? Number(d.billing_day.replace(/[^\d]/g, "")) : null,
    };
    startTransition(async () => {
      const res = card ? await updateCard(card.id, value) : await createCard(value);
      if (res.ok) onSaved(card?.id);
      else setError(res.error ?? "오류");
    });
  }

  const banksForCompany = bankAccounts.filter((b) => b.company_id === d.company_id);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4" onClick={onClose}>
      <div
        className="mt-12 w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="font-semibold">{card ? "카드 수정" : "카드 등록"}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            ✕
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 p-5">
          <Field label="사업자">
            <SelectInput value={d.company_id} onChange={(e) => setD({ ...d, company_id: e.target.value, settlement_bank_account_id: "" })}>
              {companyNames.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="카드 종류">
            <SelectInput value={d.card_type} onChange={(e) => setD({ ...d, card_type: e.target.value as "CREDIT" | "CHECK" })}>
              <option value="CREDIT">신용카드</option>
              <option value="CHECK">체크카드</option>
            </SelectInput>
          </Field>
          <div className="col-span-2">
            <Field label="별칭" required>
              <TextInput value={d.alias} onChange={(e) => setD({ ...d, alias: e.target.value })} placeholder="예: 법인 운영비 카드" />
            </Field>
          </div>
          <Field label="카드사">
            <TextInput value={d.card_company} onChange={(e) => setD({ ...d, card_company: e.target.value })} placeholder="신한·삼성 등" />
          </Field>
          <Field label="카드번호 끝 4자리">
            <TextInput value={d.card_no_last4} onChange={(e) => setD({ ...d, card_no_last4: e.target.value })} placeholder="1234" />
          </Field>
          <Field label="결제 통장 (대금 출금)">
            <SelectInput value={d.settlement_bank_account_id} onChange={(e) => setD({ ...d, settlement_bank_account_id: e.target.value })}>
              <option value="">미지정</option>
              {banksForCompany.map((b) => (
                <option key={b.id} value={b.id}>{b.alias}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="결제일 (1~31)">
            <TextInput inputMode="numeric" value={d.billing_day} onChange={(e) => setD({ ...d, billing_day: e.target.value })} placeholder="예: 25" />
          </Field>
        </div>
        {error && <p className="px-5 pb-1 text-sm text-rose-600">{error}</p>}
        <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-3">
          {card ? (
            <button
              onClick={() => {
                if (confirm(`${card.alias} 카드를 삭제할까요?\n(사용내역도 함께 삭제됩니다)`))
                  startTransition(async () => {
                    await deleteCard(card.id);
                    onSaved();
                  });
              }}
              className="text-sm text-rose-500 hover:text-rose-700"
            >
              카드 삭제
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">
              취소
            </button>
            <button
              onClick={save}
              disabled={pending}
              className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {pending ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- 명세서 업로드(파일·붙여넣기·직접입력) ----------
interface PreviewRow {
  rowNo: number;
  raw: Record<string, string>;
  ok: boolean;
  label: string;
  error?: string;
}
interface DraftCardTxn {
  _id: string;
  이용일: string;
  가맹점: string;
  이용금액: string;
  할부개월: string;
  승인번호: string;
}
const DRAFT_COLS: GridCol<DraftCardTxn>[] = [
  { key: "이용일", label: "이용일", width: 140, edit: "date", text: (r) => r.이용일 },
  { key: "가맹점", label: "가맹점", width: 220, edit: "text", text: (r) => r.가맹점 },
  { key: "이용금액", label: "이용금액", width: 120, align: "right", edit: "number", text: (r) => r.이용금액 },
  { key: "할부개월", label: "할부", width: 80, align: "right", edit: "number", text: (r) => r.할부개월 },
  { key: "승인번호", label: "승인번호", width: 130, edit: "text", text: (r) => r.승인번호 },
];

function ImportModal({
  card,
  onClose,
  onDone,
}: {
  card: CardRow;
  onClose: () => void;
  onDone: (gotoMonth?: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [result, setResult] = useState<{ inserted: number; skipped: number; failed: number; error?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [parseError, setParseError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [inputMode, setInputMode] = useState<"import" | "manual">("import");
  const draftSeq = useRef(0);
  const blankDraft = (): DraftCardTxn => ({ _id: `d${draftSeq.current++}`, 이용일: "", 가맹점: "", 이용금액: "", 할부개월: "", 승인번호: "" });
  const [drafts, setDrafts] = useState<DraftCardTxn[]>([]);

  const validCount = rows.filter((r) => r.ok).length;

  function downloadTemplate() {
    const csv = buildCSV(CARD_TEMPLATE_HEADERS, [CARD_TEMPLATE_SAMPLE]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "카드사용내역_양식.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function preview(parsed: Record<string, string>[], emptyMsg: string) {
    setResult(null);
    setParseError(null);
    if (parsed.length === 0) {
      setRows([]);
      setParseError(emptyMsg);
      return;
    }
    setRows(
      parsed.map((raw, i) => {
        const res = parseCardRow(raw);
        if (res.ok) {
          const v = res.value;
          const sign = v.direction === "IN" ? "+" : "−";
          return { rowNo: i + 2, raw, ok: true, label: `${v.txn_date} · ${v.counterparty || "-"} · ${sign}${krw(v.amount)}` };
        }
        return { rowNo: i + 2, raw, ok: false, label: "", error: res.error };
      })
    );
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseSpreadsheetFile(file);
      preview(parsed, "사용내역 행을 찾지 못했습니다. 이용일·가맹점·금액 열이 있는 파일인지 확인하세요.");
    } catch {
      setRows([]);
      setParseError("파일을 읽지 못했습니다. 엑셀(.xlsx)·CSV 파일인지 확인하세요.");
    }
  }

  function switchToManual() {
    setInputMode("manual");
    setRows([]);
    setResult(null);
    setParseError(null);
    if (drafts.length === 0) setDrafts([blankDraft(), blankDraft(), blankDraft()]);
  }
  function previewDrafts() {
    const filled = drafts.filter((d) => d.이용일.trim() || d.이용금액.trim() || d.가맹점.trim());
    preview(
      filled.map(({ _id, ...rest }) => { void _id; return rest; }),
      "입력된 행이 없습니다. 이용일과 이용금액을 채워주세요."
    );
  }

  function confirmImport() {
    const raws = rows.filter((r) => r.ok).map((r) => r.raw);
    if (raws.length === 0) return;
    startTransition(async () => {
      const res = await bulkImportCardTxns(card.id, raws);
      let maxDate = "";
      for (const r of rows) {
        if (!r.ok) continue;
        const p = parseCardRow(r.raw);
        if (p.ok && p.value.txn_date > maxDate) maxDate = p.value.txn_date;
      }
      setResult({ inserted: res.inserted, skipped: res.skipped, failed: res.failed.length, error: res.error });
      setRows([]);
      setPasteText("");
      setDrafts([]);
      if (fileRef.current) fileRef.current.value = "";
      onDone(maxDate ? maxDate.slice(0, 7) : undefined);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4" onClick={onClose}>
      <div className="mt-12 w-full max-w-2xl rounded-xl border border-neutral-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="font-semibold">{card.alias} · 카드 명세서 업로드</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
        </div>
        <div className="space-y-4 p-5">
          <div className="rounded-lg bg-indigo-50 p-3 text-xs text-indigo-700">
            카드사에서 받은 사용내역 파일(<b>엑셀 .xlsx</b> 또는 CSV)을 그대로 올리세요. <b>이용일·가맹점·이용금액·할부·승인번호</b> 열을
            자동 인식합니다. <b>여러 번 올려도 새 내역만 추가</b>되고, 달아둔 거래처·계정·메모는 유지됩니다.
          </div>

          <div className="inline-flex rounded-lg border border-neutral-300 bg-white p-0.5 text-sm">
            <button
              onClick={() => setInputMode("import")}
              className={`rounded-md px-3 py-1 font-medium ${inputMode === "import" ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-800"}`}
            >
              📂 파일·붙여넣기
            </button>
            <button
              onClick={switchToManual}
              className={`rounded-md px-3 py-1 font-medium ${inputMode === "manual" ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-800"}`}
            >
              ▦ 직접 입력(엑셀형)
            </button>
          </div>

          {inputMode === "import" ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={downloadTemplate} className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium hover:bg-neutral-50">
                  양식 다운로드
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  onChange={onFile}
                  className="block text-sm file:mr-3 file:rounded-lg file:border file:border-neutral-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-neutral-50"
                />
              </div>
              <div className="rounded-lg border border-dashed border-neutral-300 p-3">
                <p className="mb-2 text-xs font-medium text-neutral-600">📋 또는 카드사 화면에서 표를 복사해 그대로 붙여넣기</p>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  onPaste={(e) => {
                    const t = e.clipboardData.getData("text");
                    const html = e.clipboardData.getData("text/html");
                    if (t || html) {
                      e.preventDefault();
                      setPasteText(t);
                      const parsed = parseClipboard(html, t);
                      setTimeout(() => preview(parsed, "표를 인식하지 못했습니다. 머리글 줄을 포함해 복사하세요."), 0);
                    }
                  }}
                  rows={4}
                  placeholder={"이용일\t가맹점\t이용금액\t할부\t승인번호\n2026.06.02\t스타벅스\t5,600\t0\t12345678"}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-xs focus:border-neutral-500 focus:outline-none"
                />
                <button
                  onClick={() => pasteText.trim() && preview(parsePastedText(pasteText), "표를 인식하지 못했습니다. 머리글 줄을 포함해 붙여넣으세요.")}
                  disabled={!pasteText.trim()}
                  className="mt-2 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-40"
                >
                  붙여넣기 미리보기
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-neutral-300 p-3">
              <p className="mb-2 text-xs font-medium text-neutral-600">
                ▦ 셀을 클릭해 직접 입력하세요. <span className="font-normal text-neutral-400">(맨 아래 ‘+ 행 추가’)</span>
              </p>
              <ExcelGrid
                storageKey="card_manual_grid"
                columns={DRAFT_COLS}
                rows={drafts}
                rowId={(r) => r._id}
                onEdit={(id, key, value) => setDrafts((ds) => ds.map((d) => (d._id === id ? { ...d, [key]: value } : d)))}
                onAddRow={() => setDrafts((ds) => [...ds, blankDraft()])}
                addLabel="+ 사용 행 추가"
                accent={(r) => !!r.이용금액.trim() && !r.이용일.trim()}
                empty="‘+ 사용 행 추가’로 입력을 시작하세요."
                pageSize={50}
                searchPlaceholder="🔍 가맹점 검색"
              />
              <button onClick={previewDrafts} className="mt-2 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-50">
                입력한 표 미리보기
              </button>
            </div>
          )}

          {parseError && <p className="text-sm text-rose-600">{parseError}</p>}

          {rows.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-medium text-emerald-700">등록 가능 {validCount}건</span>
                {rows.length - validCount > 0 && <span className="text-rose-600">오류 {rows.length - validCount}건</span>}
              </div>
              <div className="max-h-72 overflow-auto rounded-lg border border-neutral-200">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-neutral-50 text-xs text-neutral-500">
                    <tr>
                      <th className="px-3 py-2">행</th>
                      <th className="px-3 py-2">상태</th>
                      <th className="px-3 py-2">내용 / 오류 사유</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {rows.slice(0, 300).map((r) => (
                      <tr key={r.rowNo} className={r.ok ? "" : "bg-rose-50"}>
                        <td className="px-3 py-2 text-neutral-400">{r.rowNo}</td>
                        <td className="px-3 py-2">{r.ok ? <span className="text-emerald-600">✓</span> : <span className="text-rose-600">✕</span>}</td>
                        <td className={`px-3 py-2 text-xs ${r.ok ? "text-neutral-600" : "font-medium text-rose-600"}`}>{r.ok ? r.label : r.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={confirmImport}
                disabled={pending || validCount === 0}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {pending ? "등록 중…" : `${validCount}건 등록`}
              </button>
            </>
          )}

          {result && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              ✅ 등록 {result.inserted}건 · 중복 건너뜀 {result.skipped}건
              {result.failed > 0 && <span className="text-rose-600"> · 실패 {result.failed}건</span>}
              {result.error && <span className="text-rose-600"> · {result.error}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

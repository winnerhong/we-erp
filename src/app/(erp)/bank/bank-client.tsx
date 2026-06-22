"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, TextInput } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { ExcelGrid, type GridCol } from "@/components/excel-grid";
import { BankTradeTabs } from "@/components/bank-trade-tabs";
import { OptionsManager } from "@/components/options-manager";
import type { FieldOptionRow } from "@/lib/supabase/database.types";
import { krw } from "@/lib/labels";
import { buildCSV } from "@/lib/csv";
import { parseSpreadsheetFile, parsePastedText, parseClipboard, downloadXlsx } from "@/lib/sheet";
import {
  parseBankRow,
  BANK_TEMPLATE_HEADERS,
  BANK_TEMPLATE_SAMPLE,
} from "@/lib/bank-import";
import type { BankAccountRow, BankTransactionRow, BankDirection, PaybackRow } from "@/lib/supabase/database.types";
import {
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  bulkImportTransactions,
  setBankTaxStatus,
  createTaxInvoiceFromTxn,
  unlinkTxnTaxInvoice,
  linkBankReceipt,
  setTxnPartner,
  setTxnAccount,
  setTxnCategory,
  setTxnEmployee,
  markInvoiceSettled,
  bulkDeleteTransactions,
  bulkSetTxnPartner,
  bulkSetTaxStatus,
  createPayback,
  deletePayback,
  payPayback,
  unpayPayback,
} from "./actions";

export interface PartnerOption {
  id: string;
  name: string;
  default_tax_rate?: number | null;
}

/** 거래처/의뢰인 텍스트로 등록 거래처를 추정(완전·부분 일치). */
function autoMatchPartner<T extends { id: string; name: string }>(
  counterparty: string | null,
  partners: T[]
): T | undefined {
  if (!counterparty) return undefined;
  const cp = counterparty.trim();
  if (!cp) return undefined;
  return partners.find(
    (p) => p.name === cp || cp.includes(p.name) || p.name.includes(cp)
  );
}

export type TxnWithBalance = BankTransactionRow & { running_balance: number };

export interface ReceiptOption {
  id: string;
  vendor_name: string | null;
  total_amount: number | null;
  doc_date: string | null;
  company_id: string;
}

export interface AccountBalance {
  id: string;
  alias: string;
  bank_name: string | null;
  balance: number;
}

export interface TradeInvoiceView {
  id: string;
  type: "SALES" | "PURCHASE";
  partnerName: string | null;
  total_amount: number;
  due_date: string | null;
  doc_date: string | null;
  evidence: string | null;
}

interface Props {
  accounts: BankAccountRow[];
  companyNames: { id: string; name: string }[];
  selectedId: string | null;
  activeCompanyId: string | null;
  month: string;
  monthTxns: TxnWithBalance[];
  priorBalance: number;
  monthEndBalance: number;
  partners: PartnerOption[];
  receipts: ReceiptOption[];
  accountBalances: AccountBalance[];
  grandBalance: number;
  receivables: TradeInvoiceView[];
  payables: TradeInvoiceView[];
  accountTxnCount: number;
  accountLatestDate: string | null;
  accountOptions: { id: string; code: string; name: string }[];
  categoryOptions: FieldOptionRow[];
  employees: { id: string; name: string; company_id: string | null }[];
  paybacksByTxn: Record<string, PaybackRow[]>;
  cardAlias: Record<string, string>;
}

// 원천징수율 프리셋(직접입력 항상 가능)
export const PAYBACK_TAX_PRESETS = [3.3, 8.8, 10, 13.3];

const num = (s: string) => {
  const n = Number(s.replace(/[^\d.-]/g, ""));
  return s.trim() === "" || !Number.isFinite(n) ? 0 : n;
};

/** 숫자 문자열을 천단위 콤마로 표시(입력칸용). 빈값은 빈문자. */
const commaFmt = (s: string) => {
  const digits = s.replace(/[^\d]/g, "");
  return digits ? Number(digits).toLocaleString("en-US") : "";
};

/** "YYYY-MM" 을 delta 개월 이동. */
function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
/** "2026-06-09" → "2026.06.09(화)" (날짜는 고정값이라 SSR/CSR 동일). */
function fmtDateK(s: string): string {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return s;
  const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${y}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}(${wd})`;
}

export function BankClient({
  accounts,
  companyNames,
  selectedId,
  activeCompanyId,
  month,
  monthTxns,
  priorBalance,
  monthEndBalance,
  partners,
  receipts,
  accountBalances,
  grandBalance,
  receivables,
  payables,
  accountTxnCount,
  accountLatestDate,
  accountOptions,
  categoryOptions,
  employees,
  paybacksByTxn,
  cardAlias,
}: Props) {
  const router = useRouter();
  const [optsOpen, setOptsOpen] = useState(false);
  const [acctModal, setAcctModal] = useState<BankAccountRow | "new" | null>(null);
  const [txnModal, setTxnModal] = useState<BankTransactionRow | "new" | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [taxModalTxn, setTaxModalTxn] = useState<TxnWithBalance | null>(null);
  const [receiptModalTxn, setReceiptModalTxn] = useState<TxnWithBalance | null>(null);
  const [paybackModalTxn, setPaybackModalTxn] = useState<TxnWithBalance | null>(null);
  const [, startQuick] = useTransition();

  // 행에서 바로 세금계산서 발행/수취(자동 분리·거래처 자동매칭). 세부조정은 모달 사용.
  function quickIssue(t: TxnWithBalance) {
    const matched = t.partner_id
      ? partners.find((p) => p.id === t.partner_id)
      : autoMatchPartner(t.counterparty, partners);
    // 거래처 기본세율(null=10%). 0이면 면세/영세 → 세액 0.
    const rate = matched?.default_tax_rate ?? 10;
    const supply = rate > 0 ? Math.round(t.amount / (1 + rate / 100)) : t.amount;
    const vat = t.amount - supply;
    const partnerId = matched?.id || null;
    startQuick(async () => {
      await createTaxInvoiceFromTxn(t.id, {
        partner_id: partnerId,
        doc_date: t.txn_date,
        supply_amount: supply,
        vat_amount: vat,
      });
      router.refresh();
    });
  }

  const pName = new Map(partners.map((p) => [p.id, p.name]));
  const acctMap = new Map(accountOptions.map((a) => [a.id, a]));
  const catLabel = new Map(categoryOptions.map((c) => [c.value, c.label]));
  const eName = new Map(employees.map((e) => [e.id, e.name]));
  const refresh = () => router.refresh();

  // 셀 인라인 편집 커밋(컬럼 key별로 알맞은 액션 호출)
  function onCellEdit(id: string, key: string, value: string) {
    startQuick(async () => {
      if (key === "out_amount") {
        const amt = num(value);
        if (amt > 0) await updateTransaction(id, { amount: amt, direction: "OUT" });
      } else if (key === "in_amount") {
        const amt = num(value);
        if (amt > 0) await updateTransaction(id, { amount: amt, direction: "IN" });
      } else if (key === "txn_date") {
        if (value) await updateTransaction(id, { txn_date: value });
      } else if (key === "description") {
        await updateTransaction(id, { description: value.trim() || null });
      } else if (key === "memo") {
        await updateTransaction(id, { memo: value.trim() || null });
      } else if (key === "tax_status") {
        await setBankTaxStatus(id, value || null);
      } else if (key === "direction") {
        if (value === "IN" || value === "OUT") await updateTransaction(id, { direction: value });
      } else if (key === "category") {
        await setTxnCategory(id, value || null);
      }
      router.refresh();
    });
  }

  // 엑셀 리스트에서 바로 빈 행 추가(이후 셀 인라인 편집)
  function addRow() {
    if (!account) return;
    const d = new Date();
    const cur = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const day = cur === month ? String(d.getDate()).padStart(2, "0") : "01";
    startQuick(async () => {
      await addTransaction({
        bank_account_id: account.id,
        company_id: account.company_id,
        txn_date: `${month}-${day}`,
        direction: "OUT",
        amount: 0,
      });
      router.refresh();
    });
  }

  // 엑셀 그리드 컬럼 정의 — 통장 원본 형식(날짜·구분·내용·출금·입금) + 부가 컬럼
  const gridCols: GridCol<TxnWithBalance>[] = [
    {
      key: "txn_date",
      label: "날짜",
      width: 170,
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
      key: "direction",
      label: "입출",
      width: 64,
      align: "center",
      edit: "select",
      editableRow: (t) => !t.source_ref,
      options: [
        { value: "IN", label: "입금" },
        { value: "OUT", label: "출금" },
      ],
      text: (t) => (t.direction === "IN" ? "입금" : "출금"),
      render: (t) => (
        <span className={t.direction === "IN" ? "text-emerald-600" : "text-rose-600"}>
          {t.direction === "IN" ? "입금" : "출금"}
        </span>
      ),
    },
    {
      key: "category",
      label: "구분",
      width: 100,
      align: "center",
      edit: "select",
      options: [
        { value: "", label: "미지정" },
        ...categoryOptions.map((c) => ({ value: c.value, label: c.label })),
      ],
      text: (t) => (t.category ? catLabel.get(t.category) ?? t.category : ""),
    },
    {
      key: "description",
      label: "내용",
      width: 180,
      edit: "text",
      editableRow: (t) => !t.source_ref,
      text: (t) => t.description ?? "",
    },
    {
      key: "out_amount",
      label: "출금",
      width: 120,
      align: "right",
      edit: "number",
      editableRow: (t) => !t.source_ref,
      text: (t) => (t.direction === "OUT" ? String(t.amount) : ""),
      render: (t) =>
        t.direction === "OUT" ? (
          <span className="tabular font-semibold text-rose-600">−{krw(t.amount)}</span>
        ) : (
          <span className="text-neutral-300">·</span>
        ),
    },
    {
      key: "in_amount",
      label: "입금",
      width: 120,
      align: "right",
      edit: "number",
      editableRow: (t) => !t.source_ref,
      text: (t) => (t.direction === "IN" ? String(t.amount) : ""),
      render: (t) =>
        t.direction === "IN" ? (
          <span className="tabular font-semibold text-emerald-600">+{krw(t.amount)}</span>
        ) : (
          <span className="text-neutral-300">·</span>
        ),
    },
    {
      key: "partner_id",
      label: "거래처·직원",
      width: 160,
      text: (t) =>
        t.employee_id
          ? eName.get(t.employee_id) ?? ""
          : t.partner_id
            ? pName.get(t.partner_id) ?? ""
            : t.counterparty ?? "",
      render: (t) => <PartyCell txn={t} partners={partners} employees={employees} onChanged={refresh} />,
    },
    {
      key: "tax_status",
      label: "계산서",
      width: 130,
      options: [
        { value: "NEEDED", label: "필요" },
        { value: "DONE", label: "완료" },
        { value: "NONE", label: "해당없음" },
      ],
      text: (t) =>
        ({ DONE: "완료", NEEDED: "필요", NONE: "해당없음" } as Record<string, string>)[t.tax_status ?? ""] ?? "미확인",
      render: (t) => (
        <TxnTaxChip
          txn={t}
          onCreate={() => setTaxModalTxn(t)}
          onQuickIssue={() => quickIssue(t)}
          onLinkReceipt={() => setReceiptModalTxn(t)}
          onChanged={refresh}
        />
      ),
    },
    {
      key: "account_id",
      label: "계정과목",
      width: 160,
      text: (t) => {
        const a = t.account_id ? acctMap.get(t.account_id) : undefined;
        return a ? `${a.code} ${a.name}` : "";
      },
      render: (t) => <AccountCell txn={t} accounts={accountOptions} onChanged={refresh} />,
    },
    {
      key: "payback",
      label: "페이백",
      width: 130,
      align: "center",
      text: (t) => {
        const list = paybacksByTxn[t.id] ?? [];
        return list.length ? String(list.reduce((s, p) => s + p.gross_amount, 0)) : "";
      },
      render: (t) => (
        <PaybackChip paybacks={paybacksByTxn[t.id] ?? []} onClick={() => setPaybackModalTxn(t)} />
      ),
    },
    {
      key: "settles_card_id",
      label: "카드대금",
      width: 120,
      align: "center",
      text: (t) => (t.settles_card_id ? `${cardAlias[t.settles_card_id] ?? "카드"} ${t.settles_month ?? ""}` : ""),
      render: (t) =>
        t.settles_card_id ? (
          <span
            className="inline-block rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-700"
            title="카드 사용내역과 정산 연결됨 (카드원장에서 관리)"
          >
            💳 {cardAlias[t.settles_card_id] ?? "카드"} {t.settles_month}
          </span>
        ) : (
          <span className="text-neutral-300">·</span>
        ),
    },
    { key: "memo", label: "메모", width: 150, edit: "text", text: (t) => t.memo ?? "" },
    {
      key: "_actions",
      label: "",
      width: 60,
      align: "center",
      render: (t) => <RowMenu id={t.id} onEdit={() => setTxnModal(t)} onDelete={refresh} />,
    },
  ];

  // 이번달 거래내역을 엑셀(.xlsx)로 내보내기
  function exportMonth() {
    const taxLabel: Record<string, string> = {
      DONE: "완료",
      NEEDED: "필요",
      NONE: "해당없음",
    };
    const rows = monthTxns.map((t) => [
        t.txn_date,
        t.description ?? "",
        (t.partner_id ? pName.get(t.partner_id) : null) ?? t.counterparty ?? "",
        t.direction === "IN" ? t.amount : "",
        t.direction === "OUT" ? t.amount : "",
        t.running_balance,
        t.tax_status ? taxLabel[t.tax_status] ?? "" : "",
        t.memo ?? "",
      ]);
    downloadXlsx(
      `통장거래내역_${account?.alias ?? ""}_${month}`,
      ["거래일자", "적요", "거래처", "입금", "출금", "잔액", "계산서", "메모"],
      rows,
      month
    );
  }

  const compName = new Map(companyNames.map((c) => [c.id, c.name]));
  const account = accounts.find((a) => a.id === selectedId) ?? null;

  function go(params: Record<string, string>) {
    const q = new URLSearchParams({ m: month, ...(selectedId ? { a: selectedId } : {}), ...params });
    router.push(`/bank?${q.toString()}`);
  }

  // 월 합계
  const inSum = monthTxns.filter((t) => t.direction === "IN").reduce((s, t) => s + t.amount, 0);
  const outSum = monthTxns.filter((t) => t.direction === "OUT").reduce((s, t) => s + t.amount, 0);
  const net = inSum - outSum;
  // 월말 잔액 — 마지막 거래의 업로드 잔액(balance_after)이 있으면 그 값 사용
  const lastTxn = monthTxns[monthTxns.length - 1];
  const endBalance = lastTxn?.balance_after ?? monthEndBalance;

  // 미수/미지급 합계 + 잔액 대사(은행제공 잔액 ↔ 계산 잔액 불일치)
  const receivableSum = receivables.reduce((s, i) => s + i.total_amount, 0);
  const payableSum = payables.reduce((s, i) => s + i.total_amount, 0);
  const reconMismatch = monthTxns.filter(
    (t) => t.balance_after != null && Math.abs(t.balance_after - t.running_balance) >= 1
  );
  const [boardOpen, setBoardOpen] = useState(false);

  // 미지정 판정 + 필터
  const noPartner = (t: TxnWithBalance) => !t.partner_id;
  const noTax = (t: TxnWithBalance) => !t.tax_status || t.tax_status === "NEEDED";
  const noPartnerCount = monthTxns.filter(noPartner).length;
  const noTaxCount = monthTxns.filter(noTax).length;
  const [rowFilter, setRowFilter] = useState<"all" | "no_partner" | "no_tax">("all");
  const visibleTxns = monthTxns.filter((t) =>
    rowFilter === "no_partner" ? noPartner(t) : rowFilter === "no_tax" ? noTax(t) : true
  );

  return (
    <div>
      <BankTradeTabs active="bank" />
      <div className="mb-4">
        <h1 className="text-xl font-bold text-neutral-900">통장원장</h1>
      </div>

      {/* 통장 선택 칩 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {accounts.map((a) => {
          const on = a.id === selectedId;
          return (
            <button
              key={a.id}
              onClick={() => go({ a: a.id })}
              className={`group flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                on
                  ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-300"
                  : "border-neutral-200 bg-white hover:bg-neutral-50"
              }`}
            >
              <span className="text-lg">🏦</span>
              <span>
                <span className="block font-semibold text-neutral-800">{a.alias}</span>
                <span className="block text-xs text-neutral-400">
                  {[a.bank_name, a.account_no].filter(Boolean).join(" ") || "계좌정보 없음"}
                  {!activeCompanyId && compName.get(a.company_id) ? ` · ${compName.get(a.company_id)}` : ""}
                </span>
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  setAcctModal(a);
                }}
                className="ml-1 rounded-md px-1.5 py-0.5 text-xs text-neutral-400 opacity-0 hover:bg-neutral-200 group-hover:opacity-100"
              >
                ⚙
              </span>
            </button>
          );
        })}
        <button
          onClick={() => setAcctModal("new")}
          disabled={!activeCompanyId}
          title={activeCompanyId ? "" : "상단에서 사업자를 먼저 선택하세요"}
          className="rounded-xl border border-dashed border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-500 hover:bg-neutral-50 disabled:opacity-40"
        >
          + 통장 추가
        </button>
      </div>

      {accounts.length === 0 ? (
        <Card className="border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-800">
          {activeCompanyId
            ? "등록된 통장이 없습니다. ‘+ 통장 추가’로 시작하세요."
            : "상단에서 사업자를 선택한 뒤 통장을 추가할 수 있습니다."}
        </Card>
      ) : !account ? null : (
        <>
          {/* 요약 — 한 줄 바 */}
          <Card className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {/* 월 네비게이터 — 메인 위치 */}
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
                <span className="text-xs text-neutral-500">월말 잔액</span>
                <span className="text-2xl font-bold tabular text-neutral-900">{krw(endBalance)}</span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-emerald-600">입금 +{krw(inSum)}</span>
              <span className="text-rose-600">출금 −{krw(outSum)}</span>
              <span className={net >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>
                순증감 {net >= 0 ? "+" : "−"}
                {krw(Math.abs(net))}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setBoardOpen((v) => !v)}
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
              >
                받을 돈 {krw(receivableSum)}
              </button>
              <button
                onClick={() => setBoardOpen((v) => !v)}
                className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-800 hover:bg-sky-100"
              >
                줄 돈 {krw(payableSum)}
              </button>
              <span
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600"
                title={`전체 통장 ${accountBalances.length}개 합산`}
              >
                전체잔액 {krw(grandBalance)}
              </span>
            </div>
          </Card>

          {/* 미수/미지급 상세 보드 */}
          {boardOpen && (
            <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <TradeBoard
                title="받을 돈 · 미수금 (매출)"
                accent="amber"
                items={receivables}
                onChanged={() => router.refresh()}
              />
              <TradeBoard
                title="줄 돈 · 미지급 (매입)"
                accent="sky"
                items={payables}
                onChanged={() => router.refresh()}
              />
            </div>
          )}

          {/* 잔액 대사 경고 */}
          {reconMismatch.length > 0 && (
            <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              ⚠ 은행 제공 잔액과 계산 잔액이 다른 거래가 {reconMismatch.length}건 있습니다. 누락·중복 거래나 기초잔액을
              확인하세요. (가장 이른 건: {reconMismatch[0].txn_date} · 차이{" "}
              {krw(Math.abs((reconMismatch[0].balance_after ?? 0) - reconMismatch[0].running_balance))})
            </div>
          )}

          {/* 필터 칩 + 액션 바 */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {([
                ["all", `전체 ${monthTxns.length}`],
                ["no_partner", `거래처 미지정 ${noPartnerCount}`],
                ["no_tax", `계산서 미처리 ${noTaxCount}`],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setRowFilter(key)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    rowFilter === key
                      ? "bg-neutral-900 text-white"
                      : "border border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setImportOpen(true)}
                title="거래내역 올리기 (자동 병합)"
                className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                ⬆ 올리기
              </button>
              <button
                onClick={exportMonth}
                disabled={monthTxns.length === 0}
                title="엑셀로 내보내기"
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
                onClick={() => setTxnModal("new")}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700"
              >
                ＋ 거래 추가
              </button>
            </div>
          </div>

          {monthTxns.length === 0 && accountTxnCount > 0 && accountLatestDate && (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              이 달({month})엔 거래가 없지만, 이 통장에 <b>{accountTxnCount.toLocaleString()}건</b>이 다른 달에 있습니다.
              <button
                onClick={() => go({ m: accountLatestDate.slice(0, 7) })}
                className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
              >
                최근 거래 달({accountLatestDate.slice(0, 7)}) 보기 →
              </button>
            </div>
          )}
          <p className="mb-1 text-xs text-neutral-400">
셀 클릭=수정 · 헤더 드래그=순서 · 끝 드래그=너비 · 단위: 원
          </p>
          <ExcelGrid
            storageKey="bank_grid2"
            columns={gridCols}
            rows={visibleTxns}
            rowId={(t) => t.id}
            onEdit={onCellEdit}
            accent={(t) => noPartner(t) || noTax(t)}
            onAddRow={addRow}
            addLabel="+ 거래 추가 (빈 행)"
            selectable
            renderBulk={(ids, clear) => (
              <BankBulkActions ids={ids} clear={clear} partners={partners} onChanged={refresh} />
            )}
            empty={monthTxns.length === 0 ? `${month} 거래내역이 없습니다. 올리거나 아래에서 추가하세요.` : "조건에 맞는 거래가 없습니다 👍"}
          />
          <div className="mt-2 flex flex-wrap items-center justify-end gap-x-5 gap-y-1 px-1 text-sm text-neutral-600">
            <span>
              {month} 합계 {monthTxns.length}건 · 월초 {krw(priorBalance)}
            </span>
            <span className={net >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>
              순증감 {net >= 0 ? "+" : "−"}
              {krw(Math.abs(net))}
            </span>
            <span className="font-bold text-neutral-900">월말 {krw(endBalance)}</span>
          </div>
        </>
      )}

      {optsOpen && (
        <OptionsManager
          options={categoryOptions}
          cats={[
            {
              key: "bank_category",
              title: "구분",
              hint: "분류 + 연동 대상(거래처/직원). ‘직원’ 연동 구분은 통장에서 직원 선택 시 그 달 급여로 자동기록",
              linkable: true,
            },
          ]}
          onClose={() => {
            setOptsOpen(false);
            router.refresh();
          }}
        />
      )}
      {acctModal && (
        <AccountModal
          row={acctModal === "new" ? null : acctModal}
          companyId={activeCompanyId}
          onClose={() => setAcctModal(null)}
          onSaved={() => {
            setAcctModal(null);
            router.refresh();
          }}
        />
      )}
      {txnModal && account && (
        <TxnModal
          row={txnModal === "new" ? null : txnModal}
          account={account}
          partners={partners}
          defaultDate={`${month}-01`}
          onClose={() => setTxnModal(null)}
          onSaved={() => {
            setTxnModal(null);
            router.refresh();
          }}
        />
      )}
      {importOpen && account && (
        <ImportModal
          account={account}
          onClose={() => setImportOpen(false)}
          onDone={(gotoMonth) => {
            setImportOpen(false);
            if (gotoMonth && gotoMonth !== month) go({ m: gotoMonth });
            else router.refresh();
          }}
        />
      )}
      {taxModalTxn && (
        <TaxFromTxnModal
          txn={taxModalTxn}
          partners={partners}
          onClose={() => setTaxModalTxn(null)}
          onSaved={() => {
            setTaxModalTxn(null);
            router.refresh();
          }}
        />
      )}
      {receiptModalTxn && (
        <ReceiptPickerModal
          txn={receiptModalTxn}
          receipts={receipts.filter((r) => r.company_id === receiptModalTxn.company_id)}
          onClose={() => setReceiptModalTxn(null)}
          onSaved={() => {
            setReceiptModalTxn(null);
            router.refresh();
          }}
        />
      )}
      {paybackModalTxn && (
        <PaybackModal
          txn={paybackModalTxn}
          paybacks={paybacksByTxn[paybackModalTxn.id] ?? []}
          partners={partners}
          employees={employees}
          onClose={() => setPaybackModalTxn(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

// ---------- 페이백 칩(통장 행) ----------
function PaybackChip({ paybacks, onClick }: { paybacks: PaybackRow[]; onClick: () => void }) {
  if (paybacks.length === 0) {
    return (
      <button
        onClick={onClick}
        className="rounded-md border border-dashed border-neutral-300 px-2 py-0.5 text-xs text-neutral-400 hover:border-neutral-400 hover:text-neutral-600"
      >
        + 페이백
      </button>
    );
  }
  const gross = paybacks.reduce((s, p) => s + p.gross_amount, 0);
  const allPaid = paybacks.every((p) => p.status === "PAID");
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
        allPaid
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
      }`}
      title={allPaid ? "지불완료" : "요청받음 포함"}
    >
      {krw(gross)} {allPaid ? "✓" : `· ${paybacks.filter((p) => p.status === "PENDING").length}건 요청`}
    </button>
  );
}

// ---------- 페이백 관리 모달 ----------
function PaybackModal({
  txn,
  paybacks,
  partners,
  employees,
  onClose,
  onChanged,
}: {
  txn: TxnWithBalance;
  paybacks: PaybackRow[];
  partners: PartnerOption[];
  employees: { id: string; name: string; company_id: string | null }[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(paybacks.length === 0);
  const [recipientType, setRecipientType] = useState<"PARTNER" | "EMPLOYEE">("EMPLOYEE");
  const [recipientId, setRecipientId] = useState("");
  const [gross, setGross] = useState("");
  const [rate, setRate] = useState<number>(3.3);
  const [memo, setMemo] = useState("");

  const pName = new Map(partners.map((p) => [p.id, p.name]));
  const eName = new Map(employees.map((e) => [e.id, e.name]));
  const recipientName = (p: PaybackRow) =>
    p.recipient_type === "EMPLOYEE"
      ? eName.get(p.employee_id ?? "") ?? "(직원)"
      : pName.get(p.partner_id ?? "") ?? "(거래처)";

  const grossNum = num(gross);
  const taxPreview = Math.round((grossNum * rate) / 100);
  const netPreview = grossNum - taxPreview;

  const totalGross = paybacks.reduce((s, p) => s + p.gross_amount, 0);
  const remain = txn.amount - totalGross; // 우리 몫(잔여)

  function add() {
    if (grossNum <= 0) {
      alert("페이백 금액을 입력하세요.");
      return;
    }
    if (!recipientId) {
      alert(recipientType === "EMPLOYEE" ? "직원을 선택하세요." : "거래처를 선택하세요.");
      return;
    }
    startTransition(async () => {
      const res = await createPayback({
        bank_transaction_id: txn.id,
        recipient_type: recipientType,
        partner_id: recipientType === "PARTNER" ? recipientId : null,
        employee_id: recipientType === "EMPLOYEE" ? recipientId : null,
        gross_amount: grossNum,
        tax_rate: rate,
        memo: memo.trim() || null,
      });
      if (!res.ok) {
        alert(res.error);
        return;
      }
      setAdding(false);
      setRecipientId("");
      setGross("");
      setMemo("");
      onChanged();
    });
  }

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) alert(res.error);
      onChanged();
    });
  }

  return (
    <Modal title="페이백 관리" onClose={onClose} wide>
      <div className="space-y-4 p-5">
        {/* 거래 요약 */}
        <div className="grid grid-cols-3 gap-3 rounded-xl bg-neutral-50 p-3 text-sm">
          <div>
            <p className="text-xs text-neutral-400">거래({txn.direction === "IN" ? "입금" : "출금"})</p>
            <p className="font-semibold">{krw(txn.amount)}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-400">페이백 합계</p>
            <p className="font-semibold text-amber-700">{krw(totalGross)}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-400">잔여(우리 몫)</p>
            <p className={`font-semibold ${remain < 0 ? "text-rose-600" : "text-neutral-900"}`}>{krw(remain)}</p>
          </div>
        </div>

        {/* 기존 페이백 목록 */}
        {paybacks.length > 0 && (
          <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
            {paybacks.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500">
                    {p.recipient_type === "EMPLOYEE" ? "직원" : "거래처"}
                  </span>
                  <span className="ml-2 font-medium">{recipientName(p)}</span>
                  <span className="ml-2 text-neutral-400">
                    총 {krw(p.gross_amount)} · 원천 {p.tax_rate}%(−{krw(p.tax_amount)}) · 실지급{" "}
                    <b className="text-neutral-700">{krw(p.net_amount)}</b>
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {p.status === "PAID" ? (
                    <>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                        지불완료 {p.paid_at ?? ""}
                      </span>
                      <button
                        onClick={() => act(() => unpayPayback(p.id))}
                        disabled={pending}
                        className="rounded-md border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-50"
                      >
                        취소
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        if (confirm(`${recipientName(p)} 에게 ${krw(p.net_amount)} 지불 처리할까요?\n통장에 출금거래가 자동 생성됩니다.`))
                          act(() => payPayback(p.id));
                      }}
                      disabled={pending}
                      className="rounded-md bg-neutral-900 px-2.5 py-0.5 text-xs font-medium text-white hover:bg-neutral-700"
                    >
                      지불완료
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (confirm("이 페이백을 삭제할까요?" + (p.status === "PAID" ? "\n(자동 생성된 출금거래도 삭제됩니다)" : "")))
                        act(() => deletePayback(p.id));
                    }}
                    disabled={pending}
                    className="rounded-md px-1.5 py-0.5 text-xs text-rose-500 hover:bg-rose-50"
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 추가 폼 */}
        {adding ? (
          <div className="space-y-3 rounded-xl border-2 border-neutral-800 p-4">
            <div className="flex gap-2">
              {(["EMPLOYEE", "PARTNER"] as const).map((rt) => (
                <button
                  key={rt}
                  onClick={() => {
                    setRecipientType(rt);
                    setRecipientId("");
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    recipientType === rt ? "bg-neutral-900 text-white" : "border border-neutral-300 hover:bg-neutral-50"
                  }`}
                >
                  {rt === "EMPLOYEE" ? "💼 강사·직원" : "🏢 거래처"}
                </button>
              ))}
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-neutral-500">받는 대상</p>
              <SearchableSelect
                value={recipientId}
                onChange={(v) => setRecipientId(v)}
                options={(recipientType === "EMPLOYEE" ? employees : partners).map((o) => ({
                  value: o.id,
                  label: o.name,
                }))}
                emptyOption="선택 안함"
                placeholder={recipientType === "EMPLOYEE" ? "직원 검색" : "거래처 검색"}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">페이백 총액</p>
                <input
                  inputMode="numeric"
                  value={gross}
                  onChange={(e) => setGross(e.target.value)}
                  placeholder="700,000"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">원천징수율(%)</p>
                <div className="flex flex-wrap items-center gap-1">
                  {PAYBACK_TAX_PRESETS.map((r) => (
                    <button
                      key={r}
                      onClick={() => setRate(r)}
                      className={`rounded-md px-2 py-1 text-xs ${
                        rate === r ? "bg-neutral-900 text-white" : "border border-neutral-300 hover:bg-neutral-50"
                      }`}
                    >
                      {r}%
                    </button>
                  ))}
                  <input
                    inputMode="decimal"
                    value={rate}
                    onChange={(e) => setRate(Number(e.target.value.replace(/[^\d.]/g, "")) || 0)}
                    className="w-16 rounded-md border border-neutral-300 px-2 py-1 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* 미리보기 */}
            <div className="flex items-center gap-4 rounded-lg bg-neutral-50 px-3 py-2 text-sm">
              <span className="text-neutral-500">세액 <b className="text-rose-600">−{krw(taxPreview)}</b></span>
              <span className="text-neutral-500">실지급액 <b className="text-neutral-900">{krw(netPreview)}</b></span>
            </div>

            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="메모(선택)"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            />

            <div className="flex justify-end gap-2">
              {paybacks.length > 0 && (
                <button onClick={() => setAdding(false)} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">
                  취소
                </button>
              )}
              <button
                onClick={add}
                disabled={pending}
                className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
              >
                페이백 추가
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full rounded-xl border-2 border-dashed border-neutral-300 py-2.5 text-sm font-medium text-neutral-500 hover:border-neutral-400 hover:bg-neutral-50"
          >
            + 페이백 추가
          </button>
        )}
      </div>
    </Modal>
  );
}

// ---------- 미수/미지급 보드 ----------
function TradeBoard({
  title,
  accent,
  items,
  onChanged,
}: {
  title: string;
  accent: "amber" | "sky";
  items: TradeInvoiceView[];
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const isReceivable = accent === "amber";
  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const ring = isReceivable ? "border-amber-200" : "border-sky-200";
  const head = isReceivable ? "text-amber-800" : "text-sky-800";

  function settle(id: string) {
    startTransition(async () => {
      await markInvoiceSettled(id, today);
      onChanged();
    });
  }

  return (
    <Card className={`${ring} overflow-hidden`}>
      <div className={`border-b border-neutral-100 px-4 py-2.5 text-sm font-semibold ${head}`}>
        {title} · {items.length}건
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-neutral-400">미정산 건이 없습니다 👍</p>
      ) : (
        <div className="max-h-80 divide-y divide-neutral-100 overflow-y-auto">
          {items.map((i) => {
            const overdue = !!(i.due_date && i.due_date < today);
            return (
              <div key={i.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-neutral-800">{i.partnerName ?? "거래처 미지정"}</p>
                  <p className="text-xs text-neutral-400">
                    {i.doc_date ?? "-"}
                    {i.due_date && (
                      <span className={overdue ? "ml-2 font-semibold text-rose-600" : "ml-2 text-neutral-400"}>
                        예정 {i.due_date}
                        {overdue ? " (연체)" : ""}
                      </span>
                    )}
                    {i.evidence && i.evidence !== "세금계산서" && (
                      <span className="ml-2 text-neutral-400">· {i.evidence}</span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="tabular font-semibold text-neutral-700">{krw(i.total_amount)}</span>
                  <button
                    onClick={() => settle(i.id)}
                    disabled={pending}
                    className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50"
                  >
                    {isReceivable ? "받음" : "지급"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ---------- 선택 행 일괄 작업 ----------
function BankBulkActions({
  ids,
  clear,
  partners,
  onChanged,
}: {
  ids: string[];
  clear: () => void;
  partners: PartnerOption[];
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      clear();
      onChanged();
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-neutral-500">일괄:</span>
      <div className="w-44">
        <SearchableSelect
          value=""
          onChange={(v) => v && run(() => bulkSetTxnPartner(ids, v))}
          options={partners.map((p) => ({ value: p.id, label: p.name }))}
          placeholder="거래처 지정"
        />
      </div>
      <select
        value=""
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          if (v) run(() => bulkSetTaxStatus(ids, v === "_null" ? null : v));
        }}
        className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm"
      >
        <option value="">계산서 상태…</option>
        <option value="DONE">완료</option>
        <option value="NEEDED">필요</option>
        <option value="NONE">해당없음</option>
        <option value="_null">미확인</option>
      </select>
      <button
        disabled={pending}
        onClick={() => {
          if (confirm(`선택한 ${ids.length}건을 삭제할까요?`)) run(() => bulkDeleteTransactions(ids));
        }}
        className="rounded-lg border border-rose-300 bg-white px-2.5 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
      >
        🗑 삭제
      </button>
    </div>
  );
}

// ---------- 계정과목 인라인 지정 ----------
function AccountCell({
  txn,
  accounts,
  onChanged,
}: {
  txn: TxnWithBalance;
  accounts: { id: string; code: string; name: string }[];
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <SearchableSelect
      value={txn.account_id ?? ""}
      onChange={(v) =>
        startTransition(async () => {
          await setTxnAccount(txn.id, v || null);
          onChanged();
        })
      }
      options={accounts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }))}
      emptyOption="미지정"
      placeholder="계정과목"
      disabled={pending}
    />
  );
}

// ---------- 거래처·직원 통합 인라인 지정 ----------
// 한 칸에서 거래처와 직원을 함께 검색·선택. 직원을 고르면(구분이 직원연동일 때) 그 달 급여로 자동 기록.
function PartyCell({
  txn,
  partners,
  employees,
  onChanged,
}: {
  txn: TxnWithBalance;
  partners: { id: string; name: string }[];
  employees: { id: string; name: string; company_id: string | null }[];
  onChanged: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();

  const curEmp = txn.employee_id ? employees.find((e) => e.id === txn.employee_id) : undefined;
  const curPartner = !curEmp && txn.partner_id ? partners.find((p) => p.id === txn.partner_id) : undefined;
  // 추천: 미지정일 때만 적요로 거래처 자동 매칭
  const suggestion = curEmp || curPartner ? undefined : autoMatchPartner(txn.counterparty, partners);
  const MENU_W = 240;

  const ql = q.trim().toLowerCase();
  const fPartners = ql ? partners.filter((p) => p.name.toLowerCase().includes(ql)) : partners;
  const fEmployees = ql ? employees.filter((e) => e.name.toLowerCase().includes(ql)) : employees;

  function open() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - MENU_W - 8) });
    setQ("");
  }
  function close() {
    setPos(null);
  }
  // 거래처 선택 → 직원 연결은 해제(둘 중 하나만 유지)
  function pickPartner(id: string | null) {
    startTransition(async () => {
      if (txn.employee_id) await setTxnEmployee(txn.id, null);
      await setTxnPartner(txn.id, id);
      close();
      onChanged();
    });
  }
  // 직원 선택 → 거래처 연결은 해제
  function pickEmployee(id: string) {
    startTransition(async () => {
      if (txn.partner_id) await setTxnPartner(txn.id, null);
      const res = await setTxnEmployee(txn.id, id);
      if (!res.ok) alert(res.error);
      close();
      onChanged();
    });
  }
  function clearAll() {
    startTransition(async () => {
      if (txn.employee_id) await setTxnEmployee(txn.id, null);
      if (txn.partner_id) await setTxnPartner(txn.id, null);
      close();
      onChanged();
    });
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => (pos ? close() : open())}
        disabled={pending}
        className={`mt-0.5 flex max-w-[180px] items-center gap-1 rounded-lg px-2 py-0.5 text-left text-xs ${
          curEmp
            ? "font-medium text-violet-700 hover:bg-violet-50"
            : curPartner
              ? "font-medium text-neutral-700 hover:bg-neutral-100"
              : "text-neutral-400 hover:bg-neutral-100"
        }`}
        title={curEmp ? "연결 직원" : txn.counterparty || ""}
      >
        {curEmp && <span className="text-neutral-300">💼</span>}
        {curEmp ? (
          <span className="truncate">{curEmp.name}</span>
        ) : curPartner ? (
          <span className="truncate">{curPartner.name}</span>
        ) : suggestion ? (
          <span className="truncate text-amber-600">{suggestion.name}?</span>
        ) : (
          <span className="truncate">{txn.counterparty || "거래처·직원"}</span>
        )}
        <span className="text-[10px] text-neutral-300">▾</span>
      </button>
      {pos && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div
            className="fixed z-50 rounded-lg border border-neutral-200 bg-white p-1 shadow-xl"
            style={{ top: pos.top, left: pos.left, width: MENU_W }}
          >
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="거래처·직원 검색…"
              className="mb-1 w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
            />
            {suggestion && !q && (
              <button
                onClick={() => pickPartner(suggestion.id)}
                disabled={pending}
                className="block w-full rounded-md px-3 py-2 text-left text-sm text-amber-700 hover:bg-amber-50"
              >
                ⭐ 추천: {suggestion.name}
              </button>
            )}
            <div className="max-h-56 overflow-y-auto">
              {fPartners.length > 0 && (
                <>
                  <p className="px-2 pb-0.5 pt-1 text-[10px] font-semibold text-neutral-400">거래처</p>
                  {fPartners.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => pickPartner(p.id)}
                      disabled={pending}
                      className={`block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-neutral-100 ${
                        p.id === txn.partner_id ? "font-semibold text-indigo-600" : ""
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </>
              )}
              {fEmployees.length > 0 && (
                <>
                  <p className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold text-neutral-400">직원</p>
                  {fEmployees.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => pickEmployee(e.id)}
                      disabled={pending}
                      className={`block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-neutral-100 ${
                        e.id === txn.employee_id ? "font-semibold text-violet-700" : ""
                      }`}
                    >
                      💼 {e.name}
                    </button>
                  ))}
                </>
              )}
              {fPartners.length === 0 && fEmployees.length === 0 && (
                <p className="px-3 py-3 text-center text-xs text-neutral-400">검색 결과가 없습니다</p>
              )}
            </div>
            {(curEmp || curPartner) && (
              <>
                <div className="my-1 border-t border-neutral-100" />
                <button
                  onClick={clearAll}
                  disabled={pending}
                  className="block w-full rounded-md px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                >
                  연결 해제{curEmp ? "(급여 제거)" : ""}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}

// ---------- 행 작업 메뉴(호버 시 표시) ----------
function RowMenu({ id, onEdit, onDelete }: { id: string; onEdit: () => void; onDelete: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
      <button
        onClick={onEdit}
        title="수정"
        className="rounded-md px-1.5 py-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-800"
      >
        ✏️
      </button>
      <button
        disabled={pending}
        title="삭제"
        onClick={() => {
          if (!confirm("이 거래를 삭제할까요?")) return;
          startTransition(async () => {
            await deleteTransaction(id);
            onDelete();
          });
        }}
        className="rounded-md px-1.5 py-1 text-neutral-400 hover:bg-rose-50 hover:text-rose-600"
      >
        🗑
      </button>
    </span>
  );
}

// ---------- 증빙(세금계산서) 칩 + 팝오버 ----------
function TxnTaxChip({
  txn,
  onCreate,
  onQuickIssue,
  onLinkReceipt,
  onChanged,
}: {
  txn: TxnWithBalance;
  onCreate: () => void;
  onQuickIssue: () => void;
  onLinkReceipt: () => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [pending, startTransition] = useTransition();
  const isIn = txn.direction === "IN";
  const verb = isIn ? "발행" : "수취";
  const linked = !!(txn.tax_invoice_id || txn.receipt_id);
  const viewHref = txn.receipt_id ? "/receipts" : "/tax-invoices";
  const viewLabel = txn.receipt_id ? "📄 영수증 보기" : "📑 세금계산서 보기";
  const MENU_W = 220;

  const chip =
    txn.tax_status === "DONE"
      ? { cls: "bg-emerald-100 text-emerald-700", text: `${verb}완료` }
      : txn.tax_status === "NEEDED"
        ? { cls: "bg-rose-100 text-rose-700", text: `${verb} 필요` }
        : txn.tax_status === "NONE"
          ? { cls: "bg-neutral-100 text-neutral-400", text: "해당없음" }
          : { cls: "border border-dashed border-neutral-300 bg-white text-neutral-400", text: "미확인" };

  function toggle() {
    if (pos) {
      setPos(null);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: Math.max(8, r.right - MENU_W) });
  }
  function close() {
    setPos(null);
  }
  function set(status: string | null) {
    startTransition(async () => {
      await setBankTaxStatus(txn.id, status);
      close();
      onChanged();
    });
  }
  function unlink() {
    startTransition(async () => {
      await unlinkTxnTaxInvoice(txn.id);
      close();
      onChanged();
    });
  }

  const item = "block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-neutral-100";

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        disabled={pending}
        className={`rounded-full px-2.5 py-1 text-xs font-medium ${chip.cls}`}
      >
        {chip.text}
      </button>
      {pos && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div
            className="fixed z-50 rounded-lg border border-neutral-200 bg-white p-1 shadow-xl"
            style={{ top: pos.top, left: pos.left, width: MENU_W }}
          >
            {linked ? (
              <>
                <button onClick={() => { close(); router.push(viewHref); }} className={item}>
                  {viewLabel}
                </button>
                <button onClick={unlink} disabled={pending} className={`${item} text-rose-600`}>
                  연결 해제
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => { close(); onQuickIssue(); }}
                  disabled={pending}
                  className={`${item} font-semibold text-emerald-700`}
                >
                  ✅ {verb}완료 (세금계산서 자동생성)
                </button>
                <button onClick={() => { close(); onCreate(); }} className={`${item} text-indigo-600`}>
                  ✏️ 금액·거래처 직접 입력
                </button>
                {!isIn && (
                  <button onClick={() => { close(); onLinkReceipt(); }} className={`${item} text-indigo-600`}>
                    📄 영수증 연결
                  </button>
                )}
                <div className="my-1 border-t border-neutral-100" />
                <button onClick={() => set("NEEDED")} className={item}>🔴 {verb} 필요(표시만)</button>
                <button onClick={() => set("NONE")} className={item}>⚪ 해당없음</button>
                {txn.tax_status && (
                  <button onClick={() => set(null)} className={`${item} text-neutral-400`}>미확인으로</button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}

// ---------- 거래 → 세금계산서 등록(자동채움) ----------
function TaxFromTxnModal({
  txn,
  partners,
  onClose,
  onSaved,
}: {
  txn: TxnWithBalance;
  partners: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const isIn = txn.direction === "IN";
  const matched =
    (txn.tax_partner_id && partners.find((p) => p.id === txn.tax_partner_id)) ||
    (txn.partner_id && partners.find((p) => p.id === txn.partner_id)) ||
    autoMatchPartner(txn.counterparty, partners);
  const supplyInit = Math.round(txn.amount / 1.1);
  const [partnerId, setPartnerId] = useState(matched?.id ?? "");
  const [docDate, setDocDate] = useState(txn.txn_date);
  const [supply, setSupply] = useState(String(supplyInit));
  const [vat, setVat] = useState(String(txn.amount - supplyInit));
  const [error, setError] = useState<string | null>(null);

  const total = num(supply) + num(vat);

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await createTaxInvoiceFromTxn(txn.id, {
        partner_id: partnerId || null,
        doc_date: docDate,
        supply_amount: num(supply),
        vat_amount: num(vat),
      });
      if (res.ok) onSaved();
      else setError(res.error ?? "오류");
    });
  }

  return (
    <Modal title={`세금계산서 ${isIn ? "발행(매출)" : "수취(매입)"} 등록`} onClose={onClose}>
      <div className="space-y-3 p-5">
        <div className="rounded-lg bg-neutral-50 p-3 text-xs text-neutral-500">
          {txn.txn_date} · {txn.counterparty || txn.description || "-"} ·{" "}
          <span className={isIn ? "text-emerald-600" : "text-rose-600"}>
            {isIn ? "입금" : "출금"} {krw(txn.amount)}
          </span>
          <span className="ml-1">기준 자동 분리</span>
        </div>
        <Field label="거래처">
          <SearchableSelect
            value={partnerId}
            onChange={setPartnerId}
            options={partners.map((p) => ({ value: p.id, label: p.name }))}
            emptyOption="미지정"
            placeholder="거래처 검색·선택"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="작성일자">
            <TextInput type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
          </Field>
          <Field label="공급가액">
            <TextInput
              inputMode="numeric"
              value={commaFmt(supply)}
              onChange={(e) => setSupply(e.target.value.replace(/[^\d]/g, ""))}
            />
          </Field>
          <Field label="세액">
            <TextInput
              inputMode="numeric"
              value={commaFmt(vat)}
              onChange={(e) => setVat(e.target.value.replace(/[^\d]/g, ""))}
            />
          </Field>
          <Field label="합계">
            <TextInput value={krw(total)} readOnly className="bg-neutral-50" />
          </Field>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>
      <div className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-3">
        <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">
          취소
        </button>
        <button
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? "등록 중…" : "등록 + 완료 처리"}
        </button>
      </div>
    </Modal>
  );
}

// ---------- 통장 추가/수정 ----------
function AccountModal({
  row,
  companyId,
  onClose,
  onSaved,
}: {
  row: BankAccountRow | null;
  companyId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [d, setD] = useState({
    alias: row?.alias ?? "",
    bank_name: row?.bank_name ?? "",
    account_no: row?.account_no ?? "",
    opening_balance: row?.opening_balance?.toString() ?? "0",
  });
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (!d.alias.trim()) {
      setError("통장 별칭은 필수입니다");
      return;
    }
    const value = {
      alias: d.alias.trim(),
      bank_name: d.bank_name.trim() || null,
      account_no: d.account_no.trim() || null,
      opening_balance: num(d.opening_balance),
    };
    startTransition(async () => {
      const res = row
        ? await updateBankAccount(row.id, value)
        : await createBankAccount({ ...value, company_id: companyId! });
      if (res.ok) onSaved();
      else setError(res.error ?? "오류");
    });
  }

  function remove() {
    if (!row) return;
    if (!confirm("이 통장과 모든 거래내역이 삭제됩니다. 계속할까요?")) return;
    startTransition(async () => {
      const res = await deleteBankAccount(row.id);
      if (res.ok) onSaved();
      else setError(res.error ?? "오류");
    });
  }

  return (
    <Modal title={row ? "통장 수정" : "통장 추가"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3 p-5">
        <div className="col-span-2">
          <Field label="별칭(통장 이름)" required>
            <TextInput
              placeholder="예: 운영비 주거래"
              value={d.alias}
              onChange={(e) => setD({ ...d, alias: e.target.value })}
            />
          </Field>
        </div>
        <Field label="은행명">
          <TextInput
            placeholder="국민은행"
            value={d.bank_name}
            onChange={(e) => setD({ ...d, bank_name: e.target.value })}
          />
        </Field>
        <Field label="계좌번호">
          <TextInput
            placeholder="123-45-678901"
            value={d.account_no}
            onChange={(e) => setD({ ...d, account_no: e.target.value })}
          />
        </Field>
        <div className="col-span-2">
          <Field label="기초잔액(거래내역 시작 전 잔액)">
            <TextInput
              inputMode="numeric"
              value={d.opening_balance}
              onChange={(e) => setD({ ...d, opening_balance: e.target.value })}
            />
          </Field>
        </div>
      </div>
      {error && <p className="px-5 text-sm text-rose-600">{error}</p>}
      <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-3">
        <div>
          {row && (
            <button onClick={remove} disabled={pending} className="text-sm text-rose-500 hover:text-rose-700">
              통장 삭제
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">
            취소
          </button>
          <button
            onClick={save}
            disabled={pending}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {pending ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- 거래 추가/수정 ----------
function TxnModal({
  row,
  account,
  partners,
  defaultDate,
  onClose,
  onSaved,
}: {
  row: BankTransactionRow | null;
  account: BankAccountRow;
  partners: { id: string; name: string }[];
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [d, setD] = useState({
    txn_date: row?.txn_date ?? defaultDate,
    direction: (row?.direction ?? "OUT") as BankDirection,
    amount: row?.amount?.toString() ?? "",
    counterparty: row?.counterparty ?? "",
    description: row?.description ?? "",
    memo: row?.memo ?? "",
    partner_id: row?.partner_id ?? "",
  });
  const [error, setError] = useState<string | null>(null);

  function save() {
    const amount = num(d.amount);
    if (!d.txn_date) {
      setError("거래일자를 입력하세요");
      return;
    }
    if (amount <= 0) {
      setError("금액을 입력하세요");
      return;
    }
    const value = {
      txn_date: d.txn_date,
      direction: d.direction,
      amount,
      counterparty: d.counterparty.trim() || null,
      description: d.description.trim() || null,
      memo: d.memo.trim() || null,
      partner_id: d.partner_id || null,
    };
    startTransition(async () => {
      const res = row
        ? await updateTransaction(row.id, value)
        : await addTransaction({ ...value, bank_account_id: account.id, company_id: account.company_id });
      if (res.ok) onSaved();
      else setError(res.error ?? "오류");
    });
  }

  return (
    <Modal title={`${account.alias} · 거래 ${row ? "수정" : "추가"}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3 p-5">
        <Field label="거래일자" required>
          <TextInput type="date" value={d.txn_date} onChange={(e) => setD({ ...d, txn_date: e.target.value })} />
        </Field>
        <Field label="구분" required>
          <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
            {(["IN", "OUT"] as BankDirection[]).map((dir) => (
              <button
                key={dir}
                type="button"
                onClick={() => setD({ ...d, direction: dir })}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
                  d.direction === dir
                    ? dir === "IN"
                      ? "bg-emerald-500 text-white"
                      : "bg-rose-500 text-white"
                    : "text-neutral-500"
                }`}
              >
                {dir === "IN" ? "입금 +" : "출금 −"}
              </button>
            ))}
          </div>
        </Field>
        <div className="col-span-2">
          <Field label="금액" required>
            <TextInput
              inputMode="numeric"
              placeholder="1,000,000"
              value={d.amount}
              onChange={(e) => setD({ ...d, amount: e.target.value })}
            />
          </Field>
        </div>
        <Field label="거래처/의뢰인">
          <TextInput value={d.counterparty} onChange={(e) => setD({ ...d, counterparty: e.target.value })} />
        </Field>
        <Field label="적요">
          <TextInput value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
        </Field>
        <div className="col-span-2">
          <Field label="거래처 연결 (선택 — 거래처 상세 원장에 반영)">
            <SearchableSelect
              value={d.partner_id}
              onChange={(v) => setD({ ...d, partner_id: v })}
              options={partners.map((p) => ({ value: p.id, label: p.name }))}
              emptyOption="미연결"
              placeholder="거래처 검색·선택"
            />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="메모">
            <TextInput value={d.memo} onChange={(e) => setD({ ...d, memo: e.target.value })} />
          </Field>
        </div>
      </div>
      {error && <p className="px-5 text-sm text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-3">
        <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">
          취소
        </button>
        <button
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
      </div>
    </Modal>
  );
}

// ---------- CSV 업로드 ----------
interface PreviewRow {
  rowNo: number;
  raw: Record<string, string>;
  ok: boolean;
  label: string;
  error?: string;
}

// 직접 입력(엑셀형) 한 행 — 키는 표준 양식 헤더와 동일해 parseBankRow 가 그대로 인식.
interface DraftTxn {
  _id: string;
  거래일자: string;
  적요: string;
  거래처: string;
  입금: string;
  출금: string;
}

const DRAFT_COLS: GridCol<DraftTxn>[] = [
  { key: "거래일자", label: "거래일자", width: 130, edit: "date", text: (r) => r.거래일자 },
  { key: "적요", label: "내용(적요)", width: 200, edit: "text", text: (r) => r.적요 },
  { key: "거래처", label: "거래처", width: 140, edit: "text", text: (r) => r.거래처 },
  { key: "입금", label: "입금", width: 120, align: "right", edit: "number", text: (r) => r.입금 },
  { key: "출금", label: "출금", width: 120, align: "right", edit: "number", text: (r) => r.출금 },
];

function ImportModal({
  account,
  onClose,
  onDone,
}: {
  account: BankAccountRow;
  onClose: () => void;
  onDone: (gotoMonth?: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [result, setResult] = useState<{
    inserted: number;
    skipped: number;
    failed: number;
    error?: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const validCount = rows.filter((r) => r.ok).length;
  const errorCount = rows.length - validCount;
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // 입력 방식: 파일·붙여넣기(import) ↔ 직접 입력(엑셀형 manual)
  const [inputMode, setInputMode] = useState<"import" | "manual">("import");
  const draftSeq = useRef(0);
  const blankDraft = (): DraftTxn => ({
    _id: `d${draftSeq.current++}`,
    거래일자: "",
    적요: "",
    거래처: "",
    입금: "",
    출금: "",
  });
  const [drafts, setDrafts] = useState<DraftTxn[]>([]);
  function switchToManual() {
    setInputMode("manual");
    setRows([]);
    setResult(null);
    setParseError(null);
    if (drafts.length === 0) setDrafts([blankDraft(), blankDraft(), blankDraft()]);
  }
  function editDraft(id: string, key: string, value: string) {
    setDrafts((ds) => ds.map((d) => (d._id === id ? { ...d, [key]: value } : d)));
  }
  function previewDrafts() {
    const filled = drafts.filter((d) => d.거래일자.trim() || d.입금.trim() || d.출금.trim() || d.적요.trim());
    preview(
      filled.map(({ _id, ...rest }) => { void _id; return rest; }),
      "입력된 행이 없습니다. 거래일자와 입금 또는 출금 금액을 채워주세요."
    );
  }

  function downloadTemplate() {
    const csv = buildCSV(BANK_TEMPLATE_HEADERS, [BANK_TEMPLATE_SAMPLE]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "통장거래내역_양식.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const [parseError, setParseError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");

  // 파싱된 행 배열 → 미리보기 행으로 변환
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
        const res = parseBankRow(raw);
        if (res.ok) {
          const v = res.value;
          const sign = v.direction === "IN" ? "+" : "−";
          return {
            rowNo: i + 2,
            raw,
            ok: true,
            label: `${v.txn_date} · ${v.counterparty || v.description || "-"} · ${sign}${krw(v.amount)}`,
          };
        }
        return { rowNo: i + 2, raw, ok: false, label: "", error: res.error };
      })
    );
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    let parsed: Record<string, string>[];
    try {
      parsed = await parseSpreadsheetFile(file);
    } catch {
      setRows([]);
      setResult(null);
      setParseError("파일을 읽지 못했습니다. 엑셀(.xlsx)·CSV 파일인지 확인하세요.");
      return;
    }
    preview(parsed, "거래 행을 찾지 못했습니다. 거래일자·입금·출금 열이 있는 파일인지 확인하세요.");
  }

  function onPastePreview() {
    if (!pasteText.trim()) return;
    preview(
      parsePastedText(pasteText),
      "표를 인식하지 못했습니다. 머리글 줄(구분·내용·출금·입금 등)을 포함해서 복사해 붙여넣으세요."
    );
  }

  function confirm() {
    const raws = rows.filter((r) => r.ok).map((r) => r.raw);
    if (raws.length === 0) return;
    startTransition(async () => {
      // 1MB Server Action 한도 회피 — 배치로 순차 전송(앞 배치가 DB에 들어가 중복제거 유지)
      const BATCH = 1000;
      let inserted = 0;
      let skipped = 0;
      let failed = 0;
      let error: string | undefined;
      for (let i = 0; i < raws.length; i += BATCH) {
        const chunk = raws.slice(i, i + BATCH);
        setProgress({ done: i, total: raws.length });
        const res = await bulkImportTransactions(account.id, chunk);
        if (!res.ok) {
          error = res.error;
          failed += chunk.length;
          continue;
        }
        inserted += res.inserted;
        skipped += res.skipped;
        failed += res.failed.length;
      }
      setProgress(null);
      // 업로드한 거래 중 가장 최근 날짜의 달로 이동(빈 달에 머무르지 않게)
      let maxDate = "";
      for (const r of rows) {
        if (!r.ok) continue;
        const p = parseBankRow(r.raw);
        if (p.ok && p.value.txn_date > maxDate) maxDate = p.value.txn_date;
      }
      const gotoMonth = maxDate ? maxDate.slice(0, 7) : undefined;
      setResult({ inserted, skipped, failed, error });
      setRows([]);
      setPasteText("");
      setDrafts([]);
      if (fileRef.current) fileRef.current.value = "";
      onDone(gotoMonth);
    });
  }

  return (
    <Modal title={`${account.alias} · 거래내역 업로드`} onClose={onClose} wide>
      <div className="space-y-4 p-5">
        <div className="rounded-lg bg-indigo-50 p-3 text-xs text-indigo-700">
          은행에서 받은 거래내역 파일(<b>엑셀 .xlsx</b> 또는 CSV)을 그대로 올리세요. <b>거래일자·적요·입금·출금·잔액</b> 열을
          자동 인식합니다. <b>여러 번 올려도 새 거래만 추가</b>되고, 이미 달아둔 거래처·계산서·메모는 그대로 유지됩니다(자동 병합).
        </div>

        {/* 입력 방식 전환 */}
        <div className="inline-flex rounded-lg border border-neutral-300 bg-white p-0.5 text-sm">
          <button
            onClick={() => setInputMode("import")}
            className={`rounded-md px-3 py-1 font-medium ${
              inputMode === "import" ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            📂 파일·붙여넣기
          </button>
          <button
            onClick={switchToManual}
            className={`rounded-md px-3 py-1 font-medium ${
              inputMode === "manual" ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            ▦ 직접 입력(엑셀형)
          </button>
        </div>

        {inputMode === "import" ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={downloadTemplate}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium hover:bg-neutral-50"
              >
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

            {/* 붙여넣기 입력 */}
            <div className="rounded-lg border border-dashed border-neutral-300 p-3">
              <p className="mb-2 text-xs font-medium text-neutral-600">
                📋 또는 통장 화면에서 표를 복사해 그대로 붙여넣기
                <span className="ml-1 font-normal text-neutral-400">(머리글 줄 포함 · 잔액은 자동 제외되어 우리 원장 기준으로 계산)</span>
              </p>
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
                    setTimeout(
                      () => preview(parsed, "표를 인식하지 못했습니다. 머리글 줄을 포함해 복사하세요."),
                      0
                    );
                  }
                }}
                rows={4}
                placeholder={"거래일시\t구분\t내용\t출금\t입금\t잔액\n2024.03.01 21:46\t인터넷\t노우잔\t0\t90,000\t..."}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-xs focus:border-neutral-500 focus:outline-none"
              />
              <button
                onClick={onPastePreview}
                disabled={!pasteText.trim()}
                className="mt-2 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-40"
              >
                붙여넣기 미리보기
              </button>
            </div>
          </>
        ) : (
          /* 직접 입력(엑셀형) */
          <div className="rounded-lg border border-dashed border-neutral-300 p-3">
            <p className="mb-2 text-xs font-medium text-neutral-600">
              ▦ 셀을 클릭해 직접 입력하세요. <b>입금</b> 또는 <b>출금</b> 중 한 칸에 금액을 넣으면 방향이 정해집니다.
              <span className="ml-1 font-normal text-neutral-400">(맨 아래 ‘+ 거래 행 추가’ · 잔액은 우리 원장 기준 자동 계산)</span>
            </p>
            <ExcelGrid
              storageKey="erp_bank_manual_grid"
              columns={DRAFT_COLS}
              rows={drafts}
              rowId={(r) => r._id}
              onEdit={editDraft}
              onAddRow={() => setDrafts((ds) => [...ds, blankDraft()])}
              addLabel="+ 거래 행 추가"
              accent={(r) => !!(r.입금.trim() || r.출금.trim()) && !r.거래일자.trim()}
              empty="‘+ 거래 행 추가’로 입력을 시작하세요."
              pageSize={50}
              searchPlaceholder="🔍 내용·거래처 검색"
            />
            <button
              onClick={previewDrafts}
              className="mt-2 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-50"
            >
              입력한 표 미리보기
            </button>
          </div>
        )}

        {parseError && <p className="text-sm text-rose-600">{parseError}</p>}

        {rows.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-medium text-emerald-700">등록 가능 {validCount}건</span>
              {errorCount > 0 && (
                <button
                  onClick={() => setErrorsOnly((v) => !v)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                    errorsOnly
                      ? "border-rose-400 bg-rose-500 text-white"
                      : "border-rose-300 bg-rose-50 text-rose-600 hover:bg-rose-100"
                  }`}
                >
                  오류 {errorCount}건 {errorsOnly ? "✕ 전체 보기" : "만 보기"}
                </button>
              )}
            </div>
            {(() => {
              const view = errorsOnly ? rows.filter((r) => !r.ok) : rows;
              const MAX = 300;
              const shown = view.slice(0, MAX);
              return (
                <>
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
                        {shown.map((r) => (
                          <tr key={r.rowNo} className={r.ok ? "" : "bg-rose-50"}>
                            <td className="px-3 py-2 text-neutral-400">{r.rowNo}</td>
                            <td className="px-3 py-2">
                              {r.ok ? (
                                <span className="text-emerald-600">✓</span>
                              ) : (
                                <span className="text-rose-600">✕</span>
                              )}
                            </td>
                            <td className={`px-3 py-2 text-xs ${r.ok ? "text-neutral-600" : "font-medium text-rose-600"}`}>
                              {r.ok ? r.label : r.error}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {view.length > MAX && (
                    <p className="text-xs text-neutral-400">
                      {view.length.toLocaleString()}건 중 {MAX}건만 표시 중{errorsOnly ? "" : " — 오류만 보기로 좁혀보세요"}
                    </p>
                  )}
                </>
              );
            })()}
            <button
              onClick={confirm}
              disabled={pending || validCount === 0}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {pending
                ? progress
                  ? `등록 중… ${Math.min(progress.done, progress.total).toLocaleString()}/${progress.total.toLocaleString()}`
                  : "등록 중…"
                : `${validCount.toLocaleString()}건 확정 등록`}
            </button>
          </>
        )}

        {result && (
          <div className="rounded-lg bg-neutral-50 p-4 text-sm">
            <p className="font-medium text-emerald-700">✓ 새로 추가 {result.inserted}건</p>
            {result.skipped > 0 && (
              <p className="mt-1 text-xs text-neutral-500">
                기존 유지 {result.skipped}건 (이미 있던 거래 — 거래처·계산서 그대로 보존)
              </p>
            )}
            {result.failed > 0 && <p className="mt-1 text-xs text-rose-600">{result.failed}건 실패</p>}
            {result.error && <p className="mt-1 break-all text-xs text-rose-600">오류: {result.error}</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------- 거래 → 기존 영수증 연결 ----------
function ReceiptPickerModal({
  txn,
  receipts,
  onClose,
  onSaved,
}: {
  txn: TxnWithBalance;
  receipts: ReceiptOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function pick(receiptId: string | null) {
    startTransition(async () => {
      await linkBankReceipt(txn.id, receiptId);
      onSaved();
    });
  }

  return (
    <Modal title="영수증 증빙 연결" onClose={onClose}>
      <div className="space-y-2 p-4">
        <div className="rounded-lg bg-neutral-50 p-3 text-xs text-neutral-500">
          {txn.txn_date} · {txn.counterparty || txn.description || "-"} ·{" "}
          <span className="text-rose-600">출금 {krw(txn.amount)}</span>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {receipts.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-neutral-400">
              연결할 확정 영수증이 없습니다. 영수증 메뉴에서 먼저 업로드·확정하세요.
            </p>
          ) : (
            receipts.map((r) => (
              <button
                key={r.id}
                onClick={() => pick(r.id)}
                disabled={pending}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-neutral-50 ${
                  txn.receipt_id === r.id ? "bg-indigo-50" : ""
                }`}
              >
                <span>
                  <span className="font-medium">{r.vendor_name ?? "(상호 미확인)"}</span>
                  <span className="ml-2 text-xs text-neutral-400">{r.doc_date ?? ""}</span>
                </span>
                <span className="tabular text-neutral-600">{krw(r.total_amount)}</span>
              </button>
            ))
          )}
        </div>
      </div>
      {txn.receipt_id && (
        <div className="border-t border-neutral-200 px-4 py-3">
          <button onClick={() => pick(null)} disabled={pending} className="text-sm text-rose-500 hover:text-rose-700">
            연결 해제
          </button>
        </div>
      )}
    </Modal>
  );
}

// ---------- 공통 모달 셸 ----------
function Modal({
  title,
  children,
  onClose,
  wide,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <div className={`mt-10 w-full ${wide ? "max-w-3xl" : "max-w-md"} rounded-xl border border-neutral-200 bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, TextInput, NumberInput, SelectInput, EmptyState, Badge } from "@/components/ui";
import {
  PURCHASE_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  AUTO_APPROVE_LIMIT,
  krw,
} from "@/lib/labels";
import type {
  PurchaseRequestRow,
  PurchaseStatus,
  PaymentMethod,
} from "@/lib/supabase/database.types";
import {
  previewLink,
  createPurchaseRequest,
  reviewPurchase,
  markPurchased,
  deletePurchase,
  linkPurchaseReceipt,
  updatePurchase,
  bulkReviewPurchases,
  bulkDeletePurchases,
} from "./actions";
import { downloadXlsx } from "@/lib/sheet";
import { SearchableSelect } from "@/components/searchable-select";
import { setActiveCompany } from "@/app/actions/set-company";

type Partner = { id: string; name: string };
type Employee = { id: string; name: string };
type Account = { id: string; code: string; name: string };
type BankAccount = { id: string; alias: string; bank_name: string | null; company_id: string };

export interface ReceiptCandidate {
  id: string;
  vendor_name: string | null;
  total_amount: number | null;
  doc_date: string | null;
  company_id: string;
  status: string;
}

const payOptions = Object.entries(PAYMENT_METHOD_LABEL) as [PaymentMethod, string][];

type FilterKey = "ALL" | "PENDING" | "APPROVED" | "PURCHASED" | "OTHER";

function statusTone(s: PurchaseStatus): "neutral" | "green" | "red" | "blue" {
  if (s === "PURCHASED") return "green";
  if (s === "APPROVED") return "blue";
  if (s === "REJECTED") return "red";
  return "neutral";
}

function thisMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function PurchasesClient({
  rows,
  receipts,
  partners,
  accounts,
  bankAccounts,
  employees,
  companies,
  activeCompanyId,
}: {
  rows: PurchaseRequestRow[];
  receipts: ReceiptCandidate[];
  partners: Partner[];
  accounts: Account[];
  bankAccounts: BankAccount[];
  employees: Employee[];
  companies: { id: string; name: string }[];
  activeCompanyId: string | null;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [pickerDismissed, setPickerDismissed] = useState(false);
  const [, startBulk] = useTransition();

  const counts = {
    ALL: rows.length,
    PENDING: rows.filter((r) => r.status === "PENDING").length,
    APPROVED: rows.filter((r) => r.status === "APPROVED").length,
    PURCHASED: rows.filter((r) => r.status === "PURCHASED").length,
    OTHER: rows.filter((r) => r.status === "REJECTED" || r.status === "ON_HOLD").length,
  };

  // 요약 통계
  const pendingSum = rows.filter((r) => r.status === "PENDING").reduce((s, r) => s + (r.amount ?? 0), 0);
  const tm = thisMonthStr();
  const monthPurchased = rows.filter((r) => r.status === "PURCHASED" && (r.paid_at ?? "").slice(0, 7) === tm);
  const monthSum = monthPurchased.reduce((s, r) => s + (r.amount ?? 0), 0);
  const noReceiptCount = rows.filter((r) => r.status === "PURCHASED" && !r.receipt_id).length;

  const q = search.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    const tabOk =
      filter === "ALL"
        ? true
        : filter === "OTHER"
          ? r.status === "REJECTED" || r.status === "ON_HOLD"
          : r.status === filter;
    if (!tabOk) return false;
    if (!q) return true;
    return `${r.product_name ?? ""} ${r.requester_name ?? ""} ${r.department ?? ""} ${r.reason ?? ""}`
      .toLowerCase()
      .includes(q);
  });

  const TABS: { key: FilterKey; label: string }[] = [
    { key: "ALL", label: "전체" },
    { key: "PENDING", label: "승인대기" },
    { key: "APPROVED", label: "승인(구매전)" },
    { key: "PURCHASED", label: "구매완료" },
    { key: "OTHER", label: "반려·보류" },
  ];

  // 선택(일괄)
  const filteredIds = filtered.map((r) => r.id);
  const allSel = filteredIds.length > 0 && filteredIds.every((id) => selected.includes(id));
  const toggleAll = () =>
    setSelected(allSel ? selected.filter((id) => !filteredIds.includes(id)) : [...new Set([...selected, ...filteredIds])]);
  const toggleOne = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const clearSel = () => setSelected([]);
  function runBulk(fn: () => Promise<unknown>) {
    startBulk(async () => {
      await fn();
      clearSel();
      refresh();
    });
  }

  function exportXlsx() {
    const accMap = new Map(accounts.map((a) => [a.id, a]));
    const pMap = new Map(partners.map((p) => [p.id, p.name]));
    const data = filtered.map((r) => [
      r.created_at?.slice(0, 10) ?? "",
      PURCHASE_STATUS_LABEL[r.status],
      r.product_name ?? "",
      r.unit_price ?? 0,
      r.quantity,
      r.amount ?? 0,
      r.requester_name ?? "",
      r.partner_id ? pMap.get(r.partner_id) ?? "" : "",
      r.account_id ? (accMap.get(r.account_id) ? `${accMap.get(r.account_id)!.code} ${accMap.get(r.account_id)!.name}` : "") : "",
      r.status === "PURCHASED" ? [r.payer_name, r.payment_method && PAYMENT_METHOD_LABEL[r.payment_method]].filter(Boolean).join(" ") : "",
      r.paid_at?.slice(0, 10) ?? "",
      r.reason ?? "",
    ]);
    downloadXlsx(
      `구매요청_${tm}`,
      ["요청일", "상태", "상품명", "단가", "수량", "합계", "요청자", "거래처", "계정과목", "결제", "결제일", "사유"],
      data
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">구매 요청</h1>
          <p className="mt-1 text-sm text-neutral-500">
            요청 → 승인 → 결제 → 증빙. {krw(AUTO_APPROVE_LIMIT)} 미만은 자동 승인됩니다.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportXlsx}
            disabled={filtered.length === 0}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
          >
            📤 내보내기
          </button>
          <button
            onClick={() => setCreating(true)}
            disabled={!activeCompanyId}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            + 구매 요청
          </button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-neutral-500">승인 대기</p>
          <p className="mt-1 text-lg font-bold tabular text-amber-700">
            {counts.PENDING}건 · {krw(pendingSum)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-neutral-500">이번달 구매</p>
          <p className="mt-1 text-lg font-bold tabular text-neutral-900">
            {monthPurchased.length}건 · {krw(monthSum)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-neutral-500">증빙 미연결(구매완료)</p>
          <p className="mt-1 text-lg font-bold tabular text-rose-600">{noReceiptCount}건</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-neutral-500">전체 요청</p>
          <p className="mt-1 text-lg font-bold tabular text-neutral-900">{counts.ALL}건</p>
        </Card>
      </div>

      {!activeCompanyId && !pickerDismissed && (
        <CompanyPickerModal companies={companies} onPicked={refresh} onClose={() => setPickerDismissed(true)} />
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg bg-neutral-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                filter === t.key ? "bg-white shadow-sm" : "text-neutral-500"
              }`}
            >
              {t.label} {counts[t.key] > 0 && <span className="text-neutral-400">{counts[t.key]}</span>}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 상품명·요청자·부서·사유 검색"
          className="ml-auto w-64 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-neutral-500 focus:outline-none"
        />
      </div>

      {/* 일괄 작업 바 */}
      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm">
          <span className="font-semibold text-indigo-800">{selected.length}건 선택</span>
          <button
            onClick={() => runBulk(() => bulkReviewPurchases(selected, "APPROVED"))}
            className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            승인
          </button>
          <button
            onClick={() => {
              const note = window.prompt("반려 사유") ?? undefined;
              runBulk(() => bulkReviewPurchases(selected, "REJECTED", note));
            }}
            className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-neutral-50"
          >
            반려
          </button>
          <button
            onClick={() => {
              const note = window.prompt("보류 사유") ?? undefined;
              runBulk(() => bulkReviewPurchases(selected, "ON_HOLD", note));
            }}
            className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-neutral-50"
          >
            보류
          </button>
          <button
            onClick={() => {
              if (confirm(`선택한 ${selected.length}건을 삭제할까요?`)) runBulk(() => bulkDeletePurchases(selected));
            }}
            className="rounded-lg border border-rose-300 bg-white px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
          >
            🗑 삭제
          </button>
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-neutral-600">
            <input type="checkbox" checked={allSel} onChange={toggleAll} /> 전체 선택
          </label>
          <button onClick={clearSel} className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs hover:bg-neutral-50">
            해제
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <Card><EmptyState message="해당하는 구매 요청이 없습니다." /></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <PurchaseCard
              key={r.id}
              row={r}
              receipts={receipts}
              partners={partners}
              accounts={accounts}
              bankAccounts={bankAccounts}
              selected={selected.includes(r.id)}
              onToggle={() => toggleOne(r.id)}
              onChanged={refresh}
            />
          ))}
        </div>
      )}

      {creating && activeCompanyId && (
        <RequestModal
          companyId={activeCompanyId}
          partners={partners}
          employees={employees}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// 사업자 미선택 시 강제 선택 모달
function CompanyPickerModal({
  companies,
  onPicked,
  onClose,
}: {
  companies: { id: string; name: string }[];
  onPicked: () => void;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  function pick(id: string) {
    startTransition(async () => {
      await setActiveCompany(id);
      onPicked();
    });
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-neutral-400 hover:text-neutral-700"
          aria-label="닫기"
        >
          ✕
        </button>
        <div className="mb-1 text-center text-2xl">🏢</div>
        <h2 className="text-center text-lg font-bold text-neutral-900">사업자를 선택하세요</h2>
        <p className="mt-1 text-center text-sm text-neutral-500">
          구매 요청은 사업자별로 관리됩니다. 작업할 사업자를 골라주세요.
        </p>
        <div className="mt-4 space-y-2">
          {companies.length === 0 ? (
            <p className="rounded-lg bg-amber-50 p-3 text-center text-sm text-amber-700">
              등록된 사업자가 없습니다. ‘사업자’ 메뉴에서 먼저 등록하세요.
            </p>
          ) : (
            companies.map((c) => (
              <button
                key={c.id}
                onClick={() => pick(c.id)}
                disabled={pending}
                className="flex w-full items-center justify-between rounded-xl border border-neutral-200 px-4 py-3 text-left text-sm font-medium hover:border-neutral-900 hover:bg-neutral-50 disabled:opacity-50"
              >
                <span>{c.name}</span>
                <span className="text-neutral-400">선택 →</span>
              </button>
            ))
          )}
        </div>
        <p className="mt-3 text-center text-xs text-neutral-400">상단의 사업자 선택으로도 바꿀 수 있습니다.</p>
      </div>
    </div>
  );
}

function PurchaseCard({
  row,
  receipts,
  partners,
  accounts,
  bankAccounts,
  selected,
  onToggle,
  onChanged,
}: {
  row: PurchaseRequestRow;
  receipts: ReceiptCandidate[];
  partners: Partner[];
  accounts: Account[];
  bankAccounts: BankAccount[];
  selected: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [payOpen, setPayOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const linked = receipts.find((r) => r.id === row.receipt_id);
  const companyBanks = bankAccounts.filter((b) => b.company_id === row.company_id);

  function review(status: "APPROVED" | "REJECTED" | "ON_HOLD") {
    let note: string | undefined;
    if (status !== "APPROVED") {
      note = window.prompt(status === "REJECTED" ? "반려 사유" : "보류 사유") ?? undefined;
    }
    startTransition(async () => {
      await reviewPurchase(row.id, status, note);
      onChanged();
    });
  }
  function remove() {
    if (!confirm("이 구매 요청을 삭제할까요?")) return;
    startTransition(async () => {
      await deletePurchase(row.id);
      onChanged();
    });
  }

  return (
    <Card className={`p-4 ${selected ? "ring-2 ring-indigo-300" : ""}`}>
      <div className="flex gap-4">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-1 h-4 w-4 shrink-0"
          aria-label="선택"
        />
        {row.product_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.product_image} alt="" className="h-20 w-20 shrink-0 rounded-md border border-neutral-200 object-cover" />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-2xl">🛒</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(row.status)}>{PURCHASE_STATUS_LABEL[row.status]}</Badge>
            <span className="truncate font-medium">{row.product_name ?? "(상품명 없음)"}</span>
            {row.product_url && (
              <a href={row.product_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">
                링크
              </a>
            )}
          </div>
          <div className="mt-1 text-sm text-neutral-600">
            {krw(row.unit_price)} × {row.quantity} = <span className="font-semibold">{krw(row.amount)}</span>
          </div>
          <div className="mt-0.5 text-xs text-neutral-500">
            {row.requester_name || "요청자 미상"}
            {row.reason && ` · ${row.reason}`}
          </div>
          {row.review_note && <div className="mt-1 text-xs text-neutral-400">메모: {row.review_note}</div>}
          <div className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500">
            거래처
            <select
              value={row.partner_id ?? ""}
              disabled={pending}
              onChange={(e) =>
                startTransition(async () => {
                  await updatePurchase(row.id, { partner_id: e.target.value || null });
                  onChanged();
                })
              }
              className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-xs"
            >
              <option value="">미연결</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <span className="ml-2">계정</span>
            <select
              value={row.account_id ?? ""}
              disabled={pending}
              onChange={(e) =>
                startTransition(async () => {
                  await updatePurchase(row.id, { account_id: e.target.value || null });
                  onChanged();
                })
              }
              className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-xs"
            >
              <option value="">미분류</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.code} {a.name}</option>
              ))}
            </select>
          </div>
          {row.status === "PURCHASED" && (
            <div className="mt-1 text-xs text-green-700">
              결제: {row.payer_name ?? "-"}
              {row.payment_method && ` · ${PAYMENT_METHOD_LABEL[row.payment_method]}`}
              {row.paid_at && ` · ${row.paid_at.slice(0, 10)}`}
            </div>
          )}
          {row.receipt_id && (
            <div className="mt-0.5 text-xs text-neutral-500">
              증빙: {linked ? `${linked.vendor_name ?? "영수증"} (${krw(linked.total_amount)})` : "연결됨"}
            </div>
          )}
        </div>

        {/* 작업 */}
        <div className="flex shrink-0 flex-col items-end gap-1.5 text-sm">
          {row.status === "PENDING" && (
            <>
              <button onClick={() => review("APPROVED")} disabled={pending} className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700">승인</button>
              <button onClick={() => review("REJECTED")} disabled={pending} className="rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50">반려</button>
              <button onClick={() => review("ON_HOLD")} disabled={pending} className="rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50">보류</button>
            </>
          )}
          {(row.status === "APPROVED" || row.status === "ON_HOLD") && (
            <button onClick={() => setPayOpen(true)} disabled={pending} className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700">구매완료 처리</button>
          )}
          {row.status === "REJECTED" && (
            <button onClick={() => review("APPROVED")} disabled={pending} className="rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50">재승인</button>
          )}
          {row.status === "PURCHASED" && (
            <button onClick={() => setLinkOpen(true)} disabled={pending} className="rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50">
              {row.receipt_id ? "증빙 변경" : "증빙 연결"}
            </button>
          )}
          <button onClick={remove} disabled={pending} className="text-xs text-red-500 hover:text-red-700">삭제</button>
        </div>
      </div>

      {payOpen && (
        <PayModal
          banks={companyBanks}
          onClose={() => setPayOpen(false)}
          onConfirm={(payer, method, bankId) => {
            startTransition(async () => {
              await markPurchased(row.id, payer, method, bankId);
              setPayOpen(false);
              onChanged();
            });
          }}
        />
      )}

      {linkOpen && (
        <LinkReceiptModal
          current={row.receipt_id}
          candidates={receipts.filter((r) => r.company_id === row.company_id && r.status === "CONFIRMED")}
          onClose={() => setLinkOpen(false)}
          onPick={(receiptId) => {
            startTransition(async () => {
              await linkPurchaseReceipt(row.id, receiptId);
              setLinkOpen(false);
              onChanged();
            });
          }}
        />
      )}
    </Card>
  );
}

function LinkReceiptModal({
  current,
  candidates,
  onClose,
  onPick,
}: {
  current: string | null;
  candidates: ReceiptCandidate[];
  onClose: () => void;
  onPick: (receiptId: string | null) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <div className="mt-16 w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h3 className="font-semibold">증빙(영수증) 연결</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {candidates.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-neutral-400">
              연결할 확정 영수증이 없습니다. 영수증 모듈에서 먼저 업로드·확정하세요.
            </p>
          ) : (
            candidates.map((r) => (
              <button
                key={r.id}
                onClick={() => onPick(r.id)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-neutral-50 ${
                  current === r.id ? "bg-blue-50" : ""
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
        {current && (
          <div className="border-t border-neutral-200 px-5 py-3">
            <button onClick={() => onPick(null)} className="text-sm text-red-500 hover:text-red-700">
              연결 해제
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PayModal({
  banks,
  onClose,
  onConfirm,
}: {
  banks: BankAccount[];
  onClose: () => void;
  onConfirm: (payer: string, method: PaymentMethod | null, bankId: string | null) => void;
}) {
  const [payer, setPayer] = useState("");
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [bankId, setBankId] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <div className="mt-20 w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-5 shadow-xl">
        <h3 className="mb-3 font-semibold">구매완료 처리</h3>
        <p className="mb-3 text-xs text-neutral-500">
          ⚠ 시스템은 직접 결제하지 않습니다. 사람이 결제한 뒤 완료로 기록하세요.
        </p>
        <div className="space-y-3">
          <Field label="결제자"><TextInput value={payer} onChange={(e) => setPayer(e.target.value)} placeholder="이름" /></Field>
          <Field label="결제수단">
            <SelectInput value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              <option value="">선택…</option>
              {payOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </SelectInput>
          </Field>
          <Field label="통장 출금 자동기록 (선택)">
            <SelectInput value={bankId} onChange={(e) => setBankId(e.target.value)}>
              <option value="">기록 안 함</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.alias}
                  {b.bank_name ? ` (${b.bank_name})` : ""}
                </option>
              ))}
            </SelectInput>
          </Field>
          {bankId && (
            <p className="text-xs text-emerald-600">선택한 통장에 출금 거래가 자동 생성됩니다(거래처·계정과목 승계).</p>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">취소</button>
          <button
            onClick={() => onConfirm(payer, (method || null) as PaymentMethod | null, bankId || null)}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            완료 기록
          </button>
        </div>
      </div>
    </div>
  );
}

function RequestModal({
  companyId,
  partners,
  employees,
  onClose,
  onSaved,
}: {
  companyId: string;
  partners: Partner[];
  employees: Employee[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [d, setD] = useState({
    product_url: "",
    product_name: "",
    product_image: "",
    unit_price: "",
    quantity: "1",
    requester_name: "",
    reason: "",
    partner_id: "",
  });

  const num = (s: string) => {
    const n = Number(s.replace(/[^\d.-]/g, ""));
    return s.trim() === "" || !Number.isFinite(n) ? 0 : n;
  };
  const amount = num(d.unit_price) * (num(d.quantity) || 1);

  async function doPreview() {
    if (!d.product_url.trim()) return;
    setPreviewing(true);
    try {
      const p = await previewLink(d.product_url.trim());
      setD((prev) => ({
        ...prev,
        product_name: prev.product_name || p.title || "",
        product_image: p.image || prev.product_image,
        unit_price: prev.unit_price || (p.price ? String(p.price) : ""),
      }));
      if (!p.title && !p.image && !p.price) setError("미리보기를 가져오지 못했습니다. 직접 입력하세요.");
    } finally {
      setPreviewing(false);
    }
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await createPurchaseRequest({
        company_id: companyId,
        requester_name: d.requester_name.trim() || null,
        product_url: d.product_url.trim() || null,
        product_name: d.product_name.trim() || null,
        product_image: d.product_image.trim() || null,
        unit_price: num(d.unit_price) || null,
        quantity: num(d.quantity) || 1,
        amount,
        reason: d.reason.trim() || null,
        partner_id: d.partner_id || null,
      });
      if (res.ok) onSaved();
      else setError(res.error ?? "오류");
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <div className="mt-8 w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="font-semibold">구매 요청</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
        </div>
        <div className="space-y-3 p-5">
          <Field label="상품명"><TextInput value={d.product_name} onChange={(e) => setD({ ...d, product_name: e.target.value })} /></Field>

          <Field label="상품 링크">
            <div className="flex gap-2">
              <TextInput
                className="flex-1"
                value={d.product_url}
                onChange={(e) => setD({ ...d, product_url: e.target.value })}
                placeholder="쿠팡·네이버 등 상품 URL 붙여넣기"
              />
              <button
                type="button"
                onClick={doPreview}
                disabled={previewing || !d.product_url.trim()}
                className="shrink-0 rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
              >
                {previewing ? "불러오는 중…" : "미리보기"}
              </button>
            </div>
          </Field>

          {d.product_image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.product_image} alt="" className="h-24 rounded-md border border-neutral-200 object-cover" />
          )}

          <div className="grid grid-cols-3 gap-3">
            <Field label="단가"><NumberInput value={d.unit_price} onChange={(v) => setD({ ...d, unit_price: v })} /></Field>
            <Field label="수량"><NumberInput value={d.quantity} onChange={(v) => setD({ ...d, quantity: v })} /></Field>
            <Field label="합계"><TextInput value={krw(amount)} readOnly className="bg-neutral-50" /></Field>
          </div>

          <Field label="요청자 (직원 검색·선택)">
            <SearchableSelect
              value={d.requester_name}
              onChange={(v) => setD({ ...d, requester_name: v })}
              options={employees.map((e) => ({ value: e.name, label: e.name }))}
              emptyOption="미지정"
              placeholder="직원 검색·선택"
            />
          </Field>
          <Field label="구매 사유"><TextInput value={d.reason} onChange={(e) => setD({ ...d, reason: e.target.value })} /></Field>
          <Field label="거래처 (선택 — 거래처 상세 원장에 반영)">
            <SelectInput value={d.partner_id} onChange={(e) => setD({ ...d, partner_id: e.target.value })}>
              <option value="">미연결</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </SelectInput>
          </Field>

          {amount > 0 && amount < AUTO_APPROVE_LIMIT && (
            <p className="text-xs text-blue-600">소액({krw(AUTO_APPROVE_LIMIT)} 미만) — 등록 시 자동 승인됩니다.</p>
          )}
        </div>
        {error && <p className="px-5 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">취소</button>
          <button onClick={save} disabled={pending} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50">
            {pending ? "등록 중…" : "요청 등록"}
          </button>
        </div>
      </div>
    </div>
  );
}

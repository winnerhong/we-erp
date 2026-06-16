"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Field, TextInput, SelectInput, EmptyState, Badge } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { TAX_INVOICE_TYPE_LABEL, taxInvoiceStatusLabel, krw } from "@/lib/labels";
import type {
  TaxInvoiceRow,
  TaxInvoiceType,
  TaxInvoiceStatus,
} from "@/lib/supabase/database.types";
import {
  createTaxInvoice,
  updateTaxInvoice,
  setTaxInvoiceStatus,
  setTaxInvoiceSettled,
  deleteTaxInvoice,
} from "./actions";

interface Props {
  rows: TaxInvoiceRow[];
  partners: { id: string; name: string }[];
  linkedIds: string[];
  month: string;
  activeCompanyId: string | null;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function TaxInvoicesClient({ rows, partners, linkedIds, month, activeCompanyId }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<TaxInvoiceType>("SALES");
  const [editing, setEditing] = useState<TaxInvoiceRow | null>(null);
  const [adding, setAdding] = useState(false);

  const partnerName = new Map(partners.map((p) => [p.id, p.name]));
  const linkedSet = new Set(linkedIds);
  const isLinked = (r: TaxInvoiceRow) => linkedSet.has(r.id);
  const isSettled = (r: TaxInvoiceRow) => isLinked(r) || !!r.settled_at;

  const salesVat = rows.filter((r) => r.type === "SALES").reduce((s, r) => s + r.vat_amount, 0);
  const purchaseVat = rows.filter((r) => r.type === "PURCHASE").reduce((s, r) => s + r.vat_amount, 0);
  const payable = salesVat - purchaseVat;

  // 미수금/미지급(이번달 기준) — 정산 안 된 건 합계
  const receivableSum = rows
    .filter((r) => r.type === "SALES" && !isSettled(r))
    .reduce((s, r) => s + r.total_amount, 0);
  const payableSum = rows
    .filter((r) => r.type === "PURCHASE" && !isSettled(r))
    .reduce((s, r) => s + r.total_amount, 0);

  const tabRows = rows.filter((r) => r.type === tab);
  const unsettledCount = tabRows.filter((r) => !isSettled(r)).length;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">세금계산서 · 매입매출</h1>
          <p className="mt-1 text-sm text-neutral-500">
            매출(발행)·매입(수취)과 부가세를 집계하고, 통장 입출금과의 정산(받음/지급)을 관리합니다.
          </p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => router.push(`/tax-invoices?m=${e.target.value}`)}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
        />
      </div>

      <Card className="mb-4 flex flex-wrap items-center justify-between gap-2 border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-700">
        <span>
          💡 거래는 <b>통장원장</b>에서 입력하면 계산서가 자동 생성·정산됩니다. 이 화면은 발행 현황·부가세 집계·미정산 관리용입니다.
        </span>
        <Link
          href="/bank"
          className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 font-medium text-indigo-700 hover:bg-indigo-100"
        >
          통장원장으로 →
        </Link>
      </Card>

      {/* 부가세 + 미수/미지급 요약 */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card className="p-4">
          <p className="text-xs text-neutral-500">매출세액 (낼 돈)</p>
          <p className="mt-1 text-lg font-bold tabular">{krw(salesVat)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-neutral-500">매입세액 (공제)</p>
          <p className="mt-1 text-lg font-bold tabular">{krw(purchaseVat)}</p>
        </Card>
        <Card className={`p-4 ${payable >= 0 ? "bg-red-50" : "bg-green-50"}`}>
          <p className="text-xs text-neutral-500">예상 부가세 {month}</p>
          <p className="mt-1 text-lg font-bold tabular">
            {payable >= 0 ? "납부 " : "환급 "}
            {krw(Math.abs(payable))}
          </p>
        </Card>
        <Card className="bg-amber-50 p-4">
          <p className="text-xs text-amber-700">받을 돈 (미수금)</p>
          <p className="mt-1 text-lg font-bold tabular text-amber-800">{krw(receivableSum)}</p>
        </Card>
        <Card className="bg-sky-50 p-4">
          <p className="text-xs text-sky-700">줄 돈 (미지급)</p>
          <p className="mt-1 text-lg font-bold tabular text-sky-800">{krw(payableSum)}</p>
        </Card>
      </div>

      {/* 탭 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
          {(["SALES", "PURCHASE"] as TaxInvoiceType[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium ${
                tab === t ? "bg-white shadow-sm" : "text-neutral-500"
              }`}
            >
              {TAX_INVOICE_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        <button
          onClick={() => setAdding(true)}
          disabled={!activeCompanyId}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          + {TAX_INVOICE_TYPE_LABEL[tab]} 추가
        </button>
      </div>

      {!activeCompanyId && (
        <Card className="mb-3 border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          추가하려면 상단에서 사업자를 선택하세요. (현재 전체보기)
        </Card>
      )}

      <Card>
        {tabRows.length === 0 ? (
          <EmptyState message={`${month} ${TAX_INVOICE_TYPE_LABEL[tab]} 세금계산서가 없습니다.`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 text-xs text-neutral-500">
                <tr>
                  <th className="px-4 py-3">일자</th>
                  <th className="px-4 py-3">거래처</th>
                  <th className="px-4 py-3 text-right">공급가액</th>
                  <th className="px-4 py-3 text-right">세액</th>
                  <th className="px-4 py-3 text-right">합계</th>
                  <th className="px-4 py-3">상태</th>
                  <th className="px-4 py-3">정산</th>
                  <th className="px-4 py-3 text-right">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {tabRows.map((r) => (
                  <TaxRow
                    key={r.id}
                    row={r}
                    partnerName={r.partner_id ? partnerName.get(r.partner_id) : undefined}
                    linked={isLinked(r)}
                    onEdit={() => setEditing(r)}
                    onChanged={() => router.refresh()}
                  />
                ))}
              </tbody>
              <tfoot className="border-t border-neutral-200 text-sm font-semibold">
                <tr>
                  <td className="px-4 py-3" colSpan={2}>
                    합계 ({tabRows.length}건, 미정산 {unsettledCount})
                  </td>
                  <td className="px-4 py-3 text-right tabular">
                    {krw(tabRows.reduce((s, r) => s + r.supply_amount, 0))}
                  </td>
                  <td className="px-4 py-3 text-right tabular">
                    {krw(tabRows.reduce((s, r) => s + r.vat_amount, 0))}
                  </td>
                  <td className="px-4 py-3 text-right tabular">
                    {krw(tabRows.reduce((s, r) => s + r.total_amount, 0))}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {(adding || editing) && (
        <TaxInvoiceModal
          row={editing}
          type={editing?.type ?? tab}
          companyId={activeCompanyId}
          partners={partners}
          defaultDate={`${month}-01`}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={() => {
            setAdding(false);
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function TaxRow({
  row,
  partnerName,
  linked,
  onEdit,
  onChanged,
}: {
  row: TaxInvoiceRow;
  partnerName?: string;
  linked: boolean;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const settled = linked || !!row.settled_at;
  const isReceivable = row.type === "SALES";
  const overdue = !settled && !!row.due_date && row.due_date < todayStr();

  function toggle() {
    const next: TaxInvoiceStatus = row.status === "DONE" ? "PENDING" : "DONE";
    startTransition(async () => {
      await setTaxInvoiceStatus(row.id, next);
      onChanged();
    });
  }
  function settle() {
    startTransition(async () => {
      await setTaxInvoiceSettled(row.id, todayStr());
      onChanged();
    });
  }
  function unsettle() {
    startTransition(async () => {
      await setTaxInvoiceSettled(row.id, null);
      onChanged();
    });
  }
  function remove() {
    if (!confirm("삭제할까요?")) return;
    startTransition(async () => {
      await deleteTaxInvoice(row.id);
      onChanged();
    });
  }

  const done = row.status === "DONE";
  return (
    <tr>
      <td className="px-4 py-3">{row.doc_date ?? "-"}</td>
      <td className="px-4 py-3">
        {partnerName ?? "-"}
        {row.receipt_id && (
          <span className="ml-2">
            <Badge tone="blue">영수증</Badge>
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular">{krw(row.supply_amount)}</td>
      <td className="px-4 py-3 text-right tabular">{krw(row.vat_amount)}</td>
      <td className="px-4 py-3 text-right tabular font-medium">{krw(row.total_amount)}</td>
      <td className="px-4 py-3">
        <button onClick={toggle} disabled={pending}>
          {done ? (
            <Badge tone="green">{taxInvoiceStatusLabel(row.type, "DONE")}</Badge>
          ) : (
            <Badge tone="red">{taxInvoiceStatusLabel(row.type, "PENDING")}</Badge>
          )}
        </button>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {linked ? (
          <Badge tone="blue">통장연결</Badge>
        ) : row.settled_at ? (
          <button onClick={unsettle} disabled={pending} title="정산 해제">
            <Badge tone="green">정산 {row.settled_at.slice(5)}</Badge>
          </button>
        ) : (
          <button
            onClick={settle}
            disabled={pending}
            className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50"
          >
            {isReceivable ? "받음" : "지급"}
            {overdue && <span className="ml-1 text-rose-600">·연체</span>}
          </button>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <button onClick={onEdit} className="mr-3 text-neutral-600 hover:text-neutral-900">
          수정
        </button>
        <button onClick={remove} disabled={pending} className="text-red-500 hover:text-red-700">
          삭제
        </button>
      </td>
    </tr>
  );
}

function TaxInvoiceModal({
  row,
  type,
  companyId,
  partners,
  defaultDate,
  onClose,
  onSaved,
}: {
  row: TaxInvoiceRow | null;
  type: TaxInvoiceType;
  companyId: string | null;
  partners: { id: string; name: string }[];
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [d, setD] = useState({
    partner_id: row?.partner_id ?? "",
    doc_date: row?.doc_date ?? defaultDate,
    due_date: row?.due_date ?? "",
    supply_amount: row?.supply_amount?.toString() ?? "",
    vat_amount: row?.vat_amount?.toString() ?? "",
    total_amount: row?.total_amount?.toString() ?? "",
    status: row?.status ?? ("PENDING" as TaxInvoiceStatus),
    memo: row?.memo ?? "",
  });
  const [error, setError] = useState<string | null>(null);

  const num = (s: string) => {
    const n = Number(s.replace(/[^\d.-]/g, ""));
    return s.trim() === "" || !Number.isFinite(n) ? 0 : n;
  };

  // 공급가 입력 시 세액(10%)·합계 자동 채움(비워져 있을 때)
  function onSupply(v: string) {
    const supply = num(v);
    const vatEmpty = d.vat_amount.trim() === "";
    const vat = vatEmpty ? Math.round(supply * 0.1) : num(d.vat_amount);
    setD((p) => ({
      ...p,
      supply_amount: v,
      vat_amount: vatEmpty ? String(vat) : p.vat_amount,
      total_amount: String(supply + vat),
    }));
  }

  function save() {
    if (!companyId && !row) {
      setError("사업자를 먼저 선택하세요");
      return;
    }
    const supply = num(d.supply_amount);
    const vat = num(d.vat_amount);
    const value = {
      partner_id: d.partner_id || null,
      doc_date: d.doc_date || null,
      due_date: d.due_date || null,
      supply_amount: supply,
      vat_amount: vat,
      total_amount: num(d.total_amount) || supply + vat,
      status: d.status,
      memo: d.memo.trim() || null,
    };
    startTransition(async () => {
      const res = row
        ? await updateTaxInvoice(row.id, value)
        : await createTaxInvoice({ ...value, company_id: companyId!, type });
      if (res.ok) onSaved();
      else setError(res.error ?? "오류");
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <div className="mt-10 w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="font-semibold">
            {TAX_INVOICE_TYPE_LABEL[type]} 세금계산서 {row ? "수정" : "추가"}
          </h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-3 p-5">
          <div className="col-span-2">
            <Field label="거래처">
              <SearchableSelect
                value={d.partner_id}
                onChange={(v) => setD({ ...d, partner_id: v })}
                options={partners.map((p) => ({ value: p.id, label: p.name }))}
                emptyOption="미지정"
                placeholder="거래처 검색·선택"
              />
            </Field>
          </div>
          <Field label="작성일자"><TextInput type="date" value={d.doc_date} onChange={(e) => setD({ ...d, doc_date: e.target.value })} /></Field>
          <Field label="결제예정일 (미수/미지급 관리)"><TextInput type="date" value={d.due_date} onChange={(e) => setD({ ...d, due_date: e.target.value })} /></Field>
          <Field label="상태">
            <SelectInput value={d.status} onChange={(e) => setD({ ...d, status: e.target.value as TaxInvoiceStatus })}>
              <option value="PENDING">{taxInvoiceStatusLabel(type, "PENDING")}</option>
              <option value="DONE">{taxInvoiceStatusLabel(type, "DONE")}</option>
            </SelectInput>
          </Field>
          <Field label="공급가액"><TextInput inputMode="numeric" value={d.supply_amount} onChange={(e) => onSupply(e.target.value)} /></Field>
          <Field label="세액"><TextInput inputMode="numeric" value={d.vat_amount} onChange={(e) => setD({ ...d, vat_amount: e.target.value })} /></Field>
          <div className="col-span-2">
            <Field label="합계"><TextInput inputMode="numeric" value={d.total_amount} onChange={(e) => setD({ ...d, total_amount: e.target.value })} /></Field>
          </div>
          <div className="col-span-2">
            <Field label="메모"><TextInput value={d.memo} onChange={(e) => setD({ ...d, memo: e.target.value })} /></Field>
          </div>
        </div>
        {error && <p className="px-5 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">취소</button>
          <button onClick={save} disabled={pending} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
            {pending ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

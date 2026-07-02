"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Field, TextInput, SelectInput, Badge, EmptyState } from "@/components/ui";
import { krw } from "@/lib/labels";
import { updateRow } from "@/app/(erp)/actions";
import type { PartnerRow } from "@/lib/supabase/database.types";

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

type Filter = "ALL" | "세금계산서" | "영수증" | "통장" | "구매";
const TABS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "세금계산서", label: "세금계산서" },
  { key: "영수증", label: "영수증" },
  { key: "통장", label: "통장" },
  { key: "구매", label: "구매" },
];

export function PartnerDetailClient({
  partner,
  companies,
  entries,
  receivable,
  payable,
}: {
  partner: PartnerRow;
  companies: { id: string; name: string }[];
  entries: LedgerEntry[];
  receivable: number;
  payable: number;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [editing, setEditing] = useState(false);
  const companyName = companies.find((c) => c.id === partner.company_id)?.name ?? "공용";

  const filtered = useMemo(
    () => (filter === "ALL" ? entries : entries.filter((e) => e.source === filter)),
    [filter, entries]
  );

  const totalIn = filtered.filter((e) => e.direction === "IN").reduce((s, e) => s + e.amount, 0);
  const totalOut = filtered.filter((e) => e.direction === "OUT").reduce((s, e) => s + e.amount, 0);
  const net = totalIn - totalOut;
  const lastDate = filtered[0]?.date || "-";

  const sourceTone = (s: string): "blue" | "neutral" | "green" | "red" =>
    s === "세금계산서" ? "blue" : s === "영수증" ? "neutral" : s === "구매" ? "red" : "green";

  return (
    <div>
      <div className="mb-4">
        <Link href="/partners" className="text-sm text-neutral-500 hover:text-neutral-800">
          ← 거래처 목록
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold text-neutral-900">{partner.name}</h1>
          {partner.category && <Badge tone="blue">{partner.category}</Badge>}
        </div>
      </div>

      {/* 거래처 정보 */}
      <Card className="mb-4 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-700">거래처 정보</h2>
          <button onClick={() => setEditing(true)} className="text-sm text-indigo-600 hover:text-indigo-800">
            ✎ 수정
          </button>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <Info label="사업자번호" value={partner.biz_no} />
          <Info label="담당자" value={partner.contact_name} />
          <Info label="연락처" value={partner.phone} />
          <Info label="이메일" value={partner.email} />
          <Info label="소속" value={companyName} />
          <Info label="메모" value={partner.memo} />
        </dl>
      </Card>

      {/* 정산 현황 — 받을 돈 / 줄 돈 */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Card className={`p-4 ${receivable > 0 ? "bg-rose-50" : ""}`}>
          <p className="text-xs text-neutral-500">받을 돈 (미수금)</p>
          <p className={`mt-1 text-lg font-bold tabular ${receivable > 0 ? "text-rose-700" : "text-neutral-400"}`}>
            {krw(receivable)}
          </p>
        </Card>
        <Card className={`p-4 ${payable > 0 ? "bg-amber-50" : ""}`}>
          <p className="text-xs text-neutral-500">줄 돈 (미지급)</p>
          <p className={`mt-1 text-lg font-bold tabular ${payable > 0 ? "text-amber-700" : "text-neutral-400"}`}>
            {krw(payable)}
          </p>
        </Card>
      </div>

      {/* 거래 합계 (선택한 출처 기준) */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-neutral-500">총 입금</p>
          <p className="mt-1 text-lg font-bold tabular text-emerald-600">+{krw(totalIn)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-neutral-500">총 출금</p>
          <p className="mt-1 text-lg font-bold tabular text-rose-600">−{krw(totalOut)}</p>
        </Card>
        <Card className={`p-4 ${net >= 0 ? "bg-emerald-50" : "bg-rose-50"}`}>
          <p className="text-xs text-neutral-500">순액</p>
          <p className={`mt-1 text-lg font-bold tabular ${net >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {net >= 0 ? "+" : "−"}
            {krw(Math.abs(net))}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-neutral-500">거래 {filtered.length}건 · 최근</p>
          <p className="mt-1 text-lg font-bold tabular text-neutral-700">{lastDate}</p>
        </Card>
      </div>

      {/* 출처 필터 */}
      <div className="mb-3 flex flex-wrap gap-1 rounded-lg bg-neutral-100 p-1">
        {TABS.map((t) => {
          const n = t.key === "ALL" ? entries.length : entries.filter((e) => e.source === t.key).length;
          return (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                filter === t.key ? "bg-white shadow-sm" : "text-neutral-500"
              }`}
            >
              {t.label} <span className="text-neutral-400">{n}</span>
            </button>
          );
        })}
      </div>

      <Card>
        {filtered.length === 0 ? (
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
                {filtered.map((e) => (
                  <tr key={e.id} className={e.pending ? "opacity-60" : ""}>
                    <td className="px-4 py-3 text-neutral-500">{e.date || "-"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={sourceTone(e.source)}>{e.source}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular font-semibold text-emerald-600">
                      {e.direction === "IN" ? `+${krw(e.amount)}` : ""}
                    </td>
                    <td className="px-4 py-3 text-right tabular font-semibold text-rose-600">
                      {e.direction === "OUT" ? `−${krw(e.amount)}` : ""}
                    </td>
                    <td className="px-4 py-3 text-neutral-500">
                      {e.status && (
                        <span className={`mr-2 text-xs ${e.pending ? "text-amber-600" : "text-neutral-400"}`}>
                          {e.status}
                        </span>
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

      {editing && (
        <EditPartnerModal
          partner={partner}
          companies={companies}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-neutral-400">{label}</dt>
      <dd className="text-neutral-800">{value || "-"}</dd>
    </div>
  );
}

function EditPartnerModal({
  partner,
  companies,
  onClose,
  onSaved,
}: {
  partner: PartnerRow;
  companies: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [d, setD] = useState({
    name: partner.name ?? "",
    biz_no: partner.biz_no ?? "",
    contact_name: partner.contact_name ?? "",
    phone: partner.phone ?? "",
    email: partner.email ?? "",
    company_id: partner.company_id ?? "",
    memo: partner.memo ?? "",
  });

  function save() {
    if (!d.name.trim()) {
      setError("상호는 필수입니다");
      return;
    }
    startTransition(async () => {
      const res = await updateRow("partners", partner.id, {
        name: d.name.trim(),
        biz_no: d.biz_no.trim() || null,
        contact_name: d.contact_name.trim() || null,
        phone: d.phone.trim() || null,
        email: d.email.trim() || null,
        company_id: d.company_id || null,
        memo: d.memo.trim() || null,
      });
      if (res.ok) onSaved();
      else setError(res.error ?? "오류");
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <div className="mt-12 w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="font-semibold">거래처 정보 수정</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-3 p-5">
          <div className="col-span-2">
            <Field label="상호" required>
              <TextInput value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
            </Field>
          </div>
          <Field label="사업자번호">
            <TextInput value={d.biz_no} onChange={(e) => setD({ ...d, biz_no: e.target.value })} />
          </Field>
          <Field label="담당자">
            <TextInput value={d.contact_name} onChange={(e) => setD({ ...d, contact_name: e.target.value })} />
          </Field>
          <Field label="연락처">
            <TextInput value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} />
          </Field>
          <Field label="이메일">
            <TextInput value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} />
          </Field>
          <div className="col-span-2">
            <Field label="소속 사업자 (미선택=공용)">
              <SelectInput value={d.company_id} onChange={(e) => setD({ ...d, company_id: e.target.value })}>
                <option value="">공용</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </SelectInput>
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
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            {pending ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState } from "@/components/ui";
import { krw } from "@/lib/labels";
import { setInvoiceSettled } from "@/app/(erp)/trade/actions";
import type { AgingSummary } from "@/lib/aging";

export interface DueItem {
  id: string;
  type: "SALES" | "PURCHASE";
  company: string;
  partner: string;
  date: string;
  due: string | null;
  amount: number;
  overdue: boolean;
  manual: boolean;
}

export interface OverdueRow {
  partner: string;
  company: string;
  type: "SALES" | "PURCHASE";
  amount: number;
  days: number;
  count: number;
}

const today = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};
const dPlus = (due: string | null) => {
  if (!due) return 0;
  return Math.round((new Date(today() + "T00:00:00").getTime() - new Date(due + "T00:00:00").getTime()) / 86400000);
};

export function FinanceClient({
  receivables,
  payables,
  settledManual,
  month,
  aging,
  topOverdue,
}: {
  receivables: DueItem[];
  payables: DueItem[];
  settledManual: DueItem[];
  month: string;
  aging: AgingSummary;
  topOverdue: OverdueRow[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"recv" | "pay">("recv");
  const [showDone, setShowDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const recvTotal = receivables.reduce((s, r) => s + r.amount, 0);
  const payTotal = payables.reduce((s, r) => s + r.amount, 0);

  function go(m: string) {
    router.push(`/finance?m=${m}`);
  }
  function shift(delta: number) {
    const [y, mo] = month.split("-").map(Number);
    const d = new Date(y, mo - 1 + delta, 1);
    go(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  function settle(id: string, on: boolean) {
    startTransition(async () => {
      await setInvoiceSettled(id, on);
      router.refresh();
    });
  }

  const isRecv = tab === "recv";
  const list = isRecv ? receivables : payables;
  const doneLabel = isRecv ? "받음" : "지급";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">받을돈·줄돈</h1>
          <p className="mt-1 text-sm text-neutral-500">목록에서 <b>받음/지급</b>을 누르면 바로 정산됩니다. (전 사업자 · {month} 발생분)</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-1)} className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50">◀</button>
          <input type="month" value={month} onChange={(e) => e.target.value && go(e.target.value)} className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm" />
          <button onClick={() => shift(1)} className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50">▶</button>
        </div>
      </div>

      {/* 탭(큰 버튼) */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <button
          onClick={() => setTab("recv")}
          className={`rounded-xl border p-4 text-left transition-colors ${isRecv ? "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-300" : "border-neutral-200 bg-white hover:bg-neutral-50"}`}
        >
          <p className="text-xs text-neutral-500">받을 돈 (미수) · {receivables.length}건</p>
          <p className="mt-1 text-xl font-bold tabular text-emerald-700">+{krw(recvTotal)}</p>
        </button>
        <button
          onClick={() => setTab("pay")}
          className={`rounded-xl border p-4 text-left transition-colors ${!isRecv ? "border-rose-400 bg-rose-50 ring-1 ring-rose-300" : "border-neutral-200 bg-white hover:bg-neutral-50"}`}
        >
          <p className="text-xs text-neutral-500">줄 돈 (미지급) · {payables.length}건</p>
          <p className="mt-1 text-xl font-bold tabular text-rose-700">−{krw(payTotal)}</p>
        </button>
      </div>

      {/* 연령분석(Aging) — 전체 미결제, 월 무관 */}
      <section className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-neutral-800">📊 연령분석 · 전체 미결제</h2>
          <span className="text-xs text-neutral-400">결제예정일 기준(없으면 발행일) · 전 사업자</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-right text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs text-neutral-500">
                <th className="py-2 pr-2 text-left font-medium">구분</th>
                {aging.buckets.map((b) => (
                  <th key={b.key} className={`px-2 py-2 font-medium ${b.key === "over90" ? "text-rose-600" : ""}`}>{b.label}</th>
                ))}
                <th className="px-2 py-2 font-semibold">합계</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-neutral-50">
                <td className="py-2.5 pr-2 text-left font-medium text-emerald-700">받을 돈</td>
                {aging.buckets.map((b) => (
                  <td key={b.key} className={`px-2 py-2.5 tabular-nums ${b.key !== "notdue" && b.recv > 0 ? "font-medium text-rose-600" : "text-neutral-600"}`}>
                    {b.recv ? krw(b.recv) : "—"}
                  </td>
                ))}
                <td className="px-2 py-2.5 font-bold tabular-nums text-emerald-700">{krw(aging.recvTotal)}</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-2 text-left font-medium text-rose-700">줄 돈</td>
                {aging.buckets.map((b) => (
                  <td key={b.key} className={`px-2 py-2.5 tabular-nums ${b.key !== "notdue" && b.pay > 0 ? "font-medium text-rose-600" : "text-neutral-600"}`}>
                    {b.pay ? krw(b.pay) : "—"}
                  </td>
                ))}
                <td className="px-2 py-2.5 font-bold tabular-nums text-rose-700">{krw(aging.payTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-500">
          <span>연체 받을돈 <b className="tabular-nums text-rose-600">{krw(aging.recvOverdue)}</b></span>
          <span>연체 줄돈 <b className="tabular-nums text-rose-600">{krw(aging.payOverdue)}</b></span>
          <span className="text-neutral-400">미결제 {aging.recvCount + aging.payCount}건</span>
        </div>
        {topOverdue.length > 0 && (
          <div className="mt-3 border-t border-neutral-100 pt-3">
            <p className="mb-1.5 text-xs font-semibold text-neutral-500">연체 상위</p>
            <ul className="space-y-1">
              {topOverdue.map((o, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${o.type === "SALES" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                    {o.type === "SALES" ? "받을" : "줄"}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <b className="text-neutral-800">{o.partner}</b> <span className="text-neutral-400">· {o.company}</span>
                    {o.count > 1 && <span className="text-neutral-400"> ({o.count}건)</span>}
                  </span>
                  <span className="shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">D+{o.days}</span>
                  <span className="shrink-0 tabular-nums font-semibold text-neutral-700">{krw(o.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <Card>
        {list.length === 0 ? (
          <EmptyState message={`${isRecv ? "받을 돈" : "줄 돈"}이 모두 정산됐거나 없습니다. 👍`} />
        ) : (
          <ul className="divide-y divide-neutral-100">
            {list.map((it) => (
              <li key={it.id} className={`flex items-center gap-3 px-4 py-3 ${it.overdue ? "bg-rose-50/40" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">{it.company}</span>
                    <span className="font-medium text-neutral-800">{it.partner}</span>
                    {it.overdue && (
                      <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">연체 D+{dPlus(it.due)}</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-400">
                    {it.date}{it.due && ` · 결제예정 ${it.due}`}
                  </div>
                </div>
                <span className={`shrink-0 tabular font-semibold ${isRecv ? "text-emerald-600" : "text-rose-600"}`}>
                  {isRecv ? "+" : "−"}{krw(it.amount)}
                </span>
                <button
                  onClick={() => settle(it.id, true)}
                  disabled={pending}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50 ${isRecv ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}
                >
                  {doneLabel} ✓
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 되돌리기 */}
      {settledManual.length > 0 && (
        <div className="mt-4">
          <button onClick={() => setShowDone((v) => !v)} className="text-sm text-neutral-500 hover:text-neutral-800">
            {showDone ? "▾" : "▸"} 정산 완료 {settledManual.length}건 (되돌리기)
          </button>
          {showDone && (
            <Card className="mt-2">
              <ul className="divide-y divide-neutral-100">
                {settledManual.map((it) => (
                  <li key={it.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">{it.company}</span>
                    <span className="flex-1 truncate text-neutral-500 line-through">
                      {it.partner} · {it.type === "SALES" ? "받을" : "줄"} {krw(it.amount)}
                    </span>
                    <button onClick={() => settle(it.id, false)} disabled={pending} className="shrink-0 text-neutral-500 hover:text-neutral-800">
                      되돌리기
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <p className="mt-3 text-xs text-neutral-400">
        ※ ‘받음/지급 ✓’는 빠른 수기 정산입니다. 통장 거래와 정확히 매칭하려면 매입/매출 화면의 정산 기능을 쓰세요(둘 다 ‘정산완료’로 반영).
      </p>
    </div>
  );
}

"use client";

import { krw } from "@/lib/labels";

interface Party {
  name: string;
  biz_no: string | null;
  ceo: string | null;
  address: string | null;
  biz_type: string | null;
  biz_item: string | null;
}
export interface StmtData {
  title: string;
  period: string | null;
  subtotal: number;
  tax: number;
  total: number;
  supplier: Party | null;
  buyer: Party | null;
  items: { date: string; title: string; qty: number; unit: number; amount: number }[];
}

export function StatementView({ data }: { data: StmtData }) {
  return (
    <div className="min-h-screen bg-neutral-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto max-w-[800px] px-4 print:max-w-none print:px-0">
        <div className="mb-4 flex justify-end gap-2 print:hidden">
          <button onClick={() => window.print()} className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-700">🖨 인쇄 / PDF 저장</button>
        </div>

        <div className="bg-white p-10 shadow-sm print:p-0 print:shadow-none">
          <h1 className="mb-1 text-center text-2xl font-bold tracking-[0.3em] text-neutral-900">거 래 명 세 서</h1>
          <p className="mb-6 text-center text-sm text-neutral-500">{data.title}{data.period ? ` · ${data.period}` : ""}</p>

          {/* 공급자 / 공급받는자 */}
          <div className="mb-5 grid grid-cols-2 gap-3 text-sm">
            <PartyBox label="공급받는 자" p={data.buyer} />
            <PartyBox label="공급자" p={data.supplier} />
          </div>

          {/* 합계 강조 */}
          <div className="mb-4 flex items-center justify-between rounded-lg bg-neutral-900 px-5 py-3 text-white">
            <span className="text-sm">합계금액 (공급가액 + 세액)</span>
            <span className="text-xl font-bold tabular-nums">{krw(data.total)}</span>
          </div>

          {/* 품목 표 */}
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-y-2 border-neutral-800 bg-neutral-50 text-xs text-neutral-600">
                <th className="border-r border-neutral-200 px-2 py-2">일자</th>
                <th className="border-r border-neutral-200 px-2 py-2 text-left">품목·내용</th>
                <th className="border-r border-neutral-200 px-2 py-2 text-right">수량</th>
                <th className="border-r border-neutral-200 px-2 py-2 text-right">단가</th>
                <th className="px-2 py-2 text-right">공급가액</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it, i) => (
                <tr key={i} className="border-b border-neutral-100">
                  <td className="border-r border-neutral-100 px-2 py-1.5 text-center tabular-nums text-neutral-600">{it.date.slice(2)}</td>
                  <td className="border-r border-neutral-100 px-2 py-1.5">{it.title}</td>
                  <td className="border-r border-neutral-100 px-2 py-1.5 text-right tabular-nums">{it.qty.toLocaleString()}</td>
                  <td className="border-r border-neutral-100 px-2 py-1.5 text-right tabular-nums text-neutral-500">{krw(it.unit)}</td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">{krw(it.amount)}</td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-neutral-400">품목이 없습니다.</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-neutral-800 text-sm">
                <td colSpan={4} className="px-2 py-2 text-right font-medium text-neutral-600">공급가액</td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums">{krw(data.subtotal)}</td>
              </tr>
              <tr className="text-sm">
                <td colSpan={4} className="px-2 py-1 text-right font-medium text-neutral-600">부가세</td>
                <td className="px-2 py-1 text-right tabular-nums">{krw(data.tax)}</td>
              </tr>
              <tr className="border-t border-neutral-300 text-sm">
                <td colSpan={4} className="px-2 py-2 text-right font-bold text-neutral-800">합계</td>
                <td className="px-2 py-2 text-right text-base font-bold tabular-nums">{krw(data.total)}</td>
              </tr>
            </tfoot>
          </table>

          <p className="mt-6 text-center text-xs text-neutral-400">본 거래명세서는 위너 통합 ERP에서 발행되었습니다.</p>
        </div>
      </div>
    </div>
  );
}

function PartyBox({ label, p }: { label: string; p: Party | null }) {
  return (
    <div className="rounded-lg border border-neutral-200">
      <div className="border-b border-neutral-100 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-500">{label}</div>
      <dl className="space-y-1 px-3 py-2 text-xs">
        <Row k="상호" v={p?.name ?? "-"} strong />
        <Row k="사업자번호" v={p?.biz_no ?? "-"} />
        <Row k="대표자" v={p?.ceo ?? "-"} />
        <Row k="주소" v={p?.address ?? "-"} />
        <Row k="업태/종목" v={[p?.biz_type, p?.biz_item].filter(Boolean).join(" / ") || "-"} />
      </dl>
    </div>
  );
}
function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-neutral-400">{k}</dt>
      <dd className={`min-w-0 flex-1 truncate ${strong ? "font-bold text-neutral-800" : "text-neutral-700"}`}>{v}</dd>
    </div>
  );
}

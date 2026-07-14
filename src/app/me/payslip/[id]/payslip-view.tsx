"use client";

import { krw } from "@/lib/labels";

export interface PayslipData {
  companyName: string | null;
  employeeName: string;
  department: string | null;
  yearMonth: string;
  basePay: number;
  allowance: number;
  nontaxAllowance: number;
  nontaxItems: Record<string, number> | null;
  incomeTax: number;
  insurance: number; // 4대보험 근로자부담 합계
  otherDeduction: number;
  netPay: number;
}

export function PayslipView({ d }: { d: PayslipData }) {
  const gross = d.basePay + d.allowance + d.nontaxAllowance;
  const deductions = d.incomeTax + d.insurance + d.otherDeduction;
  const payItems = [
    { label: "기본급", value: d.basePay },
    { label: "과세 수당", value: d.allowance },
    { label: "비과세 수당", value: d.nontaxAllowance },
  ].filter((x) => x.value);
  const dedItems = [
    { label: "소득세·지방소득세", value: d.incomeTax },
    { label: "4대보험 (국민연금·건강·요양·고용)", value: d.insurance },
    { label: "기타 공제", value: d.otherDeduction },
  ].filter((x) => x.value);

  return (
    <div className="min-h-screen bg-neutral-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto max-w-[700px] px-4 print:max-w-none print:px-0">
        <div className="mb-4 flex justify-end print:hidden">
          <button onClick={() => window.print()} className="rounded-lg bg-indigo-500 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-400">🖨 인쇄 / PDF 저장</button>
        </div>

        <div className="bg-white p-10 shadow-sm print:p-0 print:shadow-none">
          <h1 className="mb-1 text-center text-2xl font-bold tracking-[0.3em] text-neutral-900">급 여 명 세 서</h1>
          <p className="mb-6 text-center text-sm text-neutral-500">{d.yearMonth} · {d.companyName ?? ""}</p>

          <div className="mb-5 grid grid-cols-2 gap-3 text-sm">
            <Info k="성명" v={d.employeeName} />
            <Info k="부서" v={d.department ?? "-"} />
            <Info k="귀속월" v={d.yearMonth} />
            <Info k="지급일" v="—" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Block title="지급 내역" items={payItems} total={gross} totalLabel="지급 합계" />
            <Block title="공제 내역" items={dedItems} total={deductions} totalLabel="공제 합계" negative />
          </div>

          {d.nontaxItems && Object.keys(d.nontaxItems).length > 0 && (
            <p className="mt-3 text-xs text-neutral-400">
              비과세 항목: {Object.entries(d.nontaxItems).map(([k, v]) => `${k} ${krw(v)}`).join(" · ")}
            </p>
          )}

          <div className="mt-4 flex items-center justify-between rounded-lg bg-indigo-500 px-5 py-4 text-white">
            <span className="text-sm">실 수령액 (지급 − 공제)</span>
            <span className="text-2xl font-bold tabular-nums">{krw(d.netPay)}</span>
          </div>

          <p className="mt-6 text-center text-xs text-neutral-400">
            공제액(소득세·4대보험)은 추정치가 포함될 수 있어 실제 신고·정산과 차이날 수 있습니다. · 위너 통합 ERP 발행
          </p>
        </div>
      </div>
    </div>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2 rounded-lg border border-neutral-200 px-3 py-2">
      <span className="w-16 shrink-0 text-neutral-400">{k}</span>
      <span className="min-w-0 flex-1 truncate font-medium text-neutral-800">{v}</span>
    </div>
  );
}

function Block({ title, items, total, totalLabel, negative }: { title: string; items: { label: string; value: number }[]; total: number; totalLabel: string; negative?: boolean }) {
  return (
    <div className="rounded-lg border border-neutral-200">
      <div className="border-b border-neutral-100 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-500">{title}</div>
      <dl className="divide-y divide-neutral-50 px-3 text-sm">
        {items.length === 0 ? (
          <div className="py-2 text-xs text-neutral-400">항목 없음</div>
        ) : (
          items.map((it) => (
            <div key={it.label} className="flex items-center justify-between py-1.5">
              <dt className="text-neutral-600">{it.label}</dt>
              <dd className="tabular-nums text-neutral-800">{krw(it.value)}</dd>
            </div>
          ))
        )}
      </dl>
      <div className="flex items-center justify-between border-t-2 border-neutral-800 px-3 py-2 text-sm font-bold">
        <span>{totalLabel}</span>
        <span className={`tabular-nums ${negative ? "text-rose-600" : "text-neutral-900"}`}>{negative ? "−" : ""}{krw(total)}</span>
      </div>
    </div>
  );
}

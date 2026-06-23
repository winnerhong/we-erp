"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { ExcelGrid, type GridCol } from "@/components/excel-grid";
import { OptionsManager } from "@/components/options-manager";
import { krw } from "@/lib/labels";
import type { DailyRecordRow, FieldOptionRow } from "@/lib/supabase/database.types";
import { addDailyRecord, updateDailyRecord, bulkDeleteDailyRecords } from "./actions";

/** 결제수단(고정값) — 매출/지출 공통. */
const PAYMENT_METHODS = [
  { value: "CASH", label: "현금" },
  { value: "CARD", label: "카드" },
  { value: "TRANSFER", label: "계좌이체" },
  { value: "OTHER", label: "기타" },
];
const METHOD_LABEL: Record<string, string> = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label]));

function shiftDate(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
function dayLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const wd = ["일", "월", "화", "수", "목", "금", "토"][new Date(y, m - 1, d).getDay()];
  return `${y}년 ${m}월 ${d}일 (${wd})`;
}

interface Props {
  date: string;
  isAll: boolean;
  companyId: string | null;
  companyName: string | null;
  options: FieldOptionRow[];
  rows: DailyRecordRow[];
  monthNet: Record<string, number>;
}

export function SalesClient({ date, isAll, companyId, companyName, options, rows, monthNet }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [mgrOpen, setMgrOpen] = useState(false);
  const go = (d: string) => router.push(`/sales?d=${d}`);
  const refresh = () => router.refresh();

  const salesOpts = options.filter((o) => o.category === "sales_category" && o.is_active).map((o) => ({ value: o.value, label: o.label }));
  const expenseOpts = options.filter((o) => o.category === "expense_category" && o.is_active).map((o) => ({ value: o.value, label: o.label }));
  const catLabel = Object.fromEntries(options.map((o) => [o.value, o.label]));

  const sales = rows.filter((r) => r.kind === "SALES");
  const expenses = rows.filter((r) => r.kind === "EXPENSE");
  const sum = (rs: DailyRecordRow[]) => rs.reduce((s, r) => s + (r.amount ?? 0), 0);
  const salesTotal = sum(sales);
  const expenseTotal = sum(expenses);
  const net = salesTotal - expenseTotal;

  // 매출 결제수단별 분해
  const byMethod = (method: string) => sales.filter((r) => (r.payment_method ?? "CASH") === method).reduce((s, r) => s + (r.amount ?? 0), 0);

  function handleEdit(id: string, key: string, raw: string) {
    startTransition(async () => {
      await updateDailyRecord(id, { [key]: raw });
      refresh();
    });
  }
  function handleAdd(kind: "SALES" | "EXPENSE") {
    if (!companyId) return;
    startTransition(async () => {
      await addDailyRecord({
        company_id: companyId,
        record_date: date,
        kind,
        category: kind === "SALES" ? salesOpts[0]?.value ?? null : expenseOpts[0]?.value ?? null,
        payment_method: "CASH",
        amount: 0,
      });
      refresh();
    });
  }

  const columns = (catOpts: { value: string; label: string }[]): GridCol<DailyRecordRow>[] => [
    {
      key: "category",
      label: "유형",
      width: 120,
      edit: "select",
      options: catOpts,
      text: (r) => (r.category ? catLabel[r.category] ?? r.category : ""),
    },
    {
      key: "payment_method",
      label: "결제수단",
      width: 100,
      edit: "select",
      options: PAYMENT_METHODS,
      text: (r) => (r.payment_method ? METHOD_LABEL[r.payment_method] ?? r.payment_method : ""),
    },
    {
      key: "amount",
      label: "금액",
      width: 120,
      align: "right",
      edit: "number",
      text: (r) => (r.amount != null ? r.amount.toLocaleString() : ""),
    },
    {
      key: "qty",
      label: "건수",
      width: 70,
      align: "right",
      edit: "number",
      text: (r) => (r.qty != null ? String(r.qty) : ""),
    },
    { key: "memo", label: "메모", width: 220, edit: "text", text: (r) => r.memo ?? "" },
  ];

  const bulkDelete = (ids: string[], clear: () => void) => (
    <button
      onClick={() => {
        if (!confirm(`선택한 ${ids.length}건을 삭제할까요?`)) return;
        startTransition(async () => {
          await bulkDeleteDailyRecords(ids);
          clear();
          refresh();
        });
      }}
      className="rounded-lg border border-rose-300 bg-white px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
    >
      🗑 삭제
    </button>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">
            일매출 {companyName && <span className="ml-1 text-base font-semibold text-indigo-600">· {companyName}</span>}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">사업자별로 오늘의 매출·지출을 직접 기록합니다.</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setMgrOpen(true)} className="mr-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
            ⚙ 항목
          </button>
          <button onClick={() => go(shiftDate(date, -1))} className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50">◀</button>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && go(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          />
          <button onClick={() => go(shiftDate(date, 1))} className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50">▶</button>
        </div>
      </div>

      {isAll ? (
        <Card className="px-5 py-12 text-center text-sm text-neutral-500">
          상단 <b>사업자</b> 선택에서 특정 사업자를 고르면 일매출을 입력·조회할 수 있습니다.
          <br />
          <span className="text-xs text-neutral-400">일매출은 사업자별로 따로 기록됩니다.</span>
        </Card>
      ) : (
        <>
          <p className="mb-3 text-sm font-medium text-neutral-700">{dayLabel(date)}</p>

          {/* 요약 */}
          <div className="mb-2 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Card className="p-4">
              <p className="text-xs text-neutral-500">매출 합계</p>
              <p className="mt-1 text-lg font-bold tabular text-emerald-600">+{krw(salesTotal)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-neutral-500">지출 합계</p>
              <p className="mt-1 text-lg font-bold tabular text-rose-600">−{krw(expenseTotal)}</p>
            </Card>
            <Card className={`p-4 ${net >= 0 ? "bg-emerald-50" : "bg-rose-50"}`}>
              <p className="text-xs text-neutral-500">순익 (매출−지출)</p>
              <p className={`mt-1 text-lg font-bold tabular ${net >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                {net >= 0 ? "+" : "−"}
                {krw(Math.abs(net))}
              </p>
            </Card>
          </div>

          {/* 매출 결제수단별 분해 */}
          <Card className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 bg-neutral-900 p-4 text-sm text-white">
            <span className="text-neutral-300">💳 매출 결제수단</span>
            {PAYMENT_METHODS.map((m) => (
              <span key={m.value}>
                {m.label} <span className="font-semibold text-emerald-300">{krw(byMethod(m.value))}</span>
              </span>
            ))}
          </Card>

          {/* 입력 그리드 */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold text-neutral-800">📈 매출 <span className="text-xs font-normal text-neutral-400">{sales.length}건</span></h2>
                <span className="text-sm font-bold tabular text-emerald-600">+{krw(salesTotal)}</span>
              </div>
              <ExcelGrid
                storageKey="sales-grid"
                columns={columns(salesOpts)}
                rows={sales}
                rowId={(r) => r.id}
                onEdit={handleEdit}
                onAddRow={() => handleAdd("SALES")}
                addLabel="+ 매출 추가"
                selectable
                renderBulk={bulkDelete}
                searchPlaceholder="매출 검색 (유형·메모·금액)"
                empty="오늘 매출이 없습니다 · 아래 + 매출 추가"
                accent={(r) => !r.amount}
              />
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold text-neutral-800">📉 지출 <span className="text-xs font-normal text-neutral-400">{expenses.length}건</span></h2>
                <span className="text-sm font-bold tabular text-rose-600">−{krw(expenseTotal)}</span>
              </div>
              <ExcelGrid
                storageKey="expense-grid"
                columns={columns(expenseOpts)}
                rows={expenses}
                rowId={(r) => r.id}
                onEdit={handleEdit}
                onAddRow={() => handleAdd("EXPENSE")}
                addLabel="+ 지출 추가"
                selectable
                renderBulk={bulkDelete}
                searchPlaceholder="지출 검색 (유형·메모·금액)"
                empty="오늘 지출이 없습니다 · 아래 + 지출 추가"
                accent={(r) => !r.amount}
              />
            </section>
          </div>

          {/* 월간 캘린더 — 입력 항목 아래 */}
          <div className="mt-6">
            <MonthCalendar date={date} monthNet={monthNet} onPick={go} />
          </div>
        </>
      )}

      {mgrOpen && (
        <OptionsManager
          options={options}
          cats={[
            { key: "sales_category", title: "매출유형", hint: "입장료·식음료·강습료·물품판매 등" },
            { key: "expense_category", title: "지출유형", hint: "식자재·소모품·인건비·임대료 등" },
          ]}
          onClose={() => {
            setMgrOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

/** 부호 + 원금액 그대로(천단위 콤마). 예: 75000 → +75,000 */
function signedWon(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n).toLocaleString("ko-KR")}`;
}

function MonthCalendar({ date, monthNet, onPick }: { date: string; monthNet: Record<string, number>; onPick: (d: string) => void }) {
  const [y, m] = date.split("-").map(Number);
  const firstWeekday = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const prevMonth = new Date(y, m - 2, 1).toISOString().slice(0, 7) + "-01";
  const nextMonth = new Date(y, m, 1).toISOString().slice(0, 7) + "-01";

  const cells: (string | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${date.slice(0, 7)}-${String(d).padStart(2, "0")}`);

  const cellTone = (n: number | undefined) => {
    if (!n) return "bg-white text-neutral-300";
    return n > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700";
  };

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <button onClick={() => onPick(prevMonth)} className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100">◀</button>
        <span className="text-sm font-semibold text-neutral-700">{y}년 {m}월</span>
        <button onClick={() => onPick(nextMonth)} className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100">▶</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-neutral-400">
        {["일", "월", "화", "수", "목", "금", "토"].map((w) => (
          <div key={w} className="py-1">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cd, idx) => {
          if (!cd) return <div key={`e${idx}`} />;
          const day = Number(cd.slice(8));
          const n = monthNet[cd];
          const selected = cd === date;
          return (
            <button
              key={cd}
              onClick={() => onPick(cd)}
              className={`flex h-14 flex-col items-start rounded-md border p-1 text-left transition-colors ${cellTone(n)} ${
                selected ? "border-neutral-900 ring-1 ring-neutral-900" : "border-neutral-100 hover:border-neutral-300"
              }`}
            >
              <span className={`text-[11px] ${selected ? "font-bold text-neutral-900" : "text-neutral-400"}`}>{day}</span>
              {n ? <span className="mt-auto w-full truncate text-[10px] font-semibold tabular">{signedWon(n)}</span> : null}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-neutral-400">날짜 클릭 시 그날로 이동 · 색: 흑자(초록)/적자(빨강), 금액=순익(매출−지출)</p>
    </Card>
  );
}

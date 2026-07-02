"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, EmptyState } from "@/components/ui";
import { krw } from "@/lib/labels";

export interface DayItem {
  id: string;
  title: string;
  amount: number;
  pending: boolean;
  tag?: string;
  href?: string;
}

interface Props {
  date: string;
  sales: DayItem[];
  purchases: DayItem[];
  buys: DayItem[];
  bankIn: number;
  bankOut: number;
  monthNet: Record<string, number>;
}

const sum = (items: DayItem[]) => items.reduce((s, i) => s + i.amount, 0);

function shiftDate(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function dayLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const wd = ["일", "월", "화", "수", "목", "금", "토"][new Date(y, m - 1, d).getDay()];
  return `${y}년 ${m}월 ${d}일 (${wd})`;
}

export function DailyClient({ date, sales, purchases, buys, bankIn, bankOut, monthNet }: Props) {
  const router = useRouter();
  const go = (d: string) => router.push(`/daily?d=${d}`);

  const salesTotal = sum(sales);
  const purchaseTotal = sum(purchases);
  const buyTotal = sum(buys);
  const net = salesTotal - purchaseTotal - buyTotal;

  const pendingCount = [...sales, ...purchases, ...buys].filter((i) => i.pending).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">일일결산</h1>
          <p className="mt-1 text-sm text-neutral-500">하루의 매출·매입·구매를 모아 순현금흐름을 봅니다.</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => go(shiftDate(date, -1))}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            ◀
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && go(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          />
          <button
            onClick={() => go(shiftDate(date, 1))}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            ▶
          </button>
        </div>
      </div>

      <MonthCalendar date={date} monthNet={monthNet} onPick={go} />

      <p className="mb-3 mt-4 text-sm font-medium text-neutral-700">{dayLabel(date)}</p>

      {/* 요약 */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-neutral-500">매출</p>
          <p className="mt-1 text-lg font-bold tabular text-emerald-600">+{krw(salesTotal)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-neutral-500">매입</p>
          <p className="mt-1 text-lg font-bold tabular text-rose-600">−{krw(purchaseTotal)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-neutral-500">구매</p>
          <p className="mt-1 text-lg font-bold tabular text-rose-600">−{krw(buyTotal)}</p>
        </Card>
        <Card className={`p-4 ${net >= 0 ? "bg-emerald-50" : "bg-rose-50"}`}>
          <p className="text-xs text-neutral-500">순현금흐름</p>
          <p className={`mt-1 text-lg font-bold tabular ${net >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {net >= 0 ? "+" : "−"}
            {krw(Math.abs(net))}
          </p>
        </Card>
      </div>

      {/* 통장 실입출금(실제 현금) */}
      <Card className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 bg-indigo-600 p-4 text-sm text-white">
        <span className="text-neutral-300">🏦 통장 실제 입출금</span>
        <span>
          입금 <span className="font-semibold text-emerald-300">+{krw(bankIn)}</span>
        </span>
        <span>
          출금 <span className="font-semibold text-rose-300">−{krw(bankOut)}</span>
        </span>
        <span className="text-neutral-400">
          (실잔액 증감 {bankIn - bankOut >= 0 ? "+" : "−"}
          {krw(Math.abs(bankIn - bankOut))})
        </span>
      </Card>

      {pendingCount > 0 && (
        <p className="mb-3 text-xs text-amber-600">⚠️ 잠정 {pendingCount}건 — 미확정(검수·발행·결제 전) 거래가 포함되어 있습니다.</p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section icon="💰" title="매출" tone="emerald" sign="+" items={sales} />
        <Section icon="📥" title="매입" tone="rose" sign="−" items={purchases} />
        <Section icon="🛒" title="구매" tone="rose" sign="−" items={buys} />
      </div>
    </div>
  );
}

/** 부호 + 원금액 그대로(천단위 콤마). 예: 1234000 → +1,234,000 */
function compactWon(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n).toLocaleString("ko-KR")}`;
}

function MonthCalendar({
  date,
  monthNet,
  onPick,
}: {
  date: string;
  monthNet: Record<string, number>;
  onPick: (d: string) => void;
}) {
  const [y, m] = date.split("-").map(Number);
  const firstWeekday = new Date(y, m - 1, 1).getDay(); // 0=일
  const daysInMonth = new Date(y, m, 0).getDate();
  const prevMonth = new Date(y, m - 2, 1).toISOString().slice(0, 7) + "-01";
  const nextMonth = new Date(y, m, 1).toISOString().slice(0, 7) + "-01";

  // 앞쪽 빈칸 + 날짜 셀
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${date.slice(0, 7)}-${String(d).padStart(2, "0")}`);
  }

  const cellTone = (net: number | undefined) => {
    if (!net) return "bg-white text-neutral-300";
    return net > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700";
  };

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <button onClick={() => onPick(prevMonth)} className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100">
          ◀
        </button>
        <span className="text-sm font-semibold text-neutral-700">{y}년 {m}월</span>
        <button onClick={() => onPick(nextMonth)} className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100">
          ▶
        </button>
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
          const net = monthNet[cd];
          const selected = cd === date;
          return (
            <button
              key={cd}
              onClick={() => onPick(cd)}
              className={`flex h-14 flex-col items-start rounded-md border p-1 text-left transition-colors ${cellTone(net)} ${
                selected ? "border-neutral-900 ring-1 ring-neutral-900" : "border-neutral-100 hover:border-neutral-300"
              }`}
            >
              <span className={`text-[11px] ${selected ? "font-bold text-neutral-900" : "text-neutral-400"}`}>{day}</span>
              {net ? <span className="mt-auto w-full truncate text-[10px] font-semibold tabular">{compactWon(net)}</span> : null}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-neutral-400">날짜를 클릭하면 그날 상세로 이동 · 색: 흑자(초록)/적자(빨강), 금액=순현금흐름</p>
    </Card>
  );
}

function Section({
  icon,
  title,
  tone,
  sign,
  items,
}: {
  icon: string;
  title: string;
  tone: "emerald" | "rose";
  sign: "+" | "−";
  items: DayItem[];
}) {
  const total = sum(items);
  const amtCls = tone === "emerald" ? "text-emerald-600" : "text-rose-600";
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
        <span className="font-semibold text-neutral-800">
          {icon} {title} <span className="text-xs font-normal text-neutral-400">{items.length}건</span>
        </span>
        <span className={`text-sm font-bold tabular ${amtCls}`}>
          {sign}
          {krw(total)}
        </span>
      </div>
      {items.length === 0 ? (
        <EmptyState message="없음" />
      ) : (
        <ul className="divide-y divide-neutral-100">
          {items.map((i) => {
            const rowCls = `flex items-center justify-between px-4 py-2.5 text-sm ${i.pending ? "opacity-60" : ""}`;
            const inner = (
              <>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-neutral-700">{i.title}</span>
                  {i.tag && (
                    <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">
                      {i.tag}
                    </span>
                  )}
                  {i.pending && (
                    <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                      잠정
                    </span>
                  )}
                </span>
                <span className={`shrink-0 tabular ${amtCls}`}>
                  {sign}
                  {krw(i.amount)}
                </span>
              </>
            );
            return (
              <li key={i.id}>
                {i.href ? (
                  <Link href={i.href} className={`${rowCls} hover:bg-neutral-50`}>
                    {inner}
                  </Link>
                ) : (
                  <div className={rowCls}>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

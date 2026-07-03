// 채권/채무 연령분석(Aging) — 미결제 건을 결제예정일(없으면 발행일) 기준으로 연령 버킷 분류.
// 순수 함수 모음(서버·클라이언트 공용). 'YYYY-MM-DD' 문자열 기준.

export const AGING_BUCKETS = [
  { key: "notdue", label: "미도래" },
  { key: "d1_30", label: "1~30일" },
  { key: "d31_60", label: "31~60일" },
  { key: "d61_90", label: "61~90일" },
  { key: "over90", label: "90일+" },
] as const;

export type AgingKey = (typeof AGING_BUCKETS)[number]["key"];

function toEpochDays(d: string): number {
  const [y, m, dd] = d.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, dd) / 86400000);
}

/** 기준일 대비 경과(연체) 일수. ref 없으면 null, 미도래면 0 이하. */
export function overdueDays(ref: string | null | undefined, today: string): number | null {
  if (!ref) return null;
  return toEpochDays(today) - toEpochDays(ref);
}

/** 미결제 건의 연령 버킷 키. ref = 결제예정일 우선, 없으면 발행일. */
export function agingKey(ref: string | null | undefined, today: string): AgingKey {
  const d = overdueDays(ref, today);
  if (d === null || d <= 0) return "notdue";
  if (d <= 30) return "d1_30";
  if (d <= 60) return "d31_60";
  if (d <= 90) return "d61_90";
  return "over90";
}

export interface AgingItem {
  amount: number;
  ref: string | null; // 결제예정일(없으면 발행일)
  type: "SALES" | "PURCHASE";
  partner?: string;
  company?: string;
}

export interface AgingBucketSum {
  key: AgingKey;
  label: string;
  recv: number; // 채권(SALES)
  pay: number; // 채무(PURCHASE)
  recvCount: number;
  payCount: number;
}

export interface AgingSummary {
  buckets: AgingBucketSum[];
  recvTotal: number;
  payTotal: number;
  recvOverdue: number; // 미도래 제외 합
  payOverdue: number;
  recvCount: number;
  payCount: number;
}

/** 미결제 건 목록 → 연령 버킷 집계. */
export function summarizeAging(items: AgingItem[], today: string): AgingSummary {
  const map = new Map<AgingKey, AgingBucketSum>(
    AGING_BUCKETS.map((b) => [b.key, { key: b.key, label: b.label, recv: 0, pay: 0, recvCount: 0, payCount: 0 }])
  );
  let recvTotal = 0, payTotal = 0, recvOverdue = 0, payOverdue = 0, recvCount = 0, payCount = 0;
  for (const it of items) {
    const k = agingKey(it.ref, today);
    const b = map.get(k)!;
    if (it.type === "SALES") {
      b.recv += it.amount; b.recvCount += 1; recvTotal += it.amount; recvCount += 1;
      if (k !== "notdue") recvOverdue += it.amount;
    } else {
      b.pay += it.amount; b.payCount += 1; payTotal += it.amount; payCount += 1;
      if (k !== "notdue") payOverdue += it.amount;
    }
  }
  return {
    buckets: AGING_BUCKETS.map((b) => map.get(b.key)!),
    recvTotal, payTotal, recvOverdue, payOverdue, recvCount, payCount,
  };
}

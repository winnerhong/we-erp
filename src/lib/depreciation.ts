// 고정자산 감가상각 — 정액법(straight-line) 월 상각/장부가 계산(순수 함수).
// 별도 스케줄 테이블 없이 as-of 기준일로 산출.

export interface DepInput {
  purchasePrice: number | null;
  purchaseDate: string | null;      // 'YYYY-MM-DD' (상각 시작)
  usefulLifeMonths: number | null;  // 내용연수(개월)
  salvageValue: number | null;      // 잔존가치
  method?: string | null;           // STRAIGHT
}

export interface DepResult {
  applicable: boolean;   // 계산 가능 여부(취득가·내용연수·취득일 필요)
  cost: number;          // 취득가
  salvage: number;       // 잔존가치
  base: number;          // 상각대상액(취득가-잔존)
  life: number;          // 내용연수(개월)
  monthly: number;       // 월 상각액(정액)
  monthsElapsed: number; // 경과 개월(내용연수 한도)
  accumulated: number;   // 누적 상각액
  bookValue: number;     // 장부가(취득가-누적상각)
  progress: number;      // 상각 진행률 0~1
  fullyDepreciated: boolean;
}

/** start~asOf 사이 '완전히 지난' 개월 수. */
function monthsBetween(start: string, asOf: string): number {
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ya, ma, da] = asOf.split("-").map(Number);
  if (!ys || !ya) return 0;
  let m = (ya - ys) * 12 + (ma - ms);
  if (da < ds) m -= 1; // 취득일 기준으로 아직 그 달이 안 찼으면 제외
  return Math.max(0, m);
}

export function computeDepreciation(i: DepInput, asOf: string): DepResult {
  const cost = i.purchasePrice ?? 0;
  const salvage = Math.max(0, Math.min(i.salvageValue ?? 0, cost));
  const life = i.usefulLifeMonths ?? 0;
  const base = Math.max(0, cost - salvage);
  const applicable = cost > 0 && life > 0 && !!i.purchaseDate;
  if (!applicable) {
    return { applicable: false, cost, salvage, base, life, monthly: 0, monthsElapsed: 0, accumulated: 0, bookValue: cost, progress: 0, fullyDepreciated: false };
  }
  const monthly = base / life;
  const monthsElapsed = Math.min(monthsBetween(i.purchaseDate as string, asOf), life);
  const accumulated = Math.min(Math.round(monthly * monthsElapsed), base);
  const bookValue = cost - accumulated;
  return {
    applicable: true, cost, salvage, base, life,
    monthly: Math.round(monthly), monthsElapsed, accumulated, bookValue,
    progress: base > 0 ? accumulated / base : 0,
    fullyDepreciated: monthsElapsed >= life,
  };
}

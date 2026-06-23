// 근태 로직 — 표준 근무시간(work_start/work_end) 기준 지각·조퇴 판정, 근무시간 계산. 클라/서버 공용.

export const ATT_STATUS_LABEL: Record<string, string> = {
  NORMAL: "정상",
  LATE: "지각",
  EARLY: "조퇴",
  LATE_EARLY: "지각·조퇴",
  ABSENT: "결근",
  LEAVE: "휴가",
};
export const ATT_STATUS_TONE: Record<string, string> = {
  NORMAL: "bg-emerald-100 text-emerald-700",
  LATE: "bg-amber-100 text-amber-700",
  EARLY: "bg-amber-100 text-amber-700",
  LATE_EARLY: "bg-rose-100 text-rose-700",
  ABSENT: "bg-rose-100 text-rose-700",
  LEAVE: "bg-blue-100 text-blue-700",
};
export const WORK_MODE_LABEL: Record<string, string> = {
  OFFICE: "사무실",
  REMOTE: "재택",
  FIELD: "외근",
  TRIP: "출장",
};
export const WORK_MODES = ["OFFICE", "REMOTE", "FIELD", "TRIP"] as const;

export const DEFAULT_WORK_START = "09:00";
export const DEFAULT_WORK_END = "18:00";

/** 'HH:MM' → 자정 기준 분. 실패 시 null. */
export function toMinutes(hm: string | null | undefined): number | null {
  if (!hm) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 분 → '8시간 12분' 표기. */
export function fmtDuration(min: number | null | undefined): string {
  if (min == null || min <= 0) return "-";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

/** 분 → 'HH:MM' 표기(경과시간 등). */
export function fmtHM(min: number | null | undefined): string {
  if (min == null || min < 0) return "-";
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export interface AttCalc {
  workMinutes: number | null;
  status: string;
  lateMin: number;
  earlyMin: number;
  overtimeMin: number;
}

/** 출퇴근 시각 + 표준 근무시간으로 상태·근무시간 계산. */
export function calcAttendance(
  checkIn: string | null,
  checkOut: string | null,
  workStart?: string | null,
  workEnd?: string | null
): AttCalc {
  const ci = toMinutes(checkIn);
  const co = toMinutes(checkOut);
  const ws = toMinutes(workStart) ?? toMinutes(DEFAULT_WORK_START)!;
  const we = toMinutes(workEnd) ?? toMinutes(DEFAULT_WORK_END)!;

  const lateMin = ci != null ? Math.max(0, ci - ws) : 0;
  const earlyMin = co != null ? Math.max(0, we - co) : 0;
  const overtimeMin = co != null ? Math.max(0, co - we) : 0;
  const workMinutes = ci != null && co != null ? Math.max(0, co - ci) : null;

  let status = "NORMAL";
  if (ci == null) status = "ABSENT";
  else if (lateMin > 0 && earlyMin > 0) status = "LATE_EARLY";
  else if (lateMin > 0) status = "LATE";
  else if (earlyMin > 0) status = "EARLY";

  return { workMinutes, status, lateMin, earlyMin, overtimeMin };
}

/** KST 기준 오늘 'YYYY-MM-DD'. (서버 UTC 환경 대비) */
export function kstToday(): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}
/** KST 기준 현재 'HH:MM'. */
export function kstNowHM(): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return kst.toISOString().slice(11, 16);
}

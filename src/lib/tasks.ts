// 업무공유캘린더 공용 상수·헬퍼 (클라/서버 공용 — 순수 데이터)
import type { TaskStatus, TaskPriority } from "./supabase/database.types";

export const TASK_STATUSES: TaskStatus[] = ["TODO", "DOING", "DONE", "HOLD"];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: "대기",
  DOING: "진행중",
  DONE: "완료",
  HOLD: "보류",
};

/** 칸반 컬럼 순서(보류는 별도 표시) */
export const KANBAN_COLUMNS: TaskStatus[] = ["TODO", "DOING", "DONE"];

/** 상태 색(Tailwind 톤 키 → 클래스 매핑은 화면에서) */
export const TASK_STATUS_TONE: Record<TaskStatus, string> = {
  TODO: "neutral",
  DOING: "blue",
  DONE: "emerald",
  HOLD: "amber",
};

export const TASK_PRIORITIES: TaskPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: "낮음",
  NORMAL: "보통",
  HIGH: "높음",
  URGENT: "긴급",
};

export const TASK_PRIORITY_TONE: Record<TaskPriority, string> = {
  LOW: "neutral",
  NORMAL: "sky",
  HIGH: "amber",
  URGENT: "rose",
};

/** 톤 키 → 칩 배경/글자 클래스 (캘린더·뱃지 공용) */
export const TONE_CHIP: Record<string, string> = {
  neutral: "bg-neutral-100 text-neutral-700 border-neutral-200",
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  sky: "bg-sky-100 text-sky-700 border-sky-200",
  emerald: "bg-emerald-100 text-emerald-700 border-emerald-200",
  amber: "bg-amber-100 text-amber-700 border-amber-200",
  violet: "bg-violet-100 text-violet-700 border-violet-200",
  rose: "bg-rose-100 text-rose-700 border-rose-200",
  indigo: "bg-indigo-100 text-indigo-700 border-indigo-200",
};

export function toneChip(tone: string | null | undefined): string {
  return TONE_CHIP[tone ?? "neutral"] ?? TONE_CHIP.neutral;
}

/** 톤 키 → 진한 막대 색(타임라인 간트) */
export const TONE_BAR: Record<string, string> = {
  neutral: "bg-neutral-400",
  blue: "bg-blue-500",
  sky: "bg-sky-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  violet: "bg-violet-500",
  rose: "bg-rose-500",
  indigo: "bg-indigo-500",
};

export function toneBar(tone: string | null | undefined): string {
  return TONE_BAR[tone ?? "neutral"] ?? TONE_BAR.neutral;
}

export const DOW_KR = ["일", "월", "화", "수", "목", "금", "토"];

/** YYYY-MM 의 모든 날짜(YYYY-MM-DD) 배열. */
export function monthDays(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

/** YYYY-MM-DD 의 요일(0=일). */
export function dowOf(ymd: string): number {
  return new Date(`${ymd}T00:00:00`).getDay();
}

/** YYYY-MM 을 delta 개월 이동. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** YYYY-MM-DD 문자열 더하기(일 단위). TZ 영향 없는 순수 계산. */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** 두 날짜(YYYY-MM-DD) 사이 일수(a→b, 양끝 포함이면 +1). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ua = Date.UTC(ay, am - 1, ad);
  const ub = Date.UTC(by, bm - 1, bd);
  return Math.round((ub - ua) / 86400000);
}

/** 기간 [s1,e1] 과 [s2,e2] 가 겹치면 true (날짜 문자열 비교). */
export function rangeOverlaps(s1: string, e1: string, s2: string, e2: string): boolean {
  return s1 <= e2 && s2 <= e1;
}

/** 업무의 유효 기간(시작/마감 한쪽만 있어도 보정). 둘 다 없으면 null. */
export function taskRange(start: string | null, due: string | null): { start: string; end: string } | null {
  const s = start ?? due;
  const e = due ?? start;
  if (!s || !e) return null;
  return s <= e ? { start: s, end: e } : { start: e, end: s };
}

/** 마감 기준 상태: 지연(overdue) / 임박(today·내일) 판정. done 이면 false. */
export function isOverdue(due: string | null, status: string, today: string): boolean {
  if (!due || status === "DONE") return false;
  return due < today;
}
export function isDueSoon(due: string | null, status: string, today: string): boolean {
  if (!due || status === "DONE") return false;
  return due === today || due === addDays(today, 1);
}

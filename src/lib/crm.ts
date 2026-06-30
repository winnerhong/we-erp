// 거래처 CRM(계약·거래내역) 공용 상수·헬퍼
import type { ContractType, TxnStatus } from "./supabase/database.types";

export const CONTRACT_TYPES: ContractType[] = ["CLASS", "EVENT", "RENTAL"];
export const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  CLASS: "체육수업",
  EVENT: "체육행사",
  RENTAL: "교구렌탈",
};
export const CONTRACT_TYPE_ICON: Record<ContractType, string> = {
  CLASS: "🤸",
  EVENT: "🎪",
  RENTAL: "🏐",
};
/** 유형 색 톤(칩/배지) */
export const CONTRACT_TYPE_TONE: Record<ContractType, string> = {
  CLASS: "blue",
  EVENT: "violet",
  RENTAL: "amber",
};

export const CONTRACT_STATUS_LABEL: Record<string, string> = {
  DRAFT: "작성중",
  ACTIVE: "진행중",
  ENDED: "종료",
};

export const SETTLE_UNIT_LABEL: Record<string, string> = {
  MONTHLY: "월 합산",
  PER_ITEM: "건별",
};

export const TXN_STATUS_LABEL: Record<TxnStatus, string> = {
  PLANNED: "예정",
  DONE: "완료",
  CANCELED: "취소",
};
export const TXN_STATUS_TONE: Record<TxnStatus, string> = {
  PLANNED: "amber",
  DONE: "emerald",
  CANCELED: "neutral",
};

// 거래처 확장필드 옵션
export const PARTNER_KIND_LABEL: Record<string, string> = {
  SALES: "매출처",
  PURCHASE: "매입처",
  BOTH: "매출·매입",
  ETC: "기타",
};
export const TAX_CATEGORY_LABEL: Record<string, string> = {
  TAXABLE: "과세",
  TAXFREE: "면세",
  ZERO: "영세율",
};
export const PAYMENT_TERMS_LABEL: Record<string, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  NOTE: "어음",
  CREDIT: "외상",
};
export const PAYMENT_CYCLE_LABEL: Record<string, string> = {
  IMMEDIATE: "즉시",
  EOM: "월말",
  NEXT_EOM: "익월말",
  QUARTER: "분기",
};
export const EVIDENCE_TYPE_LABEL: Record<string, string> = {
  TAX_INVOICE: "세금계산서",
  INVOICE: "계산서",
  CASH_RECEIPT: "현금영수증",
  NONE: "미발행",
};

/** 톤 키 → 칩 클래스(거래처/계약 공용) */
export const CRM_TONE_CHIP: Record<string, string> = {
  neutral: "bg-neutral-100 text-neutral-700 border-neutral-200",
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  emerald: "bg-emerald-100 text-emerald-700 border-emerald-200",
  amber: "bg-amber-100 text-amber-700 border-amber-200",
  violet: "bg-violet-100 text-violet-700 border-violet-200",
  rose: "bg-rose-100 text-rose-700 border-rose-200",
};
export function crmChip(tone: string | null | undefined): string {
  return CRM_TONE_CHIP[tone ?? "neutral"] ?? CRM_TONE_CHIP.neutral;
}

/** 거래 규모 기준 자동 등급 */
export function autoGrade(totalAmount: number): { label: string; tone: string } {
  if (totalAmount >= 50_000_000) return { label: "VIP", tone: "rose" };
  if (totalAmount >= 10_000_000) return { label: "우수", tone: "violet" };
  if (totalAmount > 0) return { label: "일반", tone: "blue" };
  return { label: "신규", tone: "neutral" };
}

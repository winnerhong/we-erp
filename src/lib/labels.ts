import type {
  TaxType,
  EmploymentType,
  UserRole,
  ReceiptStatus,
  PaymentMethod,
  EvidenceType,
  TaxInvoiceType,
  TaxInvoiceStatus,
  PurchaseStatus,
  LeaveType,
  LeaveStatus,
} from "./supabase/database.types";

export const TAX_TYPE_LABEL: Record<TaxType, string> = {
  GENERAL: "일반과세",
  SIMPLIFIED: "간이과세",
  TAX_FREE: "면세",
};

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  FULL_TIME: "정규직",
  CONTRACT: "계약직",
  FREELANCER: "프리랜서",
  HOURLY: "시급제",
};

export const USER_ROLE_LABEL: Record<UserRole, string> = {
  STAFF: "직원",
  MANAGER: "부서장",
  ACCOUNTANT: "경리/회계",
  ADMIN: "관리자",
};

/** 한글 라벨 → enum 코드 역매핑 (CSV 일괄등록 시 사용). 코드 자체도 허용. */
function reverseLookup<T extends string>(
  map: Record<T, string>,
  input: string
): T | null {
  const v = input.trim();
  for (const key of Object.keys(map) as T[]) {
    if (key === v || map[key] === v) return key;
  }
  return null;
}

export const parseTaxType = (s: string) => reverseLookup(TAX_TYPE_LABEL, s);
export const parseEmploymentType = (s: string) =>
  reverseLookup(EMPLOYMENT_TYPE_LABEL, s);
export const parseUserRole = (s: string) => reverseLookup(USER_ROLE_LABEL, s);

export const krw = (n: number | null | undefined) =>
  n == null ? "-" : n.toLocaleString("ko-KR") + "원";

// ---------- Phase 1: 영수증 ----------
export const RECEIPT_STATUS_LABEL: Record<ReceiptStatus, string> = {
  PENDING: "검수대기",
  CONFIRMED: "확정",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CARD: "카드",
  CASH: "현금",
  TRANSFER: "계좌이체",
  OTHER: "기타",
};

export const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  TAX_INVOICE: "세금계산서",
  CARD_SALES_SLIP: "카드매출전표",
  CASH_RECEIPT: "현금영수증",
  SIMPLE_RECEIPT: "간이영수증",
  OTHER: "기타",
};

/**
 * 증빙종류에 따른 부가세 공제 가능 여부(기본 판정).
 * 세금계산서·카드전표·현금영수증 → 공제 가능 / 간이영수증·기타 → 불가.
 * (면세사업자/비공제 항목 등 예외는 검수에서 수동 조정)
 */
export function defaultVatDeductible(ev: EvidenceType | null): boolean {
  if (!ev) return false;
  return (
    ev === "TAX_INVOICE" || ev === "CARD_SALES_SLIP" || ev === "CASH_RECEIPT"
  );
}

// ---------- Phase 2: 세금계산서 ----------
export const TAX_INVOICE_TYPE_LABEL: Record<TaxInvoiceType, string> = {
  SALES: "매출",
  PURCHASE: "매입",
};

/** 상태 라벨은 매출/매입에 따라 다름(발행 vs 수취). */
export function taxInvoiceStatusLabel(
  type: TaxInvoiceType,
  status: TaxInvoiceStatus
): string {
  if (type === "SALES") return status === "DONE" ? "발행완료" : "미발행";
  return status === "DONE" ? "수취완료" : "미수취";
}

// ---------- Phase 3: 구매 요청 ----------
export const PURCHASE_STATUS_LABEL: Record<PurchaseStatus, string> = {
  PENDING: "승인대기",
  APPROVED: "승인",
  REJECTED: "반려",
  ON_HOLD: "보류",
  PURCHASED: "구매완료",
};

/** 소액 자동승인 임계값(원). 이 미만이면 요청 즉시 승인. */
export const AUTO_APPROVE_LIMIT = 50000;

// ---------- Phase 4: 급여·인사 ----------
export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  ANNUAL: "연차",
  HALF_DAY: "반차",
  SICK: "병가",
  FAMILY_EVENT: "경조사",
  PARENTAL: "육아휴직",
  UNPAID: "무급휴가",
  OTHER: "기타",
};

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  PENDING: "신청",
  APPROVED: "승인",
  REJECTED: "반려",
};

/** 연차 잔여에서 차감되는 휴가종류(연차·반차만). */
export function deductsAnnual(t: LeaveType): boolean {
  return t === "ANNUAL" || t === "HALF_DAY";
}

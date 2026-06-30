// QR 교구·자산 공용 상수·헬퍼
export const ASSET_STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "보유",
  RENTED: "대여중",
  REPAIR: "수리중",
  LOST: "분실/폐기",
};
export const ASSET_STATUS_TONE: Record<string, string> = {
  AVAILABLE: "emerald",
  RENTED: "blue",
  REPAIR: "amber",
  LOST: "neutral",
};

export const MOVE_TYPES = ["IN", "OUT", "RENT", "RETURN", "REPAIR", "DISPOSE"] as const;
export type MoveType = (typeof MOVE_TYPES)[number];
export const MOVE_TYPE_LABEL: Record<MoveType, string> = {
  IN: "입고",
  OUT: "출고",
  RENT: "대여",
  RETURN: "반납",
  REPAIR: "수리",
  DISPOSE: "폐기",
};
export const MOVE_TYPE_TONE: Record<MoveType, string> = {
  IN: "emerald",
  OUT: "neutral",
  RENT: "blue",
  RETURN: "violet",
  REPAIR: "amber",
  DISPOSE: "rose",
};

/** 이동 유형이 가용수량에 주는 변화량 부호(±qty). */
export function availableDelta(type: string, qty: number): number {
  switch (type) {
    case "IN":
    case "RETURN":
      return qty;
    case "OUT":
    case "RENT":
    case "REPAIR":
    case "DISPOSE":
      return -qty;
    default:
      return 0;
  }
}
/** 총수량 변화량(입고+/폐기-). */
export function totalDelta(type: string, qty: number): number {
  if (type === "IN") return qty;
  if (type === "DISPOSE") return -qty;
  return 0;
}

export const ASSET_TONE_CHIP: Record<string, string> = {
  neutral: "bg-neutral-100 text-neutral-700 border-neutral-200",
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  emerald: "bg-emerald-100 text-emerald-700 border-emerald-200",
  amber: "bg-amber-100 text-amber-700 border-amber-200",
  violet: "bg-violet-100 text-violet-700 border-violet-200",
  rose: "bg-rose-100 text-rose-700 border-rose-200",
};
export function assetChip(tone: string | null | undefined): string {
  return ASSET_TONE_CHIP[tone ?? "neutral"] ?? ASSET_TONE_CHIP.neutral;
}

/** 외부 QR 이미지 URL(딥링크 인코딩). 폰 카메라로 스캔→해당 자산 페이지. */
export function qrImageUrl(data: string, size = 160): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
}

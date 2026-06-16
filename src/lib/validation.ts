// 공통 검증·정규화 헬퍼

/** 사업자등록번호 → 000-00-00000 형식으로 정규화 (10자리일 때만). */
export function normalizeBizNo(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  return raw.trim();
}

/** 사업자등록번호 형식 검증 (10자리 + 국세청 체크섬). */
export function validateBizNo(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  if (!/^\d{10}$/.test(d)) return false;
  // 국세청 사업자등록번호 체크섬
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * weights[i];
  sum += Math.floor((Number(d[8]) * 5) / 10);
  const check = (10 - (sum % 10)) % 10;
  return check === Number(d[9]);
}

/** 휴대폰 정규화 → 010-0000-0000. */
export function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return raw.trim();
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** "1,200,000원" 같은 입력 → 1200000 (숫자만). 빈값이면 null. */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.-]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** "2024-01-15" / "2024.1.5" / "2024/1/5" → "2024-01-15", 실패 시 null. */
export function parseDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

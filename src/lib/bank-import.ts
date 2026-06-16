// 은행 거래내역 CSV 파서 — 은행마다 다른 헤더를 키워드로 유연하게 매핑.
// 클라이언트(미리보기)와 서버(재검증·삽입)가 공유하는 단일 소스. 순수 함수만.
import { parseAmount } from "./validation";
import type { BankDirection } from "./supabase/database.types";

/** 우리 표준 양식(다운로드용). 실제 은행 파일은 헤더가 달라도 키워드로 인식. */
export const BANK_TEMPLATE_HEADERS = [
  "거래일자",
  "적요",
  "거래처",
  "입금",
  "출금",
  "거래후잔액",
];
export const BANK_TEMPLATE_SAMPLE = [
  "2026-06-02",
  "급식비 입금",
  "행복유치원",
  "4400000",
  "",
  "12400000",
];

export interface BankTxnValue {
  txn_date: string;
  txn_time: string | null;
  description: string | null;
  counterparty: string | null;
  direction: BankDirection;
  amount: number;
  balance_after: number | null;
}

export type BankRowResult =
  | { ok: true; value: BankTxnValue }
  | { ok: false; error: string };

const norm = (s: string) => s.replace(/\s/g, "");

/** keywords 중 하나를 '포함'하는 첫 헤더 키를 반환. */
function findKey(row: Record<string, string>, keywords: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const kw of keywords) {
    const hit = keys.find((k) => norm(k).includes(kw));
    if (hit) return hit;
  }
  return undefined;
}

/** keywords 와 '정확히' 일치하는 첫 헤더 키(짧은 헤더의 오인식 방지). */
function findKeyExact(row: Record<string, string>, keywords: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const kw of keywords) {
    const hit = keys.find((k) => norm(k) === kw);
    if (hit) return hit;
  }
  return undefined;
}

/** 연·월·일이 그럴듯한지 검증(오인식 방지). */
function buildDate(y: string, mo: string, d: string): string | null {
  const Y = Number(y);
  const M = Number(mo);
  const D = Number(d);
  if (Y < 1990 || Y > 2999 || M < 1 || M > 12 || D < 1 || D > 31) return null;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** "2026.06.02 13:22:01", "2026-6-2", "20260602" 등에서 날짜만 → YYYY-MM-DD. */
function extractDate(raw: string): string | null {
  const t = raw.trim();
  const m = t.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m) return buildDate(m[1], m[2], m[3]);
  const m2 = t.match(/^(\d{4})(\d{2})(\d{2})$/); // 20260602 (정확히 8자리)
  if (m2) return buildDate(m2[1], m2[2], m2[3]);
  return null;
}

/** "2026.06.02 13:22:01" → "13:22:01", "...13:22" → "13:22". 시각 없으면 null. */
function extractTime(raw: string): string | null {
  const m = raw.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const h = m[1].padStart(2, "0");
  return m[3] ? `${h}:${m[2]}:${m[3]}` : `${h}:${m[2]}`;
}

/**
 * 은행 거래내역 한 행을 검증·변환.
 * - 입금/출금 분리 컬럼이 표준. 없으면 금액+구분(또는 부호)으로 방향 판단.
 */
export function parseBankRow(row: Record<string, string>): BankRowResult {
  // 날짜 — 키워드로 못 찾으면(예: 첫 칸 헤더가 계좌번호) 날짜처럼 보이는 첫 셀로 폴백
  const dateKey = findKey(row, ["거래일자", "거래일시", "거래일", "거래날짜", "일자", "날짜"]);
  let dateSrc = dateKey ? row[dateKey] ?? "" : "";
  let txn_date = extractDate(dateSrc);
  if (!txn_date) {
    for (const k of Object.keys(row)) {
      const d = extractDate(row[k] ?? "");
      if (d) {
        txn_date = d;
        dateSrc = row[k] ?? "";
        break;
      }
    }
  }
  if (!txn_date) return { ok: false, error: "거래일자를 찾을 수 없습니다" };
  const txn_time = extractTime(dateSrc);

  // 입금/출금 (구체 키워드 우선, 없으면 정확 일치)
  const inKey =
    findKey(row, ["입금액", "입금금액", "맡기신금액", "받으신금액"]) ??
    findKeyExact(row, ["입금", "대변"]);
  const outKey =
    findKey(row, ["출금액", "출금금액", "찾으신금액", "지급금액", "보내신금액"]) ??
    findKeyExact(row, ["출금", "차변", "지급"]);
  const inAmt = inKey ? parseAmount(row[inKey]) ?? 0 : 0;
  const outAmt = outKey ? parseAmount(row[outKey]) ?? 0 : 0;

  let direction: BankDirection | null = null;
  let amount = 0;
  if (inAmt > 0 && outAmt === 0) {
    direction = "IN";
    amount = inAmt;
  } else if (outAmt > 0 && inAmt === 0) {
    direction = "OUT";
    amount = outAmt;
  } else if (inAmt > 0 && outAmt > 0) {
    // 한 행에 입·출금이 동시에 잡히면 큰 쪽을 채택
    direction = inAmt >= outAmt ? "IN" : "OUT";
    amount = Math.max(inAmt, outAmt);
  } else {
    // 단일 금액 + 구분(또는 부호)
    const amtKey = findKey(row, ["거래금액", "금액"]);
    const typeKey = findKey(row, ["입출구분", "입출금구분", "거래구분", "구분"]);
    const raw = amtKey ? row[amtKey] ?? "" : "";
    const signed = parseAmount(raw);
    if (signed != null && signed !== 0) {
      const typeVal = typeKey ? norm(row[typeKey] ?? "") : "";
      const isOut = /출금|출|지급|차변|-/.test(typeVal) || signed < 0;
      const isIn = /입금|입|대변|\+/.test(typeVal);
      direction = isIn && !isOut ? "IN" : isOut ? "OUT" : signed < 0 ? "OUT" : "IN";
      amount = Math.abs(signed);
    }
  }

  if (!direction || amount <= 0)
    return { ok: false, error: "입금/출금 금액을 인식할 수 없습니다" };

  // 적요·거래처·거래후잔액
  const descKey = findKey(row, ["적요", "거래내용", "내용", "기재내용", "거래기록사항", "비고"]);
  const partyKey = findKey(row, [
    "의뢰인",
    "수취인",
    "받는분",
    "보내는분",
    "상대방",
    "거래처",
    "입금자",
    "받는통장표시",
    "보내는통장표시",
    "상대계좌예금주",
  ]);
  const balKey = findKey(row, ["거래후잔액", "잔액", "잔고", "남은잔액"]);

  return {
    ok: true,
    value: {
      txn_date,
      txn_time,
      description: descKey ? row[descKey]?.trim() || null : null,
      counterparty: partyKey ? row[partyKey]?.trim() || null : null,
      direction,
      amount,
      balance_after: balKey ? parseAmount(row[balKey]) : null,
    },
  };
}

/**
 * 머리글 없이 데이터만 붙여넣은 경우: 열 내용으로 날짜·금액·적요 열을 추정해
 * 표준 머리글(거래일자/적요/출금/입금/거래후잔액)을 가진 행으로 정규화한다.
 * (이후 parseBankRow 가 그대로 처리)
 */
export function normalizeHeaderlessBankAOA(aoa: string[][]): Record<string, string>[] {
  const rows = aoa.filter((r) => r.length >= 3);
  if (rows.length === 0) return [];
  // 열 개수 = 최빈값
  const counts: Record<number, number> = {};
  for (const r of rows) counts[r.length] = (counts[r.length] ?? 0) + 1;
  const ncol = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
  const data = rows.filter((r) => r.length === ncol);
  if (data.length === 0) return [];

  const isNum = (s: string) => {
    const t = s.trim();
    return t !== "" && /^-?[\d,]+(\.\d+)?$/.test(t);
  };
  const dateScore = new Array(ncol).fill(0);
  const numScore = new Array(ncol).fill(0);
  const zero = new Array(ncol).fill(0);
  const totLen = new Array(ncol).fill(0);
  for (const r of data) {
    for (let c = 0; c < ncol; c++) {
      const cell = (r[c] ?? "").trim();
      if (extractDate(cell)) dateScore[c]++;
      if (isNum(cell)) {
        numScore[c]++;
        if (parseAmount(cell) === 0) zero[c]++;
      }
      totLen[c] += cell.length;
    }
  }
  const half = data.length / 2;

  // 날짜 열
  let dateCol = -1;
  let bestDate = 0;
  for (let c = 0; c < ncol; c++) {
    if (dateScore[c] > bestDate) {
      bestDate = dateScore[c];
      dateCol = c;
    }
  }
  if (bestDate < half) dateCol = -1;

  // 숫자 열(과반이 숫자)
  const numCols: number[] = [];
  for (let c = 0; c < ncol; c++) if (c !== dateCol && numScore[c] > half) numCols.push(c);

  let outCol = -1;
  let inCol = -1;
  let balCol = -1;
  let amtCol = -1;
  if (numCols.length >= 3) {
    // 잔액 = 0 이 가장 드문 숫자 열(잔액은 0 되는 일이 거의 없음)
    balCol = numCols.reduce((m, c) => (zero[c] < zero[m] ? c : m), numCols[0]);
    const rest = numCols.filter((c) => c !== balCol);
    outCol = rest[0];
    inCol = rest[1];
  } else if (numCols.length === 2) {
    // 일반적 순서: 출금, 입금
    outCol = numCols[0];
    inCol = numCols[1];
  } else if (numCols.length === 1) {
    amtCol = numCols[0];
  }

  // 적요 = 날짜·숫자 아닌 열 중 글자수 가장 많은 열(보통 '내용')
  let textCol = -1;
  let bestLen = -1;
  for (let c = 0; c < ncol; c++) {
    if (c === dateCol || numCols.includes(c)) continue;
    if (totLen[c] > bestLen) {
      bestLen = totLen[c];
      textCol = c;
    }
  }

  return data.map((r) => {
    const rec: Record<string, string> = {};
    if (dateCol >= 0) rec["거래일자"] = r[dateCol] ?? "";
    if (textCol >= 0) rec["적요"] = r[textCol] ?? "";
    if (outCol >= 0) rec["출금"] = r[outCol] ?? "";
    if (inCol >= 0) rec["입금"] = r[inCol] ?? "";
    if (balCol >= 0) rec["거래후잔액"] = r[balCol] ?? "";
    if (amtCol >= 0) rec["거래금액"] = r[amtCol] ?? "";
    return rec;
  });
}

/** 중복 업로드 방지용 지문(통장 내 유일). */
export function bankSourceRef(v: BankTxnValue): string {
  return [v.txn_date, v.txn_time ?? "", v.direction, v.amount, v.description ?? "", v.balance_after ?? ""].join("|");
}

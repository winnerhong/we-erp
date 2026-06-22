// 카드 사용내역 CSV/엑셀 파서 — 카드사마다 다른 헤더를 키워드로 유연하게 매핑.
// 통장 파서(bank-import.ts)와 같은 구조. 클라(미리보기)·서버(재검증·삽입) 공유. 순수 함수만.
import { parseAmount } from "./validation";
import type { BankDirection } from "./supabase/database.types";

/** 우리 표준 양식(다운로드용). 실제 카드사 파일은 헤더가 달라도 키워드로 인식. */
export const CARD_TEMPLATE_HEADERS = ["이용일", "가맹점", "이용금액", "할부개월", "승인번호"];
export const CARD_TEMPLATE_SAMPLE = ["2026-06-02", "스타벅스 강남점", "5600", "0", "12345678"];

export interface CardTxnValue {
  txn_date: string;
  txn_time: string | null;
  counterparty: string | null; // 가맹점
  direction: BankDirection; // OUT=사용 / IN=취소·환불
  amount: number;
  installment_months: number;
  approval_no: string | null;
}

export type CardRowResult = { ok: true; value: CardTxnValue } | { ok: false; error: string };

const norm = (s: string) => s.replace(/\s/g, "");

function findKey(row: Record<string, string>, keywords: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const kw of keywords) {
    const hit = keys.find((k) => norm(k).includes(kw));
    if (hit) return hit;
  }
  return undefined;
}

function buildDate(y: string, mo: string, d: string): string | null {
  const Y = Number(y);
  const M = Number(mo);
  const D = Number(d);
  if (Y < 1990 || Y > 2999 || M < 1 || M > 12 || D < 1 || D > 31) return null;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function extractDate(raw: string): string | null {
  const t = raw.trim();
  const m = t.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m) return buildDate(m[1], m[2], m[3]);
  const m2 = t.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m2) return buildDate(m2[1], m2[2], m2[3]);
  return null;
}

function extractTime(raw: string): string | null {
  const m = raw.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const h = m[1].padStart(2, "0");
  return m[3] ? `${h}:${m[2]}:${m[3]}` : `${h}:${m[2]}`;
}

/** 카드 사용내역 한 행을 검증·변환. */
export function parseCardRow(row: Record<string, string>): CardRowResult {
  // 이용일 — 키워드로 못 찾으면 날짜처럼 보이는 첫 셀로 폴백 (신한·삼성·현대·국민·롯데·BC·하나·우리 등 공통)
  const dateKey = findKey(row, [
    "이용일", "이용일자", "이용일시", "거래일자", "거래일시", "승인일시", "승인일자", "승인날짜", "매출일자", "매출일", "이용하신날", "사용일", "일자", "날짜",
  ]);
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
  if (!txn_date) return { ok: false, error: "이용일자를 찾을 수 없습니다" };
  const txn_time = extractTime(dateSrc);

  // 금액 (원화 우선 — 해외이용 시 원화금액/청구금액 사용)
  const amtKey = findKey(row, [
    "원화금액", "이용금액", "승인금액", "결제금액", "매출금액", "사용금액", "청구금액", "거래금액", "합계금액", "금액",
  ]);
  const signed = amtKey ? parseAmount(row[amtKey] ?? "") : null;
  if (signed == null || signed === 0) return { ok: false, error: "이용금액을 인식할 수 없습니다" };

  // 취소/환불 판단 → IN, 그 외 사용 → OUT
  const typeKey = findKey(row, ["매출구분", "거래구분", "구분", "취소여부", "승인구분"]);
  const typeVal = typeKey ? norm(row[typeKey] ?? "") : "";
  const merchKeyEarly = findKey(row, ["가맹점", "이용하신곳", "이용가맹점", "사용처", "이용처"]);
  const merchVal = merchKeyEarly ? norm(row[merchKeyEarly] ?? "") : "";
  const isCancel = /취소|환불|반품|승인취소/.test(typeVal) || /취소|환불|반품/.test(merchVal) || signed < 0;
  const direction: BankDirection = isCancel ? "IN" : "OUT";
  const amount = Math.abs(signed);

  // 가맹점
  const merchKey = findKey(row, ["가맹점", "가맹점명", "이용하신곳", "이용가맹점", "이용내역", "사용처", "이용처", "상호", "내용", "적요"]);
  const counterparty = merchKey ? (row[merchKey] ?? "").trim() || null : null;

  // 할부개월 (일시불=0)
  const instKey = findKey(row, ["할부개월", "할부기간", "할부", "개월"]);
  let installment_months = 0;
  if (instKey) {
    const raw = norm(row[instKey] ?? "");
    if (/일시불|일시|00/.test(raw)) installment_months = 0;
    else {
      const n = parseInt(raw.replace(/[^\d]/g, ""), 10);
      installment_months = Number.isFinite(n) ? n : 0;
    }
  }

  // 승인번호
  const apprKey = findKey(row, ["승인번호", "승인no", "거래번호", "매출번호"]);
  const approval_no = apprKey ? (row[apprKey] ?? "").trim() || null : null;

  return { ok: true, value: { txn_date, txn_time, counterparty, direction, amount, installment_months, approval_no } };
}

/** 중복 업로드 방지 지문(이용일·방향·금액·가맹점·승인번호). */
export function cardSourceRef(v: CardTxnValue): string {
  return [v.txn_date, v.direction, v.amount, norm(v.counterparty ?? ""), v.approval_no ?? ""].join("|");
}

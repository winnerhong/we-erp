// 스프레드시트 파일(csv/xlsx/xls) → 헤더 기준 객체 배열.
// 은행 엑셀은 상단에 제목·계좌정보·빈 줄이 섞여 있으므로 '진짜 헤더 행'을 자동 탐지한다.
// 브라우저(미리보기)에서 사용. xlsx 파싱은 클라이언트에서 수행.
import * as XLSX from "xlsx";
import { parseCSV } from "./csv";
import { normalizeHeaderlessBankAOA } from "./bank-import";

/** 헤더 행 판별용 힌트: 은행 거래내역 표의 머리글에 자주 쓰이는 키워드. */
const HEADER_HINTS = [
  "거래일",
  "거래일자",
  "거래일시",
  "일자",
  "날짜",
  "적요",
  "거래내용",
  "내용",
  "입금",
  "출금",
  "맡기신",
  "찾으신",
  "잔액",
  "잔고",
  "거래금액",
  "금액",
  "의뢰인",
  "거래처",
  "구분",
];

const norm = (s: string) => String(s ?? "").replace(/\s/g, "");

/** 한 행(셀 배열)이 헤더처럼 보이는지: 힌트 키워드와 겹치는 셀이 2개 이상. */
function looksLikeHeader(cells: string[]): boolean {
  let hits = 0;
  for (const cell of cells) {
    const c = norm(cell);
    if (c && HEADER_HINTS.some((h) => c.includes(h))) hits++;
  }
  return hits >= 2;
}

/** 빈 헤더/중복 헤더를 정리(빈 칸은 컬럼번호로 대체, 중복은 접미사). */
function dedupeHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    const name = String(h ?? "").trim() || `열${i + 1}`;
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    return n === 0 ? name : `${name}_${n + 1}`;
  });
}

/** 2차원 배열(행×셀) → 헤더 자동 탐지 후 객체 배열. */
function rowsFromAOA(aoa: string[][]): Record<string, string>[] {
  if (aoa.length === 0) return [];
  // 헤더 후보: 상위 30행 안에서 헤더처럼 보이는 첫 행.
  let headerIdx = -1;
  const scan = Math.min(aoa.length, 30);
  for (let i = 0; i < scan; i++) {
    if (looksLikeHeader(aoa[i])) {
      headerIdx = i;
      break;
    }
  }
  // 머리글이 없으면(데이터만 붙여넣은 경우) 내용으로 열을 추정해 정규화
  if (headerIdx === -1) return normalizeHeaderlessBankAOA(aoa);
  const headers = dedupeHeaders(aoa[headerIdx]);
  const out: Record<string, string>[] = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const cells = aoa[i];
    if (!cells || cells.every((c) => !String(c ?? "").trim())) continue; // 빈 줄 skip
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = String(cells[idx] ?? "").trim();
    });
    out.push(row);
  }
  return out;
}

/** 클립보드에서 복사한 표(텍스트) → 객체 배열. 탭 우선, 없으면 2칸 이상 공백으로 분리. */
export function parsePastedText(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  // 탭 > 2칸이상 공백 > 콤마(금액 콤마 오인 방지로 마지막). 날짜 "2024.03.01 21:46"의
  // 한 칸 공백은 보존되도록 \s{2,} 사용.
  const hasTab = lines.some((l) => l.includes("\t"));
  const split = (l: string) =>
    hasTab ? l.split("\t") : /\s{2,}/.test(l) ? l.split(/\s{2,}/) : l.split(",");
  const aoa = lines.map((l) => split(l).map((c) => c.trim()));
  return rowsFromAOA(aoa);
}

/** 클립보드 HTML(표) → 객체 배열. 통장 화면 복사 시 가장 정확. 실패 시 텍스트로 폴백. */
export function parseClipboard(html: string, text: string): Record<string, string>[] {
  if (html && /<table/i.test(html) && typeof DOMParser !== "undefined") {
    try {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const table = doc.querySelector("table");
      if (table) {
        const aoa = Array.from(table.querySelectorAll("tr"))
          .map((tr) =>
            Array.from(tr.querySelectorAll("th,td")).map((td) =>
              (td.textContent ?? "").replace(/\s+/g, " ").trim()
            )
          )
          .filter((r) => r.some((c) => c));
        if (aoa.length) return rowsFromAOA(aoa);
      }
    } catch {
      /* 텍스트 폴백 */
    }
  }
  return parsePastedText(text);
}

/** xlsx/xls ArrayBuffer → 첫 시트 기준 객체 배열. */
export function parseSheetBuffer(buf: ArrayBuffer): Record<string, string>[] {
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const ws = sheetName ? wb.Sheets[sheetName] : undefined;
  if (!ws) return [];
  // raw:false → 날짜·금액을 표시 형식 문자열로(서식 보존). defval로 빈 칸 보존.
  const aoa = XLSX.utils.sheet_to_json<string[]>(ws, {
    header: 1,
    blankrows: false,
    raw: false,
    defval: "",
  });
  return rowsFromAOA(aoa.map((r) => (r as unknown[]).map((c) => String(c ?? ""))));
}

/** 헤더 + 행(2차원 배열)을 .xlsx 파일로 내려받기(브라우저). */
export function downloadXlsx(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
  sheetName = "Sheet1"
): void {
  const aoa: (string | number)[][] = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/** 파일 확장자에 따라 csv 또는 xlsx로 파싱(공용 진입점). */
export async function parseSpreadsheetFile(file: File): Promise<Record<string, string>[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type === "text/csv") {
    return parseCSV(await file.text());
  }
  const buf = await file.arrayBuffer();
  return parseSheetBuffer(buf);
}

// CSV 파싱·생성 (따옴표·이스케이프·BOM·한글 처리).

/** CSV 한 줄을 셀 배열로 분해. */
function parseLine(line: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          buf += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        buf += c;
      }
    } else if (c === ",") {
      out.push(buf.trim());
      buf = "";
    } else if (c === '"' && buf.length === 0) {
      inQuotes = true;
    } else {
      buf += c;
    }
  }
  out.push(buf.trim());
  return out;
}

/** CSV 텍스트 → 헤더 기준 객체 배열. 1행은 헤더로 간주. */
export function parseCSV(text: string): Record<string, string>[] {
  const cleaned = text.replace(/^﻿/, "");
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    return row;
  });
}

function escapeCell(v: string): string {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/**
 * 헤더 + 행들을 CSV 문자열로 생성. 엑셀 한글 깨짐 방지를 위해 BOM 포함.
 * rows 가 없으면 헤더만 (= 양식 다운로드용).
 */
export function buildCSV(headers: string[], rows: string[][] = []): string {
  const lines = [headers.map(escapeCell).join(",")];
  for (const r of rows) lines.push(r.map(escapeCell).join(","));
  return "﻿" + lines.join("\r\n");
}

/** 검증 결과: 유효/중복/오류 분리. */
export interface ValidationResult<T> {
  valid: T[];
  errors: { row: number; message: string; raw: Record<string, string> }[];
}

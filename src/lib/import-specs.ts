// CSV 일괄등록 스펙 — 클라이언트(미리보기)와 서버(재검증·삽입)가 공유하는 단일 소스.
// 순수 함수만 사용 (DB/서버 의존 없음).
import {
  normalizeBizNo,
  validateBizNo,
  normalizePhone,
  validateEmail,
  parseAmount,
  parseDate,
} from "./validation";
import { parseTaxType, parseEmploymentType, parseUserRole } from "./labels";

export type ImportKind = "companies" | "partners" | "employees" | "accounts";

export interface ImportCtx {
  companies: { id: string; name: string }[];
  accounts: { id: string; code: string; name: string }[];
}

export type RowResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string };

export interface ImportSpec {
  kind: ImportKind;
  label: string;
  table: string;
  headers: string[];
  sample: string[];
  /** 한 CSV 행을 검증·변환. */
  validate: (row: Record<string, string>, ctx: ImportCtx) => RowResult;
}

const findCompany = (ctx: ImportCtx, name: string) =>
  ctx.companies.find((c) => c.name === name.trim());

export const IMPORT_SPECS: Record<ImportKind, ImportSpec> = {
  companies: {
    kind: "companies",
    label: "사업자",
    table: "companies",
    headers: ["상호", "사업자등록번호", "대표자", "업종", "업태", "주소", "과세유형"],
    sample: ["위너키즈스포츠", "123-45-67890", "홍길동", "교육서비스", "스포츠교육", "서울시 ...", "면세"],
    validate: (row) => {
      const name = row["상호"]?.trim();
      if (!name) return { ok: false, error: "상호는 필수입니다" };
      const bizRaw = row["사업자등록번호"]?.trim();
      if (bizRaw && !validateBizNo(bizRaw))
        return { ok: false, error: `사업자등록번호 형식 오류: ${bizRaw}` };
      const tax = row["과세유형"]?.trim()
        ? parseTaxType(row["과세유형"])
        : "GENERAL";
      if (!tax) return { ok: false, error: `과세유형 인식 불가: ${row["과세유형"]}` };
      return {
        ok: true,
        value: {
          name,
          biz_no: bizRaw ? normalizeBizNo(bizRaw) : null,
          ceo_name: row["대표자"]?.trim() || null,
          biz_type: row["업종"]?.trim() || null,
          biz_category: row["업태"]?.trim() || null,
          address: row["주소"]?.trim() || null,
          tax_type: tax,
        },
      };
    },
  },

  accounts: {
    kind: "accounts",
    label: "계정과목",
    table: "accounts",
    headers: ["계정코드", "계정명", "구분"],
    sample: ["811", "복리후생비", "판관비"],
    validate: (row) => {
      const code = row["계정코드"]?.trim();
      const name = row["계정명"]?.trim();
      if (!code) return { ok: false, error: "계정코드는 필수입니다" };
      if (!name) return { ok: false, error: "계정명은 필수입니다" };
      return {
        ok: true,
        value: { code, name, category: row["구분"]?.trim() || null },
      };
    },
  },

  partners: {
    kind: "partners",
    label: "거래처",
    table: "partners",
    headers: ["상호", "사업자번호", "담당자", "연락처", "이메일", "소속사업자", "기본계정코드", "메모"],
    sample: ["문구나라", "111-22-33333", "김담당", "010-1234-5678", "buy@store.com", "(공용)", "811", ""],
    validate: (row, ctx) => {
      const name = row["상호"]?.trim();
      if (!name) return { ok: false, error: "상호는 필수입니다" };
      const bizRaw = row["사업자번호"]?.trim();
      if (bizRaw && !validateBizNo(bizRaw))
        return { ok: false, error: `사업자번호 형식 오류: ${bizRaw}` };
      const email = row["이메일"]?.trim();
      if (email && !validateEmail(email))
        return { ok: false, error: `이메일 형식 오류: ${email}` };

      let companyId: string | null = null;
      const compName = row["소속사업자"]?.trim();
      if (compName && compName !== "(공용)") {
        const c = findCompany(ctx, compName);
        if (!c) return { ok: false, error: `사업자 미등록: ${compName}` };
        companyId = c.id;
      }

      let accountId: string | null = null;
      const acctCode = row["기본계정코드"]?.trim();
      if (acctCode) {
        const a = ctx.accounts.find((x) => x.code === acctCode);
        if (!a) return { ok: false, error: `계정코드 미등록: ${acctCode}` };
        accountId = a.id;
      }

      return {
        ok: true,
        value: {
          name,
          biz_no: bizRaw ? normalizeBizNo(bizRaw) : null,
          contact_name: row["담당자"]?.trim() || null,
          phone: row["연락처"]?.trim() ? normalizePhone(row["연락처"]) : null,
          email: email || null,
          company_id: companyId,
          default_account_id: accountId,
          memo: row["메모"]?.trim() || null,
        },
      };
    },
  },

  employees: {
    kind: "employees",
    label: "직원",
    table: "employees",
    headers: ["이름", "소속사업자", "이메일", "연락처", "고용형태", "권한", "입사일", "기본급", "시급", "메모"],
    sample: ["이강사", "위너키즈스포츠", "lee@winner.com", "010-2222-3333", "정규직", "직원", "2023-03-02", "2800000", "", ""],
    validate: (row, ctx) => {
      const name = row["이름"]?.trim();
      if (!name) return { ok: false, error: "이름은 필수입니다" };
      const compName = row["소속사업자"]?.trim();
      if (!compName) return { ok: false, error: "소속사업자는 필수입니다" };
      const c = findCompany(ctx, compName);
      if (!c) return { ok: false, error: `사업자 미등록: ${compName}` };

      const empType = row["고용형태"]?.trim()
        ? parseEmploymentType(row["고용형태"])
        : "FULL_TIME";
      if (!empType) return { ok: false, error: `고용형태 인식 불가: ${row["고용형태"]}` };
      const role = row["권한"]?.trim() ? parseUserRole(row["권한"]) : "STAFF";
      if (!role) return { ok: false, error: `권한 인식 불가: ${row["권한"]}` };

      const email = row["이메일"]?.trim();
      if (email && !validateEmail(email))
        return { ok: false, error: `이메일 형식 오류: ${email}` };

      let hiredOn: string | null = null;
      const hiredRaw = row["입사일"]?.trim();
      if (hiredRaw) {
        hiredOn = parseDate(hiredRaw);
        if (!hiredOn) return { ok: false, error: `입사일 형식 오류: ${hiredRaw}` };
      }

      return {
        ok: true,
        value: {
          name,
          company_id: c.id,
          email: email || null,
          phone: row["연락처"]?.trim() ? normalizePhone(row["연락처"]) : null,
          employment_type: empType,
          role,
          hired_on: hiredOn,
          base_salary: row["기본급"]?.trim() ? parseAmount(row["기본급"]) : null,
          hourly_wage: row["시급"]?.trim() ? parseAmount(row["시급"]) : null,
          memo: row["메모"]?.trim() || null,
        },
      };
    },
  },
};

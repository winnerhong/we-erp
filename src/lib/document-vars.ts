// 서류 양식 변수 엔진 — 본문의 {{변수}} 를 직원·사업자 정보로 자동 치환.
// 자동변수 사전에 없는 토큰은 "직접입력 빈칸"으로 취급(사람이 채움).
// 클라/서버 공용(순수 함수).

import type { EmployeeRow } from "./supabase/database.types";

export interface VarLabels {
  employment_type?: Record<string, string>;
  job_rank?: Record<string, string>;
  job_title?: Record<string, string>;
}

export interface VarCompany {
  name?: string | null;
  biz_no?: string | null;
  ceo_name?: string | null;
  address?: string | null;
  biz_type?: string | null;
  biz_category?: string | null;
}

export interface VarContext {
  employee: Partial<EmployeeRow>;
  company?: VarCompany | null;
  labels?: VarLabels;
  today?: string; // 'YYYY-MM-DD'
}

const won = (n: number | null | undefined) => (n == null ? "" : `${Number(n).toLocaleString("ko-KR")}원`);
function kdate(s: string | null | undefined): string {
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일` : s;
}

/** 팔레트·치환에 쓰는 자동변수 정의. */
export const AUTO_VARS: { token: string; label: string; get: (ctx: VarContext) => string }[] = [
  // 직원
  { token: "직원명", label: "직원 이름", get: (c) => c.employee.name ?? "" },
  { token: "닉네임", label: "닉네임", get: (c) => c.employee.nickname ?? "" },
  { token: "생년월일", label: "생년월일", get: (c) => kdate(c.employee.birth) },
  { token: "주민등록번호", label: "주민등록번호", get: (c) => c.employee.resident_no ?? "" },
  { token: "주소", label: "직원 주소", get: (c) => c.employee.address ?? "" },
  { token: "연락처", label: "직원 연락처", get: (c) => c.employee.phone ?? "" },
  { token: "이메일", label: "직원 이메일", get: (c) => c.employee.email ?? "" },
  { token: "입사일", label: "입사일", get: (c) => kdate(c.employee.hired_on) },
  { token: "고용형태", label: "고용형태", get: (c) => c.labels?.employment_type?.[c.employee.employment_type ?? ""] ?? c.employee.employment_type ?? "" },
  { token: "직급", label: "직급", get: (c) => c.labels?.job_rank?.[c.employee.job_rank ?? ""] ?? c.employee.job_rank ?? "" },
  { token: "직책", label: "직책", get: (c) => c.labels?.job_title?.[c.employee.job_title ?? ""] ?? c.employee.job_title ?? "" },
  { token: "기본급", label: "기본급(월)", get: (c) => won(c.employee.base_salary) },
  { token: "시급", label: "시급", get: (c) => won(c.employee.hourly_wage) },
  { token: "근무요일", label: "근무요일", get: (c) => c.employee.work_days ?? "" },
  { token: "근무시간", label: "근무시간", get: (c) => (c.employee.work_start || c.employee.work_end ? `${c.employee.work_start ?? ""} ~ ${c.employee.work_end ?? ""}` : "") },
  { token: "은행명", label: "은행명", get: (c) => c.employee.bank_name ?? "" },
  { token: "계좌번호", label: "계좌번호", get: (c) => c.employee.account_number ?? "" },
  { token: "예금주", label: "예금주", get: (c) => c.employee.account_holder ?? "" },
  // 사업자
  { token: "회사명", label: "사업자 상호", get: (c) => c.company?.name ?? "" },
  { token: "사업자번호", label: "사업자등록번호", get: (c) => c.company?.biz_no ?? "" },
  { token: "대표자", label: "대표자명", get: (c) => c.company?.ceo_name ?? "" },
  { token: "회사주소", label: "사업장 주소", get: (c) => c.company?.address ?? "" },
  { token: "업태", label: "업태", get: (c) => c.company?.biz_type ?? "" },
  { token: "업종", label: "업종", get: (c) => c.company?.biz_category ?? "" },
  // 기타
  { token: "오늘날짜", label: "오늘 날짜", get: (c) => kdate(c.today) },
];

const AUTO_MAP = new Map(AUTO_VARS.map((v) => [v.token, v]));

/** 본문에서 {{토큰}} 을 순서대로 중복 없이 추출. */
export function extractTokens(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of body.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) {
    const t = m[1].trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/** 자동변수로 채울 수 없는 토큰(=사람이 직접 채울 빈칸)만 추출. */
export function manualTokens(body: string): string[] {
  return extractTokens(body).filter((t) => !AUTO_MAP.has(t));
}

/**
 * 본문의 모든 {{토큰}} 을 치환한 최종 텍스트. 빈 값은 밑줄로 표시.
 * highlight 토큰이 주어지면 해당 위치를 <mark class="doc-hl">…</mark> 로 감싸 강조(미리보기용).
 */
export function renderBody(
  body: string,
  ctx: VarContext,
  fieldValues: Record<string, string> = {},
  highlight?: string
): string {
  return body.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, raw) => {
    const t = String(raw).trim();
    const auto = AUTO_MAP.get(t);
    const v = auto ? auto.get(ctx) : fieldValues[t];
    const out = v && v.trim() !== "" ? v : "____________";
    return highlight && t === highlight ? `<mark class="doc-hl" data-hl="1">${out}</mark>` : out;
  });
}

/** 평문 본문을 HTML 로 보정(레거시 평문 → 문단/<br>). 이미 태그가 있으면 그대로. */
export function ensureHtml(s: string): string {
  if (!s) return "<p></p>";
  if (/<[a-z][\s\S]*>/i.test(s)) return s;
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** 양식 편집 미리보기용 가상 데이터(실제 발행 시엔 직원·사업자 실값으로 치환됨). */
export function sampleContext(today: string): VarContext {
  return {
    employee: {
      name: "홍길동",
      nickname: "길동",
      birth: "1990-03-15",
      resident_no: "900315-1******",
      address: "서울특별시 강남구 테헤란로 123",
      phone: "010-1234-5678",
      email: "hong@example.com",
      hired_on: "2024-01-02",
      employment_type: "FULL_TIME",
      job_rank: "STAFF",
      job_title: "MEMBER",
      base_salary: 2800000,
      hourly_wage: 12000,
      work_days: "월~금",
      work_start: "09:00",
      work_end: "18:00",
      bank_name: "국민은행",
      account_number: "000000-00-000000",
      account_holder: "홍길동",
    },
    company: {
      name: "(주)위너그룹",
      biz_no: "123-45-67890",
      ceo_name: "홍보광",
      address: "서울특별시 강남구 위너로 1",
      biz_type: "서비스",
      biz_category: "교육서비스",
    },
    labels: {
      employment_type: { FULL_TIME: "정규직" },
      job_rank: { STAFF: "사원" },
      job_title: { MEMBER: "팀원" },
    },
    today,
  };
}

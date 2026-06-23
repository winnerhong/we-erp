// 인사카드 — 신상 필드 + 반복항목(가족·학력·경력·자격) 정의. 클라/서버 공용.

/** 직원이 자가입력 가능한 신상 스칼라 필드(화이트리스트). */
export const HR_SCALAR_FIELDS = [
  "name_en",
  "gender",
  "nationality",
  "birth",
  "resident_no",
  "address",
  "phone",
  "email",
  "emergency_contact",
  "emergency_relation",
  "bank_name",
  "account_number",
  "account_holder",
] as const;
export type HrScalarField = (typeof HR_SCALAR_FIELDS)[number];

/** 신상 입력 폼 정의(라벨·종류). */
export const HR_FIELDS: { key: HrScalarField; label: string; type?: "date" | "select"; options?: string[]; placeholder?: string; full?: boolean }[] = [
  { key: "name_en", label: "영문이름", placeholder: "Hong Gildong" },
  { key: "gender", label: "성별", type: "select", options: ["남", "여", "기타"] },
  { key: "nationality", label: "국적", placeholder: "대한민국" },
  { key: "birth", label: "생년월일", type: "date" },
  { key: "resident_no", label: "주민(외국인)번호", placeholder: "000000-0000000" },
  { key: "phone", label: "연락처", placeholder: "010-0000-0000" },
  { key: "email", label: "이메일", placeholder: "name@example.com" },
  { key: "address", label: "주소", full: true },
  { key: "emergency_contact", label: "비상연락처", placeholder: "010-0000-0000" },
  { key: "emergency_relation", label: "비상연락 관계", placeholder: "배우자·부모 등" },
  { key: "bank_name", label: "은행명" },
  { key: "account_number", label: "계좌번호" },
  { key: "account_holder", label: "예금주" },
];

export type HrRow = Record<string, string>;
export interface HrExtra {
  family: HrRow[];
  education: HrRow[];
  career: HrRow[];
  certificates: HrRow[];
}
export type HrSectionKey = keyof HrExtra;

/** 반복항목 섹션 스키마(제네릭 렌더용). */
export const HR_SECTIONS: { key: HrSectionKey; title: string; icon: string; cols: { k: string; label: string }[] }[] = [
  { key: "family", title: "가족", icon: "👪", cols: [
    { k: "relation", label: "관계" }, { k: "name", label: "성명" }, { k: "birth", label: "생년월일" }, { k: "job", label: "직업" },
  ] },
  { key: "education", title: "학력", icon: "🎓", cols: [
    { k: "school", label: "학교" }, { k: "major", label: "전공" }, { k: "degree", label: "학위" }, { k: "period", label: "기간" }, { k: "status", label: "졸업구분" },
  ] },
  { key: "career", title: "경력", icon: "💼", cols: [
    { k: "company", label: "회사" }, { k: "dept", label: "부서" }, { k: "position", label: "직위" }, { k: "period", label: "기간" }, { k: "duty", label: "담당업무" },
  ] },
  { key: "certificates", title: "자격증", icon: "📜", cols: [
    { k: "name", label: "자격명" }, { k: "issuer", label: "발급기관" }, { k: "date", label: "취득일" }, { k: "no", label: "번호" },
  ] },
];

/** jsonb 원본 → 안전한 HrExtra 형태로 정규화. */
export function normalizeHrExtra(raw: unknown): HrExtra {
  const o = (raw ?? {}) as Record<string, unknown>;
  const arr = (v: unknown): HrRow[] =>
    Array.isArray(v) ? v.map((r) => (r && typeof r === "object" ? (r as HrRow) : {})) : [];
  return {
    family: arr(o.family),
    education: arr(o.education),
    career: arr(o.career),
    certificates: arr(o.certificates),
  };
}

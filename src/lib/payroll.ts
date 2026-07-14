// 급여·연차 계산 — 한국 노동법/4대보험 기준의 "추정" 로직.
// ⚠️ 실제 신고는 간이세액표·요율 변동·상한 등으로 달라질 수 있음(검수 필요).

// ---------- 연차 자동 발생 ----------
function parseDate(s: string): Date {
  return new Date(`${s}T00:00:00`);
}

/** 입사일~기준일 사이 만으로 경과한 개월 수. */
function completedMonths(hired: Date, asOf: Date): number {
  let months =
    (asOf.getFullYear() - hired.getFullYear()) * 12 +
    (asOf.getMonth() - hired.getMonth());
  if (asOf.getDate() < hired.getDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * 근속 기준 연차 발생일수(개근 가정).
 * - 1년 미만: 매월 개근 시 1일씩(최대 11일)
 * - 1년 이상: 15일, 3년 이상부터 2년마다 +1일(최대 25일)
 */
export function accruedAnnualLeave(hiredOn: string | null, asOf: Date): number {
  if (!hiredOn) return 0;
  const hired = parseDate(hiredOn);
  if (isNaN(hired.getTime()) || hired > asOf) return 0;
  const months = completedMonths(hired, asOf);
  const years = Math.floor(months / 12);
  if (years < 1) return Math.min(months, 11);
  return Math.min(25, 15 + Math.floor((years - 1) / 2));
}

// ---------- 4대보험(근로자 부담) 추정 ----------
// 2026년 기준 근사 요율. 상한/하한·정산은 미반영(추정).
export const INSURANCE_RATES = {
  pension: 0.045, // 국민연금 4.5%
  health: 0.03545, // 건강보험 3.545%
  careOfHealth: 0.1295, // 장기요양 = 건강보험료 × 12.95%
  employment: 0.009, // 고용보험 0.9%
};

export interface InsuranceBreakdown {
  pension: number;
  health: number;
  care: number;
  employment: number;
  total: number;
}

const r10 = (n: number) => Math.round(n / 10) * 10; // 원단위 10원 절사 근사

/** 과세 월보수(기본급+과세수당) 기준 4대보험 근로자 부담 추정. */
export function estimateInsurance(taxableMonthly: number): InsuranceBreakdown {
  const base = Math.max(0, taxableMonthly);
  const pension = r10(base * INSURANCE_RATES.pension);
  const health = r10(base * INSURANCE_RATES.health);
  const care = r10(health * INSURANCE_RATES.careOfHealth);
  const employment = r10(base * INSURANCE_RATES.employment);
  return { pension, health, care, employment, total: pension + health + care + employment };
}

// ---------- 사업주(회사) 부담 4대보험 ----------
// 2026년 기준 근사. 산재는 업종별 → 기본값(입력 가능). 추정치.
export const EMPLOYER_INSURANCE_RATES = {
  pension: 0.045, // 국민연금 4.5%
  health: 0.03545, // 건강보험 3.545%
  careOfHealth: 0.1295, // 장기요양 = 건강보험료 × 12.95%
  employment: 0.009, // 고용보험(실업급여) 0.9%
  employmentStability: 0.0025, // 고용안정·직업능력개발 0.25%(150인 미만)
  industrial: 0.007, // 산재보험 기본 0.7%(업종별 상이 — 입력 권장)
};

export interface EmployerInsurance {
  pension: number;
  health: number;
  care: number;
  employment: number; // 실업급여 + 고용안정·능력개발
  industrial: number; // 산재
  total: number;
}

/** 사업주(회사) 부담 4대보험 추정. industrialRate(%) 미지정 시 기본 0.7%. */
export function estimateEmployerInsurance(
  taxableMonthly: number,
  industrialRatePct?: number
): EmployerInsurance {
  const base = Math.max(0, taxableMonthly);
  const pension = r10(base * EMPLOYER_INSURANCE_RATES.pension);
  const health = r10(base * EMPLOYER_INSURANCE_RATES.health);
  const care = r10(health * EMPLOYER_INSURANCE_RATES.careOfHealth);
  const employment = r10(
    base * (EMPLOYER_INSURANCE_RATES.employment + EMPLOYER_INSURANCE_RATES.employmentStability)
  );
  const industrialRate = industrialRatePct != null ? industrialRatePct / 100 : EMPLOYER_INSURANCE_RATES.industrial;
  const industrial = r10(base * industrialRate);
  return { pension, health, care, employment, industrial, total: pension + health + care + employment + industrial };
}

export interface FullInsurance {
  worker: InsuranceBreakdown; // 근로자 부담
  employer: EmployerInsurance; // 사업주 부담
}

/** 근로자+사업주 4대보험 전체 분해. */
export function fullInsurance(taxableMonthly: number, industrialRatePct?: number): FullInsurance {
  return {
    worker: estimateInsurance(taxableMonthly),
    employer: estimateEmployerInsurance(taxableMonthly, industrialRatePct),
  };
}

// ---------- 프리랜서/기타소득 원천징수 ----------
export interface Withholding {
  gross: number; // 지급총액
  tax: number; // 원천징수 합계
  income: number; // 소득세
  local: number; // 지방소득세(소득세 × 10%)
  net: number; // 실지급액
}

/** 프리랜서(3.3%)·기타소득(8.8%) 등 원천징수 계산. 소득세:지방세 = 1:0.1 분리. */
export function freelanceWithholding(amount: number, ratePct: number): Withholding {
  const gross = Math.max(0, Math.round(amount));
  const tax = Math.round((gross * ratePct) / 100);
  const income = Math.round(tax / 1.1);
  return { gross, tax, income, local: tax - income, net: gross - tax };
}

// ---------- 근로소득세 원천징수(추정) ----------
// 국세청 근로소득 간이세액표에 대응하는 근사. 연말정산 방식(연환산→과세표준→누진세율→근로소득세액공제)을
// 12로 나눠 월 원천징수를 추정한다. 실제 간이세액표와 소폭 차이날 수 있어 검수·조정 대상.
// 부양가족수(본인 포함)를 인적공제로 반영. 세율·공제는 2023년 개정 기준(변동 시 이 상수만 갱신).

/** 종합소득세 누진세율(과세표준, 세율, 누진공제). */
const INCOME_TAX_BRACKETS: { upto: number; rate: number; deduct: number }[] = [
  { upto: 14_000_000, rate: 0.06, deduct: 0 },
  { upto: 50_000_000, rate: 0.15, deduct: 1_260_000 },
  { upto: 88_000_000, rate: 0.24, deduct: 5_760_000 },
  { upto: 150_000_000, rate: 0.35, deduct: 15_440_000 },
  { upto: 300_000_000, rate: 0.38, deduct: 19_940_000 },
  { upto: 500_000_000, rate: 0.40, deduct: 25_940_000 },
  { upto: 1_000_000_000, rate: 0.42, deduct: 35_940_000 },
  { upto: Infinity, rate: 0.45, deduct: 65_940_000 },
];

/** 근로소득공제(총급여 기준, 한도 2천만원). */
function earnedIncomeDeduction(gross: number): number {
  let d: number;
  if (gross <= 5_000_000) d = gross * 0.7;
  else if (gross <= 15_000_000) d = 3_500_000 + (gross - 5_000_000) * 0.4;
  else if (gross <= 45_000_000) d = 7_500_000 + (gross - 15_000_000) * 0.15;
  else if (gross <= 100_000_000) d = 12_000_000 + (gross - 45_000_000) * 0.05;
  else d = 14_750_000 + (gross - 100_000_000) * 0.02;
  return Math.min(d, 20_000_000);
}

/** 근로소득 세액공제(산출세액 기준, 총급여별 한도). */
function earnedIncomeTaxCredit(computed: number, gross: number): number {
  const credit = computed <= 1_300_000 ? computed * 0.55 : 715_000 + (computed - 1_300_000) * 0.3;
  let cap: number;
  if (gross <= 33_000_000) cap = 740_000;
  else if (gross <= 70_000_000) cap = Math.max(660_000, 740_000 - (gross - 33_000_000) * 0.008);
  else cap = Math.max(500_000, 660_000 - ((gross - 70_000_000) / 2));
  return Math.min(credit, cap);
}

/** 자녀세액공제(연): 1명 15만, 2명 35만, 3명+ 35만 + 30만×(n-2). */
function childTaxCredit(children: number): number {
  const n = Math.max(0, Math.floor(children || 0));
  if (n <= 0) return 0;
  if (n === 1) return 150_000;
  if (n === 2) return 350_000;
  return 350_000 + (n - 2) * 300_000;
}

/**
 * 월 근로소득세(소득세) 원천징수 추정. 간이세액표 근사(연환산 방식).
 * @param monthlyTaxable 월 과세급여(기본급+과세수당; 비과세 제외)
 * @param dependents 공제대상 부양가족수(본인 포함, 최소 1)
 * @param childrenUnder20 8~20세 자녀 수(자녀세액공제)
 */
export function estimateIncomeTax(monthlyTaxable: number, dependents = 1, childrenUnder20 = 0): number {
  const m = Math.max(0, monthlyTaxable);
  const deps = Math.max(1, Math.floor(dependents || 1));
  const grossYear = m * 12;
  if (grossYear <= 0) return 0;
  const earnedIncome = grossYear - earnedIncomeDeduction(grossYear); // 근로소득금액
  const personal = deps * 1_500_000; // 인적공제(기본공제 1인당 150만)
  // 4대보험 근로자부담은 소득공제(연금보험료공제·특별소득공제) — 연액을 과세표준에서 차감
  const insuranceDeduction = estimateInsurance(m).total * 12;
  const taxBase = Math.max(0, earnedIncome - personal - insuranceDeduction); // 과세표준(근사)
  if (taxBase <= 0) return 0;
  const br = INCOME_TAX_BRACKETS.find((b) => taxBase <= b.upto)!;
  const computed = taxBase * br.rate - br.deduct; // 산출세액
  // 세액공제: 근로소득세액공제 + 표준세액공제(13만) + 자녀세액공제
  const credit = earnedIncomeTaxCredit(computed, grossYear) + 130_000 + childTaxCredit(childrenUnder20);
  const afterCredit = Math.max(0, computed - credit);
  return Math.max(0, Math.round(afterCredit / 12 / 10) * 10); // 월 환산, 10원 절사
}

/** 지방소득세 = 소득세 × 10%(10원 절사). */
export function localIncomeTax(incomeTax: number): number {
  return Math.round((Math.max(0, incomeTax) * 0.1) / 10) * 10;
}

export interface PayrollCalc {
  base_pay: number;
  allowance: number;
  nontax_allowance: number;
  income_tax: number;
  insurance: number;
  other_deduction: number;
  net_pay: number;
}

/** 실지급액 = (기본급+과세수당+비과세수당) − (소득세+4대보험+기타공제). */
export function computeNet(p: {
  base_pay: number;
  allowance: number;
  nontax_allowance: number;
  income_tax: number;
  insurance: number;
  other_deduction: number;
}): number {
  const gross = p.base_pay + p.allowance + p.nontax_allowance;
  const ded = p.income_tax + p.insurance + p.other_deduction;
  return gross - ded;
}

// ---------- 최저임금 검증 ----------
// 2026년 최저임금(시급). 변동 시 이 값만 갱신.
export const MIN_HOURLY_WAGE = 10320;
// 월 환산 기준시간(주40h + 주휴 → 월 209시간 통상).
export const MONTHLY_WORK_HOURS = 209;
/** 월 최저임금(주40h·209h 환산). */
export const MIN_MONTHLY_WAGE = MIN_HOURLY_WAGE * MONTHLY_WORK_HOURS;

export interface MinWageCheck {
  ok: boolean;
  hourly: number; // 환산 시급
  min: number; // 최저 시급
  shortfall: number; // 미달액(시급 기준, 0 이상)
}

/**
 * 최저임금 위반 여부(추정).
 * - 시급제: hourly_wage 직접 비교
 * - 월급제: base_salary ÷ 209h 로 환산 시급 산출 후 비교
 */
export function checkMinWage(opts: {
  employmentType: string;
  hourlyWage: number | null;
  baseSalary: number | null;
  weeklyHours?: number | null;
}): MinWageCheck | null {
  let hourly = 0;
  if (opts.employmentType === "HOURLY") {
    if (!opts.hourlyWage) return null;
    hourly = opts.hourlyWage;
  } else {
    if (!opts.baseSalary) return null;
    // 주 소정근로시간이 있으면 그 기준 월 환산시간, 없으면 209h
    const monthly =
      opts.weeklyHours && opts.weeklyHours > 0
        ? Math.round((opts.weeklyHours * 52) / 12)
        : MONTHLY_WORK_HOURS;
    hourly = Math.round(opts.baseSalary / monthly);
  }
  const shortfall = Math.max(0, MIN_HOURLY_WAGE - hourly);
  return { ok: hourly >= MIN_HOURLY_WAGE, hourly, min: MIN_HOURLY_WAGE, shortfall };
}

// ---------- 퇴직금(추정) ----------
function diffDays(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

export interface SeveranceEstimate {
  eligible: boolean; // 1년 이상 근속
  serviceDays: number; // 재직일수
  serviceYears: number; // 재직 년수(소수)
  avgDailyWage: number; // 1일 평균임금(추정)
  amount: number; // 퇴직금(추정)
}

/**
 * 퇴직금 추정 = 1일 평균임금 × 30 × (재직일수 / 365).
 * 평균임금 = 퇴직 전 3개월 임금총액 ÷ 91.25(3개월 평균일수)로 근사.
 * recentMonthlyGross: 최근 월급여총액 배열(최신 우선, 최대 3개월 사용).
 */
export function severanceEstimate(opts: {
  hiredOn: string | null;
  asOf: Date;
  recentMonthlyGross: number[];
}): SeveranceEstimate | null {
  if (!opts.hiredOn) return null;
  const hired = parseDate(opts.hiredOn);
  if (isNaN(hired.getTime()) || hired > opts.asOf) return null;
  const serviceDays = diffDays(hired, opts.asOf);
  const serviceYears = serviceDays / 365;
  const recent = opts.recentMonthlyGross.slice(0, 3);
  const sum = recent.reduce((s, v) => s + v, 0);
  // 3개월 미만이면 있는 개월수 기준 일평균
  const periodDays = recent.length > 0 ? recent.length * (91.25 / 3) : 91.25;
  const avgDailyWage = sum > 0 ? Math.round(sum / periodDays) : 0;
  const eligible = serviceDays >= 365;
  const amount = Math.round(avgDailyWage * 30 * serviceYears);
  return { eligible, serviceDays, serviceYears, avgDailyWage, amount };
}

// ---------- 미사용 연차수당(추정) ----------
export interface LeaveAllowance {
  accrued: number; // 발생 연차
  used: number; // 사용 연차
  remaining: number; // 잔여 연차
  dailyOrdinaryWage: number; // 1일 통상임금(추정)
  amount: number; // 연차수당(추정)
}

/**
 * 미사용 연차수당 추정 = 잔여연차 × 1일 통상임금.
 * 1일 통상임금 = 월 통상임금(기본급 근사) ÷ 209 × 8(1일 8시간).
 */
export function leaveAllowance(opts: {
  hiredOn: string | null;
  asOf: Date;
  usedDays: number;
  monthlyOrdinaryWage: number | null; // 보통 기본급
}): LeaveAllowance | null {
  if (!opts.monthlyOrdinaryWage) return null;
  const accrued = accruedAnnualLeave(opts.hiredOn, opts.asOf);
  const remaining = Math.max(0, accrued - opts.usedDays);
  const dailyOrdinaryWage = Math.round((opts.monthlyOrdinaryWage / MONTHLY_WORK_HOURS) * 8);
  const amount = Math.round(remaining * dailyOrdinaryWage);
  return { accrued, used: opts.usedDays, remaining, dailyOrdinaryWage, amount };
}

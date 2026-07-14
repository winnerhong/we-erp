import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateIncomeTax,
  localIncomeTax,
  estimateInsurance,
  computeNet,
  accruedAnnualLeave,
  checkMinWage,
  freelanceWithholding,
  MIN_HOURLY_WAGE,
} from "../src/lib/payroll.ts";

test("estimateIncomeTax: 소득 0 → 0", () => {
  assert.equal(estimateIncomeTax(0, 1), 0);
  assert.equal(estimateIncomeTax(1_000_000, 1), 0); // 저소득은 과세표준 0 → 0
});

test("estimateIncomeTax: 월 300만/부양1명 은 NTS 간이세액표 근방(6만~10만)", () => {
  const t = estimateIncomeTax(3_000_000, 1);
  assert.ok(t >= 60_000 && t <= 100_000, `got ${t}`);
});

test("estimateIncomeTax: 부양가족 많을수록 세금 감소", () => {
  assert.ok(estimateIncomeTax(3_000_000, 3) < estimateIncomeTax(3_000_000, 1));
});

test("estimateIncomeTax: 자녀 있으면 세액공제로 감소", () => {
  assert.ok(estimateIncomeTax(3_000_000, 2, 1) < estimateIncomeTax(3_000_000, 2, 0));
});

test("estimateIncomeTax: 10원 단위 절사", () => {
  assert.equal(estimateIncomeTax(5_000_000, 1) % 10, 0);
});

test("localIncomeTax = 소득세 10%(10원 절사)", () => {
  assert.equal(localIncomeTax(80_000), 8_000);
  assert.equal(localIncomeTax(84_850), 8_490); // 8,485 → 반올림 8,490
  assert.equal(localIncomeTax(0), 0);
});

test("estimateInsurance: 요율 적용(10원 절사)", () => {
  const ins = estimateInsurance(3_000_000);
  assert.equal(ins.pension, 135_000); // 4.5%
  assert.equal(ins.employment, 27_000); // 0.9%
  assert.equal(ins.total, ins.pension + ins.health + ins.care + ins.employment);
});

test("computeNet = 총지급 - (소득세+보험+기타)", () => {
  assert.equal(
    computeNet({ base_pay: 3_000_000, allowance: 200_000, nontax_allowance: 100_000, income_tax: 80_000, insurance: 270_000, other_deduction: 0 }),
    3_300_000 - 350_000
  );
});

test("accruedAnnualLeave: 1년 미만 개월수(최대11), 1년 15일", () => {
  const asOf = new Date("2026-01-01T00:00:00");
  assert.equal(accruedAnnualLeave("2025-09-01", asOf), 4); // 4개월
  assert.equal(accruedAnnualLeave("2024-06-01", asOf), 15); // 1년 이상
  assert.equal(accruedAnnualLeave(null, asOf), 0);
});

test("checkMinWage: 시급 미달 판정", () => {
  const low = checkMinWage({ employmentType: "HOURLY", hourlyWage: MIN_HOURLY_WAGE - 100, baseSalary: null });
  assert.equal(low?.ok, false);
  const ok = checkMinWage({ employmentType: "HOURLY", hourlyWage: MIN_HOURLY_WAGE, baseSalary: null });
  assert.equal(ok?.ok, true);
});

test("freelanceWithholding: 3.3% 분리(소득세:지방세)", () => {
  const w = freelanceWithholding(1_000_000, 3.3);
  assert.equal(w.tax, 33_000);
  assert.equal(w.income + w.local, w.tax);
  assert.equal(w.net, 1_000_000 - 33_000);
});

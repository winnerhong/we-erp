import { test } from "node:test";
import assert from "node:assert/strict";
import { calcTax, autoGrade } from "../src/lib/crm.ts";

test("calcTax: 과세 기본 10%", () => {
  assert.deepEqual(calcTax(1_000_000, "TAXABLE", null), { tax: 100_000, total: 1_100_000 });
  assert.deepEqual(calcTax(1_000_000, null, null), { tax: 100_000, total: 1_100_000 }); // null=과세취급
});

test("calcTax: 면세는 세액 0", () => {
  assert.deepEqual(calcTax(1_000_000, "TAXFREE", 10), { tax: 0, total: 1_000_000 });
});

test("calcTax: 사용자 세율", () => {
  assert.deepEqual(calcTax(1_000_000, "TAXABLE", 3), { tax: 30_000, total: 1_030_000 });
});

test("calcTax: 반올림", () => {
  assert.equal(calcTax(12_345, "TAXABLE", 10).tax, 1_235); // 1234.5 → 1235
});

test("autoGrade: 규모별 등급", () => {
  assert.equal(autoGrade(60_000_000).label, "VIP");
  assert.equal(autoGrade(20_000_000).label, "우수");
  assert.equal(autoGrade(1_000_000).label, "일반");
});

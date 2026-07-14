import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDepreciation } from "../src/lib/depreciation.ts";

test("computeDepreciation: 데이터 부족 시 계산불가·장부가=취득가", () => {
  const r = computeDepreciation({ purchasePrice: 1_000_000, purchaseDate: null, usefulLifeMonths: null, salvageValue: 0 }, "2026-01-01");
  assert.equal(r.applicable, false);
  assert.equal(r.bookValue, 1_000_000);
  assert.equal(r.accumulated, 0);
});

test("computeDepreciation: 정액법 절반 경과", () => {
  const r = computeDepreciation(
    { purchasePrice: 1_200_000, purchaseDate: "2025-01-01", usefulLifeMonths: 12, salvageValue: 0 },
    "2025-07-01"
  );
  assert.equal(r.applicable, true);
  assert.equal(r.monthly, 100_000);
  assert.equal(r.monthsElapsed, 6);
  assert.equal(r.accumulated, 600_000);
  assert.equal(r.bookValue, 600_000);
  assert.equal(r.progress, 0.5);
  assert.equal(r.fullyDepreciated, false);
});

test("computeDepreciation: 내용연수 경과 → 완전상각(장부가=잔존)", () => {
  const r = computeDepreciation(
    { purchasePrice: 1_200_000, purchaseDate: "2025-01-01", usefulLifeMonths: 12, salvageValue: 200_000 },
    "2027-01-01"
  );
  assert.equal(r.monthsElapsed, 12); // 한도
  assert.equal(r.accumulated, 1_000_000); // base = 1,200,000 - 200,000
  assert.equal(r.bookValue, 200_000); // 잔존가치
  assert.equal(r.fullyDepreciated, true);
});

test("computeDepreciation: 잔존가치는 취득가 상한", () => {
  const r = computeDepreciation(
    { purchasePrice: 500_000, purchaseDate: "2025-01-01", usefulLifeMonths: 10, salvageValue: 999_999 },
    "2025-01-01"
  );
  assert.equal(r.salvage, 500_000);
  assert.equal(r.base, 0);
});

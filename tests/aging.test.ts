import { test } from "node:test";
import assert from "node:assert/strict";
import { overdueDays, agingKey, summarizeAging, type AgingItem } from "../src/lib/aging.ts";

test("overdueDays: 경과일수 / null", () => {
  assert.equal(overdueDays("2026-01-01", "2026-01-31"), 30);
  assert.equal(overdueDays(null, "2026-01-31"), null);
  assert.equal(overdueDays("2026-02-01", "2026-01-31"), -1); // 미도래
});

test("agingKey: 버킷 분류", () => {
  assert.equal(agingKey("2026-02-01", "2026-01-31"), "notdue"); // 미도래
  assert.equal(agingKey("2026-01-01", "2026-01-01"), "notdue"); // 0일
  assert.equal(agingKey("2026-01-01", "2026-01-15"), "d1_30"); // 14일
  assert.equal(agingKey("2026-01-01", "2026-03-01"), "d31_60"); // 59일
  assert.equal(agingKey("2026-01-01", "2026-04-01"), "d61_90"); // 90일
  assert.equal(agingKey("2026-01-01", "2026-05-01"), "over90"); // 120일
});

test("summarizeAging: 채권/채무 집계 + 미도래 제외 합", () => {
  const items: AgingItem[] = [
    { amount: 100, ref: "2026-01-01", type: "SALES" }, // 30일 연체 → d1_30
    { amount: 50, ref: "2026-03-01", type: "SALES" }, // 미도래
    { amount: 200, ref: "2025-10-01", type: "PURCHASE" }, // over90
  ];
  const s = summarizeAging(items, "2026-01-31");
  assert.equal(s.recvTotal, 150);
  assert.equal(s.payTotal, 200);
  assert.equal(s.recvOverdue, 100); // 미도래 50 제외
  assert.equal(s.payOverdue, 200);
  assert.equal(s.recvCount, 2);
  assert.equal(s.payCount, 1);
  const d1 = s.buckets.find((b) => b.key === "d1_30")!;
  assert.equal(d1.recv, 100);
});

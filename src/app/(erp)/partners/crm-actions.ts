"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureUser } from "@/lib/auth-guard";
import type { ContractRow } from "@/lib/supabase/database.types";

export interface Result {
  ok: boolean;
  error?: string;
  id?: string;
  count?: number;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

// ---------------- 계약 ----------------

export interface ContractInput {
  partner_id: string;
  company_id: string | null;
  type: string;
  name: string;
  status?: string;
  start_date?: string | null;
  end_date?: string | null;
  auto_renew?: boolean;
  settle_unit?: string;
  evidence_type?: string | null;
  instructor_id?: string | null;
  unit_price?: string | number | null;
  memo?: string | null;
  detail?: Record<string, unknown>;
}

function contractPayload(input: ContractInput) {
  return {
    partner_id: input.partner_id,
    company_id: input.company_id ?? null,
    type: input.type,
    name: input.name.trim(),
    status: input.status ?? "ACTIVE",
    start_date: input.start_date || null,
    end_date: input.end_date || null,
    auto_renew: input.auto_renew ?? false,
    settle_unit: input.settle_unit ?? "MONTHLY",
    evidence_type: input.evidence_type || null,
    instructor_id: input.instructor_id || null,
    unit_price: num(input.unit_price),
    memo: input.memo?.trim() || null,
    detail: input.detail ?? {},
  };
}

export async function createContract(input: ContractInput): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  if (!input.partner_id) return { ok: false, error: "거래처가 지정되지 않았습니다" };
  if (!input.name.trim()) return { ok: false, error: "계약명을 입력하세요" };
  const db = createAdminClient();
  const { data, error } = await db.from("contracts").insert(contractPayload(input) as never).select("id").single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/partners");
  return { ok: true, id: (data as { id: string }).id };
}

export async function updateContract(id: string, input: ContractInput): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("contracts").update({ ...contractPayload(input), updated_at: new Date().toISOString() } as never).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/partners");
  return { ok: true };
}

export async function deleteContract(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("contracts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/partners");
  return { ok: true };
}

// ---------------- 거래내역 ----------------

export interface TxnInput {
  partner_id: string;
  company_id: string | null;
  contract_id?: string | null;
  type: string;
  txn_date: string;
  title?: string | null;
  qty?: string | number | null;
  unit_price?: string | number | null;
  instructor_id?: string | null;
  status?: string;
  memo?: string | null;
}

function txnPayload(input: TxnInput) {
  const qty = num(input.qty) ?? 1;
  const unit = num(input.unit_price) ?? 0;
  return {
    partner_id: input.partner_id,
    company_id: input.company_id ?? null,
    contract_id: input.contract_id || null,
    type: input.type,
    txn_date: input.txn_date,
    title: input.title?.trim() || null,
    qty,
    unit_price: unit,
    amount: Math.round(qty * unit),
    instructor_id: input.instructor_id || null,
    status: input.status ?? "DONE",
    memo: input.memo?.trim() || null,
  };
}

export async function createTransaction(input: TxnInput): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  if (!input.partner_id) return { ok: false, error: "거래처가 지정되지 않았습니다" };
  if (!input.txn_date) return { ok: false, error: "거래일을 입력하세요" };
  const db = createAdminClient();
  const { data, error } = await db.from("transactions").insert(txnPayload(input) as never).select("id").single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/partners");
  revalidatePath("/");
  return { ok: true, id: (data as { id: string }).id };
}

export async function updateTransaction(id: string, input: TxnInput): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("transactions").update({ ...txnPayload(input), updated_at: new Date().toISOString() } as never).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/partners");
  return { ok: true };
}

export async function deleteTransaction(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("transactions").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/partners");
  return { ok: true };
}

/**
 * 체육수업 계약 → 해당 월의 요일별 수업 회차를 거래내역(예정)으로 자동 생성.
 *   detail.dows(number[] 0=일)·detail.class_name 사용, 단가는 contract.unit_price.
 *   이미 같은 계약+날짜의 거래가 있으면 건너뜀(중복 방지).
 */
export async function generateMonthlyClassTxns(contractId: string, month: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: "월 형식 오류(YYYY-MM)" };
  const db = createAdminClient();
  const { data: c } = await db.from("contracts").select("*").eq("id", contractId).maybeSingle();
  const contract = c as ContractRow | null;
  if (!contract) return { ok: false, error: "계약을 찾을 수 없습니다" };

  const detail = contract.detail ?? {};
  const dowsRaw = (detail.dows ?? detail.dow) as unknown;
  const dows: number[] = Array.isArray(dowsRaw) ? dowsRaw.map(Number) : dowsRaw !== undefined ? [Number(dowsRaw)] : [];
  if (dows.length === 0) return { ok: false, error: "계약에 수업 요일(detail.dows)이 없습니다." };
  const className = typeof detail.class_name === "string" ? detail.class_name : contract.name;
  const unit = contract.unit_price ?? 0;

  const [y, m] = month.split("-").map(Number);
  const daysIn = new Date(y, m, 0).getDate();
  const existing = new Set(
    (((await db.from("transactions").select("txn_date").eq("contract_id", contractId)
      .gte("txn_date", `${month}-01`).lte("txn_date", `${month}-${String(daysIn).padStart(2, "0")}`)).data ?? []) as { txn_date: string }[])
      .map((r) => r.txn_date)
  );

  const rows: Record<string, unknown>[] = [];
  for (let d = 1; d <= daysIn; d++) {
    const date = new Date(y, m - 1, d);
    if (!dows.includes(date.getDay())) continue;
    const ymd = `${month}-${String(d).padStart(2, "0")}`;
    if (existing.has(ymd)) continue;
    rows.push({
      partner_id: contract.partner_id, company_id: contract.company_id, contract_id: contractId,
      type: "CLASS", txn_date: ymd, title: className, qty: 1, unit_price: unit, amount: Math.round(unit),
      instructor_id: contract.instructor_id, status: "PLANNED",
    });
  }
  if (rows.length === 0) return { ok: true, count: 0 };
  const { error } = await db.from("transactions").insert(rows as never);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/partners");
  return { ok: true, count: rows.length };
}

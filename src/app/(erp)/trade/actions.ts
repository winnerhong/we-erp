"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureUser, ensureCompanyAccess } from "@/lib/auth-guard";
import type { TaxInvoiceRow } from "@/lib/supabase/database.types";

export interface Result {
  ok: boolean;
  error?: string;
}

export interface NewTrade {
  company_id: string;
  type: "SALES" | "PURCHASE";
  partner_id: string | null;
  doc_date: string | null;
  supply_amount: number;
  vat_amount: number;
  total_amount: number;
  evidence: string;
  due_date: string | null;
  memo: string | null;
  account_id: string | null;
}

/** 매입/매출 거래 추가(세금계산서 장부에 기록). */
export async function createTrade(v: NewTrade): Promise<Result> {
  if (!v.company_id) return { ok: false, error: "사업자를 먼저 선택하세요" };
  const g = await ensureCompanyAccess(v.company_id);
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("tax_invoices").insert({
    company_id: v.company_id,
    type: v.type,
    status: "DONE",
    partner_id: v.partner_id,
    doc_date: v.doc_date,
    supply_amount: v.supply_amount,
    vat_amount: v.vat_amount,
    total_amount: v.total_amount,
    evidence: v.evidence,
    due_date: v.due_date,
    memo: v.memo,
    account_id: v.account_id,
  } as never);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/trade");
  revalidatePath("/tax-invoices");
  revalidatePath("/");
  return { ok: true };
}

async function guardInvoice(db: ReturnType<typeof createAdminClient>, id: string): Promise<string | null> {
  const { data } = await db.from("tax_invoices").select("company_id").eq("id", id).maybeSingle();
  const acc = await ensureCompanyAccess((data as { company_id: string | null } | null)?.company_id ?? null);
  return acc.error ?? null;
}

export async function updateTrade(id: string, patch: Partial<TaxInvoiceRow>): Promise<Result> {
  const db = createAdminClient();
  const gErr = await guardInvoice(db, id);
  if (gErr) return { ok: false, error: gErr };
  const { error } = await db.from("tax_invoices").update(patch as never).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/trade");
  revalidatePath("/tax-invoices");
  return { ok: true };
}

export async function deleteTrade(id: string): Promise<Result> {
  const db = createAdminClient();
  const gErr = await guardInvoice(db, id);
  if (gErr) return { ok: false, error: gErr };
  // 연결된 통장 거래의 참조 해제 후 삭제
  await db.from("bank_transactions").update({ tax_invoice_id: null, tax_status: "NEEDED" } as never).eq("tax_invoice_id", id);
  const { error } = await db.from("tax_invoices").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/trade");
  revalidatePath("/tax-invoices");
  revalidatePath("/");
  return { ok: true };
}

/** 거래(세금계산서)에 통장 거래를 연결 → 정산완료. */
export async function linkInvoiceToBankTxn(invoiceId: string, bankTxnId: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();

  // 거래처 보강: 거래에 거래처가 있으면 통장 거래에도 연결(비어있을 때만)
  const { data: inv } = await db.from("tax_invoices").select("partner_id").eq("id", invoiceId).maybeSingle();
  const partnerId = (inv as { partner_id: string | null } | null)?.partner_id ?? null;

  const { data: txn } = await db.from("bank_transactions").select("partner_id").eq("id", bankTxnId).maybeSingle();
  const txnPartner = (txn as { partner_id: string | null } | null)?.partner_id ?? null;

  const { error } = await db
    .from("bank_transactions")
    .update({
      tax_invoice_id: invoiceId,
      tax_status: "DONE",
      ...(partnerId && !txnPartner ? { partner_id: partnerId } : {}),
    } as never)
    .eq("id", bankTxnId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/trade");
  revalidatePath("/bank");
  return { ok: true };
}

/** 거래의 통장 정산 연결 해제(연결된 통장 거래 전부 + 수기 정산도 해제). */
export async function unlinkInvoiceBank(invoiceId: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db
    .from("bank_transactions")
    .update({ tax_invoice_id: null, tax_status: "NEEDED" } as never)
    .eq("tax_invoice_id", invoiceId);
  if (error) return { ok: false, error: error.message };
  await db.from("tax_invoices").update({ settled_at: null } as never).eq("id", invoiceId);
  revalidatePath("/trade");
  revalidatePath("/bank");
  revalidatePath("/finance");
  return { ok: true };
}

/** 빠른 수기 정산 — 받음/지급을 클릭 한 번으로 표시(또는 해제). */
export async function setInvoiceSettled(invoiceId: string, settled: boolean): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const today = new Date().toISOString().slice(0, 10);
  const db = createAdminClient();
  const { error } = await db
    .from("tax_invoices")
    .update({ settled_at: settled ? today : null } as never)
    .eq("id", invoiceId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/finance");
  revalidatePath("/trade");
  revalidatePath("/");
  return { ok: true };
}

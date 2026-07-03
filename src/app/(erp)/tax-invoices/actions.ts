"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureCompanyAccess, guardCompanyRows } from "@/lib/auth-guard";
import type { TaxInvoiceRow, TaxInvoiceStatus } from "@/lib/supabase/database.types";

export interface Result {
  ok: boolean;
  error?: string;
}

/** 대상 계산서(id)의 소속 회사 접근 권한 확인 → 오류메시지 또는 null. */
async function guardInvoice(db: ReturnType<typeof createAdminClient>, id: string): Promise<string | null> {
  const { data } = await db.from("tax_invoices").select("company_id").eq("id", id).maybeSingle();
  const acc = await ensureCompanyAccess((data as { company_id: string | null } | null)?.company_id ?? null);
  return acc.error ?? null;
}

export async function createTaxInvoice(
  value: Partial<TaxInvoiceRow> & { company_id: string; type: string }
): Promise<Result> {
  const g = await ensureCompanyAccess(value.company_id);
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("tax_invoices").insert(value as never);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tax-invoices");
  revalidatePath("/");
  return { ok: true };
}

export async function updateTaxInvoice(
  id: string,
  patch: Partial<TaxInvoiceRow>
): Promise<Result> {
  const db = createAdminClient();
  const gErr = await guardInvoice(db, id);
  if (gErr) return { ok: false, error: gErr };
  const { error } = await db.from("tax_invoices").update(patch as never).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tax-invoices");
  return { ok: true };
}

export async function setTaxInvoiceStatus(id: string, status: TaxInvoiceStatus) {
  return updateTaxInvoice(id, { status });
}

/** 수기 정산 처리(받음/지급). settledDate=null 이면 정산 해제. */
export async function setTaxInvoiceSettled(id: string, settledDate: string | null): Promise<Result> {
  const db = createAdminClient();
  const gErr = await guardInvoice(db, id);
  if (gErr) return { ok: false, error: gErr };
  const { error } = await db
    .from("tax_invoices")
    .update({ settled_at: settledDate } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tax-invoices");
  revalidatePath("/bank");
  revalidatePath("/");
  return { ok: true };
}

// ---------- 일괄 ----------
export async function bulkSetTaxStatus(ids: string[], status: TaxInvoiceStatus): Promise<Result & { count?: number }> {
  const g = await guardCompanyRows("tax_invoices", ids);
  if (g.error) return { ok: false, error: g.error };
  if (ids.length === 0) return { ok: true, count: 0 };
  const db = createAdminClient();
  const { error } = await db.from("tax_invoices").update({ status } as never).in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tax-invoices");
  revalidatePath("/");
  return { ok: true, count: ids.length };
}

/** 일괄 정산(받음/지급) 또는 해제(null). */
export async function bulkSetTaxSettled(ids: string[], settledDate: string | null): Promise<Result & { count?: number }> {
  const g = await guardCompanyRows("tax_invoices", ids);
  if (g.error) return { ok: false, error: g.error };
  if (ids.length === 0) return { ok: true, count: 0 };
  const db = createAdminClient();
  const { error } = await db.from("tax_invoices").update({ settled_at: settledDate } as never).in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tax-invoices");
  revalidatePath("/bank");
  revalidatePath("/");
  return { ok: true, count: ids.length };
}

export async function bulkDeleteTaxInvoices(ids: string[]): Promise<Result & { count?: number }> {
  const g = await guardCompanyRows("tax_invoices", ids);
  if (g.error) return { ok: false, error: g.error };
  if (ids.length === 0) return { ok: true, count: 0 };
  const db = createAdminClient();
  const { error } = await db.from("tax_invoices").delete().in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tax-invoices");
  revalidatePath("/");
  return { ok: true, count: ids.length };
}

export async function deleteTaxInvoice(id: string): Promise<Result> {
  const db = createAdminClient();
  const gErr = await guardInvoice(db, id);
  if (gErr) return { ok: false, error: gErr };
  const { error } = await db.from("tax_invoices").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tax-invoices");
  revalidatePath("/");
  return { ok: true };
}

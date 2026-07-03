"use server";

import { revalidatePath } from "next/cache";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureUser, ensureCompanyAccess } from "@/lib/auth-guard";
import { calcTax } from "@/lib/crm";
import { kstToday } from "@/lib/attendance";
import type { ContractRow, SettlementRow, PartnerAttachmentRow } from "@/lib/supabase/database.types";

const FILE_BUCKET = "library";

export interface Result {
  ok: boolean;
  error?: string;
  id?: string;
  count?: number;
  url?: string;
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

/** 대상 레코드(id)의 소속 회사 접근 권한 확인 → 오류메시지 또는 null. */
async function guardCompanyRow(db: ReturnType<typeof createAdminClient>, table: string, id: string): Promise<string | null> {
  const { data } = await db.from(table).select("company_id").eq("id", id).maybeSingle();
  const acc = await ensureCompanyAccess((data as { company_id: string | null } | null)?.company_id ?? null);
  return acc.error ?? null;
}

export async function createContract(input: ContractInput): Promise<Result> {
  const g = await ensureCompanyAccess(input.company_id ?? null);
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
  const db = createAdminClient();
  const gErr = await guardCompanyRow(db, "contracts", id);
  if (gErr) return { ok: false, error: gErr };
  const { error } = await db.from("contracts").update({ ...contractPayload(input), updated_at: new Date().toISOString() } as never).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/partners");
  return { ok: true };
}

export async function deleteContract(id: string): Promise<Result> {
  const db = createAdminClient();
  const gErr = await guardCompanyRow(db, "contracts", id);
  if (gErr) return { ok: false, error: gErr };
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
  const g = await ensureCompanyAccess(input.company_id ?? null);
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
  const db = createAdminClient();
  const gErr = await guardCompanyRow(db, "transactions", id);
  if (gErr) return { ok: false, error: gErr };
  const { error } = await db.from("transactions").update({ ...txnPayload(input), updated_at: new Date().toISOString() } as never).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/partners");
  return { ok: true };
}

export async function deleteTransaction(id: string): Promise<Result> {
  const db = createAdminClient();
  const gErr = await guardCompanyRow(db, "transactions", id);
  if (gErr) return { ok: false, error: gErr };
  const { error } = await db.from("transactions").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/partners");
  return { ok: true };
}

/** 관리자/매니저가 수업 회차 완료 처리(현장 모니터링). */
export async function managerSetSessionDone(id: string, done: boolean): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const patch: Record<string, unknown> = {
    status: done ? "DONE" : "PLANNED",
    completed_at: done ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("transactions").update(patch as never).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/sessions");
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
  const acc = await ensureCompanyAccess(contract.company_id);
  if (acc.error) return { ok: false, error: acc.error };

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

// ---------------- 정산(Settlement) ----------------

interface PartnerTaxInfo { company_id: string | null; name: string; tax_category: string | null; default_tax_rate: number | null }

/** 거래처+월의 미정산 거래를 모아 월별 정산 1건 생성(공급가 합산→부가세·합계). */
export async function generateMonthlySettlement(partnerId: string, month: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: "월 형식 오류(YYYY-MM)" };
  const db = createAdminClient();
  const [y, m] = month.split("-").map(Number);
  const last = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;

  const { data: txns } = await db
    .from("transactions").select("id, amount")
    .eq("partner_id", partnerId).is("settlement_id", null).neq("status", "CANCELED")
    .gte("txn_date", `${month}-01`).lte("txn_date", last);
  const list = (txns ?? []) as { id: string; amount: number }[];
  if (list.length === 0) return { ok: false, error: "정산할 미정산 거래가 없습니다(이미 정산됐거나 거래 없음)." };

  const { data: p } = await db.from("partners").select("company_id, name, tax_category, default_tax_rate").eq("id", partnerId).maybeSingle();
  const partner = p as PartnerTaxInfo | null;
  const acc = await ensureCompanyAccess(partner?.company_id ?? null);
  if (acc.error) return { ok: false, error: acc.error };
  const subtotal = list.reduce((s, t) => s + t.amount, 0);
  const { tax, total } = calcTax(subtotal, partner?.tax_category ?? null, partner?.default_tax_rate ?? null);

  const { data: st, error: sErr } = await db.from("settlements").insert({
    company_id: partner?.company_id ?? null, partner_id: partnerId, type: "MONTHLY", period: month,
    title: `${month} ${partner?.name ?? ""} 정산`.trim(), subtotal, tax_amount: tax, total, status: "DRAFT",
  } as never).select("id").single();
  if (sErr) return { ok: false, error: sErr.message };
  const sid = (st as { id: string }).id;
  const { error: uErr } = await db.from("transactions").update({ settlement_id: sid } as never).in("id", list.map((t) => t.id));
  if (uErr) return { ok: false, error: uErr.message };
  revalidatePath("/partners");
  return { ok: true, id: sid, count: list.length };
}

/** 선택한 거래들로 정산 1건 생성(건별/수동). */
export async function createSettlementFromTxns(partnerId: string, txnIds: string[], title?: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const ids = txnIds.filter(Boolean);
  if (ids.length === 0) return { ok: false, error: "선택된 거래가 없습니다" };
  const db = createAdminClient();
  const { data: txns } = await db.from("transactions").select("id, amount, settlement_id").in("id", ids).eq("partner_id", partnerId);
  const list = (txns ?? []) as { id: string; amount: number; settlement_id: string | null }[];
  if (list.some((t) => t.settlement_id)) return { ok: false, error: "이미 정산된 거래가 포함되어 있습니다." };
  if (list.length === 0) return { ok: false, error: "거래를 찾을 수 없습니다" };

  const { data: p } = await db.from("partners").select("company_id, name, tax_category, default_tax_rate").eq("id", partnerId).maybeSingle();
  const partner = p as PartnerTaxInfo | null;
  const acc = await ensureCompanyAccess(partner?.company_id ?? null);
  if (acc.error) return { ok: false, error: acc.error };
  const subtotal = list.reduce((s, t) => s + t.amount, 0);
  const { tax, total } = calcTax(subtotal, partner?.tax_category ?? null, partner?.default_tax_rate ?? null);

  const { data: st, error: sErr } = await db.from("settlements").insert({
    company_id: partner?.company_id ?? null, partner_id: partnerId, type: "MANUAL", period: null,
    title: title?.trim() || `${partner?.name ?? ""} 정산`.trim(), subtotal, tax_amount: tax, total, status: "DRAFT",
  } as never).select("id").single();
  if (sErr) return { ok: false, error: sErr.message };
  const sid = (st as { id: string }).id;
  await db.from("transactions").update({ settlement_id: sid } as never).in("id", list.map((t) => t.id));
  revalidatePath("/partners");
  return { ok: true, id: sid, count: list.length };
}

/** 정산 상태 변경(미발행/발행/입금) — 타임스탬프 동기화. */
export async function updateSettlementStatus(id: string, status: string): Promise<Result> {
  const db = createAdminClient();
  const gErr = await guardCompanyRow(db, "settlements", id);
  if (gErr) return { ok: false, error: gErr };
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "ISSUED") patch.issued_at = new Date().toISOString();
  if (status === "PAID") patch.paid_at = new Date().toISOString();
  const { error } = await db.from("settlements").update(patch as never).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/partners");
  return { ok: true };
}

/** 정산 삭제(해제) — FK on delete set null 로 포함 거래는 미정산으로 복귀. */
export async function deleteSettlement(id: string): Promise<Result> {
  const db = createAdminClient();
  const gErr = await guardCompanyRow(db, "settlements", id);
  if (gErr) return { ok: false, error: gErr };
  const { error } = await db.from("settlements").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/partners");
  return { ok: true };
}

// ---------------- 거래처 문서함(첨부) ----------------

export interface AttachInput {
  partner_id: string;
  company_id: string | null;
  title: string;
  category?: string | null;
  file_name: string;
  base64: string;
  mime?: string | null;
}

export async function uploadPartnerFile(input: AttachInput): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  if (!input.partner_id || !input.file_name || !input.base64) return { ok: false, error: "파일이 없습니다" };
  const db = createAdminClient();
  const bytes = Buffer.from(input.base64, "base64");
  if (bytes.length > 24 * 1024 * 1024) return { ok: false, error: "파일이 너무 큽니다(최대 24MB)." };
  const ext = input.file_name.includes(".") ? input.file_name.toLowerCase().split(".").pop() : "bin";
  const path = `partners/${input.partner_id}/${crypto.randomUUID()}.${ext}`;
  const up = await db.storage.from(FILE_BUCKET).upload(path, bytes, { contentType: input.mime ?? "application/octet-stream", upsert: false });
  if (up.error) return { ok: false, error: `업로드 실패: ${up.error.message}` };

  const { error } = await db.from("partner_attachments").insert({
    partner_id: input.partner_id, company_id: input.company_id ?? null,
    title: input.title.trim() || input.file_name, category: input.category || null,
    file_name: input.file_name, mime: input.mime ?? null, size_bytes: bytes.length, storage_path: path,
    uploaded_by: g.profile!.id, uploader_name: g.profile!.username ?? g.profile!.email ?? "관리자",
  } as never);
  if (error) { await db.storage.from(FILE_BUCKET).remove([path]); return { ok: false, error: error.message }; }
  revalidatePath("/partners");
  return { ok: true };
}

export async function getPartnerFileUrl(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { data } = await db.from("partner_attachments").select("storage_path, file_name").eq("id", id).maybeSingle();
  const row = data as Pick<PartnerAttachmentRow, "storage_path" | "file_name"> | null;
  if (!row) return { ok: false, error: "파일을 찾을 수 없습니다" };
  const { data: signed, error } = await db.storage.from(FILE_BUCKET).createSignedUrl(row.storage_path, 60, { download: row.file_name });
  if (error || !signed) return { ok: false, error: error?.message ?? "링크 생성 실패" };
  return { ok: true, url: signed.signedUrl };
}

export async function deletePartnerFile(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { data } = await db.from("partner_attachments").select("storage_path").eq("id", id).maybeSingle();
  const path = (data as { storage_path: string } | null)?.storage_path;
  const { error } = await db.from("partner_attachments").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (path) await db.storage.from(FILE_BUCKET).remove([path]);
  revalidatePath("/partners");
  return { ok: true };
}

/** 거래처 메모 로그 추가(누적). 작성자·시각 기록. */
export async function addPartnerMemo(partnerId: string, body: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const text = body.trim();
  if (!text) return { ok: false, error: "메모를 입력하세요" };
  const db = createAdminClient();
  const { error } = await db.from("partner_memos").insert({
    partner_id: partnerId,
    body: text,
    author_id: g.profile!.id,
    author_name: g.profile!.username ?? g.profile!.email ?? "관리자",
  } as never);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/partners");
  return { ok: true };
}

export async function deletePartnerMemo(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("partner_memos").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/partners");
  return { ok: true };
}

/** 정산 → 매출 세금계산서 생성·연결(수기). 팝빌 전 단계. */
export async function createTaxInvoiceFromSettlement(settlementId: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { data: s } = await db.from("settlements").select("*").eq("id", settlementId).maybeSingle();
  const st = s as SettlementRow | null;
  if (!st) return { ok: false, error: "정산을 찾을 수 없습니다" };
  if (st.tax_invoice_id) return { ok: false, error: "이미 세금계산서가 연결되어 있습니다." };
  if (!st.company_id) return { ok: false, error: "사업자가 지정되지 않은 거래처는 세금계산서를 만들 수 없습니다(거래처에 사업자 지정 후 재시도)." };
  const acc = await ensureCompanyAccess(st.company_id);
  if (acc.error) return { ok: false, error: acc.error };

  const { data: inv, error: iErr } = await db.from("tax_invoices").insert({
    company_id: st.company_id, type: "SALES", status: "DONE", partner_id: st.partner_id,
    doc_date: kstToday(), supply_amount: st.subtotal, vat_amount: st.tax_amount, total_amount: st.total,
    evidence: "세금계산서", memo: `정산 자동발행: ${st.title}`,
  } as never).select("id").single();
  if (iErr) return { ok: false, error: iErr.message };

  await db.from("settlements").update({
    tax_invoice_id: (inv as { id: string }).id, status: "ISSUED", issued_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  } as never).eq("id", settlementId);
  revalidatePath("/partners");
  revalidatePath("/tax-invoices");
  revalidatePath("/");
  return { ok: true, id: (inv as { id: string }).id };
}

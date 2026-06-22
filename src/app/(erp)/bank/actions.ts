"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureUser } from "@/lib/auth-guard";
import { parseBankRow, bankSourceRef } from "@/lib/bank-import";
import type { BankAccountRow, BankTransactionRow } from "@/lib/supabase/database.types";

export interface Result {
  ok: boolean;
  error?: string;
}

// ---------- 통장(계좌) ----------
export async function createBankAccount(
  value: Partial<BankAccountRow> & { company_id: string; alias: string }
): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("bank_accounts").insert(value as never);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bank");
  return { ok: true };
}

export async function updateBankAccount(
  id: string,
  patch: Partial<BankAccountRow>
): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("bank_accounts").update(patch as never).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bank");
  return { ok: true };
}

export async function deleteBankAccount(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  // 거래내역은 FK cascade 로 함께 삭제됨
  const { error } = await db.from("bank_accounts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bank");
  return { ok: true };
}

// ---------- 거래내역 ----------
export async function addTransaction(
  value: Partial<BankTransactionRow> & {
    bank_account_id: string;
    company_id: string;
    txn_date: string;
    direction: "IN" | "OUT";
  }
): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  // 수기 입력은 source_ref 없이(중복 허용)
  const { error } = await db.from("bank_transactions").insert({ ...value, source_ref: null } as never);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bank");
  revalidatePath("/");
  return { ok: true };
}

export async function updateTransaction(
  id: string,
  patch: Partial<BankTransactionRow>
): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("bank_transactions").update(patch as never).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bank");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteTransaction(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("bank_transactions").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bank");
  revalidatePath("/");
  return { ok: true };
}

// ---------- 일괄 작업(선택 행) ----------
export async function bulkDeleteTransactions(ids: string[]): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  if (ids.length === 0) return { ok: true };
  const db = createAdminClient();
  const { error } = await db.from("bank_transactions").delete().in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bank");
  revalidatePath("/");
  return { ok: true };
}

/** 선택 거래에 거래처 일괄 지정/해제. */
export async function bulkSetTxnPartner(ids: string[], partnerId: string | null): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  if (ids.length === 0) return { ok: true };
  const db = createAdminClient();
  const { error } = await db
    .from("bank_transactions")
    .update({ partner_id: partnerId } as never)
    .in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bank");
  return { ok: true };
}

/** 선택 거래의 계산서 상태 일괄 변경. */
export async function bulkSetTaxStatus(ids: string[], status: string | null): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  if (ids.length === 0) return { ok: true };
  const db = createAdminClient();
  const { error } = await db
    .from("bank_transactions")
    .update({ tax_status: status } as never)
    .in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bank");
  return { ok: true };
}

/** 세금계산서를 수기 정산 처리(받음/지급). settledDate=null 이면 정산 해제. */
export async function markInvoiceSettled(
  invoiceId: string,
  settledDate: string | null
): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db
    .from("tax_invoices")
    .update({ settled_at: settledDate } as never)
    .eq("id", invoiceId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bank");
  revalidatePath("/tax-invoices");
  revalidatePath("/");
  return { ok: true };
}

/** 거래에 거래처를 인라인으로 지정/해제(원장 행에서 바로 사용). */
export async function setTxnPartner(txnId: string, partnerId: string | null): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db
    .from("bank_transactions")
    .update({ partner_id: partnerId } as never)
    .eq("id", txnId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bank");
  return { ok: true };
}

/** 통장 출금을 카드대금 정산으로 연결/해제(카드 + 사용월). cardId=null 이면 해제. */
export async function setTxnCardSettlement(
  txnId: string,
  cardId: string | null,
  settlesMonth: string | null
): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db
    .from("bank_transactions")
    .update({
      settles_card_id: cardId,
      settles_month: cardId ? settlesMonth : null,
    } as never)
    .eq("id", txnId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bank");
  revalidatePath("/cards");
  return { ok: true };
}

// 통장→급여 자동연동 표시(이 메모가 붙은 급여만 자동 삭제 대상)
const AUTO_PAYROLL_MEMO = "통장 자동연동";

type AdminDb = ReturnType<typeof createAdminClient>;

/** 구분(bank_category)의 연동 유형 조회 ('employee' | null). */
async function categoryLinkType(db: AdminDb, value: string | null): Promise<string | null> {
  if (!value) return null;
  const { data } = await db
    .from("field_options")
    .select("link_type")
    .eq("category", "bank_category")
    .eq("value", value)
    .maybeSingle();
  return (data as { link_type: string | null } | null)?.link_type ?? null;
}

/** 자동생성된(메모로 표시) 급여 링크 정리. 수기 급여는 보존. */
async function clearAutoPayroll(db: AdminDb, payrollId: string | null) {
  if (!payrollId) return;
  await db.from("payrolls").delete().eq("id", payrollId).eq("memo", AUTO_PAYROLL_MEMO);
}

/** 거래의 사용자 정의 구분(분류)을 지정/해제. 직원연동이 아니게 되면 직원·급여 링크 정리. */
export async function setTxnCategory(txnId: string, category: string | null): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db
    .from("bank_transactions")
    .update({ category } as never)
    .eq("id", txnId);
  if (error) return { ok: false, error: error.message };

  // 구분이 더 이상 '직원' 연동이 아니면, 기존 직원/급여 연결 해제
  const linkType = await categoryLinkType(db, category);
  if (linkType !== "employee") {
    const { data: txn } = await db
      .from("bank_transactions")
      .select("employee_id, payroll_id")
      .eq("id", txnId)
      .maybeSingle();
    const t = txn as { employee_id: string | null; payroll_id: string | null } | null;
    if (t && (t.employee_id || t.payroll_id)) {
      await clearAutoPayroll(db, t.payroll_id);
      await db.from("bank_transactions").update({ employee_id: null, payroll_id: null } as never).eq("id", txnId);
      revalidatePath("/hr");
      revalidatePath("/employees");
    }
  }
  revalidatePath("/bank");
  return { ok: true };
}

/**
 * 거래에 직원을 연동(구분이 '직원' 연동일 때).
 * 직원을 지정하면 그 거래를 해당 직원의 '거래월' 급여(payrolls)로 자동 기록한다.
 *  - 그 달 급여가 이미 있으면 덮어쓰지 않고 링크만 연결
 *  - 없으면 기본급=실지급=거래금액으로 자동 급여를 생성(메모=자동연동)
 * employeeId=null 이면 연동 해제(자동 생성분은 삭제).
 */
export async function setTxnEmployee(txnId: string, employeeId: string | null): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();

  const { data: txnRow } = await db
    .from("bank_transactions")
    .select("id, txn_date, amount, category, company_id, payroll_id")
    .eq("id", txnId)
    .maybeSingle();
  const t = txnRow as
    | { id: string; txn_date: string; amount: number; category: string | null; company_id: string; payroll_id: string | null }
    | null;
  if (!t) return { ok: false, error: "거래를 찾을 수 없습니다." };

  // 기존 자동 급여 정리(직원 변경/해제 시)
  await clearAutoPayroll(db, t.payroll_id);

  let payrollId: string | null = null;
  if (employeeId) {
    const linkType = await categoryLinkType(db, t.category);
    if (linkType === "employee") {
      const ym = String(t.txn_date).slice(0, 7);
      // 직원 소속 사업자(없으면 거래의 사업자)
      const { data: emp } = await db.from("employees").select("company_id").eq("id", employeeId).maybeSingle();
      const companyId = (emp as { company_id: string | null } | null)?.company_id ?? t.company_id;
      // 이미 그 달 급여가 있으면 링크만 연결(덮어쓰지 않음)
      const { data: existing } = await db
        .from("payrolls")
        .select("id")
        .eq("employee_id", employeeId)
        .eq("year_month", ym)
        .maybeSingle();
      if (existing) {
        payrollId = (existing as { id: string }).id;
      } else {
        const { data: created, error: payErr } = await db
          .from("payrolls")
          .insert({
            company_id: companyId,
            employee_id: employeeId,
            year_month: ym,
            base_pay: t.amount,
            allowance: 0,
            nontax_allowance: 0,
            income_tax: 0,
            insurance: 0,
            other_deduction: 0,
            net_pay: t.amount,
            memo: AUTO_PAYROLL_MEMO,
          } as never)
          .select("id")
          .maybeSingle();
        if (payErr) return { ok: false, error: payErr.message };
        payrollId = (created as { id: string } | null)?.id ?? null;
      }
    }
  }

  const { error } = await db
    .from("bank_transactions")
    .update({ employee_id: employeeId, payroll_id: payrollId } as never)
    .eq("id", txnId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bank");
  revalidatePath("/hr");
  revalidatePath("/employees");
  return { ok: true };
}

/** 거래에 계정과목을 인라인으로 지정/해제. */
export async function setTxnAccount(txnId: string, accountId: string | null): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db
    .from("bank_transactions")
    .update({ account_id: accountId } as never)
    .eq("id", txnId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bank");
  return { ok: true };
}

/** 거래의 계산서 '보낸 곳'(발행/수취 상대)을 지정/해제. 연결된 계산서가 있으면 함께 갱신. */
export async function setTxnTaxPartner(txnId: string, partnerId: string | null): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { data: txn } = await db
    .from("bank_transactions")
    .select("tax_invoice_id")
    .eq("id", txnId)
    .maybeSingle();
  const { error } = await db
    .from("bank_transactions")
    .update({ tax_partner_id: partnerId } as never)
    .eq("id", txnId);
  if (error) return { ok: false, error: error.message };
  // 이미 발행된 계산서가 있으면 그 거래처도 동기화
  const invId = (txn as { tax_invoice_id: string | null } | null)?.tax_invoice_id;
  if (invId) {
    await db.from("tax_invoices").update({ partner_id: partnerId } as never).eq("id", invId);
    revalidatePath("/tax-invoices");
  }
  revalidatePath("/bank");
  return { ok: true };
}

// ---------- 세금계산서 대사(증빙) ----------

/** 거래의 증빙 상태만 변경(미확인/필요/완료/해당없음). */
export async function setBankTaxStatus(txnId: string, status: string | null): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("bank_transactions").update({ tax_status: status } as never).eq("id", txnId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bank");
  return { ok: true };
}

/**
 * 거래로부터 세금계산서를 생성하고 연결('완료' 처리).
 *  - 입금(IN)→매출(발행), 출금(OUT)→매입(수취).
 *  - 금액·날짜·거래처는 호출부에서 자동 채워 전달.
 */
export async function createTaxInvoiceFromTxn(
  txnId: string,
  fields: { partner_id: string | null; doc_date: string; supply_amount: number; vat_amount: number }
): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();

  const { data: txn } = await db
    .from("bank_transactions")
    .select("id, company_id, direction, tax_invoice_id")
    .eq("id", txnId)
    .maybeSingle();
  if (!txn) return { ok: false, error: "거래를 찾을 수 없습니다" };
  const t = txn as { company_id: string; direction: string; tax_invoice_id: string | null };
  if (t.tax_invoice_id) return { ok: false, error: "이미 세금계산서가 연결된 거래입니다" };

  const type = t.direction === "IN" ? "SALES" : "PURCHASE";
  const supply = Math.round(fields.supply_amount) || 0;
  const vat = Math.round(fields.vat_amount) || 0;

  const { data: inv, error: iErr } = await db
    .from("tax_invoices")
    .insert({
      company_id: t.company_id,
      type,
      status: "DONE",
      partner_id: fields.partner_id,
      doc_date: fields.doc_date || null,
      supply_amount: supply,
      vat_amount: vat,
      total_amount: supply + vat,
      memo: "통장 거래 연동",
    } as never)
    .select("id")
    .single();
  if (iErr || !inv) return { ok: false, error: iErr?.message ?? "세금계산서 생성 실패" };

  const base = { tax_invoice_id: (inv as { id: string }).id, tax_status: "DONE" };
  // 선택한 곳을 '보낸 곳'(계산서 발행/수취 상대)으로 기록(거래처와 분리)
  let { error: uErr } = await db
    .from("bank_transactions")
    .update({ ...base, ...(fields.partner_id ? { tax_partner_id: fields.partner_id } : {}) } as never)
    .eq("id", txnId);
  // tax_partner_id 마이그레이션 미적용 폴백 — 보낸곳 없이라도 발행은 완료
  if (uErr && /tax_partner_id/.test(uErr.message)) {
    ({ error: uErr } = await db.from("bank_transactions").update(base as never).eq("id", txnId));
  }
  if (uErr) return { ok: false, error: uErr.message };

  revalidatePath("/bank");
  revalidatePath("/tax-invoices");
  revalidatePath("/");
  return { ok: true };
}

/** 거래에 기존 영수증을 증빙으로 연결('완료' 처리). null이면 해제. */
export async function linkBankReceipt(txnId: string, receiptId: string | null): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db
    .from("bank_transactions")
    .update({ receipt_id: receiptId, tax_status: receiptId ? "DONE" : "NEEDED" } as never)
    .eq("id", txnId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bank");
  return { ok: true };
}

/** 거래의 증빙 연결 해제(세금계산서·영수증 모두 해제, 문서 자체는 유지). */
export async function unlinkTxnTaxInvoice(txnId: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db
    .from("bank_transactions")
    .update({ tax_invoice_id: null, receipt_id: null, tax_status: "NEEDED" } as never)
    .eq("id", txnId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bank");
  return { ok: true };
}

export interface BankBulkResult extends Result {
  inserted: number;
  skipped: number; // 중복(이미 등록됨)으로 건너뜀
  failed: { row: number; error: string }[];
}

/**
 * 은행 거래내역 일괄등록. 선택한 통장에 귀속.
 * 클라 미리보기를 신뢰하지 않고 서버에서 재파싱. 같은 지문은 중복으로 건너뜀.
 */
export async function bulkImportTransactions(
  bankAccountId: string,
  rawRows: Record<string, string>[]
): Promise<BankBulkResult> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error, inserted: 0, skipped: 0, failed: [] };

  const db = createAdminClient();
  // 통장 → company_id 확인
  const { data: acct, error: acctErr } = await db
    .from("bank_accounts")
    .select("id, company_id")
    .eq("id", bankAccountId)
    .maybeSingle();
  if (acctErr || !acct)
    return { ok: false, error: "통장을 찾을 수 없습니다", inserted: 0, skipped: 0, failed: [] };
  const companyId = (acct as { company_id: string }).company_id;

  const toInsert: Record<string, unknown>[] = [];
  const failed: { row: number; error: string }[] = [];
  const seen = new Set<string>();
  rawRows.forEach((raw, i) => {
    const res = parseBankRow(raw);
    if (!res.ok) {
      failed.push({ row: i + 2, error: res.error });
      return;
    }
    const ref = bankSourceRef(res.value);
    if (seen.has(ref)) return; // 같은 파일 내 중복 제거
    seen.add(ref);
    toInsert.push({
      bank_account_id: bankAccountId,
      company_id: companyId,
      ...res.value,
      source_ref: ref,
    });
  });

  let inserted = 0;
  let skipped = 0;
  if (toInsert.length > 0) {
    // 이미 등록된 지문을 조회해서 제외(부분 유니크 인덱스라 onConflict 대신 직접 중복 제거)
    const refs = toInsert.map((r) => r.source_ref as string);
    const { data: existing } = await db
      .from("bank_transactions")
      .select("source_ref")
      .eq("bank_account_id", bankAccountId)
      .in("source_ref", refs);
    const have = new Set((existing ?? []).map((e) => (e as { source_ref: string }).source_ref));
    const fresh = toInsert.filter((r) => !have.has(r.source_ref as string));
    skipped = toInsert.length - fresh.length;

    if (fresh.length > 0) {
      let { data, error } = await db.from("bank_transactions").insert(fresh as never[]).select("id");
      // txn_time 마이그레이션 미적용 폴백 — 시각 없이라도 등록
      if (error && /txn_time/.test(error.message)) {
        const stripped = fresh.map((r) => {
          const { txn_time, ...rest } = r as Record<string, unknown>;
          void txn_time;
          return rest;
        });
        ({ data, error } = await db.from("bank_transactions").insert(stripped as never[]).select("id"));
      }
      if (error) {
        return { ok: false, error: error.message, inserted: 0, skipped: 0, failed };
      }
      inserted = (data ?? []).length;
    }
  }

  revalidatePath("/bank");
  revalidatePath("/");
  return { ok: true, inserted, skipped, failed };
}

// ---------- 페이백(Payback) ----------
// 통장 입금 중 일부를 강사/거래처에 되돌려줄 때. 지급 시 원천징수(세금) 공제.

const round0 = (n: number) => Math.round(n);

export interface PaybackInput {
  bank_transaction_id: string;
  recipient_type: "PARTNER" | "EMPLOYEE";
  partner_id?: string | null;
  employee_id?: string | null;
  gross_amount: number;
  tax_rate: number; // %
  memo?: string | null;
}

/** 페이백 추가(세액·실지급액은 서버에서 계산). */
export async function createPayback(input: PaybackInput): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();

  // 출처 거래에서 사업자 가져오기
  const { data: txn } = await db
    .from("bank_transactions")
    .select("company_id")
    .eq("id", input.bank_transaction_id)
    .maybeSingle();
  const companyId = (txn as { company_id: string } | null)?.company_id ?? null;

  const gross = Math.max(0, round0(input.gross_amount));
  const taxAmount = round0((gross * input.tax_rate) / 100);
  const net = gross - taxAmount;

  const { error } = await db.from("paybacks").insert({
    company_id: companyId,
    bank_transaction_id: input.bank_transaction_id,
    recipient_type: input.recipient_type,
    partner_id: input.recipient_type === "PARTNER" ? input.partner_id ?? null : null,
    employee_id: input.recipient_type === "EMPLOYEE" ? input.employee_id ?? null : null,
    gross_amount: gross,
    tax_rate: input.tax_rate,
    tax_amount: taxAmount,
    net_amount: net,
    status: "PENDING",
    memo: input.memo ?? null,
  } as never);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bank");
  revalidatePath("/paybacks");
  return { ok: true };
}

/** 페이백 수정(금액/세율 바뀌면 세액·실지급액 재계산). 지급완료 건은 금액 수정 불가. */
export async function updatePayback(
  id: string,
  patch: {
    recipient_type?: "PARTNER" | "EMPLOYEE";
    partner_id?: string | null;
    employee_id?: string | null;
    gross_amount?: number;
    tax_rate?: number;
    memo?: string | null;
  }
): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();

  const { data: cur } = await db
    .from("paybacks")
    .select("gross_amount, tax_rate, status")
    .eq("id", id)
    .maybeSingle();
  const c = cur as { gross_amount: number; tax_rate: number; status: string } | null;
  if (!c) return { ok: false, error: "페이백을 찾을 수 없습니다." };

  const upd: Record<string, unknown> = {};
  if (patch.recipient_type) {
    upd.recipient_type = patch.recipient_type;
    upd.partner_id = patch.recipient_type === "PARTNER" ? patch.partner_id ?? null : null;
    upd.employee_id = patch.recipient_type === "EMPLOYEE" ? patch.employee_id ?? null : null;
  } else {
    if (patch.partner_id !== undefined) upd.partner_id = patch.partner_id;
    if (patch.employee_id !== undefined) upd.employee_id = patch.employee_id;
  }
  if (patch.memo !== undefined) upd.memo = patch.memo;

  const gross = patch.gross_amount != null ? Math.max(0, round0(patch.gross_amount)) : c.gross_amount;
  const rate = patch.tax_rate != null ? patch.tax_rate : c.tax_rate;
  if (patch.gross_amount != null || patch.tax_rate != null) {
    if (c.status === "PAID") return { ok: false, error: "지급완료된 페이백은 금액을 수정할 수 없습니다. 먼저 지급을 취소하세요." };
    upd.gross_amount = gross;
    upd.tax_rate = rate;
    upd.tax_amount = round0((gross * rate) / 100);
    upd.net_amount = gross - round0((gross * rate) / 100);
  }

  const { error } = await db.from("paybacks").update(upd as never).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bank");
  revalidatePath("/paybacks");
  return { ok: true };
}

/** 페이백 삭제(지급완료 시 자동 생성된 출금거래도 함께 삭제). */
export async function deletePayback(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { data: cur } = await db.from("paybacks").select("paid_txn_id").eq("id", id).maybeSingle();
  const paidTxnId = (cur as { paid_txn_id: string | null } | null)?.paid_txn_id ?? null;
  if (paidTxnId) await db.from("bank_transactions").delete().eq("id", paidTxnId);
  const { error } = await db.from("paybacks").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bank");
  revalidatePath("/paybacks");
  revalidatePath("/");
  return { ok: true };
}

/** 페이백 지급완료 처리 — 통장에 실지급액(세후) 출금거래를 자동 생성하고 연결. */
export async function payPayback(id: string, paidDate?: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();

  const { data: pb } = await db
    .from("paybacks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const p = pb as PaybackRowLite | null;
  if (!p) return { ok: false, error: "페이백을 찾을 수 없습니다." };
  if (p.status === "PAID") return { ok: false, error: "이미 지급완료된 페이백입니다." };

  const date = paidDate || new Date().toISOString().slice(0, 10);

  // 출처 거래의 통장·사업자
  const { data: srcTxn } = await db
    .from("bank_transactions")
    .select("bank_account_id, company_id")
    .eq("id", p.bank_transaction_id ?? "")
    .maybeSingle();
  const src = srcTxn as { bank_account_id: string; company_id: string } | null;
  if (!src) return { ok: false, error: "출처 거래를 찾을 수 없습니다." };

  // 받는 사람 이름(적요용)
  let recipientName = "페이백";
  if (p.recipient_type === "EMPLOYEE" && p.employee_id) {
    const { data: e } = await db.from("employees").select("name").eq("id", p.employee_id).maybeSingle();
    recipientName = (e as { name: string } | null)?.name ?? recipientName;
  } else if (p.partner_id) {
    const { data: pt } = await db.from("partners").select("name").eq("id", p.partner_id).maybeSingle();
    recipientName = (pt as { name: string } | null)?.name ?? recipientName;
  }

  // 실지급액(세후) 출금거래 자동 생성
  const { data: created, error: txnErr } = await db
    .from("bank_transactions")
    .insert({
      bank_account_id: src.bank_account_id,
      company_id: src.company_id,
      txn_date: date,
      direction: "OUT",
      amount: p.net_amount,
      description: `페이백 지급 - ${recipientName}`,
      counterparty: recipientName,
      partner_id: p.recipient_type === "PARTNER" ? p.partner_id : null,
      employee_id: p.recipient_type === "EMPLOYEE" ? p.employee_id : null,
      memo: `페이백 총액 ${p.gross_amount.toLocaleString()} · 원천징수 ${p.tax_rate}%(${p.tax_amount.toLocaleString()})`,
      source_ref: null,
    } as never)
    .select("id")
    .maybeSingle();
  if (txnErr) return { ok: false, error: txnErr.message };
  const paidTxnId = (created as { id: string } | null)?.id ?? null;

  const { error } = await db
    .from("paybacks")
    .update({ status: "PAID", paid_at: date, paid_txn_id: paidTxnId } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bank");
  revalidatePath("/paybacks");
  revalidatePath("/");
  return { ok: true };
}

/** 페이백 지급 취소 — 자동 생성된 출금거래 삭제 후 '예정'으로 되돌림. */
export async function unpayPayback(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { data: cur } = await db.from("paybacks").select("paid_txn_id").eq("id", id).maybeSingle();
  const paidTxnId = (cur as { paid_txn_id: string | null } | null)?.paid_txn_id ?? null;
  if (paidTxnId) await db.from("bank_transactions").delete().eq("id", paidTxnId);
  const { error } = await db
    .from("paybacks")
    .update({ status: "PENDING", paid_at: null, paid_txn_id: null } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bank");
  revalidatePath("/paybacks");
  revalidatePath("/");
  return { ok: true };
}

type PaybackRowLite = {
  id: string;
  bank_transaction_id: string | null;
  recipient_type: string;
  partner_id: string | null;
  employee_id: string | null;
  gross_amount: number;
  tax_rate: number;
  tax_amount: number;
  net_amount: number;
  status: string;
};

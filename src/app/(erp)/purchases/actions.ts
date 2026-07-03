"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchLinkPreview, type LinkPreview } from "@/lib/link-preview";
import { AUTO_APPROVE_LIMIT } from "@/lib/labels";
import { ensureUser, ensureCompanyAccess, guardCompanyRow, guardCompanyRows } from "@/lib/auth-guard";
import { kstToday } from "@/lib/attendance";
import type {
  PurchaseRequestRow,
  PurchaseStatus,
  PaymentMethod,
} from "@/lib/supabase/database.types";

export interface Result {
  ok: boolean;
  error?: string;
}

/** 상품 링크 미리보기 (클라이언트 ‘미리보기’ 버튼). */
export async function previewLink(url: string): Promise<LinkPreview> {
  const g = await ensureUser();
  if (g.error) return { title: null, image: null, price: null };
  return fetchLinkPreview(url);
}

export interface NewPurchase {
  company_id: string;
  requester_name?: string | null;
  department?: string | null;
  product_url?: string | null;
  product_name?: string | null;
  product_image?: string | null;
  unit_price?: number | null;
  quantity: number;
  amount: number;
  reason?: string | null;
  partner_id?: string | null;
}

/** 구매 요청 등록. 소액(AUTO_APPROVE_LIMIT 미만)은 자동 승인. */
export async function createPurchaseRequest(v: NewPurchase): Promise<Result> {
  if (!v.company_id) return { ok: false, error: "사업자를 먼저 선택하세요" };
  const g = await ensureCompanyAccess(v.company_id);
  if (g.error) return { ok: false, error: g.error };
  const autoApprove = v.amount > 0 && v.amount < AUTO_APPROVE_LIMIT;
  const db = createAdminClient();
  const { error } = await db.from("purchase_requests").insert({
    ...v,
    status: autoApprove ? "APPROVED" : "PENDING",
    review_note: autoApprove ? `소액 자동승인(${AUTO_APPROVE_LIMIT.toLocaleString()}원 미만)` : null,
  } as never);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/purchases");
  revalidatePath("/");
  return { ok: true };
}

/** 승인 / 반려 / 보류. */
export async function reviewPurchase(
  id: string,
  status: Extract<PurchaseStatus, "APPROVED" | "REJECTED" | "ON_HOLD" | "PENDING">,
  note?: string
): Promise<Result> {
  const g = await guardCompanyRow("purchase_requests", id);
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db
    .from("purchase_requests")
    .update({ status, review_note: note ?? null } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/purchases");
  return { ok: true };
}

/** 결제 완료 처리. bankAccountId 지정 시 해당 통장에 출금 거래를 자동 생성. */
export async function markPurchased(
  id: string,
  payerName: string,
  paymentMethod: PaymentMethod | null,
  bankAccountId?: string | null
): Promise<Result> {
  const g = await guardCompanyRow("purchase_requests", id);
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();

  // 통장 연동을 위해 구매 정보 조회
  const { data: pr } = await db
    .from("purchase_requests")
    .select("company_id, amount, product_name, partner_id, account_id, status")
    .eq("id", id)
    .maybeSingle();

  // 이미 결제완료면 재처리 금지(중복 클릭·재시도 시 통장 출금 이중 생성 방지)
  if ((pr as { status?: string } | null)?.status === "PURCHASED") {
    return { ok: false, error: "이미 결제완료 처리된 요청입니다." };
  }

  const { error } = await db
    .from("purchase_requests")
    .update({
      status: "PURCHASED",
      payer_name: payerName || null,
      payment_method: paymentMethod,
      paid_at: new Date().toISOString(),
    } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  // 통장 출금 거래 자동 생성(계정과목·거래처 승계)
  if (bankAccountId && pr) {
    const p = pr as {
      company_id: string;
      amount: number;
      product_name: string | null;
      partner_id: string | null;
      account_id: string | null;
    };
    if (p.amount > 0) {
      await db.from("bank_transactions").insert({
        bank_account_id: bankAccountId,
        company_id: p.company_id,
        txn_date: kstToday(),
        direction: "OUT",
        amount: p.amount,
        description: p.product_name ? `구매: ${p.product_name}` : "구매 결제",
        partner_id: p.partner_id,
        account_id: p.account_id,
        source_ref: null,
      } as never);
      revalidatePath("/bank");
    }
  }

  revalidatePath("/purchases");
  revalidatePath("/");
  return { ok: true };
}

/** 선택 구매건 일괄 승인/반려/보류. */
export async function bulkReviewPurchases(
  ids: string[],
  status: Extract<PurchaseStatus, "APPROVED" | "REJECTED" | "ON_HOLD">,
  note?: string
): Promise<Result> {
  const g = await guardCompanyRows("purchase_requests", ids);
  if (g.error) return { ok: false, error: g.error };
  if (ids.length === 0) return { ok: true };
  const db = createAdminClient();
  const { error } = await db
    .from("purchase_requests")
    .update({ status, review_note: note ?? null } as never)
    .in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/purchases");
  revalidatePath("/");
  return { ok: true };
}

/** 선택 구매건 일괄 삭제. */
export async function bulkDeletePurchases(ids: string[]): Promise<Result> {
  const g = await guardCompanyRows("purchase_requests", ids);
  if (g.error) return { ok: false, error: g.error };
  if (ids.length === 0) return { ok: true };
  const db = createAdminClient();
  const { error } = await db.from("purchase_requests").delete().in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/purchases");
  revalidatePath("/");
  return { ok: true };
}

export async function updatePurchase(
  id: string,
  patch: Partial<PurchaseRequestRow>
): Promise<Result> {
  const g = await guardCompanyRow("purchase_requests", id);
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("purchase_requests").update(patch as never).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/purchases");
  return { ok: true };
}

/** 구매건에 영수증(증빙) 연결/해제. */
export async function linkPurchaseReceipt(
  id: string,
  receiptId: string | null
): Promise<Result> {
  const g = await guardCompanyRow("purchase_requests", id);
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db
    .from("purchase_requests")
    .update({ receipt_id: receiptId } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/purchases");
  return { ok: true };
}

export async function deletePurchase(id: string): Promise<Result> {
  const g = await guardCompanyRow("purchase_requests", id);
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("purchase_requests").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/purchases");
  revalidatePath("/");
  return { ok: true };
}

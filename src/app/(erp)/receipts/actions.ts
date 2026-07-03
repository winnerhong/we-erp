"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  isOcrConfigured,
  runReceiptOcr,
  mediaTypeFromName,
  type OcrResult,
} from "@/lib/ocr";
import { defaultVatDeductible } from "@/lib/labels";
import { normalizeBizNo } from "@/lib/validation";
import { ensureCompanyAccess, guardCompanyRow } from "@/lib/auth-guard";
import type { ReceiptRow } from "@/lib/supabase/database.types";

const BUCKET = "receipts";

export interface UploadResult {
  ok: boolean;
  error?: string;
  ocrUsed?: boolean;
}

/**
 * 영수증 1장 업로드 → Storage 저장 → (가능하면) OCR 추출 → PENDING 으로 등록.
 * base64 는 data URL 이 아닌 순수 base64 문자열.
 */
export async function uploadReceipt(
  companyId: string,
  fileName: string,
  base64: string
): Promise<UploadResult> {
  if (!companyId) return { ok: false, error: "사업자를 먼저 선택하세요" };
  const g = await ensureCompanyAccess(companyId);
  if (g.error) return { ok: false, error: g.error };
  const mediaType = mediaTypeFromName(fileName);
  if (!mediaType)
    return { ok: false, error: `지원하지 않는 형식: ${fileName} (jpg/png/webp/gif)` };

  const db = createAdminClient();
  const bytes = Buffer.from(base64, "base64");
  const ext = fileName.toLowerCase().split(".").pop();
  const path = `${companyId}/${crypto.randomUUID()}.${ext}`;

  const up = await db.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: mediaType, upsert: false });
  if (up.error) return { ok: false, error: `업로드 실패: ${up.error.message}` };

  // OCR (키 없으면 건너뜀 → 수기입력)
  let ocr: OcrResult | null = null;
  let ocrError: string | null = null;
  if (isOcrConfigured()) {
    try {
      const supabase = await createClient();
      const { data: accounts } = await supabase
        .from("accounts")
        .select("code, name")
        .eq("is_active", true);
      ocr = await runReceiptOcr(base64, mediaType, accounts ?? []);
    } catch (e) {
      ocrError = e instanceof Error ? e.message : "OCR 처리 오류";
    }
  } else {
    ocrError = "OCR 미설정(ANTHROPIC_API_KEY 없음) — 수기 입력 필요";
  }

  // 계정·거래처 매칭
  let accountId: string | null = null;
  let partnerId: string | null = null;
  if (ocr) {
    const supabase = await createClient();
    if (ocr.account_code) {
      const { data } = await supabase
        .from("accounts")
        .select("id")
        .eq("code", ocr.account_code)
        .maybeSingle();
      accountId = (data as { id: string } | null)?.id ?? null;
    }
    if (ocr.biz_no) {
      const { data } = await supabase
        .from("partners")
        .select("id")
        .eq("biz_no", normalizeBizNo(ocr.biz_no))
        .maybeSingle();
      partnerId = (data as { id: string } | null)?.id ?? null;
    }
  }

  const row: Record<string, unknown> = {
    company_id: companyId,
    image_path: path,
    status: "PENDING",
    vendor_name: ocr?.vendor_name ?? null,
    biz_no: ocr?.biz_no ? normalizeBizNo(ocr.biz_no) : null,
    doc_date: ocr?.doc_date ?? null,
    supply_amount: ocr?.supply_amount ?? null,
    vat_amount: ocr?.vat_amount ?? null,
    total_amount: ocr?.total_amount ?? null,
    payment_method: ocr?.payment_method ?? null,
    evidence_type: ocr?.evidence_type ?? null,
    vat_deductible: ocr ? defaultVatDeductible(ocr.evidence_type) : null,
    account_id: accountId,
    partner_id: partnerId,
    raw_ocr: ocr ?? null,
    ocr_error: ocrError,
  };

  const ins = await db.from("receipts").insert(row as never);
  if (ins.error) return { ok: false, error: ins.error.message };

  revalidatePath("/receipts");
  revalidatePath("/");
  return { ok: true, ocrUsed: !!ocr };
}

/** 검수 수정. */
export async function updateReceipt(
  id: string,
  patch: Partial<ReceiptRow>
): Promise<{ ok: boolean; error?: string }> {
  const g = await guardCompanyRow("receipts", id);
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("receipts").update(patch as never).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/receipts");
  return { ok: true };
}

/**
 * 확정 처리. 증빙종류가 세금계산서면 매입 세금계산서로 자동 연결.
 */
export async function confirmReceipt(id: string) {
  const res = await updateReceipt(id, { status: "CONFIRMED" });
  if (!res.ok) return res;

  const db = createAdminClient();
  const { data } = await db
    .from("receipts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const r = data as ReceiptRow | null;
  if (r && r.evidence_type === "TAX_INVOICE") {
    // 영수증을 수취했으므로 매입(PURCHASE) · 수취완료(DONE). receipt_id unique → 중복 무시.
    await db.from("tax_invoices").upsert(
      {
        company_id: r.company_id,
        type: "PURCHASE",
        status: "DONE",
        partner_id: r.partner_id,
        doc_date: r.doc_date,
        supply_amount: r.supply_amount ?? 0,
        vat_amount: r.vat_amount ?? 0,
        total_amount: r.total_amount ?? 0,
        receipt_id: r.id,
      } as never,
      { onConflict: "receipt_id", ignoreDuplicates: true }
    );
    revalidatePath("/tax-invoices");
  }
  return res;
}

/** 삭제 (Storage 객체도 함께 제거). */
export async function deleteReceipt(id: string, imagePath: string) {
  const g = await guardCompanyRow("receipts", id);
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  await db.storage.from(BUCKET).remove([imagePath]);
  const { error } = await db.from("receipts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/receipts");
  revalidatePath("/");
  return { ok: true };
}

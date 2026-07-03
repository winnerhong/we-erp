"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureUser, ensureCompanyAccess } from "@/lib/auth-guard";
import { parseCardRow, cardSourceRef } from "@/lib/card-import";
import type { CardRow, CardTransactionRow } from "@/lib/supabase/database.types";

export interface Result {
  ok: boolean;
  error?: string;
}

// ---------- 카드 ----------
export async function createCard(
  value: Partial<CardRow> & { company_id: string; alias: string }
): Promise<Result> {
  const g = await ensureCompanyAccess(value.company_id);
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("cards").insert(value as never);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cards");
  return { ok: true };
}

export async function updateCard(id: string, patch: Partial<CardRow>): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("cards").update(patch as never).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cards");
  return { ok: true };
}

export async function deleteCard(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("cards").delete().eq("id", id); // 사용내역은 FK cascade
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cards");
  return { ok: true };
}

// ---------- 사용내역 ----------
/** 수기 1건 추가. */
export async function addCardTxn(
  value: Partial<CardTransactionRow> & { card_id: string; company_id: string; txn_date: string }
): Promise<Result> {
  const g = await ensureCompanyAccess(value.company_id);
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("card_transactions").insert(value as never);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cards");
  return { ok: true };
}

/** 인라인 셀 편집 등 단건 수정(거래처·계정·구분·금액·메모 공용). */
export async function updateCardTxn(
  id: string,
  patch: Partial<CardTransactionRow>
): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("card_transactions").update(patch as never).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cards");
  return { ok: true };
}

export async function deleteCardTxn(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("card_transactions").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cards");
  return { ok: true };
}

/** 선택 행 일괄 수정(거래처·계정·구분 등 공용). */
export async function bulkUpdateCardTxns(ids: string[], patch: Partial<CardTransactionRow>): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  if (ids.length === 0) return { ok: true };
  const db = createAdminClient();
  const { error } = await db.from("card_transactions").update(patch as never).in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cards");
  return { ok: true };
}

export async function bulkDeleteCardTxns(ids: string[]): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  if (ids.length === 0) return { ok: true };
  const db = createAdminClient();
  const { error } = await db.from("card_transactions").delete().in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cards");
  return { ok: true };
}

export interface CardBulkResult {
  ok: boolean;
  error?: string;
  inserted: number;
  skipped: number;
  failed: { row: number; error: string }[];
}

/** 카드 명세서 일괄등록. 서버에서 재검증·지문 중복제거 후 삽입. */
export async function bulkImportCardTxns(
  cardId: string,
  rawRows: Record<string, string>[]
): Promise<CardBulkResult> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error, inserted: 0, skipped: 0, failed: [] };

  const db = createAdminClient();
  const { data: card, error: cardErr } = await db
    .from("cards")
    .select("id, company_id")
    .eq("id", cardId)
    .maybeSingle();
  if (cardErr || !card)
    return { ok: false, error: "카드를 찾을 수 없습니다", inserted: 0, skipped: 0, failed: [] };
  const companyId = (card as { company_id: string }).company_id;

  const toInsert: Record<string, unknown>[] = [];
  const failed: { row: number; error: string }[] = [];
  const seen = new Set<string>();
  rawRows.forEach((raw, i) => {
    const res = parseCardRow(raw);
    if (!res.ok) {
      failed.push({ row: i + 2, error: res.error });
      return;
    }
    const ref = cardSourceRef(res.value);
    if (seen.has(ref)) return; // 같은 파일 내 중복
    seen.add(ref);
    toInsert.push({ card_id: cardId, company_id: companyId, ...res.value, source_ref: ref });
  });

  let inserted = 0;
  let skipped = 0;
  if (toInsert.length > 0) {
    const refs = toInsert.map((r) => r.source_ref as string);
    const { data: existing } = await db
      .from("card_transactions")
      .select("source_ref")
      .eq("card_id", cardId)
      .in("source_ref", refs);
    const have = new Set((existing ?? []).map((e) => (e as { source_ref: string }).source_ref));
    const fresh = toInsert.filter((r) => !have.has(r.source_ref as string));
    skipped = toInsert.length - fresh.length;

    if (fresh.length > 0) {
      const { data, error } = await db.from("card_transactions").insert(fresh as never[]).select("id");
      if (error) return { ok: false, error: error.message, inserted: 0, skipped, failed };
      inserted = data?.length ?? fresh.length;
    }
  }

  revalidatePath("/cards");
  return { ok: true, inserted, skipped, failed };
}

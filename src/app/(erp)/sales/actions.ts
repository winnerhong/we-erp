"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureUser, ensureCompanyAccess } from "@/lib/auth-guard";

export interface Result {
  ok: boolean;
  error?: string;
  id?: string;
}

const NUM_FIELDS = new Set(["amount", "qty"]);

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** 일매출/일지출 한 줄 추가(빈 줄 → 인라인 수정). */
export async function addDailyRecord(input: {
  company_id: string;
  record_date: string;
  kind: "SALES" | "EXPENSE";
  category?: string | null;
  payment_method?: string | null;
  amount?: number;
}): Promise<Result> {
  if (!input.company_id) return { ok: false, error: "사업자를 먼저 선택하세요." };
  if (!input.record_date) return { ok: false, error: "날짜가 없습니다." };
  const g = await ensureCompanyAccess(input.company_id);
  if (g.error) return { ok: false, error: g.error };

  const db = createAdminClient();
  const { data, error } = await db
    .from("daily_records")
    .insert({
      company_id: input.company_id,
      record_date: input.record_date,
      kind: input.kind,
      category: input.category ?? null,
      payment_method: input.payment_method ?? "CASH",
      amount: input.amount ?? 0,
      created_by: g.profile!.id,
    } as never)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/sales");
  return { ok: true, id: (data as { id: string }).id };
}

/** 셀 인라인 수정. */
export async function updateDailyRecord(id: string, patch: Record<string, unknown>): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };

  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (NUM_FIELDS.has(k)) clean[k] = toNum(v);
    else clean[k] = v === "" ? null : v;
  }
  const db = createAdminClient();
  const { error } = await db.from("daily_records").update(clean as never).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/sales");
  return { ok: true };
}

/** 단건 삭제. */
export async function deleteDailyRecord(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("daily_records").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/sales");
  return { ok: true };
}

/** 선택 일괄 삭제. */
export async function bulkDeleteDailyRecords(ids: string[]): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  if (ids.length === 0) return { ok: true };
  const db = createAdminClient();
  const { error } = await db.from("daily_records").delete().in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/sales");
  return { ok: true };
}

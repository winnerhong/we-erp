"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAdmin } from "@/lib/auth-guard";

export interface Result {
  ok: boolean;
  error?: string;
}

/** 사업자·월 회계기간 마감(잠금). */
export async function lockPeriod(companyId: string, period: string, memo?: string): Promise<Result> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  if (!companyId || !/^\d{4}-\d{2}$/.test(period)) return { ok: false, error: "사업자·기간을 확인하세요" };
  const db = createAdminClient();
  const { error } = await db.from("period_locks").upsert(
    {
      company_id: companyId,
      period,
      locked_by: g.profile!.id,
      locked_by_name: g.profile!.username ?? g.profile!.email ?? "관리자",
      memo: memo?.trim() || null,
    } as never,
    { onConflict: "company_id,period" }
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/close");
  revalidatePath("/");
  return { ok: true };
}

/** 마감 해제. */
export async function unlockPeriod(companyId: string, period: string): Promise<Result> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("period_locks").delete().eq("company_id", companyId).eq("period", period);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/close");
  revalidatePath("/");
  return { ok: true };
}

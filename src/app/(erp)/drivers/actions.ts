"use server";

import { revalidatePath } from "next/cache";
import { ensureAdmin } from "@/lib/auth-guard";
import { runDriverSync, type SyncResult } from "@/lib/wks-sync";

export type { SyncResult } from "@/lib/wks-sync";

/** winner-kids 기사(drivers) → drivers 동기화 (관리자). */
export async function importDriversFromWks(): Promise<SyncResult> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error, counts: {}, total: 0, skipped: [] };

  const res = await runDriverSync();
  if (res.ok) {
    revalidatePath("/drivers");
    revalidatePath("/");
  }
  return res;
}

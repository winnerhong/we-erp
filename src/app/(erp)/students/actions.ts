"use server";

import { revalidatePath } from "next/cache";
import { ensureAdmin } from "@/lib/auth-guard";
import { runStudentSync, type SyncResult } from "@/lib/wks-sync";

export type { SyncResult } from "@/lib/wks-sync";

/** winner-kids 원생(members) → students 동기화 (관리자). */
export async function importStudentsFromWks(): Promise<SyncResult> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error, counts: {}, total: 0, skipped: [] };

  const res = await runStudentSync();
  if (res.ok) {
    revalidatePath("/students");
    revalidatePath("/");
  }
  return res;
}

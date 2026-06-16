"use server";

import { revalidatePath } from "next/cache";
import { ensureAdmin } from "@/lib/auth-guard";
import { runWksSync, ALL_KINDS, type SyncKind, type SyncResult } from "@/lib/wks-sync";

export type { SyncResult } from "@/lib/wks-sync";

/** winner-kids 동기화(관리자). 종류 미지정 시 전체(협력사·기관·장소). */
export async function importPartnersFromWks(kinds?: SyncKind[]): Promise<SyncResult> {
  const g = await ensureAdmin();
  if (g.error)
    return { ok: false, error: g.error, counts: {}, total: 0, skipped: [] };

  const res = await runWksSync(kinds ?? ALL_KINDS);
  if (res.ok) {
    revalidatePath("/partners");
    revalidatePath("/");
  }
  return res;
}

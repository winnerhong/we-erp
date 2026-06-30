"use server";

import { revalidatePath } from "next/cache";
import { ensureAdmin } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { runWksSync, ALL_KINDS, type SyncKind, type SyncResult } from "@/lib/wks-sync";

export type { SyncResult } from "@/lib/wks-sync";

/** 거래처 여러 개를 한 사업자(또는 공용)로 일괄 배정. */
export async function bulkAssignCompany(
  partnerIds: string[],
  companyId: string | null
): Promise<{ ok: boolean; error?: string; count?: number }> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  const ids = partnerIds.filter(Boolean);
  if (ids.length === 0) return { ok: false, error: "선택된 거래처가 없습니다" };
  const db = createAdminClient();
  const { error } = await db.from("partners").update({ company_id: companyId } as never).in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/partners");
  revalidatePath("/");
  return { ok: true, count: ids.length };
}

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

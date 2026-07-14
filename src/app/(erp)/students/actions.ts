"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAdmin } from "@/lib/auth-guard";
import { runStudentSync, type SyncResult } from "@/lib/wks-sync";

export type { SyncResult } from "@/lib/wks-sync";

export interface Result {
  ok: boolean;
  error?: string;
  count?: number;
}

/** 여러 원생 상태 일괄변경(재원/휴원/퇴원). 관리자. */
export async function bulkSetStudentStatus(ids: string[], status: string): Promise<Result> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  if (ids.length === 0) return { ok: true, count: 0 };
  const db = createAdminClient();
  const { error } = await db.from("students").update({ status } as never).in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/students");
  return { ok: true, count: ids.length };
}

/** 여러 원생 일괄삭제. 관리자. */
export async function bulkDeleteStudents(ids: string[]): Promise<Result> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  if (ids.length === 0) return { ok: true, count: 0 };
  const db = createAdminClient();
  const { error } = await db.from("students").delete().in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/students");
  return { ok: true, count: ids.length };
}

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

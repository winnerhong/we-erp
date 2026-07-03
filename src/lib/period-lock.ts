// 결산·마감 — 기간 잠금 판정(서버 액션 공용). best-effort(테이블 미적용 시 잠금 없음).
import type { SupabaseClient } from "@supabase/supabase-js";

/** 'YYYY-MM-DD…' → 'YYYY-MM'. */
export function periodOf(date: string | null | undefined): string | null {
  if (!date || date.length < 7) return null;
  return date.slice(0, 7);
}

/** 해당 사업자·날짜의 회계기간이 마감(잠금)됐는지. */
export async function isPeriodLocked(
  db: SupabaseClient,
  companyId: string | null | undefined,
  date: string | null | undefined
): Promise<boolean> {
  const p = periodOf(date);
  if (!companyId || !p) return false;
  try {
    const { data, error } = await db
      .from("period_locks")
      .select("id")
      .eq("company_id", companyId)
      .eq("period", p)
      .maybeSingle();
    if (error) return false; // 테이블 미적용 등 → 잠금 아님(안전)
    return !!data;
  } catch {
    return false;
  }
}

/** 잠겨 있으면 사용자용 오류 메시지, 아니면 null. */
export async function periodLockError(
  db: SupabaseClient,
  companyId: string | null | undefined,
  date: string | null | undefined
): Promise<string | null> {
  return (await isPeriodLocked(db, companyId, date))
    ? `${periodOf(date)} 은(는) 마감된 기간이라 변경할 수 없습니다. (결산 마감 해제 후 가능)`
    : null;
}

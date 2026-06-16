"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAdmin } from "@/lib/auth-guard";
import { STANDARD_ACCOUNTS } from "@/lib/seed-accounts";

/** 표준 계정과목 일괄 등록 — 이미 있는 코드는 건너뜀. */
export async function seedStandardAccounts(): Promise<{
  ok: boolean;
  created: number;
  skipped: number;
  error?: string;
}> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, created: 0, skipped: 0, error: g.error };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("accounts").select("code");
  const have = new Set(((existing ?? []) as { code: string }[]).map((a) => a.code));

  const toInsert = STANDARD_ACCOUNTS.filter((a) => !have.has(a.code)).map((a) => ({
    code: a.code,
    name: a.name,
    category: a.category,
  }));

  if (toInsert.length === 0) {
    return { ok: true, created: 0, skipped: STANDARD_ACCOUNTS.length };
  }

  const db = createAdminClient();
  const { error } = await db.from("accounts").insert(toInsert as never[]);
  if (error) return { ok: false, created: 0, skipped: 0, error: error.message };

  revalidatePath("/accounts");
  revalidatePath("/");
  return {
    ok: true,
    created: toInsert.length,
    skipped: STANDARD_ACCOUNTS.length - toInsert.length,
  };
}

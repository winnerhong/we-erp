"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureUser } from "@/lib/auth-guard";

export interface Result {
  ok: boolean;
  error?: string;
}

/** 본인 기본정보(이름·아이디) 수정. */
export async function updateMyProfile(name: string, username: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const uname = username.trim();

  // 아이디 중복(본인 제외) 확인
  if (uname) {
    const { data: dup } = await db
      .from("profiles")
      .select("id")
      .eq("username", uname)
      .neq("id", g.profile!.id)
      .maybeSingle();
    if (dup) return { ok: false, error: "이미 사용 중인 아이디입니다" };
  }

  const { error } = await db
    .from("profiles")
    .update({ name: name.trim() || null, username: uname || null } as never)
    .eq("id", g.profile!.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  return { ok: true };
}

/** 본인 비밀번호 변경. */
export async function changeMyPassword(password: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  if (password.length < 4) return { ok: false, error: "비밀번호는 4자 이상이어야 합니다" };
  const db = createAdminClient();
  const { error } = await db.auth.admin.updateUserById(g.profile!.id, { password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

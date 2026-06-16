"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * 로그인 식별자(아이디 또는 이메일) → 실제 로그인 이메일 해소.
 *  - '@' 포함: 이메일 그대로.
 *  - 아니면: profiles.username 으로 조회해 합성 이메일 반환(없으면 null).
 * 로그인 전(미인증)이라 service-role 로 조회. 반환값은 비밀번호 없이는 무의미한 합성 이메일.
 */
export async function resolveLoginEmail(identifier: string): Promise<{ email: string | null }> {
  const id = identifier.trim();
  if (!id) return { email: null };
  if (id.includes("@")) return { email: id.toLowerCase() };
  const db = createAdminClient();
  const { data } = await db.from("profiles").select("email").eq("username", id).maybeSingle();
  return { email: (data as { email: string | null } | null)?.email ?? null };
}

/**
 * 회원가입(공개). 계정 + 프로필(일반 권한) 생성.
 * 이메일 확인 단계 없이 바로 로그인 가능하도록 email_confirm 처리.
 * ⚠️ 공개 가입 — 가입 즉시 일반 권한으로 접근 가능.
 */
export async function publicSignUp(
  email: string,
  password: string,
  name: string
): Promise<{ ok: boolean; error?: string }> {
  const e = email.trim().toLowerCase();
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    return { ok: false, error: "올바른 이메일을 입력하세요" };
  if (password.length < 6) return { ok: false, error: "비밀번호는 6자 이상이어야 합니다" };

  const db = createAdminClient();
  const { data, error } = await db.auth.admin.createUser({
    email: e,
    password,
    email_confirm: true,
  });
  if (error) {
    const dup = /already|registered|exists/i.test(error.message);
    return { ok: false, error: dup ? "이미 가입된 이메일입니다" : error.message };
  }

  const { error: pErr } = await db.from("profiles").insert({
    id: data.user.id,
    email: e,
    name: name.trim() || null,
    role: "MEMBER",
    is_active: true,
  } as never);
  if (pErr) {
    // 프로필 생성 실패 시 방금 만든 계정 롤백
    await db.auth.admin.deleteUser(data.user.id);
    return { ok: false, error: pErr.message };
  }
  return { ok: true };
}

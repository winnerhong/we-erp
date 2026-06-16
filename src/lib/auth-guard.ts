import { createClient } from "./supabase/server";
import type { ProfileRow } from "./supabase/database.types";

/** 현재 로그인 사용자의 프로필(없으면 null). */
export async function getCurrentProfile(): Promise<ProfileRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return (data as ProfileRow | null) ?? null;
}

export interface Guard {
  profile?: ProfileRow;
  error?: string;
}

/** 로그인 + 활성 사용자 보장. 서버액션 맨 앞에서 호출. */
export async function ensureUser(): Promise<Guard> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "로그인이 필요합니다" };
  if (!profile.is_active) return { error: "비활성화된 계정입니다" };
  return { profile };
}

/** 관리자(ADMIN) 보장. */
export async function ensureAdmin(): Promise<Guard> {
  const g = await ensureUser();
  if (g.error) return g;
  if (g.profile!.role !== "ADMIN") return { error: "관리자 권한이 필요합니다" };
  return g;
}

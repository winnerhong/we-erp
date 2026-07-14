"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAdmin } from "@/lib/auth-guard";

export interface Result {
  ok: boolean;
  error?: string;
}

/** 거래처 포털 로그인 계정 발급(관리자). 이메일+임시비번. 거래처당 1개. */
export async function createPartnerAccount(partnerId: string, email: string, password: string): Promise<Result> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  if (!partnerId) return { ok: false, error: "거래처가 지정되지 않았습니다" };
  if (!email.trim() || password.length < 6) return { ok: false, error: "이메일과 6자 이상 비밀번호를 입력하세요" };

  const db = createAdminClient();
  const { data: existing } = await db.from("profiles").select("id").eq("partner_id", partnerId).maybeSingle();
  if (existing) return { ok: false, error: "이미 포털 계정이 있습니다." };

  const { data: partner } = await db.from("partners").select("name").eq("id", partnerId).maybeSingle();
  const partnerName = (partner as { name: string } | null)?.name ?? "거래처";

  const { data, error } = await db.auth.admin.createUser({ email: email.trim(), password, email_confirm: true });
  if (error) return { ok: false, error: error.message };

  const { error: pErr } = await db.from("profiles").insert({
    id: data.user.id,
    email: email.trim(),
    name: partnerName,
    role: "PARTNER",
    partner_id: partnerId,
  } as never);
  if (pErr) {
    // 프로필 실패 시 방금 만든 auth 사용자 롤백(고아 계정 방지)
    await db.auth.admin.deleteUser(data.user.id).catch(() => {});
    return { ok: false, error: pErr.message };
  }
  revalidatePath("/partners");
  return { ok: true };
}

/** 포털 계정 비밀번호 재설정(관리자). */
export async function resetPartnerPassword(partnerId: string, password: string): Promise<Result> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  if (password.length < 6) return { ok: false, error: "6자 이상 비밀번호를 입력하세요" };
  const db = createAdminClient();
  const { data: prof } = await db.from("profiles").select("id").eq("partner_id", partnerId).maybeSingle();
  const uid = (prof as { id: string } | null)?.id;
  if (!uid) return { ok: false, error: "포털 계정이 없습니다." };
  const { error } = await db.auth.admin.updateUserById(uid, { password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** 포털 계정 삭제(관리자). auth 사용자 삭제 → 프로필 cascade. */
export async function deletePartnerAccount(partnerId: string): Promise<Result> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { data: prof } = await db.from("profiles").select("id").eq("partner_id", partnerId).maybeSingle();
  const uid = (prof as { id: string } | null)?.id;
  if (!uid) return { ok: true };
  const { error } = await db.auth.admin.deleteUser(uid);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/partners");
  return { ok: true };
}

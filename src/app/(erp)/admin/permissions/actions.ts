"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAdmin } from "@/lib/auth-guard";

export interface Result {
  ok: boolean;
  error?: string;
}

const BUILTIN = ["ADMIN", "MEMBER"];

/** 역할별 메뉴 접근 허용/차단 설정. companyId=null 이면 기본(전체 회사), 값이면 그 사업자 오버라이드. */
export async function setMenuPermission(
  role: string,
  menuKey: string,
  allowed: boolean,
  companyId: string | null = null
): Promise<Result> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  if (role === "ADMIN") return { ok: false, error: "관리자는 항상 전체 접근입니다" };
  const db = createAdminClient();
  const { error } = await db
    .from("role_menu_permissions")
    .upsert({ role, menu_key: menuKey, allowed, company_id: companyId } as never, { onConflict: "company_id,role,menu_key" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout"); // 사이드바(전 페이지) 갱신
  return { ok: true };
}

/** 사업자 오버라이드 제거 → 기본값 상속으로 되돌림. */
export async function clearMenuPermission(
  role: string,
  menuKey: string,
  companyId: string
): Promise<Result> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  if (!companyId) return { ok: false, error: "사업자가 지정되지 않았습니다" };
  const db = createAdminClient();
  const { error } = await db
    .from("role_menu_permissions")
    .delete()
    .eq("role", role)
    .eq("menu_key", menuKey)
    .eq("company_id", companyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 등급(역할) 추가. 키는 자동 생성, 라벨만 입력. */
export async function createRole(label: string): Promise<Result> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  const name = label.trim();
  if (!name) return { ok: false, error: "등급 이름을 입력하세요" };
  const db = createAdminClient();
  const { error } = await db.from("roles").insert({
    key: `role_${crypto.randomUUID().slice(0, 8)}`,
    label: name,
    is_admin: false,
    sort_order: 100,
  } as never);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/permissions");
  return { ok: true };
}

/** 등급 이름 변경. */
export async function renameRole(key: string, label: string): Promise<Result> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  const name = label.trim();
  if (!name) return { ok: false, error: "등급 이름을 입력하세요" };
  const db = createAdminClient();
  const { error } = await db.from("roles").update({ label: name } as never).eq("key", key);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/permissions");
  revalidatePath("/admin/users");
  return { ok: true };
}

/** 등급 표시 순서 저장(드래그앤드롭). 배열 순서대로 sort_order 재부여. */
export async function reorderRoles(orderedKeys: string[]): Promise<Result> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  for (let i = 0; i < orderedKeys.length; i++) {
    const { error } = await db.from("roles").update({ sort_order: i } as never).eq("key", orderedKeys[i]);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/admin/permissions");
  revalidatePath("/admin/users");
  return { ok: true };
}

/** 등급 삭제(기본 등급 제외). 해당 등급 사용자는 일반으로 이동. */
export async function deleteRole(key: string): Promise<Result> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  if (BUILTIN.includes(key)) return { ok: false, error: "기본 등급은 삭제할 수 없습니다" };
  const db = createAdminClient();
  // 이 등급을 쓰던 사용자 → 일반으로 이동, 권한 행/등급 삭제
  await db.from("profiles").update({ role: "MEMBER" } as never).eq("role", key);
  await db.from("role_menu_permissions").delete().eq("role", key);
  const { error } = await db.from("roles").delete().eq("key", key);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  revalidatePath("/admin/permissions");
  revalidatePath("/admin/users");
  return { ok: true };
}

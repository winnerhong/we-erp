import { createClient } from "./supabase/server";
import { MENUS } from "./menus";
import type { AppRole, RoleMenuPermissionRow } from "./supabase/database.types";

/**
 * 역할이 접근 가능한 메뉴 href 목록.
 *  - ADMIN: 항상 전체.
 *  - 그 외: role_menu_permissions 에서 allowed=false 인 메뉴만 제외(기본 허용).
 */
export async function getAllowedMenuHrefs(role: AppRole | null): Promise<string[]> {
  const all = MENUS.map((m) => m.href);
  if (role === "ADMIN") return all;
  const supabase = await createClient();
  const { data } = await supabase
    .from("role_menu_permissions")
    .select("menu_key, allowed")
    .eq("role", role ?? "MEMBER");
  const disallowed = new Set(
    ((data ?? []) as Pick<RoleMenuPermissionRow, "menu_key" | "allowed">[])
      .filter((r) => !r.allowed)
      .map((r) => r.menu_key)
  );
  return all.filter((href) => !disallowed.has(href));
}

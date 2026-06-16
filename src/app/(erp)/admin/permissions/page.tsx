import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureAdmin } from "@/lib/auth-guard";
import { MENUS } from "@/lib/menus";
import { PermissionsClient, type RoleInfo } from "./permissions-client";
import type { RoleMenuPermissionRow, RoleRow } from "@/lib/supabase/database.types";

export const metadata = { title: "권한 관리" };

export default async function PermissionsPage() {
  const g = await ensureAdmin();
  if (g.error) redirect("/");

  const supabase = await createClient();
  const [{ data: roleData }, { data: permData }] = await Promise.all([
    supabase.from("roles").select("*").order("sort_order"),
    supabase.from("role_menu_permissions").select("role, menu_key, allowed"),
  ]);

  const roles = (roleData ?? []) as RoleRow[];
  const perms = (permData ?? []) as Pick<RoleMenuPermissionRow, "role" | "menu_key" | "allowed">[];

  // 명시적으로 false 인 (role, menu) 조합 — 그 외는 기본 허용
  const disallowed = new Set(perms.filter((p) => !p.allowed).map((p) => `${p.role}|${p.menu_key}`));

  // 비관리자 등급 × 메뉴 허용 매트릭스
  const matrix: Record<string, Record<string, boolean>> = {};
  for (const r of roles) {
    if (r.is_admin) continue;
    matrix[r.key] = {};
    for (const m of MENUS) matrix[r.key][m.href] = !disallowed.has(`${r.key}|${m.href}`);
  }

  const roleInfos: RoleInfo[] = roles.map((r) => ({
    key: r.key,
    label: r.label,
    isAdmin: r.is_admin,
    builtin: r.key === "ADMIN" || r.key === "MEMBER",
  }));

  return <PermissionsClient roles={roleInfos} menus={MENUS} matrix={matrix} />;
}

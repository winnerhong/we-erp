import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureAdmin } from "@/lib/auth-guard";
import { MENUS } from "@/lib/menus";
import { PermissionsClient, type RoleInfo, type CompanyOpt } from "./permissions-client";
import type { RoleMenuPermissionRow, RoleRow, CompanyRow } from "@/lib/supabase/database.types";

export const metadata = { title: "권한 관리" };

export default async function PermissionsPage() {
  const g = await ensureAdmin();
  if (g.error) redirect("/");

  const supabase = await createClient();
  const [{ data: roleData }, { data: permData }, { data: companyData }] = await Promise.all([
    supabase.from("roles").select("*").order("sort_order"),
    supabase.from("role_menu_permissions").select("role, menu_key, allowed, company_id"),
    supabase.from("companies").select("id, name, relation_type").eq("is_active", true).order("name"),
  ]);

  const roles = (roleData ?? []) as RoleRow[];
  const perms = (permData ?? []) as Pick<RoleMenuPermissionRow, "role" | "menu_key" | "allowed" | "company_id">[];
  const companies = ((companyData ?? []) as Pick<CompanyRow, "id" | "name" | "relation_type">[]).map((c) => ({
    id: c.id,
    name: c.name,
    relation_type: c.relation_type ?? "OWNED",
  })) as CompanyOpt[];

  // 기본(전역, company_id=null) 규칙에서 명시적 false 인 (role, menu) 조합
  const disallowed = new Set(
    perms.filter((p) => p.company_id == null && !p.allowed).map((p) => `${p.role}|${p.menu_key}`)
  );

  // 비관리자 등급 × 메뉴 기본 허용 매트릭스
  const matrix: Record<string, Record<string, boolean>> = {};
  for (const r of roles) {
    if (r.is_admin) continue;
    matrix[r.key] = {};
    for (const m of MENUS) matrix[r.key][m.href] = !disallowed.has(`${r.key}|${m.href}`);
  }

  // 사업자 오버라이드: overrides[companyId][role][href] = allowed (명시된 것만)
  const overrides: Record<string, Record<string, Record<string, boolean>>> = {};
  for (const p of perms) {
    if (!p.company_id) continue;
    ((overrides[p.company_id] ??= {})[p.role] ??= {})[p.menu_key] = p.allowed;
  }

  const roleInfos: RoleInfo[] = roles.map((r) => ({
    key: r.key,
    label: r.label,
    isAdmin: r.is_admin,
    builtin: r.key === "ADMIN" || r.key === "MEMBER",
  }));

  return (
    <PermissionsClient
      roles={roleInfos}
      menus={MENUS}
      matrix={matrix}
      companies={companies}
      overrides={overrides}
    />
  );
}

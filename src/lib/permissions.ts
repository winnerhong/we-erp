import { createClient } from "./supabase/server";
import { MENUS } from "./menus";
import type { AppRole } from "./supabase/database.types";

/**
 * 역할이 (활성 사업자 기준으로) 접근 가능한 메뉴 href 목록.
 *  - ADMIN: 항상 전체.
 *  - 그 외: 활성 사업자 오버라이드(company_id=companyId) → 기본(company_id=null) 순으로 해석.
 *    명시적으로 allowed=false 인 메뉴만 제외(기본 허용).
 *  - companyId=null(전체보기 등)이면 기본 규칙만 적용.
 */
export async function getAllowedMenuHrefs(
  role: AppRole | null,
  companyId: string | null
): Promise<string[]> {
  const all = MENUS.map((m) => m.href);
  if (role === "ADMIN") return all;

  const supabase = await createClient();
  let q = supabase
    .from("role_menu_permissions")
    .select("menu_key, allowed, company_id")
    .eq("role", role ?? "MEMBER");
  q = q.or(companyId ? `company_id.eq.${companyId},company_id.is.null` : "company_id.is.null");
  const { data } = await q;
  const rows = (data ?? []) as { menu_key: string; allowed: boolean; company_id: string | null }[];

  const globalMap = new Map<string, boolean>();
  const overrideMap = new Map<string, boolean>();
  for (const r of rows) {
    if (r.company_id == null) globalMap.set(r.menu_key, r.allowed);
    else if (companyId && r.company_id === companyId) overrideMap.set(r.menu_key, r.allowed);
  }

  return all.filter((href) => {
    const eff = overrideMap.has(href) ? overrideMap.get(href)! : globalMap.get(href);
    return eff !== false; // 기본 허용(명시적 false 만 차단)
  });
}

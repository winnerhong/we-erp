import { cookies } from "next/headers";
import { createClient } from "./supabase/server";
import type { CompanyRow } from "./supabase/database.types";
import { ACTIVE_COMPANY_COOKIE, ALL_COMPANIES } from "./company-constants";

export { ALL_COMPANIES };

export interface CompanyContext {
  /** 활성 사업자 id, 또는 전체보기일 때 ALL_COMPANIES. */
  activeId: string;
  /** 등록된 사업자 전체 (드롭다운용). */
  companies: Pick<CompanyRow, "id" | "name" | "tax_type">[];
}

/** 헤더/페이지에서 현재 선택된 사업자 컨텍스트를 읽는다. */
export async function getCompanyContext(): Promise<CompanyContext> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("id, name, tax_type")
    .eq("is_active", true)
    .order("name");

  const companies = (data ?? []) as CompanyContext["companies"];
  const store = await cookies();
  const cookieVal = store.get(ACTIVE_COMPANY_COOKIE)?.value;

  let activeId: string;
  if (cookieVal === ALL_COMPANIES) {
    activeId = ALL_COMPANIES;
  } else if (cookieVal && companies.some((c) => c.id === cookieVal)) {
    activeId = cookieVal;
  } else {
    // 기본값: 첫 사업자, 없으면 전체보기
    activeId = companies[0]?.id ?? ALL_COMPANIES;
  }

  return { activeId, companies };
}

/**
 * 활성 사업자 필터를 쿼리에 적용할지 판단.
 * 전체보기면 null(필터 없음), 아니면 companyId 반환.
 */
export function companyFilter(ctx: CompanyContext): string | null {
  return ctx.activeId === ALL_COMPANIES ? null : ctx.activeId;
}

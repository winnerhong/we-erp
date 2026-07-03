import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "./supabase/server";
import type { CompanyRow } from "./supabase/database.types";
import { ACTIVE_COMPANY_COOKIE, ALL_COMPANIES } from "./company-constants";

export { ALL_COMPANIES };

export interface CompanyContext {
  /** 활성 사업자 id, 또는 전체보기일 때 ALL_COMPANIES. */
  activeId: string;
  /** 등록된 사업자 전체 (드롭다운용). */
  companies: Pick<CompanyRow, "id" | "name" | "tax_type" | "relation_type">[];
  /** 회사 멤버십으로 제한된 사용자(전체보기 불가). */
  restricted: boolean;
}

/** 헤더/페이지에서 현재 선택된 사업자 컨텍스트를 읽는다.
 *  React cache 로 요청 단위 메모이즈 — 레이아웃+페이지가 각각 호출해도 실제 쿼리는 1회. */
export const getCompanyContext = cache(async function getCompanyContext(): Promise<CompanyContext> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, tax_type, relation_type")
    .eq("is_active", true)
    .order("name");

  // relation_type 마이그레이션 미적용 시 폴백(전부 자사 취급) — 앱이 죽지 않도록
  let companies = (data ?? []) as CompanyContext["companies"];
  if (error) {
    const basic = await supabase.from("companies").select("id, name, tax_type").eq("is_active", true).order("name");
    companies = ((basic.data ?? []) as Omit<CompanyContext["companies"][number], "relation_type">[]).map((c) => ({ ...c, relation_type: "OWNED" }));
  }

  // 회사 멤버십 필터 — 비관리자는 배정된 사업자만. (배정 0건이면 하위호환으로 전체)
  let restricted = false;
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (userId) {
    const [{ data: prof }, { data: mem }] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
      supabase.from("user_companies").select("company_id").eq("user_id", userId),
    ]);
    const role = (prof as { role: string } | null)?.role;
    const memberIds = new Set(((mem ?? []) as { company_id: string }[]).map((m) => m.company_id));
    if (role && role !== "ADMIN" && memberIds.size > 0) {
      companies = companies.filter((c) => memberIds.has(c.id));
      restricted = true; // 전체보기 불가(전 회사 데이터 노출 방지)
    }
  }

  const store = await cookies();
  const cookieVal = store.get(ACTIVE_COMPANY_COOKIE)?.value;

  let activeId: string;
  if (cookieVal === ALL_COMPANIES && !restricted) {
    activeId = ALL_COMPANIES;
  } else if (cookieVal && companies.some((c) => c.id === cookieVal)) {
    activeId = cookieVal;
  } else {
    // 기본값: 자사(OWNED) 우선(수임업체로 실수 진입 방지), 없으면 첫 사업자.
    // 제한 사용자는 접근 회사가 없어도 절대 전체보기로 폴백하지 않음(전 회사 노출 방지).
    const firstOwned = companies.find((c) => c.relation_type !== "MANAGED");
    activeId = (firstOwned ?? companies[0])?.id ?? (restricted ? "__none__" : ALL_COMPANIES);
  }

  return { activeId, companies, restricted };
});

/**
 * 활성 사업자 필터를 쿼리에 적용할지 판단.
 * 전체보기면 null(필터 없음), 아니면 companyId 반환.
 */
export function companyFilter(ctx: CompanyContext): string | null {
  return ctx.activeId === ALL_COMPANIES ? null : ctx.activeId;
}

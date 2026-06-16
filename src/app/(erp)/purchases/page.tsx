import { createClient } from "@/lib/supabase/server";
import { getCompanyContext, companyFilter, ALL_COMPANIES } from "@/lib/active-company";
import { PurchasesClient, type ReceiptCandidate } from "./purchases-client";
import type { PurchaseRequestRow } from "@/lib/supabase/database.types";

export const metadata = { title: "구매 요청" };

export default async function PurchasesPage() {
  const supabase = await createClient();
  const ctxCompany = await getCompanyContext();
  const filter = companyFilter(ctxCompany);

  let query = supabase
    .from("purchase_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (filter) query = query.eq("company_id", filter);

  let rcptQ = supabase
    .from("receipts")
    .select("id,vendor_name,total_amount,doc_date,company_id,status")
    .order("created_at", { ascending: false });
  if (filter) rcptQ = rcptQ.eq("company_id", filter);

  let partnerQ = supabase.from("partners").select("id, name").eq("is_active", true).order("name");
  if (filter) partnerQ = partnerQ.or(`company_id.eq.${filter},company_id.is.null`);
  const acctQ = supabase.from("accounts").select("id, code, name").eq("is_active", true).order("code");

  // 요청자 선택용 직원 목록
  let empQ = supabase.from("employees").select("id, name").order("name");
  if (filter) empQ = empQ.eq("company_id", filter);

  // 구매완료 시 통장 출금 자동생성용 통장 목록
  let bankQ = supabase
    .from("bank_accounts")
    .select("id, alias, bank_name, company_id")
    .eq("is_active", true)
    .order("alias");
  if (filter) bankQ = bankQ.eq("company_id", filter);

  const [
    { data, error },
    { data: rcptData },
    { data: partnerData },
    { data: acctData },
    { data: bankData },
    { data: empData },
  ] = await Promise.all([query, rcptQ, partnerQ, acctQ, bankQ, empQ]);
  if (error) {
    return <p className="text-sm text-red-600">데이터를 불러오지 못했습니다: {error.message}</p>;
  }

  return (
    <PurchasesClient
      rows={(data ?? []) as PurchaseRequestRow[]}
      receipts={(rcptData ?? []) as ReceiptCandidate[]}
      partners={(partnerData ?? []) as { id: string; name: string }[]}
      accounts={(acctData ?? []) as { id: string; code: string; name: string }[]}
      bankAccounts={(bankData ?? []) as { id: string; alias: string; bank_name: string | null; company_id: string }[]}
      employees={(empData ?? []) as { id: string; name: string }[]}
      companies={ctxCompany.companies.map((c) => ({ id: c.id, name: c.name }))}
      activeCompanyId={ctxCompany.activeId === ALL_COMPANIES ? null : ctxCompany.activeId}
    />
  );
}

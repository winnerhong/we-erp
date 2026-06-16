import { createClient } from "@/lib/supabase/server";
import { getCompanyContext, companyFilter, ALL_COMPANIES } from "@/lib/active-company";
import { TaxInvoicesClient } from "./tax-invoices-client";
import type { TaxInvoiceRow } from "@/lib/supabase/database.types";

export const metadata = { title: "세금계산서" };

/** 'YYYY-MM' → [이번달 1일, 다음달 1일). */
function monthRange(m: string) {
  const [y, mo] = m.split("-").map(Number);
  const first = `${m}-01`;
  const nextY = mo === 12 ? y + 1 : y;
  const nextMo = mo === 12 ? 1 : mo + 1;
  const next = `${nextY}-${String(nextMo).padStart(2, "0")}-01`;
  return { first, next };
}

export default async function TaxInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const month = sp.m ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { first, next } = monthRange(month);

  const supabase = await createClient();
  const ctxCompany = await getCompanyContext();
  const filter = companyFilter(ctxCompany);

  let query = supabase
    .from("tax_invoices")
    .select("*")
    .gte("doc_date", first)
    .lt("doc_date", next)
    .order("doc_date", { ascending: false });
  if (filter) query = query.eq("company_id", filter);

  let partnerQuery = supabase
    .from("partners")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  if (filter) partnerQuery = partnerQuery.or(`company_id.eq.${filter},company_id.is.null`);

  // 통장 거래에 연결된(=실제 입출금으로 정산된) 세금계산서 id 집합
  let linkQuery = supabase
    .from("bank_transactions")
    .select("tax_invoice_id")
    .not("tax_invoice_id", "is", null);
  if (filter) linkQuery = linkQuery.eq("company_id", filter);

  const [{ data, error }, { data: partnerData }, { data: linkData }] = await Promise.all([
    query,
    partnerQuery,
    linkQuery,
  ]);
  if (error) {
    return <p className="text-sm text-red-600">데이터를 불러오지 못했습니다: {error.message}</p>;
  }
  const linkedIds = (linkData ?? []).map((r) => (r as { tax_invoice_id: string }).tax_invoice_id);

  return (
    <TaxInvoicesClient
      rows={(data ?? []) as TaxInvoiceRow[]}
      partners={(partnerData ?? []) as { id: string; name: string }[]}
      linkedIds={linkedIds}
      month={month}
      activeCompanyId={ctxCompany.activeId === ALL_COMPANIES ? null : ctxCompany.activeId}
    />
  );
}

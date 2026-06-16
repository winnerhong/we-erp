import { createClient } from "@/lib/supabase/server";
import { getCompanyContext, companyFilter, ALL_COMPANIES } from "@/lib/active-company";
import { TradeClient, type SettleInfo, type UnlinkedTxn } from "./trade-client";
import type { TaxInvoiceRow } from "@/lib/supabase/database.types";

export const metadata = { title: "매입/매출" };

function monthRange(m: string) {
  const [y, mo] = m.split("-").map(Number);
  const first = `${m}-01`;
  const nextY = mo === 12 ? y + 1 : y;
  const nextMo = mo === 12 ? 1 : mo + 1;
  const next = `${nextY}-${String(nextMo).padStart(2, "0")}-01`;
  return { first, next };
}

export default async function TradePage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const month = sp.m ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { first, next } = monthRange(month);

  const supabase = await createClient();
  const ctx = await getCompanyContext();
  const filter = companyFilter(ctx);

  let invQ = supabase
    .from("tax_invoices")
    .select("*")
    .gte("doc_date", first)
    .lt("doc_date", next)
    .order("doc_date", { ascending: false });
  let linkedQ = supabase
    .from("bank_transactions")
    .select("id, tax_invoice_id, amount, txn_date")
    .not("tax_invoice_id", "is", null);
  let unlinkedQ = supabase
    .from("bank_transactions")
    .select("id, txn_date, direction, amount, counterparty, partner_id")
    .is("tax_invoice_id", null)
    .order("txn_date", { ascending: false });
  let partnerQ = supabase.from("partners").select("id, name").eq("is_active", true).order("name");
  const acctQ = supabase.from("accounts").select("id, code, name").eq("is_active", true).order("code");

  if (filter) {
    invQ = invQ.eq("company_id", filter);
    linkedQ = linkedQ.eq("company_id", filter);
    unlinkedQ = unlinkedQ.eq("company_id", filter);
    partnerQ = partnerQ.or(`company_id.eq.${filter},company_id.is.null`);
  }

  const [{ data: inv, error }, { data: linked }, { data: unlinked }, { data: partners }, { data: accounts }] =
    await Promise.all([invQ, linkedQ, unlinkedQ, partnerQ, acctQ]);
  if (error) {
    return <p className="text-sm text-red-600">데이터를 불러오지 못했습니다: {error.message}</p>;
  }

  // 정산 맵: invoiceId → 연결된 통장 합계/건수
  const settle: Record<string, SettleInfo> = {};
  for (const b of (linked ?? []) as { tax_invoice_id: string; amount: number; txn_date: string }[]) {
    const s = (settle[b.tax_invoice_id] ??= { amount: 0, count: 0, lastDate: "" });
    s.amount += b.amount;
    s.count += 1;
    if (b.txn_date > s.lastDate) s.lastDate = b.txn_date;
  }
  // 수기 정산(settled_at)도 정산완료로 반영(통장 연결이 없을 때)
  for (const i of (inv ?? []) as TaxInvoiceRow[]) {
    if (i.settled_at && !settle[i.id]) settle[i.id] = { amount: i.total_amount, count: 0, lastDate: i.settled_at };
  }

  return (
    <TradeClient
      invoices={(inv ?? []) as TaxInvoiceRow[]}
      settle={settle}
      unlinked={(unlinked ?? []) as UnlinkedTxn[]}
      partners={(partners ?? []) as { id: string; name: string }[]}
      accounts={(accounts ?? []) as { id: string; code: string; name: string }[]}
      month={month}
      activeCompanyId={ctx.activeId === ALL_COMPANIES ? null : ctx.activeId}
    />
  );
}

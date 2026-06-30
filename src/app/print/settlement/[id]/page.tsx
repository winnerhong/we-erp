import { createAdminClient } from "@/lib/supabase/admin";
import { StatementView, type StmtData } from "./statement-view";
import type { SettlementRow, TransactionRow, PartnerRow, CompanyRow } from "@/lib/supabase/database.types";

export const metadata = { title: "거래명세서" };

export default async function SettlementPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createAdminClient();
  const { data: sData } = await db.from("settlements").select("*").eq("id", id).maybeSingle();
  const settlement = sData as SettlementRow | null;
  if (!settlement) return <div className="p-10 text-center text-sm text-neutral-500">정산을 찾을 수 없습니다.</div>;

  const [{ data: pData }, { data: tData }, { data: cData }] = await Promise.all([
    db.from("partners").select("*").eq("id", settlement.partner_id).maybeSingle(),
    db.from("transactions").select("*").eq("settlement_id", id).order("txn_date"),
    settlement.company_id
      ? db.from("companies").select("*").eq("id", settlement.company_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const partner = pData as PartnerRow | null;
  const company = cData as CompanyRow | null;
  const txns = (tData ?? []) as TransactionRow[];

  const data: StmtData = {
    title: settlement.title,
    period: settlement.period,
    subtotal: settlement.subtotal,
    tax: settlement.tax_amount,
    total: settlement.total,
    supplier: company
      ? { name: company.name, biz_no: company.biz_no, ceo: company.ceo_name, address: company.address, biz_type: company.biz_type, biz_item: company.biz_category }
      : null,
    buyer: partner
      ? { name: partner.name, biz_no: partner.biz_no, ceo: partner.rep_name, address: [partner.address, partner.address_detail].filter(Boolean).join(" ") || null, biz_type: partner.biz_type, biz_item: partner.biz_item }
      : null,
    items: txns.map((t) => ({ date: t.txn_date, title: t.title ?? "-", qty: t.qty, unit: t.unit_price, amount: t.amount })),
  };

  return <StatementView data={data} />;
}

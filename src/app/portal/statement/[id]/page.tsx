import { createAdminClient } from "@/lib/supabase/admin";
import { ensurePartner } from "@/lib/auth-guard";
import { StatementView, type StmtData } from "@/app/print/settlement/[id]/statement-view";
import type { SettlementRow, TransactionRow, PartnerRow, CompanyRow } from "@/lib/supabase/database.types";

export const metadata = { title: "거래명세서" };

/** 거래처 포털 전용 거래명세서 — 본인(로그인 거래처) 정산만 조회. */
export default async function PortalStatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await ensurePartner();
  if (g.error || !g.partner) {
    return <div className="p-10 text-center text-sm text-neutral-500">{g.error ?? "접근할 수 없습니다."}</div>;
  }

  const db = createAdminClient();
  const { data: sData } = await db.from("settlements").select("*").eq("id", id).maybeSingle();
  const settlement = sData as SettlementRow | null;
  // 본인 거래처의 정산만 열람 가능
  if (!settlement || settlement.partner_id !== g.partner.id) {
    return <div className="p-10 text-center text-sm text-neutral-500">명세서를 찾을 수 없습니다.</div>;
  }

  const [{ data: tData }, { data: cData }] = await Promise.all([
    db.from("transactions").select("*").eq("settlement_id", id).order("txn_date"),
    settlement.company_id
      ? db.from("companies").select("*").eq("id", settlement.company_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const partner = g.partner as PartnerRow;
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
    buyer: {
      name: partner.name,
      biz_no: partner.biz_no,
      ceo: partner.rep_name,
      address: [partner.address, partner.address_detail].filter(Boolean).join(" ") || null,
      biz_type: partner.biz_type,
      biz_item: partner.biz_item,
    },
    items: txns.map((t) => ({ date: t.txn_date, title: t.title ?? "-", qty: t.qty, unit: t.unit_price, amount: t.amount })),
  };

  return <StatementView data={data} />;
}

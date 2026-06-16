import { createClient } from "@/lib/supabase/server";
import { getCompanyContext, companyFilter } from "@/lib/active-company";
import { DailyClient, type DayItem } from "./daily-client";

export const metadata = { title: "일일결산" };

/** 'YYYY-MM-DD' → 다음 날 'YYYY-MM-DD'. */
function nextDay(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day + 1));
  return dt.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' 가 속한 달의 [1일, 다음달 1일). */
function monthBounds(d: string) {
  const [y, m] = d.split("-").map(Number);
  const first = `${d.slice(0, 7)}-01`;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const next = `${ny}-${String(nm).padStart(2, "0")}-01`;
  return { first, next };
}

export default async function DailyPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const date = sp.d ?? today;
  const start = `${date}T00:00:00`;
  const end = `${nextDay(date)}T00:00:00`;

  const supabase = await createClient();
  const ctx = await getCompanyContext();
  const filter = companyFilter(ctx);

  // 거래처명 매핑
  const partnerQ = supabase.from("partners").select("id, name");
  // 세금계산서(매출/매입)
  let taxQ = supabase
    .from("tax_invoices")
    .select("id, type, total_amount, status, partner_id")
    .eq("doc_date", date);
  // 영수증(매입 증빙)
  let rcptQ = supabase
    .from("receipts")
    .select("id, total_amount, status, vendor_name")
    .eq("doc_date", date);
  // 구매(결제 완료 = 그날 결제건)
  let buyPaidQ = supabase
    .from("purchase_requests")
    .select("id, amount, status, product_name, requester_name, paid_at")
    .gte("paid_at", start)
    .lt("paid_at", end);
  // 구매(미결제·미확정 = 그날 요청건)
  let buyReqQ = supabase
    .from("purchase_requests")
    .select("id, amount, status, product_name, requester_name, created_at")
    .gte("created_at", start)
    .lt("created_at", end)
    .neq("status", "PURCHASED");
  // 통장 실입출금
  let bankQ = supabase
    .from("bank_transactions")
    .select("direction, amount")
    .eq("txn_date", date);

  if (filter) {
    taxQ = taxQ.eq("company_id", filter);
    rcptQ = rcptQ.eq("company_id", filter);
    buyPaidQ = buyPaidQ.eq("company_id", filter);
    buyReqQ = buyReqQ.eq("company_id", filter);
    bankQ = bankQ.eq("company_id", filter);
  }

  const [{ data: partners }, { data: tax }, { data: rcpt }, { data: buyPaid }, { data: buyReq }, { data: bank }] =
    await Promise.all([partnerQ, taxQ, rcptQ, buyPaidQ, buyReqQ, bankQ]);

  const pName = new Map(((partners ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));

  type Tax = { id: string; type: string; total_amount: number; status: string; partner_id: string | null };
  type Rcpt = { id: string; total_amount: number | null; status: string; vendor_name: string | null };
  type Buy = { id: string; amount: number; status: string; product_name: string | null; requester_name: string | null };

  const month = date.slice(0, 7);
  const taxRows = (tax ?? []) as Tax[];
  const sales: DayItem[] = taxRows
    .filter((t) => t.type === "SALES")
    .map((t) => ({
      id: t.id,
      title: t.partner_id ? pName.get(t.partner_id) ?? "거래처" : "거래처 미지정",
      amount: t.total_amount,
      pending: t.status !== "DONE",
      tag: "세금계산서",
      href: `/tax-invoices?m=${month}`,
    }));

  const purchases: DayItem[] = [
    ...taxRows
      .filter((t) => t.type === "PURCHASE")
      .map((t) => ({
        id: t.id,
        title: t.partner_id ? pName.get(t.partner_id) ?? "거래처" : "거래처 미지정",
        amount: t.total_amount,
        pending: t.status !== "DONE",
        tag: "세금계산서",
        href: `/tax-invoices?m=${month}`,
      })),
    ...((rcpt ?? []) as Rcpt[]).map((r) => ({
      id: r.id,
      title: r.vendor_name ?? "영수증",
      amount: r.total_amount ?? 0,
      pending: r.status !== "CONFIRMED",
      tag: "영수증",
      href: `/receipts`,
    })),
  ];

  // 구매: 결제건 + 미결제 요청건(중복 제거)
  const buyMap = new Map<string, Buy>();
  for (const b of (buyPaid ?? []) as Buy[]) buyMap.set(b.id, b);
  for (const b of (buyReq ?? []) as Buy[]) if (!buyMap.has(b.id)) buyMap.set(b.id, b);
  const buys: DayItem[] = [...buyMap.values()].map((b) => ({
    id: b.id,
    title: b.product_name ?? b.requester_name ?? "구매",
    amount: b.amount,
    pending: b.status !== "PURCHASED",
    tag: b.status === "PURCHASED" ? "결제완료" : "미결제",
    href: `/purchases`,
  }));

  const bankRows = (bank ?? []) as { direction: string; amount: number }[];
  const bankIn = bankRows.filter((b) => b.direction === "IN").reduce((s, b) => s + b.amount, 0);
  const bankOut = bankRows.filter((b) => b.direction === "OUT").reduce((s, b) => s + b.amount, 0);

  // ----- 월간 캘린더용: 일별 순현금흐름(매출−매입−구매) -----
  const { first: mFirst, next: mNext } = monthBounds(date);
  let mTaxQ = supabase.from("tax_invoices").select("type, total_amount, doc_date").gte("doc_date", mFirst).lt("doc_date", mNext);
  let mRcptQ = supabase.from("receipts").select("total_amount, doc_date").gte("doc_date", mFirst).lt("doc_date", mNext);
  let mBuyQ = supabase
    .from("purchase_requests")
    .select("amount, paid_at")
    .eq("status", "PURCHASED")
    .gte("paid_at", `${mFirst}T00:00:00`)
    .lt("paid_at", `${mNext}T00:00:00`);
  if (filter) {
    mTaxQ = mTaxQ.eq("company_id", filter);
    mRcptQ = mRcptQ.eq("company_id", filter);
    mBuyQ = mBuyQ.eq("company_id", filter);
  }
  const [{ data: mTax }, { data: mRcpt }, { data: mBuy }] = await Promise.all([mTaxQ, mRcptQ, mBuyQ]);

  const monthNet: Record<string, number> = {};
  const add = (d: string | null, v: number) => {
    if (!d) return;
    const key = d.slice(0, 10);
    monthNet[key] = (monthNet[key] ?? 0) + v;
  };
  for (const t of (mTax ?? []) as { type: string; total_amount: number; doc_date: string | null }[])
    add(t.doc_date, t.type === "SALES" ? t.total_amount : -t.total_amount);
  for (const r of (mRcpt ?? []) as { total_amount: number | null; doc_date: string | null }[])
    add(r.doc_date, -(r.total_amount ?? 0));
  for (const b of (mBuy ?? []) as { amount: number; paid_at: string | null }[]) add(b.paid_at, -b.amount);

  return (
    <DailyClient
      date={date}
      sales={sales}
      purchases={purchases}
      buys={buys}
      bankIn={bankIn}
      bankOut={bankOut}
      monthNet={monthNet}
    />
  );
}

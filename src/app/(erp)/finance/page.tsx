import { createClient } from "@/lib/supabase/server";
import { FinanceClient, type DueItem, type OverdueRow } from "./finance-client";
import { summarizeAging, overdueDays, type AgingItem } from "@/lib/aging";

export const metadata = { title: "받을돈·줄돈" };

function monthRange(m: string) {
  const [y, mo] = m.split("-").map(Number);
  const first = `${m}-01`;
  const nextY = mo === 12 ? y + 1 : y;
  const nextMo = mo === 12 ? 1 : mo + 1;
  const next = `${nextY}-${String(nextMo).padStart(2, "0")}-01`;
  return { first, next };
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const month = sp.m ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const { first, next } = monthRange(month);

  // 전 사업자 한눈에 (활성 사업자 필터 무시)
  const supabase = await createClient();
  const [{ data: companies }, { data: partners }, { data: inv }] = await Promise.all([
    supabase.from("companies").select("id, name"),
    supabase.from("partners").select("id, name"),
    supabase
      .from("tax_invoices")
      .select("id, company_id, type, total_amount, partner_id, doc_date, due_date, settled_at")
      .gte("doc_date", first)
      .lt("doc_date", next),
  ]);

  const cName = new Map(((companies ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const pName = new Map(((partners ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));

  // 통장 연결된 계산서 id(정산 판정) — 페이지네이션(1000행 캡 회피)
  const bankLinked = new Set<string>();
  for (let from = 0; from < 500000; from += 1000) {
    const { data } = await supabase.from("bank_transactions").select("tax_invoice_id").not("tax_invoice_id", "is", null).range(from, from + 999);
    const batch = (data ?? []) as { tax_invoice_id: string }[];
    for (const b of batch) bankLinked.add(b.tax_invoice_id);
    if (batch.length < 1000) break;
  }

  type Inv = {
    id: string; company_id: string; type: string; total_amount: number;
    partner_id: string | null; doc_date: string | null; due_date: string | null; settled_at: string | null;
  };

  const receivables: DueItem[] = [];
  const payables: DueItem[] = [];
  const settledManual: DueItem[] = [];

  for (const i of (inv ?? []) as Inv[]) {
    const settled = bankLinked.has(i.id) || !!i.settled_at;
    const item: DueItem = {
      id: i.id,
      type: i.type === "SALES" ? "SALES" : "PURCHASE",
      company: cName.get(i.company_id) ?? "?",
      partner: i.partner_id ? pName.get(i.partner_id) ?? "거래처" : "미지정",
      date: i.doc_date ?? "",
      due: i.due_date,
      amount: i.total_amount,
      overdue: !settled && !!i.due_date && i.due_date < today,
      manual: !!i.settled_at && !bankLinked.has(i.id),
    };
    if (!settled) {
      if (i.type === "SALES") receivables.push(item);
      else payables.push(item);
    } else if (item.manual) {
      settledManual.push(item);
    }
  }

  const byPriority = (a: DueItem, b: DueItem) =>
    Number(b.overdue) - Number(a.overdue) || (a.due ?? a.date).localeCompare(b.due ?? b.date);
  receivables.sort(byPriority);
  payables.sort(byPriority);

  // ---- 전체 미결제 연령분석(Aging) — 월 무관, settled_at null & 통장 미연결 ----
  const allUnsettled: Inv[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 100000; from += PAGE) {
    const { data } = await supabase
      .from("tax_invoices")
      .select("id, company_id, type, total_amount, partner_id, doc_date, due_date, settled_at")
      .is("settled_at", null)
      .range(from, from + PAGE - 1);
    const batch = (data ?? []) as Inv[];
    allUnsettled.push(...batch);
    if (batch.length < PAGE) break;
  }

  const agingItems: AgingItem[] = [];
  const odMap = new Map<string, OverdueRow>();
  for (const i of allUnsettled) {
    if (i.settled_at || bankLinked.has(i.id)) continue; // 통장/수기 정산분 제외
    const ref = i.due_date ?? i.doc_date ?? null;
    const type = i.type === "SALES" ? "SALES" : "PURCHASE";
    agingItems.push({ amount: i.total_amount, ref, type });
    const days = overdueDays(ref, today);
    if (days !== null && days > 0) {
      const key = `${type}:${i.partner_id ?? "none"}`;
      const cur = odMap.get(key) ?? {
        partner: i.partner_id ? pName.get(i.partner_id) ?? "거래처" : "미지정",
        company: cName.get(i.company_id) ?? "?",
        type, amount: 0, days: 0, count: 0,
      };
      cur.amount += i.total_amount;
      cur.days = Math.max(cur.days, days);
      cur.count += 1;
      odMap.set(key, cur);
    }
  }
  const aging = summarizeAging(agingItems, today);
  const topOverdue = [...odMap.values()].sort((a, b) => b.amount - a.amount).slice(0, 10);

  return (
    <FinanceClient
      receivables={receivables}
      payables={payables}
      settledManual={settledManual}
      month={month}
      aging={aging}
      topOverdue={topOverdue}
    />
  );
}

import { createClient } from "@/lib/supabase/server";
import { getCompanyContext, companyFilter, ALL_COMPANIES } from "@/lib/active-company";
import { CardsClient, type SettleBankTxn } from "./cards-client";
import type {
  CardRow,
  CardTransactionRow,
  FieldOptionRow,
} from "@/lib/supabase/database.types";

export const metadata = { title: "카드원장" };

/** 'YYYY-MM' → [이번달 1일, 다음달 1일). */
function monthRange(m: string) {
  const [y, mo] = m.split("-").map(Number);
  const first = `${m}-01`;
  const nextY = mo === 12 ? y + 1 : y;
  const nextMo = mo === 12 ? 1 : mo + 1;
  const next = `${nextY}-${String(nextMo).padStart(2, "0")}-01`;
  return { first, next };
}

async function pageAll<T>(
  build: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null }> }
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; from < 500000; from += PAGE) {
    const { data } = await build().range(from, from + PAGE - 1);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; m?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();

  const supabase = await createClient();
  const ctx = await getCompanyContext();
  const filter = companyFilter(ctx);
  const activeCompanyId = ctx.activeId === ALL_COMPANIES ? null : ctx.activeId;

  let cardQuery = supabase.from("cards").select("*").eq("is_active", true).order("alias");
  if (filter) cardQuery = cardQuery.eq("company_id", filter);
  const { data: cardData, error: cardErr } = await cardQuery;
  if (cardErr) {
    return <p className="text-sm text-red-600">카드를 불러오지 못했습니다: {cardErr.message}</p>;
  }
  const cards = (cardData ?? []) as CardRow[];

  const selectedId = sp.c && cards.some((c) => c.id === sp.c) ? sp.c : cards[0]?.id ?? null;
  const card = cards.find((c) => c.id === selectedId) ?? null;

  // 이 카드의 전체 사용 건수 + 가장 최근 이용일(빈 달 안내·최신 달 시작용)
  let cardTxnCount = 0;
  let cardLatestDate: string | null = null;
  if (card) {
    const { count } = await supabase
      .from("card_transactions")
      .select("*", { count: "exact", head: true })
      .eq("card_id", card.id);
    cardTxnCount = count ?? 0;
    const { data: latest } = await supabase
      .from("card_transactions")
      .select("txn_date")
      .eq("card_id", card.id)
      .order("txn_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    cardLatestDate = (latest as { txn_date: string } | null)?.txn_date ?? null;
  }

  const month =
    sp.m ?? cardLatestDate?.slice(0, 7) ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { first, next } = monthRange(month);

  // 보강용 목록: 거래처(활성+공용) · 계정과목 · 구분 · 직원 · 결제통장
  const partnerScope = () => {
    let q = supabase.from("partners").select("id, name").eq("is_active", true).order("name");
    if (filter) q = q.or(`company_id.eq.${filter},company_id.is.null`);
    return q;
  };
  let acctQ = supabase.from("bank_accounts").select("id, alias, company_id").eq("is_active", true).order("alias");
  if (filter) acctQ = acctQ.eq("company_id", filter);
  let empQ = supabase.from("employees").select("id, name, company_id").eq("is_active", true).order("name");
  if (filter) empQ = empQ.eq("company_id", filter);

  const [{ data: partnerData }, { data: accountData }, { data: catData }, { data: empData }, { data: bankData }] =
    await Promise.all([
      partnerScope(),
      supabase.from("accounts").select("id, code, name").eq("is_active", true).order("code"),
      supabase.from("field_options").select("*").eq("category", "bank_category").order("sort_order"),
      empQ,
      acctQ,
    ]);

  const partners = (partnerData ?? []) as { id: string; name: string }[];
  const accountOptions = (accountData ?? []) as { id: string; code: string; name: string }[];
  const categoryOptions = (catData ?? []) as FieldOptionRow[];
  const employees = (empData ?? []) as { id: string; name: string; company_id: string | null }[];
  const bankAccounts = (bankData ?? []) as { id: string; alias: string; company_id: string }[];

  const bankAlias = new Map(bankAccounts.map((b) => [b.id, b.alias]));

  let monthTxns: CardTransactionRow[] = [];
  let settledTxns: SettleBankTxn[] = []; // 이 카드·이 달에 연결된 통장 카드대금 출금
  let candidateTxns: SettleBankTxn[] = []; // 매칭 후보(이 사업자 통장의 최근 출금)
  if (card) {
    monthTxns = await pageAll<CardTransactionRow>(() =>
      supabase
        .from("card_transactions")
        .select("*")
        .eq("card_id", card.id)
        .gte("txn_date", first)
        .lt("txn_date", next)
        .order("txn_date", { ascending: true })
        .order("created_at", { ascending: true })
    );

    const toSettle = (b: {
      id: string;
      txn_date: string;
      amount: number;
      description: string | null;
      counterparty: string | null;
      bank_account_id: string;
    }): SettleBankTxn => ({
      id: b.id,
      txn_date: b.txn_date,
      amount: b.amount,
      label: b.description || b.counterparty || "",
      bankAlias: bankAlias.get(b.bank_account_id) ?? "",
    });

    const [{ data: settled }, { data: candidates }] = await Promise.all([
      supabase
        .from("bank_transactions")
        .select("id, txn_date, amount, description, counterparty, bank_account_id")
        .eq("settles_card_id", card.id)
        .eq("settles_month", month)
        .order("txn_date", { ascending: false }),
      // 후보: 이 카드 사업자의 통장 출금(최근 120일). 이미 다른 카드/달에 연결된 건 제외.
      supabase
        .from("bank_transactions")
        .select("id, txn_date, amount, description, counterparty, bank_account_id, settles_card_id")
        .eq("company_id", card.company_id)
        .eq("direction", "OUT")
        .or(`settles_card_id.is.null,and(settles_card_id.eq.${card.id},settles_month.eq.${month})`)
        .order("txn_date", { ascending: false })
        .limit(80),
    ]);
    settledTxns = ((settled ?? []) as Parameters<typeof toSettle>[0][]).map(toSettle);
    candidateTxns = ((candidates ?? []) as Parameters<typeof toSettle>[0][]).map(toSettle);
  }

  return (
    <CardsClient
      cards={cards}
      companyNames={ctx.companies.map((c) => ({ id: c.id, name: c.name }))}
      selectedId={selectedId}
      activeCompanyId={activeCompanyId}
      month={month}
      monthTxns={monthTxns}
      cardTxnCount={cardTxnCount}
      cardLatestDate={cardLatestDate}
      partners={partners}
      accountOptions={accountOptions}
      categoryOptions={categoryOptions}
      employees={employees}
      bankAccounts={bankAccounts}
      settledTxns={settledTxns}
      candidateTxns={candidateTxns}
    />
  );
}

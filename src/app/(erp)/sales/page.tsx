import { createClient } from "@/lib/supabase/server";
import { getCompanyContext, companyFilter, ALL_COMPANIES } from "@/lib/active-company";
import { SalesClient } from "./sales-client";
import type { DailyRecordRow, FieldOptionRow } from "@/lib/supabase/database.types";

export const metadata = { title: "일매출" };

/** 'YYYY-MM-DD' 가 속한 달의 [1일, 다음달 1일). */
function monthBounds(d: string) {
  const [y, m] = d.split("-").map(Number);
  const first = `${d.slice(0, 7)}-01`;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const next = `${ny}-${String(nm).padStart(2, "0")}-01`;
  return { first, next };
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const date = sp.d ?? today;

  const supabase = await createClient();
  const ctx = await getCompanyContext();
  const filter = companyFilter(ctx);
  const isAll = ctx.activeId === ALL_COMPANIES;
  const companyName = ctx.companies.find((c) => c.id === ctx.activeId)?.name ?? null;

  // 매출유형·지출유형 옵션
  const { data: opts } = await supabase
    .from("field_options")
    .select("*")
    .in("category", ["sales_category", "expense_category"])
    .order("sort_order");

  // 특정 사업자일 때만 입력/조회 (전체보기는 안내)
  let dayRows: DailyRecordRow[] = [];
  const monthNet: Record<string, number> = {};
  if (!isAll && filter) {
    const { first, next } = monthBounds(date);
    const [{ data: day }, { data: month }] = await Promise.all([
      supabase
        .from("daily_records")
        .select("*")
        .eq("company_id", filter)
        .eq("record_date", date)
        .order("created_at"),
      supabase
        .from("daily_records")
        .select("record_date, kind, amount")
        .eq("company_id", filter)
        .gte("record_date", first)
        .lt("record_date", next),
    ]);
    dayRows = (day ?? []) as DailyRecordRow[];
    for (const r of (month ?? []) as { record_date: string; kind: string; amount: number }[]) {
      const v = r.kind === "SALES" ? r.amount : -r.amount;
      monthNet[r.record_date] = (monthNet[r.record_date] ?? 0) + v;
    }
  }

  return (
    <SalesClient
      date={date}
      isAll={isAll}
      companyId={isAll ? null : ctx.activeId}
      companyName={companyName}
      options={(opts ?? []) as FieldOptionRow[]}
      rows={dayRows}
      monthNet={monthNet}
    />
  );
}

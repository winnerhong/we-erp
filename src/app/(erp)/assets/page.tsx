import { createClient } from "@/lib/supabase/server";
import { getCompanyContext, companyFilter } from "@/lib/active-company";
import { AssetsClient, type AssetItem } from "./assets-client";
import type { AssetRow } from "@/lib/supabase/database.types";

export const metadata = { title: "교구·자산" };

export default async function AssetsPage() {
  const supabase = await createClient();
  const ctx = await getCompanyContext();
  const filter = companyFilter(ctx);

  let q = supabase.from("assets").select("*").order("name");
  if (filter) q = q.eq("company_id", filter);
  const [{ data: aData }, { data: catOpts }] = await Promise.all([
    q,
    supabase.from("field_options").select("value, label, color").eq("category", "asset_category").eq("is_active", true).order("sort_order"),
  ]);

  // 대여중(OPEN) 건수 — 자산별
  const assets = (aData ?? []) as AssetRow[];
  const ids = assets.map((a) => a.id);
  const openBy = new Map<string, number>();
  if (ids.length > 0) {
    const { data: mv } = await supabase.from("asset_movements").select("asset_id").eq("status", "OPEN").in("asset_id", ids);
    for (const m of (mv ?? []) as { asset_id: string }[]) openBy.set(m.asset_id, (openBy.get(m.asset_id) ?? 0) + 1);
  }

  const items: AssetItem[] = assets.map((a) => ({
    id: a.id, code: a.code, name: a.name, category: a.category,
    totalQty: a.total_qty, availableQty: a.available_qty, status: a.status,
    location: a.location, openRentals: openBy.get(a.id) ?? 0,
  }));

  return (
    <AssetsClient
      items={items}
      companyId={filter}
      categories={(catOpts ?? []) as { value: string; label: string; color: string | null }[]}
    />
  );
}

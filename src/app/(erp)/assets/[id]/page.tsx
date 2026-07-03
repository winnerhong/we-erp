import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AssetDetailClient, type MoveItem } from "./asset-detail-client";
import type { AssetRow, AssetMovementRow } from "@/lib/supabase/database.types";

export const metadata = { title: "교구 상세" };

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: aData } = await supabase.from("assets").select("*").eq("id", id).maybeSingle();
  const asset = aData as AssetRow | null;
  if (!asset) notFound();

  const [{ data: mData }, { data: pData }, { data: eData }] = await Promise.all([
    supabase.from("asset_movements").select("*").eq("asset_id", id).order("txn_date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("partners").select("id, name").eq("is_active", true).order("name"),
    supabase.from("employees").select("id, name").eq("is_active", true).order("name"),
  ]);
  const partners = (pData ?? []) as { id: string; name: string }[];
  const employees = (eData ?? []) as { id: string; name: string }[];
  const pName = new Map(partners.map((p) => [p.id, p.name]));
  const eName = new Map(employees.map((e) => [e.id, e.name]));

  const movements: MoveItem[] = ((mData ?? []) as AssetMovementRow[]).map((m) => ({
    id: m.id, type: m.type, qty: m.qty, txnDate: m.txn_date, dueDate: m.due_date, status: m.status,
    partnerName: m.partner_id ? pName.get(m.partner_id) ?? null : null,
    employeeName: m.employee_id ? eName.get(m.employee_id) ?? null : null,
    memo: m.memo,
  }));

  return (
    <AssetDetailClient
      asset={{
        id: asset.id, code: asset.code, name: asset.name, category: asset.category,
        totalQty: asset.total_qty, availableQty: asset.available_qty, status: asset.status,
        location: asset.location, purchasePrice: asset.purchase_price, purchaseDate: asset.purchase_date, memo: asset.memo,
        usefulLifeMonths: asset.useful_life_months, salvageValue: asset.salvage_value, depreciationMethod: asset.depreciation_method,
      }}
      movements={movements}
      partners={partners}
      employees={employees}
    />
  );
}

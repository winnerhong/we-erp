import { createClient } from "@/lib/supabase/server";
import { DriversClient, type DriverRow } from "./drivers-client";

export const metadata = { title: "기사" };

export default async function DriversPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.from("drivers").select("*").order("name");
  if (error) {
    return <p className="text-sm text-red-600">데이터를 불러오지 못했습니다: {error.message}</p>;
  }
  const rows = (data ?? []) as DriverRow[];
  const selectedId = sp.p && rows.some((r) => r.id === sp.p) ? sp.p : rows[0]?.id ?? null;

  return <DriversClient rows={rows} selectedId={selectedId} />;
}

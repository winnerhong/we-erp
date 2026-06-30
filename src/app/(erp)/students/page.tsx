import { createClient } from "@/lib/supabase/server";
import { StudentsClient, type StudentRow } from "./students-client";

export const metadata = { title: "원생" };

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.from("students").select("*").order("name");
  if (error) {
    return <p className="text-sm text-red-600">데이터를 불러오지 못했습니다: {error.message}</p>;
  }
  const rows = (data ?? []) as StudentRow[];
  const selectedId = sp.p && rows.some((r) => r.id === sp.p) ? sp.p : rows[0]?.id ?? null;

  return <StudentsClient rows={rows} selectedId={selectedId} />;
}

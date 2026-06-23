import { createAdminClient } from "@/lib/supabase/admin";
import { PrintView } from "./print-view";

export const metadata = { title: "서류 인쇄" };

export default async function DocumentPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createAdminClient();
  const { data } = await db.from("document_issues").select("title, rendered_body").eq("id", id).maybeSingle();
  const row = data as { title: string; rendered_body: string } | null;

  if (!row) {
    return <div className="p-10 text-center text-sm text-neutral-500">서류를 찾을 수 없습니다.</div>;
  }
  return <PrintView title={row.title} body={row.rendered_body} />;
}

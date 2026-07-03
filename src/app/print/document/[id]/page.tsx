import { createAdminClient } from "@/lib/supabase/admin";
import { ensureCompanyAccess } from "@/lib/auth-guard";
import { PrintView } from "./print-view";

export const metadata = { title: "서류 인쇄" };

export default async function DocumentPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createAdminClient();
  const { data } = await db.from("document_issues").select("title, rendered_body, company_id").eq("id", id).maybeSingle();
  const row = data as { title: string; rendered_body: string; company_id: string | null } | null;

  if (!row) {
    return <div className="p-10 text-center text-sm text-neutral-500">서류를 찾을 수 없습니다.</div>;
  }
  // 서비스롤 by-id 조회(RLS 우회) → 앱 레벨 회사 접근 검사가 유일 방어선
  const acc = await ensureCompanyAccess(row.company_id);
  if (acc.error) return <div className="p-10 text-center text-sm text-neutral-500">이 문서에 접근할 권한이 없습니다.</div>;
  return <PrintView title={row.title} body={row.rendered_body} />;
}

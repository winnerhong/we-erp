import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getImportCtx } from "@/lib/queries";
import { getCompanyContext, companyFilter, ALL_COMPANIES } from "@/lib/active-company";
import { isOcrConfigured } from "@/lib/ocr";
import { ReceiptsClient } from "./receipts-client";
import type { ReceiptRow } from "@/lib/supabase/database.types";

export const metadata = { title: "영수증 OCR" };

export default async function ReceiptsPage() {
  const supabase = await createClient();
  const ctxCompany = await getCompanyContext();
  const filter = companyFilter(ctxCompany);

  let query = supabase
    .from("receipts")
    .select("*")
    .order("created_at", { ascending: false });
  if (filter) query = query.eq("company_id", filter);

  let partnerQuery = supabase
    .from("partners")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  if (filter) partnerQuery = partnerQuery.or(`company_id.eq.${filter},company_id.is.null`);

  const [{ data, error }, ctx, { data: partnerData }] = await Promise.all([
    query,
    getImportCtx(),
    partnerQuery,
  ]);
  if (error) {
    return <p className="text-sm text-red-600">데이터를 불러오지 못했습니다: {error.message}</p>;
  }

  const receipts = (data ?? []) as ReceiptRow[];

  // 썸네일/원본용 서명 URL (1시간)
  const signed: Record<string, string> = {};
  if (receipts.length > 0) {
    const admin = createAdminClient();
    const { data: urls } = await admin.storage
      .from("receipts")
      .createSignedUrls(
        receipts.map((r) => r.image_path),
        3600
      );
    urls?.forEach((u, i) => {
      if (u.signedUrl) signed[receipts[i].id] = u.signedUrl;
    });
  }

  return (
    <ReceiptsClient
      receipts={receipts}
      signedUrls={signed}
      ctx={ctx}
      partners={(partnerData ?? []) as { id: string; name: string }[]}
      activeCompanyId={ctxCompany.activeId === ALL_COMPANIES ? null : ctxCompany.activeId}
      ocrConfigured={isOcrConfigured()}
    />
  );
}

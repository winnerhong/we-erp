import { createClient } from "@/lib/supabase/server";
import { getImportCtx } from "@/lib/queries";
import { CompaniesClient } from "./companies-client";
import type { CompanyRow } from "@/lib/supabase/database.types";

export const metadata = { title: "사업자" };

export default async function CompaniesPage() {
  const supabase = await createClient();
  const [{ data, error }, ctx] = await Promise.all([
    supabase.from("companies").select("*").order("created_at", { ascending: false }),
    getImportCtx(),
  ]);

  if (error) {
    return (
      <p className="text-sm text-red-600">
        데이터를 불러오지 못했습니다: {error.message}
        <br />
        Supabase 환경변수와 마이그레이션 적용 여부를 확인하세요.
      </p>
    );
  }

  return <CompaniesClient rows={(data ?? []) as CompanyRow[]} ctx={ctx} />;
}

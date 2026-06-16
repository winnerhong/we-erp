import { createClient } from "@/lib/supabase/server";
import { getImportCtx } from "@/lib/queries";
import { AccountsClient } from "./accounts-client";
import type { AccountRow } from "@/lib/supabase/database.types";

export const metadata = { title: "계정과목" };

export default async function AccountsPage() {
  const supabase = await createClient();
  const [{ data, error }, ctx] = await Promise.all([
    supabase.from("accounts").select("*").order("code"),
    getImportCtx(),
  ]);

  if (error) {
    return <p className="text-sm text-red-600">데이터를 불러오지 못했습니다: {error.message}</p>;
  }

  return <AccountsClient rows={(data ?? []) as AccountRow[]} ctx={ctx} />;
}

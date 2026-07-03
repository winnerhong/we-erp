import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureAdmin } from "@/lib/auth-guard";
import { AuditClient } from "./audit-client";
import type { AuditLogRow } from "@/lib/supabase/database.types";

export const metadata = { title: "감사추적" };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; a?: string }>;
}) {
  const g = await ensureAdmin();
  if (g.error) redirect("/");
  const sp = await searchParams;

  const supabase = await createClient();
  let q = supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(400);
  if (sp.e) q = q.eq("entity_table", sp.e);
  if (sp.a) q = q.eq("action", sp.a);

  const [{ data, error }, { data: companyData }] = await Promise.all([
    q,
    supabase.from("companies").select("id, name"),
  ]);

  if (error) {
    return (
      <p className="text-sm text-amber-700">
        감사 로그를 불러오지 못했습니다. 마이그레이션(20260728_audit_logs) 적용 여부를 확인하세요: {error.message}
      </p>
    );
  }

  const companyNames: Record<string, string> = Object.fromEntries(
    ((companyData ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name])
  );

  return (
    <AuditClient
      logs={(data ?? []) as AuditLogRow[]}
      companyNames={companyNames}
      entity={sp.e ?? ""}
      action={sp.a ?? ""}
    />
  );
}

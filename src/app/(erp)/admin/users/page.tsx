import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureAdmin } from "@/lib/auth-guard";
import { UsersClient } from "./users-client";
import type { ProfileRow } from "@/lib/supabase/database.types";

export const metadata = { title: "사용자 관리" };

export default async function UsersPage() {
  const g = await ensureAdmin();
  if (g.error) redirect("/");

  const supabase = await createClient();
  const [{ data }, { data: roleData }, { data: compData }, { data: memData }] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at"),
    supabase.from("roles").select("key, label").order("sort_order"),
    supabase.from("companies").select("id, name, relation_type").eq("is_active", true).order("name"),
    supabase.from("user_companies").select("user_id, company_id"),
  ]);

  const companies = ((compData ?? []) as { id: string; name: string; relation_type: string }[]);
  const memberships: Record<string, string[]> = {};
  for (const m of (memData ?? []) as { user_id: string; company_id: string }[]) {
    (memberships[m.user_id] ??= []).push(m.company_id);
  }

  return (
    <UsersClient
      users={(data ?? []) as ProfileRow[]}
      roles={(roleData ?? []) as { key: string; label: string }[]}
      selfId={g.profile!.id}
      companies={companies}
      memberships={memberships}
    />
  );
}

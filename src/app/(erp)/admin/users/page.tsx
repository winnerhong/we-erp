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
  const [{ data }, { data: roleData }] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at"),
    supabase.from("roles").select("key, label").order("sort_order"),
  ]);

  return (
    <UsersClient
      users={(data ?? []) as ProfileRow[]}
      roles={(roleData ?? []) as { key: string; label: string }[]}
      selfId={g.profile!.id}
    />
  );
}

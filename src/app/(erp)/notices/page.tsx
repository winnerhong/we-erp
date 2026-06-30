import { createClient } from "@/lib/supabase/server";
import { getCompanyContext, companyFilter } from "@/lib/active-company";
import { NoticesClient, type NoticeItem } from "./notices-client";
import type { NoticeRow } from "@/lib/supabase/database.types";

export const metadata = { title: "공지" };

export default async function NoticesPage() {
  const supabase = await createClient();
  const ctx = await getCompanyContext();
  const filter = companyFilter(ctx);

  const [{ data: nData }, { data: pData }] = await Promise.all([
    supabase.from("notices").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("partners").select("id, name, company_id, partner_group").eq("is_active", true).order("name"),
  ]);
  const notices = (nData ?? []) as NoticeRow[];
  const allPartners = (pData ?? []) as { id: string; name: string; company_id: string | null; partner_group: string | null }[];
  const partners = filter ? allPartners.filter((p) => !p.company_id || p.company_id === filter) : allPartners;
  const groups = [...new Set(partners.map((p) => p.partner_group).filter((v): v is string => !!v))].sort();
  const pName = new Map(allPartners.map((p) => [p.id, p.name]));

  const items: NoticeItem[] = notices.map((n) => ({
    id: n.id, title: n.title, body: n.body, audience: n.audience,
    partnerIds: n.partner_ids, partnerNames: n.partner_ids.map((id) => pName.get(id) ?? "?"),
    groupTag: n.group_tag, pinned: n.pinned, startDate: n.start_date, endDate: n.end_date,
    status: n.status, publishedAt: n.published_at, sentCount: n.sent_count, authorName: n.author_name,
    createdAt: n.created_at,
  }));

  return (
    <NoticesClient
      items={items}
      companyId={filter}
      partners={partners.map((p) => ({ id: p.id, name: p.name }))}
      groups={groups}
    />
  );
}

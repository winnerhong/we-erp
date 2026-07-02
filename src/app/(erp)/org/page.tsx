import { createClient } from "@/lib/supabase/server";
import { getCompanyContext } from "@/lib/active-company";
import { OrgClient } from "./org-client";
import type { OrgEmployee } from "@/components/org-chart";
import type { EmployeeRow, FieldOptionRow } from "@/lib/supabase/database.types";

export const metadata = { title: "조직도" };

export default async function OrgPage() {
  const supabase = await createClient();
  const ctx = await getCompanyContext();

  const [{ data: empData }, { data: foRows }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, name, company_id, department, job_rank, job_title, photo_url, phone, email, hired_on")
      .eq("is_active", true)
      .order("name"),
    supabase.from("field_options").select("*").in("category", ["department", "job_rank", "job_title"]),
  ]);

  const fo = (foRows ?? []) as FieldOptionRow[];
  const labelOf = (cat: string, v: string | null): string | null =>
    v ? fo.find((o) => o.category === cat && o.value === v)?.label ?? v : null;
  const rankSortOf = (v: string | null): number =>
    v ? fo.find((o) => o.category === "job_rank" && o.value === v)?.sort_order ?? 999 : 999;

  const employees: OrgEmployee[] = ((empData ?? []) as Pick<
    EmployeeRow,
    "id" | "name" | "company_id" | "department" | "job_rank" | "job_title" | "photo_url" | "phone" | "email" | "hired_on"
  >[]).map((e) => ({
    id: e.id,
    name: e.name,
    photoUrl: e.photo_url ?? null,
    companyId: e.company_id ?? null,
    deptValue: e.department ?? null,
    deptLabel: labelOf("department", e.department ?? null),
    rankLabel: labelOf("job_rank", e.job_rank ?? null),
    rankSort: rankSortOf(e.job_rank ?? null),
    titleLabel: labelOf("job_title", e.job_title ?? null),
    phone: e.phone ?? null,
    email: e.email ?? null,
    hiredOn: e.hired_on ?? null,
  }));

  return <OrgClient companies={ctx.companies.map((c) => ({ id: c.id, name: c.name }))} employees={employees} activeId={ctx.activeId} />;
}

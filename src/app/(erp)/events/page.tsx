import { createClient } from "@/lib/supabase/server";
import { getCompanyContext, companyFilter } from "@/lib/active-company";
import { kstToday } from "@/lib/attendance";
import { EventsClient, type EventItem } from "./events-client";
import type { ContractRow, EventStaffRow } from "@/lib/supabase/database.types";

export const metadata = { title: "행사관리" };

export default async function EventsPage() {
  const supabase = await createClient();
  const ctx = await getCompanyContext();
  const filter = companyFilter(ctx);

  let q = supabase.from("contracts").select("*").eq("type", "EVENT");
  if (filter) q = q.eq("company_id", filter);
  const [{ data: cData }, { data: eData }] = await Promise.all([
    q,
    supabase.from("employees").select("id, name").eq("is_active", true).order("name"),
  ]);
  const contracts = (cData ?? []) as ContractRow[];
  const employees = (eData ?? []) as { id: string; name: string }[];

  const partnerIds = [...new Set(contracts.map((c) => c.partner_id))];
  const contractIds = contracts.map((c) => c.id);
  const [{ data: pData }, { data: sData }] = await Promise.all([
    partnerIds.length ? supabase.from("partners").select("id, name").in("id", partnerIds) : Promise.resolve({ data: [] }),
    contractIds.length ? supabase.from("event_staff").select("*").in("contract_id", contractIds) : Promise.resolve({ data: [] }),
  ]);
  const pName = new Map(((pData ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const eName = new Map(employees.map((e) => [e.id, e.name]));
  const staffBy = new Map<string, { id: string; employeeId: string | null; employeeName: string; role: string | null }[]>();
  for (const s of (sData ?? []) as EventStaffRow[]) {
    const arr = staffBy.get(s.contract_id) ?? [];
    arr.push({ id: s.id, employeeId: s.employee_id, employeeName: s.employee_id ? eName.get(s.employee_id) ?? "?" : "?", role: s.role });
    staffBy.set(s.contract_id, arr);
  }

  const items: EventItem[] = contracts
    .map((c) => {
      const d = c.detail ?? {};
      return {
        id: c.id, name: c.name, partnerName: pName.get(c.partner_id) ?? "",
        eventDate: typeof d.event_date === "string" ? d.event_date : null,
        place: typeof d.place === "string" ? d.place : null,
        headcount: d.headcount != null ? Number(d.headcount) : null,
        programs: typeof d.programs === "string" ? d.programs : null,
        amount: c.unit_price ?? null, status: c.status,
        staff: staffBy.get(c.id) ?? [],
      };
    })
    .sort((a, b) => (b.eventDate ?? "").localeCompare(a.eventDate ?? ""));

  return <EventsClient items={items} employees={employees} today={kstToday()} />;
}

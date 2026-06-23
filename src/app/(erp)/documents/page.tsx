import { createClient } from "@/lib/supabase/server";
import { DocumentsClient } from "./documents-client";
import type { DocumentTemplateRow, DocumentIssueRow } from "@/lib/supabase/database.types";

export const metadata = { title: "서류관리" };

export interface IssueOverview {
  id: string;
  title: string;
  status: string;
  issued_on: string;
  signed_file: string | null;
  employee_name: string;
}

export default async function DocumentsPage() {
  const supabase = await createClient();

  const [{ data: tpls }, { data: issues }, { data: emps }] = await Promise.all([
    supabase.from("document_templates").select("*").order("sort_order").order("created_at"),
    supabase
      .from("document_issues")
      .select("id, title, status, issued_on, signed_file, employee_id")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("employees").select("id, name"),
  ]);

  const empName = new Map(((emps ?? []) as { id: string; name: string }[]).map((e) => [e.id, e.name]));
  const overview: IssueOverview[] = ((issues ?? []) as (DocumentIssueRow & { employee_id: string })[]).map((i) => ({
    id: i.id,
    title: i.title,
    status: i.status,
    issued_on: i.issued_on,
    signed_file: i.signed_file,
    employee_name: empName.get(i.employee_id) ?? "(직원)",
  }));

  return <DocumentsClient templates={(tpls ?? []) as DocumentTemplateRow[]} issues={overview} />;
}

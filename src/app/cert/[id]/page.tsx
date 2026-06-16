import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrintBar } from "./print-bar";
import type { EmploymentCertificateRow, CompanyRow } from "@/lib/supabase/database.types";

export const metadata = { title: "재직증명서" };

function krDate(d: string | null) {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  return `${y}년 ${m}월 ${day}일`;
}

export default async function CertPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: cert } = await supabase
    .from("employment_certificates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!cert) notFound();
  const c = cert as EmploymentCertificateRow;

  const { data: companyData } = await supabase
    .from("companies")
    .select("*")
    .eq("id", c.company_id)
    .maybeSingle();
  const company = companyData as CompanyRow | null;

  const row = (label: string, value: string | null) => (
    <tr>
      <th className="w-32 border border-neutral-400 bg-neutral-50 px-3 py-2 text-left font-medium">{label}</th>
      <td className="border border-neutral-400 px-3 py-2">{value || ""}</td>
    </tr>
  );

  return (
    <div className="min-h-screen bg-neutral-100 p-6 print:bg-white print:p-0">
      <div className="mx-auto max-w-2xl">
        <PrintBar />

        <div className="mx-auto bg-white p-12 shadow-sm print:shadow-none">
          <div className="mb-2 text-right text-sm text-neutral-500">발급번호: {c.cert_no}</div>
          <h1 className="mb-10 text-center text-3xl font-bold tracking-[0.4em]">재직증명서</h1>

          <table className="w-full border-collapse text-sm">
            <tbody>
              {row("성명", c.employee_name)}
              {row("생년월일", c.birth)}
              {row("주소", c.address)}
              {row("부서", c.department)}
              {row("직위", c.position)}
              {row("고용형태", c.employment_type)}
              {row("입사일", c.hired_on)}
              {row("재직기간", c.hired_on ? `${c.hired_on} ~ 현재` : "")}
            </tbody>
          </table>

          <p className="mt-10 text-center text-base leading-relaxed">
            위 사람은 당사에 위와 같이 재직하고 있음을 증명합니다.
          </p>

          {(c.purpose || c.submit_to) && (
            <p className="mt-3 text-center text-sm text-neutral-500">
              {c.purpose && `용도: ${c.purpose}`}
              {c.purpose && c.submit_to && " · "}
              {c.submit_to && `제출처: ${c.submit_to}`}
            </p>
          )}

          <p className="mt-12 text-center text-base">{krDate(c.issued_on)}</p>

          <div className="mt-10 space-y-1 text-center text-sm">
            {company?.name && <p className="text-lg font-bold">{company.name}</p>}
            {company?.biz_no && <p>사업자등록번호: {company.biz_no}</p>}
            {company?.address && <p>{company.address}</p>}
            {company?.ceo_name && (
              <p className="mt-2 text-base">
                대표자: {company.ceo_name} <span className="ml-1 text-neutral-400">(인)</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

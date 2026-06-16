"use client";

import { EntityManager, type ColumnDef, type FieldDef } from "@/components/entity-manager";
import { Badge } from "@/components/ui";
import { TAX_TYPE_LABEL } from "@/lib/labels";
import type { CompanyRow, TaxType } from "@/lib/supabase/database.types";
import type { ImportCtx } from "@/lib/import-specs";

const taxOptions = (Object.keys(TAX_TYPE_LABEL) as TaxType[]).map((v) => ({
  value: v,
  label: TAX_TYPE_LABEL[v],
}));

const columns: ColumnDef<CompanyRow>[] = [
  { key: "name", label: "상호", render: (r) => <span className="font-medium">{r.name}</span> },
  { key: "biz_no", label: "사업자등록번호", render: (r) => r.biz_no ?? "-" },
  { key: "ceo_name", label: "대표자", render: (r) => r.ceo_name ?? "-" },
  {
    key: "tax_type",
    label: "과세유형",
    render: (r) => (
      <Badge tone={r.tax_type === "TAX_FREE" ? "blue" : "neutral"}>
        {TAX_TYPE_LABEL[r.tax_type]}
      </Badge>
    ),
  },
  { key: "biz_type", label: "업종", render: (r) => r.biz_type ?? "-" },
];

const fields: FieldDef[] = [
  { key: "name", label: "상호", type: "text", required: true },
  { key: "biz_no", label: "사업자등록번호", type: "text", placeholder: "000-00-00000" },
  { key: "ceo_name", label: "대표자", type: "text" },
  { key: "tax_type", label: "과세유형", type: "select", required: true, options: taxOptions },
  { key: "biz_type", label: "업종", type: "text" },
  { key: "biz_category", label: "업태", type: "text" },
  { key: "address", label: "주소", type: "text" },
];

export function CompaniesClient({ rows, ctx }: { rows: CompanyRow[]; ctx: ImportCtx }) {
  return (
    <EntityManager
      kind="companies"
      title="사업자"
      description="법인·개인사업자를 무제한 등록합니다. 면세/과세 혼재 사업자는 과세유형을 정확히 지정하세요."
      rows={rows}
      columns={columns}
      fields={fields}
      ctx={ctx}
      showRowNumber
      searchText={(r) =>
        `${r.name} ${r.biz_no ?? ""} ${r.ceo_name ?? ""} ${r.biz_type ?? ""}`
      }
      searchPlaceholder="상호·사업자번호·대표자 검색"
    />
  );
}

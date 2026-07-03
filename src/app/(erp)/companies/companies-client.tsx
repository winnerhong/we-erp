"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { EntityManager, type ColumnDef, type FieldDef } from "@/components/entity-manager";
import { Badge } from "@/components/ui";
import { TAX_TYPE_LABEL } from "@/lib/labels";
import { updateRow } from "@/app/(erp)/actions";
import type { CompanyRow, TaxType } from "@/lib/supabase/database.types";
import type { ImportCtx } from "@/lib/import-specs";

const taxOptions = (Object.keys(TAX_TYPE_LABEL) as TaxType[]).map((v) => ({
  value: v,
  label: TAX_TYPE_LABEL[v],
}));

const relationOptions = [
  { value: "OWNED", label: "자사" },
  { value: "MANAGED", label: "수임업체(대리)" },
];

/** 위임 항목(대리업무 범위). */
export const SCOPE_ITEMS = [
  { key: "TAX", label: "세무신고" },
  { key: "BOOKKEEPING", label: "기장" },
  { key: "PAYROLL", label: "급여" },
  { key: "SETTLE", label: "정산" },
  { key: "INVOICE", label: "계산서 발행" },
];

const columns: ColumnDef<CompanyRow>[] = [
  {
    key: "relation_type",
    label: "구분",
    render: (r) =>
      r.relation_type === "MANAGED" ? <Badge tone="amber">🤝 수임</Badge> : <Badge tone="neutral">자사</Badge>,
  },
  { key: "name", label: "상호", render: (r) => <span className="font-medium">{r.name}</span> },
  { key: "biz_no", label: "사업자등록번호", render: (r) => r.biz_no ?? "-" },
  { key: "ceo_name", label: "대표자", render: (r) => r.ceo_name ?? "-" },
  {
    key: "tax_type",
    label: "과세유형",
    render: (r) => (
      <Badge tone={r.tax_type === "TAX_FREE" ? "blue" : "neutral"}>{TAX_TYPE_LABEL[r.tax_type]}</Badge>
    ),
  },
  { key: "biz_type", label: "업종", render: (r) => r.biz_type ?? "-" },
];

const fields: FieldDef[] = [
  { key: "relation_type", label: "구분 (자사/수임)", type: "select", required: true, options: relationOptions },
  { key: "name", label: "상호", type: "text", required: true },
  { key: "biz_no", label: "사업자등록번호", type: "text", placeholder: "000-00-00000" },
  { key: "ceo_name", label: "대표자", type: "text" },
  { key: "tax_type", label: "과세유형", type: "select", required: true, options: taxOptions },
  { key: "biz_type", label: "업종", type: "text" },
  { key: "biz_category", label: "업태", type: "text" },
  { key: "address", label: "주소", type: "text" },
  { key: "corp_num", label: "Popbill CorpNum", type: "text", placeholder: "계산서 발행 주체" },
  { key: "managed_start", label: "수임 계약 시작", type: "date" },
  { key: "managed_end", label: "수임 계약 종료", type: "date" },
  { key: "client_memo", label: "수임 메모", type: "text" },
];

export interface ClientActivity {
  tax: number;
  txn: number;
}

export function CompaniesClient({
  rows,
  ctx,
  activity,
}: {
  rows: CompanyRow[];
  ctx: ImportCtx;
  activity: Record<string, ClientActivity>;
}) {
  const managed = rows.filter((r) => r.relation_type === "MANAGED");
  return (
    <div className="space-y-8">
      <EntityManager
        kind="companies"
        title="사업자"
        description="자사·수임업체를 무제한 등록합니다. 수임업체(대리업무)는 구분을 ‘수임’으로 지정하세요."
        rows={rows}
        columns={columns}
        fields={fields}
        ctx={ctx}
        showRowNumber
        searchText={(r) => `${r.name} ${r.biz_no ?? ""} ${r.ceo_name ?? ""} ${r.biz_type ?? ""}`}
        searchPlaceholder="상호·사업자번호·대표자 검색"
      />
      {managed.length > 0 && <ManagedSection rows={managed} activity={activity} />}
    </div>
  );
}

function ManagedSection({ rows, activity }: { rows: CompanyRow[]; activity: Record<string, ClientActivity> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggleScope(company: CompanyRow, key: string) {
    const cur = company.managed_scope ?? [];
    const next = cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key];
    startTransition(async () => {
      await updateRow("companies", company.id, { managed_scope: next });
      router.refresh();
    });
  }

  return (
    <section>
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-neutral-900">
        🤝 수임업체 (대리업무) <span className="text-sm font-normal text-neutral-400">{rows.length}곳</span>
      </h2>
      <p className="mb-3 text-sm text-neutral-500">위임 범위를 지정하고, 이번 달 처리 건수(대리 수수료 청구 근거)를 확인하세요.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((c) => {
          const scope = c.managed_scope ?? [];
          const act = activity[c.id] ?? { tax: 0, txn: 0 };
          return (
            <div key={c.id} className="rounded-2xl border border-amber-200 bg-amber-50/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-neutral-800">{c.name}</h3>
                {(c.managed_start || c.managed_end) && (
                  <span className="text-xs text-neutral-400">
                    {c.managed_start ?? "?"} ~ {c.managed_end ?? "진행중"}
                  </span>
                )}
              </div>
              {c.corp_num && <p className="mt-0.5 text-xs text-neutral-400">CorpNum {c.corp_num}</p>}

              <div className="mt-3">
                <p className="mb-1.5 text-xs font-semibold text-neutral-500">위임 범위</p>
                <div className="flex flex-wrap gap-1.5">
                  {SCOPE_ITEMS.map((s) => {
                    const on = scope.includes(s.key);
                    return (
                      <button
                        key={s.key}
                        onClick={() => toggleScope(c, s.key)}
                        disabled={pending}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
                          on ? "bg-amber-500 text-white" : "border border-neutral-300 bg-white text-neutral-500 hover:bg-neutral-50"
                        }`}
                      >
                        {on ? "✓ " : "+ "}
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-amber-100 pt-2.5 text-xs text-neutral-500">
                <span>이번 달 처리 —</span>
                <span>계산서 <b className="tabular-nums text-neutral-700">{act.tax}</b>건</span>
                <span>거래 <b className="tabular-nums text-neutral-700">{act.txn}</b>건</span>
              </div>
              {c.client_memo && <p className="mt-2 whitespace-pre-wrap text-xs text-neutral-500">📝 {c.client_memo}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

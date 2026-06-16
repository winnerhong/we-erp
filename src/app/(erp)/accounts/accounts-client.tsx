"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { EntityManager, type ColumnDef, type FieldDef } from "@/components/entity-manager";
import type { AccountRow } from "@/lib/supabase/database.types";
import type { ImportCtx } from "@/lib/import-specs";
import { seedStandardAccounts } from "./actions";

const columns: ColumnDef<AccountRow>[] = [
  { key: "code", label: "계정코드", render: (r) => <span className="tabular font-medium">{r.code}</span> },
  { key: "name", label: "계정명" },
  { key: "category", label: "구분", render: (r) => r.category ?? "-" },
];

const fields: FieldDef[] = [
  { key: "code", label: "계정코드", type: "text", required: true, placeholder: "811" },
  { key: "name", label: "계정명", type: "text", required: true, placeholder: "복리후생비" },
  { key: "category", label: "구분", type: "text", placeholder: "판매관리비 / 매출 / 자산 …" },
];

function SeedButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      onClick={() =>
        startTransition(async () => {
          const res = await seedStandardAccounts();
          if (!res.ok) alert(res.error);
          else alert(`표준 계정과목 ${res.created}개 추가 (이미 있던 ${res.skipped}개 제외)`);
          router.refresh();
        })
      }
      disabled={pending}
      className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
    >
      {pending ? "불러오는 중…" : "📚 표준 계정과목 불러오기"}
    </button>
  );
}

export function AccountsClient({ rows, ctx }: { rows: AccountRow[]; ctx: ImportCtx }) {
  return (
    <EntityManager
      kind="accounts"
      title="계정과목"
      description="전 사업자 공용 계정과목. 거래처·영수증 분류의 기준이 됩니다."
      rows={rows}
      columns={columns}
      fields={fields}
      ctx={ctx}
      showRowNumber
      searchText={(r) => `${r.code} ${r.name} ${r.category ?? ""}`}
      searchPlaceholder="코드·계정명·구분 검색"
      extraActions={<SeedButton />}
    />
  );
}

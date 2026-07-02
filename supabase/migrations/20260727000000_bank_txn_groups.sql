-- =============================================================
-- 통장 정기거래 그룹 — 매달 비슷한 이름으로 들어오는 거래를 하나로 묶어 관리.
--  - 그룹에 거래처·계정과목·구분 기본값을 지정하면 소속 거래에 자동 적용.
--  - match_keys: 자동 매칭용 정규화 키워드(내용/거래처에 포함되면 그 그룹으로).
-- =============================================================
create table if not exists bank_txn_groups (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies(id) on delete cascade,
  name               text not null,
  match_keys         text[] not null default '{}',   -- 정규화 키워드(포함 매칭)
  direction          text,                            -- 'IN' | 'OUT' | null(둘 다)
  default_partner_id uuid references partners(id) on delete set null,
  default_account_id uuid references accounts(id) on delete set null,
  default_category   text,                            -- field_options 'bank_category'
  color              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_bank_groups_company on bank_txn_groups (company_id);

-- 거래 → 그룹 연결
alter table bank_transactions add column if not exists group_id uuid references bank_txn_groups(id) on delete set null;
create index if not exists idx_bank_txn_group on bank_transactions (group_id);

alter table bank_txn_groups enable row level security;
do $$ begin
  drop policy if exists bank_txn_groups_select on bank_txn_groups;
  create policy bank_txn_groups_select on bank_txn_groups for select using (auth.role() = 'authenticated');
end $$;

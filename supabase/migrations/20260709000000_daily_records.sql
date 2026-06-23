-- 사업자별 일매출관리 — 매출·지출을 건별로 직접 기록(현장 현금영업 등 증빙 밖 거래)
create table if not exists daily_records (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  record_date   date not null,
  kind          text not null check (kind in ('SALES','EXPENSE')),  -- 매출 / 지출
  category      text,                 -- field_options(category=sales_category | expense_category)
  payment_method text,                -- CASH | CARD | TRANSFER | OTHER (고정값)
  amount        numeric not null default 0,
  qty           integer,              -- 건수(선택)
  memo          text,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_daily_records_company_date on daily_records (company_id, record_date);

alter table daily_records enable row level security;
-- 쓰기는 service-role + 서버액션 가드(ensureUser)가 담당 → SELECT 만 개방
drop policy if exists daily_records_select on daily_records;
create policy daily_records_select on daily_records for select to authenticated using (true);

-- 매출유형 · 지출유형 기본 옵션(⚙ 항목에서 자유롭게 추가·수정)
insert into field_options (category, value, label, color, sort_order) values
  ('sales_category','입장료','입장료',null,1),
  ('sales_category','식음료','식음료',null,2),
  ('sales_category','강습료','강습료',null,3),
  ('sales_category','물품판매','물품판매',null,4),
  ('sales_category','기타매출','기타매출',null,5),
  ('expense_category','식자재','식자재',null,1),
  ('expense_category','소모품','소모품',null,2),
  ('expense_category','인건비','인건비',null,3),
  ('expense_category','임대료','임대료',null,4),
  ('expense_category','공과금','공과금',null,5),
  ('expense_category','기타지출','기타지출',null,6)
on conflict (category, value) do nothing;

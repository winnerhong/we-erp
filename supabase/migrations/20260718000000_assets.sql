-- =============================================================
-- 3차 — QR 교구·자산 관리
--   assets(교구/자산 마스터) + asset_movements(입출고·대여·반납·수리 이력)
--   QR은 자산 상세 딥링크(/assets/[id])를 인코딩 → 폰 카메라로 스캔해 이동 기록.
--   전부 company_id 스코핑.
-- =============================================================

create table if not exists assets (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete set null,
  code          text,                              -- 자산코드(라벨)
  name          text not null,
  category      text,                              -- field_options(asset_category)
  total_qty     integer not null default 1,        -- 보유 수량
  available_qty integer not null default 1,        -- 가용(대여가능) 수량
  status        text not null default 'AVAILABLE', -- AVAILABLE/RENTED/REPAIR/LOST
  location      text,                              -- 보관 위치
  purchase_price numeric,
  purchase_date date,
  memo          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_assets_company on assets (company_id);

create table if not exists asset_movements (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references companies(id) on delete set null,
  asset_id    uuid not null references assets(id) on delete cascade,
  type        text not null,                       -- IN/OUT/RENT/RETURN/REPAIR/DISPOSE
  qty         integer not null default 1,
  partner_id  uuid references partners(id) on delete set null,  -- 대여처(기관)
  employee_id uuid references employees(id) on delete set null, -- 처리자
  txn_date    date not null,
  due_date    date,                                -- 반납 예정
  status      text not null default 'CLOSED',      -- OPEN(대여중)/CLOSED
  memo        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_asset_movements_asset on asset_movements (asset_id, txn_date);
create index if not exists idx_asset_movements_partner on asset_movements (partner_id);

alter table assets enable row level security;
alter table asset_movements enable row level security;
do $$ begin
  drop policy if exists assets_select on assets;
  create policy assets_select on assets for select using (auth.role() = 'authenticated');
  drop policy if exists asset_movements_select on asset_movements;
  create policy asset_movements_select on asset_movements for select using (auth.role() = 'authenticated');
end $$;

insert into field_options (category, value, label, color, sort_order) values
  ('asset_category','매트','매트','blue',1),
  ('asset_category','공','공','amber',2),
  ('asset_category','콘','콘','rose',3),
  ('asset_category','체육교구','체육교구','violet',4),
  ('asset_category','대형기구','대형기구','emerald',5),
  ('asset_category','기타','기타','neutral',9)
on conflict (category, value) do nothing;

-- =============================================================
-- 기사(drivers) — winner-kids drivers 동기화 대상
--   거래처/원생과 동일한 카드 마스터-디테일 UI(EntityWorkspace).
--   source_ref("wks:drivers:{id}")로 멱등 upsert. soft-delete(deleted_at)는 제외.
--   쓰기는 서비스롤(동기화), 읽기는 authenticated. company_id 스코핑(선택).
-- =============================================================

create table if not exists drivers (
  id               uuid primary key default gen_random_uuid(),
  source_ref       text unique,                       -- "wks:drivers:{id}"
  company_id       uuid references companies(id) on delete set null,
  is_active        boolean not null default true,
  name             text not null,
  phone            text,
  email            text,
  birth_date       date,
  address          text,
  license_number   text,
  license_type     text,                              -- 1종보통/1종대형/2종보통 …
  license_expiry   date,
  hire_date        date,
  employment_type  text,                              -- 정규직/계약직/프리랜서/파트
  status           text not null default '근무중' check (status in ('근무중','휴직','퇴사')),
  bank_name        text,
  bank_account     text,
  memo             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_drivers_status  on drivers (status);
create index if not exists idx_drivers_company on drivers (company_id);

alter table drivers enable row level security;
do $$ begin
  drop policy if exists drivers_select on drivers;
  create policy drivers_select on drivers for select using (auth.role() = 'authenticated');
end $$;

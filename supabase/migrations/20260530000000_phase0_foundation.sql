-- =============================================================
-- 위너 통합 ERP — Phase 0: 기초 등록 토대
--   사업자(companies) / 거래처(partners) / 계정과목(accounts) / 직원(employees)
-- =============================================================

-- ---------- ENUM 타입 ----------
-- 과세유형
do $$ begin
  create type tax_type as enum ('GENERAL', 'SIMPLIFIED', 'TAX_FREE');
  -- GENERAL=일반과세, SIMPLIFIED=간이과세, TAX_FREE=면세
exception when duplicate_object then null; end $$;

-- 고용형태
do $$ begin
  create type employment_type as enum ('FULL_TIME', 'CONTRACT', 'FREELANCER', 'HOURLY');
  -- FULL_TIME=정규, CONTRACT=계약, FREELANCER=프리랜서, HOURLY=시급
exception when duplicate_object then null; end $$;

-- 권한 역할
do $$ begin
  create type user_role as enum ('STAFF', 'MANAGER', 'ACCOUNTANT', 'ADMIN');
  -- STAFF=직원, MANAGER=부서장, ACCOUNTANT=경리/회계, ADMIN=관리자
exception when duplicate_object then null; end $$;

-- ---------- updated_at 자동 갱신 트리거 함수 ----------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------- 1) 사업자 (companies) ----------
create table if not exists companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                       -- 상호
  biz_no        text unique,                          -- 사업자등록번호 (000-00-00000)
  ceo_name      text,                                 -- 대표자
  biz_type      text,                                 -- 업종
  biz_category  text,                                 -- 업태
  address       text,                                 -- 주소
  tax_type      tax_type not null default 'GENERAL',  -- 과세유형
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists trg_companies_updated_at on companies;
create trigger trg_companies_updated_at before update on companies
  for each row execute function set_updated_at();

-- ---------- 2) 계정과목 (accounts) — 전사 공용 ----------
create table if not exists accounts (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,                  -- 계정코드
  name        text not null,                         -- 계정명
  category    text,                                  -- 구분 (매출/매입/판관비 등)
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_accounts_updated_at on accounts;
create trigger trg_accounts_updated_at before update on accounts
  for each row execute function set_updated_at();

-- ---------- 3) 거래처 (partners) ----------
-- company_id NULL = 전체 공용 거래처, 값 있으면 해당 사업자 전용
create table if not exists partners (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid references companies(id) on delete set null,
  name                text not null,                 -- 상호
  biz_no              text,                          -- 사업자번호
  contact_name        text,                          -- 담당자
  phone               text,
  email               text,
  default_account_id  uuid references accounts(id) on delete set null,  -- 기본 계정과목
  memo                text,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_partners_company on partners(company_id);

drop trigger if exists trg_partners_updated_at on partners;
create trigger trg_partners_updated_at before update on partners
  for each row execute function set_updated_at();

-- ---------- 4) 직원 (employees) ----------
create table if not exists employees (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,  -- 소속 사업자
  name              text not null,
  email             text,
  phone             text,
  employment_type   employment_type not null default 'FULL_TIME',
  role              user_role not null default 'STAFF',
  hired_on          date,                            -- 입사일
  base_salary       numeric(12,0),                   -- 기본급(월)
  hourly_wage       numeric(10,0),                   -- 시급
  is_active         boolean not null default true,
  memo              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_employees_company on employees(company_id);

drop trigger if exists trg_employees_updated_at on employees;
create trigger trg_employees_updated_at before update on employees
  for each row execute function set_updated_at();

-- =============================================================
-- RLS
--   Phase 0: 인증 도입 전 — authenticated/anon 모두 허용(임시).
--   Phase 5(권한 정교화)에서 역할 기반 정책으로 교체할 것.  TODO
-- =============================================================
alter table companies enable row level security;
alter table accounts  enable row level security;
alter table partners  enable row level security;
alter table employees enable row level security;

do $$
declare t text;
begin
  foreach t in array array['companies','accounts','partners','employees'] loop
    execute format('drop policy if exists %I on %I', t || '_all_phase0', t);
    execute format(
      'create policy %I on %I for all using (true) with check (true)',
      t || '_all_phase0', t
    );
  end loop;
end $$;

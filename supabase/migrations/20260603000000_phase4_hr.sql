-- =============================================================
-- 위너 통합 ERP — Phase 4: 급여·인사
--   휴가·연차(신청→승인→차감) + 월별 급여대장.
-- =============================================================

do $$ begin
  create type leave_type as enum
    ('ANNUAL', 'HALF_DAY', 'SICK', 'FAMILY_EVENT', 'PARENTAL', 'UNPAID', 'OTHER');
  -- ANNUAL=연차, HALF_DAY=반차, SICK=병가, FAMILY_EVENT=경조사,
  -- PARENTAL=육아휴직, UNPAID=무급휴가, OTHER=기타
exception when duplicate_object then null; end $$;

do $$ begin
  create type leave_status as enum ('PENDING', 'APPROVED', 'REJECTED');
  -- PENDING=신청, APPROVED=승인, REJECTED=반려
exception when duplicate_object then null; end $$;

-- ---------- 휴가 신청 ----------
create table if not exists leave_requests (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  employee_id  uuid not null references employees(id) on delete cascade,
  leave_type   leave_type not null default 'ANNUAL',
  start_date   date not null,
  end_date     date not null,
  days         numeric(4,1) not null default 1,          -- 사용 일수(반차 0.5)
  reason       text,
  status       leave_status not null default 'PENDING',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_leaves_emp on leave_requests(employee_id, status);
create index if not exists idx_leaves_company on leave_requests(company_id, start_date);

drop trigger if exists trg_leaves_updated_at on leave_requests;
create trigger trg_leaves_updated_at before update on leave_requests
  for each row execute function set_updated_at();

-- ---------- 급여대장 ----------
create table if not exists payrolls (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  employee_id       uuid not null references employees(id) on delete cascade,
  year_month        text not null,                       -- 'YYYY-MM'
  base_pay          numeric(12,0) not null default 0,    -- 기본급
  allowance         numeric(12,0) not null default 0,    -- 과세 수당
  nontax_allowance  numeric(12,0) not null default 0,    -- 비과세 수당(식대 등)
  income_tax        numeric(12,0) not null default 0,    -- 소득세(+지방세)
  insurance         numeric(12,0) not null default 0,    -- 4대보험(근로자부담 합)
  other_deduction   numeric(12,0) not null default 0,    -- 기타 공제
  net_pay           numeric(12,0) not null default 0,    -- 실지급액
  memo              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (employee_id, year_month)
);
create index if not exists idx_payrolls_company on payrolls(company_id, year_month);

drop trigger if exists trg_payrolls_updated_at on payrolls;
create trigger trg_payrolls_updated_at before update on payrolls
  for each row execute function set_updated_at();

-- ---------- RLS ----------
alter table leave_requests enable row level security;
alter table payrolls       enable row level security;
do $$ begin
  drop policy if exists leaves_all_phase0 on leave_requests;
  create policy leaves_all_phase0 on leave_requests for all using (true) with check (true);
  drop policy if exists payrolls_all_phase0 on payrolls;
  create policy payrolls_all_phase0 on payrolls for all using (true) with check (true);
end $$;

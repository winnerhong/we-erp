-- =============================================================
-- 페이백(Payback) — 통장 입금 중 일부를 강사/거래처에 되돌려줄 때.
--   지급 시 원천징수(세금) 공제. 지급완료하면 통장 출금거래 자동 생성.
-- =============================================================

create table if not exists paybacks (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid references companies(id) on delete set null,
  bank_transaction_id uuid references bank_transactions(id) on delete cascade,  -- 출처(입금) 거래
  recipient_type      text not null default 'PARTNER',   -- 'PARTNER' | 'EMPLOYEE'
  partner_id          uuid references partners(id)  on delete set null,
  employee_id         uuid references employees(id) on delete set null,
  gross_amount        numeric(14,0) not null default 0,  -- 페이백 총액
  tax_rate            numeric(5,2)  not null default 0,   -- 원천징수율(%)
  tax_amount          numeric(14,0) not null default 0,  -- 세액(자동)
  net_amount          numeric(14,0) not null default 0,  -- 실지급액(자동)
  status              text not null default 'PENDING',   -- 'PENDING' | 'PAID'
  paid_at             date,
  paid_txn_id         uuid references bank_transactions(id) on delete set null, -- 지급완료 시 자동 생성된 출금거래
  memo                text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists paybacks_txn_idx on paybacks (bank_transaction_id);
create index if not exists paybacks_company_idx on paybacks (company_id, status);

drop trigger if exists trg_paybacks_updated_at on paybacks;
create trigger trg_paybacks_updated_at before update on paybacks
  for each row execute function set_updated_at();

alter table paybacks enable row level security;
do $$ begin
  drop policy if exists paybacks_select_auth on paybacks;
  create policy paybacks_select_auth on paybacks
    for select using (auth.role() = 'authenticated');
end $$;

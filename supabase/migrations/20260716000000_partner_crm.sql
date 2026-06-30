-- =============================================================
-- 체육사업 거래처 360° CRM — 1차: 거래처 핵심필드 확장 + 계약(Contract) + 거래내역(Transaction)
--   거래 유형: CLASS(체육수업·매주반복) / EVENT(체육행사·일회성) / RENTAL(교구렌탈)
--   거래처 → 계약 → 거래내역(매주/건별) → (2차)정산·세금계산서
--   전부 company_id 스코핑(멀티법인).
-- =============================================================

-- 1) partners 핵심필드 확장(자주 쓰는 것만)
alter table partners add column if not exists rep_name        text;     -- 대표자명
alter table partners add column if not exists biz_type        text;     -- 업태
alter table partners add column if not exists biz_item        text;     -- 종목
alter table partners add column if not exists postal_code     text;
alter table partners add column if not exists address         text;     -- 사업장 주소
alter table partners add column if not exists address_detail  text;
alter table partners add column if not exists tax_email       text;     -- 세금계산서 수신 이메일(담당자 이메일과 별도)
alter table partners add column if not exists partner_kind    text default 'SALES';   -- SALES/PURCHASE/BOTH/ETC (거래처 구분)
alter table partners add column if not exists tax_category    text default 'TAXABLE'; -- TAXABLE/TAXFREE/ZERO (과세유형)
alter table partners add column if not exists payment_terms   text;     -- CASH/CARD/TRANSFER/NOTE/CREDIT
alter table partners add column if not exists payment_cycle   text;     -- IMMEDIATE/EOM/NEXT_EOM/QUARTER
alter table partners add column if not exists credit_limit    numeric;  -- 여신(외상) 한도
alter table partners add column if not exists evidence_type   text;     -- TAX_INVOICE/INVOICE/CASH_RECEIPT/NONE
alter table partners add column if not exists bank_name       text;
alter table partners add column if not exists account_no      text;
alter table partners add column if not exists account_holder  text;
alter table partners add column if not exists sales_rep_id    uuid references employees(id) on delete set null; -- 영업담당(내부직원)
alter table partners add column if not exists partner_group   text;     -- 지역/업종/그룹(필터용)
alter table partners add column if not exists credit_grade    text;     -- 신용등급/평가
alter table partners add column if not exists popbill_corpnum text;     -- 팝빌 CorpNum 매핑(2차 발행 주체)

-- 2) 계약(Contract) — 거래처 하위, 유형별 상세는 detail(jsonb)
create table if not exists contracts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete set null,
  partner_id    uuid not null references partners(id) on delete cascade,
  type          text not null default 'CLASS',     -- CLASS/EVENT/RENTAL
  name          text not null,                     -- 계약명
  status        text not null default 'ACTIVE',    -- DRAFT/ACTIVE/ENDED
  start_date    date,
  end_date      date,
  auto_renew    boolean not null default false,
  settle_unit   text not null default 'MONTHLY',   -- MONTHLY(월합산)/PER_ITEM(건별)
  evidence_type text,                              -- TAX_INVOICE/INVOICE/CASH_RECEIPT/NONE
  instructor_id uuid references employees(id) on delete set null, -- 수업 담당강사
  unit_price    numeric,                           -- 기본 단가(회차/건/기간)
  memo          text,
  detail        jsonb not null default '{}'::jsonb, -- 유형별 상세(요일·회차·반 / 행사일·인원 / 품목·기간)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_contracts_partner on contracts (partner_id);
create index if not exists idx_contracts_company_type on contracts (company_id, type);

-- 3) 거래내역(Transaction) — 매주 수업회차 / 행사 1건 / 렌탈 기간
create table if not exists transactions (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete set null,
  partner_id    uuid not null references partners(id) on delete cascade,
  contract_id   uuid references contracts(id) on delete set null,
  type          text not null default 'CLASS',     -- CLASS/EVENT/RENTAL/ETC
  txn_date      date not null,
  title         text,                              -- 적요(반/행사명/품목)
  qty           numeric not null default 1,        -- 회차/기간 수량
  unit_price    numeric not null default 0,
  amount        numeric not null default 0,        -- qty*unit_price (저장)
  instructor_id uuid references employees(id) on delete set null,
  status        text not null default 'DONE',      -- PLANNED/DONE/CANCELED
  settlement_id uuid,                              -- (2차) 정산 묶음
  tax_invoice_id uuid references tax_invoices(id) on delete set null,
  memo          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_transactions_partner on transactions (partner_id, txn_date);
create index if not exists idx_transactions_contract on transactions (contract_id);
create index if not exists idx_transactions_company_type on transactions (company_id, type, txn_date);

-- 4) RLS — 로그인 SELECT(쓰기는 service-role + 서버액션 가드)
alter table contracts enable row level security;
alter table transactions enable row level security;
do $$ begin
  drop policy if exists contracts_select on contracts;
  create policy contracts_select on contracts for select using (auth.role() = 'authenticated');
  drop policy if exists transactions_select on transactions;
  create policy transactions_select on transactions for select using (auth.role() = 'authenticated');
end $$;

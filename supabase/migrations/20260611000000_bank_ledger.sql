-- =============================================================
-- 위너 통합 ERP — 통장원장 (사업자별 통장 + 거래내역)
--   은행 거래내역(CSV/엑셀)을 사업자별로 업로드하거나 수기 입력하고,
--   입금(IN=+) / 출금(OUT=-) 으로 자동 구분해 잔액을 누적 계산한다.
--   * 잔액은 저장하지 않고 화면에서 기초잔액 + 누적합으로 계산(단일 진실원천).
--     은행이 제공한 거래후잔액(balance_after)은 참고/대사용으로 함께 보관.
-- =============================================================

-- ---------- 통장(계좌) ----------
create table if not exists bank_accounts (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  bank_name        text,                                  -- 은행명 (예: 국민은행)
  account_no       text,                                  -- 계좌번호
  alias            text not null,                         -- 별칭 (예: 운영비 주거래)
  opening_balance  numeric(16,0) not null default 0,      -- 기초잔액(거래내역 시작 전 잔액)
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_bank_accounts_company on bank_accounts(company_id);

drop trigger if exists trg_bank_accounts_updated_at on bank_accounts;
create trigger trg_bank_accounts_updated_at before update on bank_accounts
  for each row execute function set_updated_at();

-- ---------- 거래내역 ----------
create table if not exists bank_transactions (
  id               uuid primary key default gen_random_uuid(),
  bank_account_id  uuid not null references bank_accounts(id) on delete cascade,
  company_id       uuid not null references companies(id) on delete cascade,  -- 사업자별 조회용(비정규화)
  txn_date         date not null,                         -- 거래일자
  description      text,                                  -- 적요/거래내용
  counterparty     text,                                  -- 거래처/의뢰인·수취인
  direction        text not null check (direction in ('IN','OUT')),  -- 입금/출금
  amount           numeric(16,0) not null default 0,      -- 금액(항상 양수)
  balance_after    numeric(16,0),                         -- 은행 제공 거래후잔액(참고)
  memo             text,
  source_ref       text,                                  -- 중복 업로드 방지 키(파일 한 줄 지문)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_bank_txn_account_date on bank_transactions(bank_account_id, txn_date);
create index if not exists idx_bank_txn_company_date on bank_transactions(company_id, txn_date);
-- 동일 통장에 같은 지문(날짜·방향·금액·적요·잔액)이면 재업로드 시 무시
create unique index if not exists uq_bank_txn_source
  on bank_transactions(bank_account_id, source_ref)
  where source_ref is not null;

drop trigger if exists trg_bank_txn_updated_at on bank_transactions;
create trigger trg_bank_txn_updated_at before update on bank_transactions
  for each row execute function set_updated_at();

-- ---------- RLS: 로그인 사용자 SELECT 전용 (쓰기는 service-role 서버액션) ----------
alter table bank_accounts enable row level security;
alter table bank_transactions enable row level security;
do $$ begin
  drop policy if exists bank_accounts_select_auth on bank_accounts;
  create policy bank_accounts_select_auth on bank_accounts
    for select using (auth.role() = 'authenticated');
  drop policy if exists bank_txn_select_auth on bank_transactions;
  create policy bank_txn_select_auth on bank_transactions
    for select using (auth.role() = 'authenticated');
end $$;

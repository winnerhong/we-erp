-- =============================================================
-- 통장 거래에 계정과목 연결 — 거래별로 계정과목(accounts)을 지정.
-- =============================================================

alter table bank_transactions
  add column if not exists account_id uuid references accounts(id) on delete set null;

create index if not exists bank_transactions_account_idx on bank_transactions(account_id);

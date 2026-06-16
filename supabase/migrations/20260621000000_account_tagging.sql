-- =============================================================
-- 계정과목 전면 분류 — 매출/매입(세금계산서)·구매에도 계정과목 연결.
--   (영수증은 이미 account_id 보유) → 계정과목별 집계/원장 가능.
-- =============================================================

alter table tax_invoices add column if not exists account_id uuid references accounts(id) on delete set null;
alter table purchase_requests add column if not exists account_id uuid references accounts(id) on delete set null;
create index if not exists idx_tax_account on tax_invoices(account_id);
create index if not exists idx_purchase_account on purchase_requests(account_id);

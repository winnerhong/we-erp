-- =============================================================
-- 통장 거래 ↔ 영수증 연결
--   출금(매입) 거래의 증빙으로 세금계산서뿐 아니라 기존 영수증도 연결.
--   영수증이 연결되면 증빙(tax_status)을 'DONE'(완료)으로 본다.
-- =============================================================

alter table bank_transactions add column if not exists receipt_id uuid
  references receipts(id) on delete set null;
create index if not exists idx_bank_txn_receipt on bank_transactions(receipt_id);

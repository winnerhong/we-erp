-- =============================================================
-- 통장 거래 ↔ 거래처 연결
--   거래처 상세(거래원장)에서 입금·출금을 정확히 집계하기 위해
--   통장 거래에 거래처(partner_id)를 직접 연결. 적요의 상대방 이름(counterparty)은 유지.
-- =============================================================

alter table bank_transactions add column if not exists partner_id uuid
  references partners(id) on delete set null;
create index if not exists idx_bank_txn_partner on bank_transactions(partner_id);

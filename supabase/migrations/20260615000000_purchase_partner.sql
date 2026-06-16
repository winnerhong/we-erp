-- =============================================================
-- 구매요청 ↔ 거래처 연결
--   구매 건을 거래처에 연결해 거래처 상세(거래원장)의 출금 내역에 포함.
-- =============================================================

alter table purchase_requests add column if not exists partner_id uuid
  references partners(id) on delete set null;
create index if not exists idx_purchases_partner on purchase_requests(partner_id);

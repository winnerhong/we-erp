-- =============================================================
-- 계산서 '보낸 곳'(발행/수취 상대)을 거래처(돈 흐름)와 분리.
--   tax_partner_id: 세금계산서를 보낸/받은 거래처. 비어 있으면 partner_id(거래처)로 대체.
-- =============================================================

alter table bank_transactions
  add column if not exists tax_partner_id uuid references partners(id) on delete set null;

create index if not exists bank_transactions_tax_partner_idx
  on bank_transactions(tax_partner_id);

-- =============================================================
-- 통장 거래 ↔ 세금계산서 대사(소명)
--   각 거래에 세금계산서 발행/수취 상태를 기록하고, 실제 세금계산서와 연결.
--   tax_status: null(미확인) / 'NEEDED'(필요) / 'DONE'(완료) / 'NONE'(해당없음)
--   입금(IN)=발행, 출금(OUT)=수취 — 방향에 따라 화면 라벨이 달라짐.
-- =============================================================

alter table bank_transactions add column if not exists tax_status text;
alter table bank_transactions add column if not exists tax_invoice_id uuid
  references tax_invoices(id) on delete set null;
create index if not exists idx_bank_txn_tax on bank_transactions(tax_invoice_id);

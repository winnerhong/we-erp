-- =============================================================
-- 매입/매출 관리 — 세금계산서 장부를 매입매출 거래 원장으로 확장.
--   due_date: 결제예정일(미수금/미지급 관리)
--   evidence: 증빙구분(세금계산서/카드/현금/무증빙) — 현금·무증빙 거래도 같은 장부에 기록
--   정산여부는 bank_transactions.tax_invoice_id 연결 존재로 판정(별도 칼럼 없음).
-- =============================================================

alter table tax_invoices add column if not exists due_date date;
alter table tax_invoices add column if not exists evidence text not null default '세금계산서';

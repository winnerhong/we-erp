-- =============================================================
-- 위너 통합 ERP — Phase 2: 세금계산서 수발행
--   매출(발행) / 매입(수취) 체크 + 부가세 집계.
--   영수증 OCR에서 '세금계산서' 판정·확정된 건은 매입으로 자동 연결.
-- =============================================================

do $$ begin
  create type tax_invoice_type as enum ('SALES', 'PURCHASE');
  -- SALES=매출(우리가 발행), PURCHASE=매입(우리가 수취)
exception when duplicate_object then null; end $$;

do $$ begin
  create type tax_invoice_status as enum ('PENDING', 'DONE');
  -- 매출: PENDING=미발행, DONE=발행완료 / 매입: PENDING=미수취, DONE=수취완료
exception when duplicate_object then null; end $$;

create table if not exists tax_invoices (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  type            tax_invoice_type not null,
  status          tax_invoice_status not null default 'PENDING',
  partner_id      uuid references partners(id) on delete set null,
  doc_date        date,                                  -- 작성일자
  supply_amount   numeric(14,0) not null default 0,      -- 공급가액
  vat_amount      numeric(14,0) not null default 0,      -- 세액
  total_amount    numeric(14,0) not null default 0,      -- 합계
  receipt_id      uuid references receipts(id) on delete set null,  -- 영수증 연결(매입 자동)
  memo            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_tax_invoices_company on tax_invoices(company_id, type, doc_date);
-- 영수증당 자동생성 세금계산서는 1건만 (중복 방지)
create unique index if not exists uq_tax_invoices_receipt on tax_invoices(receipt_id)
  where receipt_id is not null;

drop trigger if exists trg_tax_invoices_updated_at on tax_invoices;
create trigger trg_tax_invoices_updated_at before update on tax_invoices
  for each row execute function set_updated_at();

alter table tax_invoices enable row level security;
do $$ begin
  drop policy if exists tax_invoices_all_phase0 on tax_invoices;
  create policy tax_invoices_all_phase0 on tax_invoices for all using (true) with check (true);
end $$;

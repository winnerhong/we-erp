-- =============================================================
-- 거래처 CRM 2차(키 불필요) — 정산(Settlement)
--   거래내역(transactions)을 월별/건별로 묶어 청구 단위로 합산 → 거래명세서·세금계산서의 기준.
--   정산 생성 시 포함 거래의 settlement_id 를 채움. 해제하면 다시 null.
--   세금계산서 발행(팝빌)은 2차-연동 단계 → 여기선 status(미발행/발행/입금)만 관리.
-- =============================================================

create table if not exists settlements (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete set null,
  partner_id    uuid not null references partners(id) on delete cascade,
  type          text not null default 'MONTHLY',   -- MONTHLY/EVENT/RENTAL/MANUAL
  period        text,                              -- 'YYYY-MM'(월별), null=건별
  title         text not null,
  subtotal      numeric not null default 0,        -- 공급가 합
  tax_amount    numeric not null default 0,        -- 부가세
  total         numeric not null default 0,        -- 합계
  status        text not null default 'DRAFT',     -- DRAFT/ISSUED/PAID
  issued_at     timestamptz,
  paid_at       timestamptz,
  tax_invoice_id uuid references tax_invoices(id) on delete set null,
  memo          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_settlements_partner on settlements (partner_id, period);
create index if not exists idx_settlements_company on settlements (company_id, status);

-- transactions.settlement_id → settlements FK (이미 컬럼 존재, 제약만 추가)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_settlement_fk') then
    alter table transactions
      add constraint transactions_settlement_fk
      foreign key (settlement_id) references settlements(id) on delete set null;
  end if;
end $$;

alter table settlements enable row level security;
do $$ begin
  drop policy if exists settlements_select on settlements;
  create policy settlements_select on settlements for select using (auth.role() = 'authenticated');
end $$;

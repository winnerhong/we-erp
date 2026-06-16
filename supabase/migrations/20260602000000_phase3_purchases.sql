-- =============================================================
-- 위너 통합 ERP — Phase 3: 구매 요청·결제
--   요청 → 승인/반려/보류 → 결제완료 → 영수증 증빙 연결.
--   소액은 자동 승인(임계값은 앱에서 처리).
-- =============================================================

do $$ begin
  create type purchase_status as enum
    ('PENDING', 'APPROVED', 'REJECTED', 'ON_HOLD', 'PURCHASED');
  -- PENDING=승인대기, APPROVED=승인, REJECTED=반려, ON_HOLD=보류, PURCHASED=구매완료
exception when duplicate_object then null; end $$;

create table if not exists purchase_requests (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  requester_name  text,                                  -- 요청자
  department      text,                                  -- 부서

  product_url     text,                                  -- 상품 링크
  product_name    text,                                  -- 상품명(링크 파싱/수기)
  product_image   text,                                  -- 미리보기 이미지 URL
  unit_price      numeric(14,0),                         -- 단가
  quantity        integer not null default 1,
  amount          numeric(14,0) not null default 0,      -- 합계(단가*수량)
  reason          text,                                  -- 구매 사유

  status          purchase_status not null default 'PENDING',
  review_note     text,                                  -- 승인/반려 메모

  payer_name      text,                                  -- 결제자
  payment_method  payment_method,                        -- 결제수단
  paid_at         timestamptz,                           -- 결제 완료 시각
  receipt_id      uuid references receipts(id) on delete set null,  -- 증빙 연결

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_purchases_company on purchase_requests(company_id, status);

drop trigger if exists trg_purchases_updated_at on purchase_requests;
create trigger trg_purchases_updated_at before update on purchase_requests
  for each row execute function set_updated_at();

alter table purchase_requests enable row level security;
do $$ begin
  drop policy if exists purchases_all_phase0 on purchase_requests;
  create policy purchases_all_phase0 on purchase_requests for all using (true) with check (true);
end $$;

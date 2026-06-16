-- =============================================================
-- 위너 통합 ERP — Phase 1: 영수증 OCR
--   업로드 → OCR 추출 → 검수 → 확정. 모두 사업자(company_id) 귀속.
-- =============================================================

-- ---------- ENUM ----------
do $$ begin
  create type receipt_status as enum ('PENDING', 'CONFIRMED');
  -- PENDING=검수대기(OCR 완료/실패), CONFIRMED=확정
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum ('CARD', 'CASH', 'TRANSFER', 'OTHER');
  -- CARD=카드, CASH=현금, TRANSFER=계좌이체, OTHER=기타
exception when duplicate_object then null; end $$;

do $$ begin
  create type evidence_type as enum
    ('TAX_INVOICE', 'CARD_SALES_SLIP', 'CASH_RECEIPT', 'SIMPLE_RECEIPT', 'OTHER');
  -- TAX_INVOICE=세금계산서, CARD_SALES_SLIP=카드매출전표,
  -- CASH_RECEIPT=현금영수증, SIMPLE_RECEIPT=간이영수증, OTHER=기타
exception when duplicate_object then null; end $$;

-- ---------- 영수증 ----------
create table if not exists receipts (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,  -- 사업자 귀속
  image_path      text not null,                          -- Supabase Storage 경로
  status          receipt_status not null default 'PENDING',

  partner_id      uuid references partners(id) on delete set null,  -- 매칭 거래처
  account_id      uuid references accounts(id) on delete set null,  -- 분류 계정과목

  vendor_name     text,                                   -- 상호(OCR)
  biz_no          text,                                   -- 사업자번호(OCR)
  doc_date        date,                                   -- 거래일자
  supply_amount   numeric(14,0),                          -- 공급가액
  vat_amount      numeric(14,0),                          -- 부가세
  total_amount    numeric(14,0),                          -- 합계
  payment_method  payment_method,
  evidence_type   evidence_type,
  vat_deductible  boolean,                                -- 부가세 공제 가능 여부

  raw_ocr         jsonb,                                  -- OCR 원본/신뢰도
  ocr_error       text,                                   -- OCR 실패 사유(있으면)
  memo            text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_receipts_company on receipts(company_id);
create index if not exists idx_receipts_status on receipts(company_id, status);

drop trigger if exists trg_receipts_updated_at on receipts;
create trigger trg_receipts_updated_at before update on receipts
  for each row execute function set_updated_at();

-- ---------- RLS (Phase 0과 동일한 임시 정책) ----------
alter table receipts enable row level security;
do $$ begin
  drop policy if exists receipts_all_phase0 on receipts;
  create policy receipts_all_phase0 on receipts for all using (true) with check (true);
end $$;

-- ---------- Storage 버킷 (영수증 이미지, 비공개) ----------
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- 버킷 접근 정책 (Phase 0: 임시 전체 허용 — Phase 5에서 인증 기반으로 교체)
do $$ begin
  drop policy if exists receipts_bucket_all on storage.objects;
  create policy receipts_bucket_all on storage.objects for all
    using (bucket_id = 'receipts') with check (bucket_id = 'receipts');
end $$;

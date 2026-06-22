-- =============================================================
-- 위너 통합 ERP — 카드원장 (사업자별 카드 + 사용내역)  [Phase C1]
--   통장원장과 같은 구조. 카드 명세서(엑셀/CSV)를 업로드하거나 수기 입력하고,
--   사용(OUT) / 취소·환불(IN) 으로 구분한다. 잔액 개념은 없음(카드 사용내역).
--   카드 사용 = 지출의 진실원천. (통장 카드대금 정산 연동은 C2에서)
-- =============================================================

-- ---------- 카드 ----------
create table if not exists cards (
  id                          uuid primary key default gen_random_uuid(),
  company_id                  uuid not null references companies(id) on delete cascade,
  card_company                text,                                  -- 카드사 (예: 신한카드)
  alias                       text not null,                         -- 별칭 (예: 법인 운영비 카드)
  card_no_last4               text,                                  -- 카드번호 끝 4자리
  card_type                   text not null default 'CREDIT'         -- 신용/체크
                                check (card_type in ('CREDIT','CHECK')),
  settlement_bank_account_id  uuid references bank_accounts(id) on delete set null,  -- 결제(대금출금) 통장
  billing_day                 int,                                   -- 결제일(1~31)
  is_active                   boolean not null default true,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index if not exists idx_cards_company on cards(company_id);

drop trigger if exists trg_cards_updated_at on cards;
create trigger trg_cards_updated_at before update on cards
  for each row execute function set_updated_at();

-- ---------- 카드 사용내역 ----------
create table if not exists card_transactions (
  id               uuid primary key default gen_random_uuid(),
  card_id          uuid not null references cards(id) on delete cascade,
  company_id       uuid not null references companies(id) on delete cascade,  -- 사업자별 조회용(비정규화)
  txn_date         date not null,                         -- 이용일자
  txn_time         text,                                  -- 이용시각 'HH:MM[:SS]'
  counterparty     text,                                  -- 가맹점(이용하신 곳)
  description      text,                                  -- 비고/내용
  direction        text not null default 'OUT'            -- 사용/취소·환불
                     check (direction in ('IN','OUT')),
  amount           numeric(16,0) not null default 0,      -- 금액(항상 양수)
  installment_months int not null default 0,              -- 할부개월(0=일시불)
  approval_no      text,                                  -- 승인번호
  memo             text,
  source_ref       text,                                  -- 중복 업로드 방지 지문
  -- 통장과 동일한 보강 필드(거래처·직원·계정과목·구분·증빙)
  tax_status       text,
  tax_invoice_id   uuid references tax_invoices(id) on delete set null,
  receipt_id       uuid references receipts(id) on delete set null,
  partner_id       uuid references partners(id) on delete set null,
  account_id       uuid references accounts(id) on delete set null,
  category         text,                                  -- field_options 'bank_category' 공유
  employee_id      uuid references employees(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_card_txn_card_date on card_transactions(card_id, txn_date);
create index if not exists idx_card_txn_company_date on card_transactions(company_id, txn_date);
-- 같은 카드에 같은 지문이면 재업로드 시 무시
create unique index if not exists uq_card_txn_source
  on card_transactions(card_id, source_ref)
  where source_ref is not null;

drop trigger if exists trg_card_txn_updated_at on card_transactions;
create trigger trg_card_txn_updated_at before update on card_transactions
  for each row execute function set_updated_at();

-- ---------- RLS: 로그인 사용자 SELECT 전용 (쓰기는 service-role 서버액션) ----------
alter table cards enable row level security;
alter table card_transactions enable row level security;
do $$ begin
  drop policy if exists cards_select_auth on cards;
  create policy cards_select_auth on cards
    for select using (auth.role() = 'authenticated');
  drop policy if exists card_txn_select_auth on card_transactions;
  create policy card_txn_select_auth on card_transactions
    for select using (auth.role() = 'authenticated');
end $$;

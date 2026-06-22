-- =============================================================
-- 위너 통합 ERP — 카드대금 정산 연동 (통장 ↔ 카드)  [Phase C2]
--   통장의 '카드대금' 출금(OUT) 1건을 특정 카드 + 사용월(YYYY-MM)에 연결한다.
--   → 카드 사용내역(지출 원천)과 통장 카드대금(현금 유출)을 정산 매칭.
--   손익/부가세 집계 로직은 변경 없음(증빙 기반 그대로).
-- =============================================================

alter table bank_transactions
  add column if not exists settles_card_id uuid references cards(id) on delete set null,
  add column if not exists settles_month   text;  -- 정산 대상 카드 사용월 'YYYY-MM'

create index if not exists idx_bank_txn_settles_card
  on bank_transactions(settles_card_id, settles_month)
  where settles_card_id is not null;

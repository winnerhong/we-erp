-- =============================================================
-- 통장 거래에 사용자 정의 '구분'(분류) — 입금/출금(방향)과 별개로
--   인터넷/모바일/이체/카드 등 사용자가 직접 만드는 분류값.
--   옵션 목록은 field_options(category='bank_category')로 관리(항목 관리에서 추가/색상).
-- =============================================================

alter table bank_transactions add column if not exists category text;

-- 기본 분류 몇 개 시드(사용자가 항목 관리에서 추가/수정 가능)
insert into field_options (category, value, label, color, sort_order) values
  ('bank_category', '이체',   '이체',   'blue',    1),
  ('bank_category', '카드',   '카드',   'violet',  2),
  ('bank_category', '현금',   '현금',   'emerald', 3),
  ('bank_category', '자동이체', '자동이체', 'amber',  4),
  ('bank_category', '급여',   '급여',   'rose',    5),
  ('bank_category', '공과금', '공과금', 'sky',     6)
on conflict (category, value) do nothing;

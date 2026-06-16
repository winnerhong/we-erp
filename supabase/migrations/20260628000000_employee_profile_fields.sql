-- =============================================================
-- 직원 1인 상세관리용 추가 필드 — 닉네임·프로필사진·계좌정보.
-- =============================================================

alter table employees add column if not exists nickname text;
alter table employees add column if not exists photo_url text;
alter table employees add column if not exists bank_name text;
alter table employees add column if not exists account_number text;
alter table employees add column if not exists account_holder text;

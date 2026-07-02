-- =============================================================
-- 거래처 시설 정보 필드 + 거래처 메모 로그(누적).
--  - 시설 필드: 장소/기관 거래처의 담당자직급·주차·수용인원·이용료 등.
--  - partner_memos: 직원 메모처럼 덮어쓰기 대신 시각·작성자와 함께 계속 누적.
-- =============================================================

-- 1) 시설 정보 컬럼(전부 선택 입력)
alter table partners add column if not exists contact_title  text;      -- 담당자 직급
alter table partners add column if not exists parking_count  integer;   -- 주차대수
alter table partners add column if not exists max_capacity   integer;   -- 최대 수용인원
alter table partners add column if not exists ideal_capacity integer;   -- 적정 인원
alter table partners add column if not exists usage_fee      numeric;   -- 이용료(원)
alter table partners add column if not exists facility_note  text;      -- 시설 비고

-- 2) 거래처 메모 로그
create table if not exists partner_memos (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references partners(id) on delete cascade,
  body        text not null,
  author_id   uuid references profiles(id) on delete set null,
  author_name text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_partner_memos_partner on partner_memos (partner_id, created_at);

alter table partner_memos enable row level security;
do $$ begin
  drop policy if exists partner_memos_select on partner_memos;
  create policy partner_memos_select on partner_memos for select using (auth.role() = 'authenticated');
end $$;

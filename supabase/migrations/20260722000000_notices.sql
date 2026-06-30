-- =============================================================
-- 4차 — CMS 공지(기관 대상 안내문 게시판)
--   공지 작성·발행 대상 지정(전체/사업자/그룹/특정 거래처) + 게시판 노출.
--   알림톡 발송(솔라피)은 키 준비 시 연동 — 여기선 게시판 발행까지.
-- =============================================================
create table if not exists notices (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid references companies(id) on delete set null,
  title        text not null,
  body         text,
  audience     text not null default 'ALL',   -- ALL/COMPANY/GROUP/PARTNERS
  partner_ids  jsonb not null default '[]'::jsonb, -- audience=PARTNERS 일 때 대상 거래처 id 배열
  group_tag    text,                          -- audience=GROUP 일 때 partner_group 값
  pinned       boolean not null default false,
  start_date   date,
  end_date     date,
  status       text not null default 'DRAFT', -- DRAFT/PUBLISHED
  published_at timestamptz,
  sent_count   integer not null default 0,    -- 알림톡 발송 건수(연동 시)
  created_by   uuid references profiles(id) on delete set null,
  author_name  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_notices_company on notices (company_id, status);
create index if not exists idx_notices_pinned on notices (pinned, created_at);

alter table notices enable row level security;
do $$ begin
  drop policy if exists notices_select on notices;
  create policy notices_select on notices for select using (auth.role() = 'authenticated');
end $$;

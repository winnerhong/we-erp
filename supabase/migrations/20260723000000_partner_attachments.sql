-- =============================================================
-- 거래처 360° — 통합 문서함(첨부 파일)
--   사업자등록증·통장사본·계약서·견적서 등을 거래처에 첨부. 실체는 'library' 버킷 재사용(partners/ 경로).
-- =============================================================
create table if not exists partner_attachments (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid not null references partners(id) on delete cascade,
  company_id   uuid references companies(id) on delete set null,
  title        text not null,
  category     text,                          -- 사업자등록증/통장사본/계약서/견적서/기타
  file_name    text not null,
  mime         text,
  size_bytes   bigint not null default 0,
  storage_path text not null,                 -- library 버킷 내 경로
  uploaded_by  uuid references profiles(id) on delete set null,
  uploader_name text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_partner_attachments_partner on partner_attachments (partner_id);

alter table partner_attachments enable row level security;
do $$ begin
  drop policy if exists partner_attachments_select on partner_attachments;
  create policy partner_attachments_select on partner_attachments for select using (auth.role() = 'authenticated');
end $$;

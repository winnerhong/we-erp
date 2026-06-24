-- =============================================================
-- 자료실(공유 자료실) — 회사 업무자료를 폴더로 정리해 올리고, 직원이 다운로드.
--   서류관리(/documents, 계약서 발급·서명)와 별개. 여기는 사내 공유 드라이브.
--   파일 실체는 Storage 버킷 'library'(비공개) → 다운로드는 서명 URL.
--   공개범위(visibility): ALL(전사) / COMPANY(특정 사업자) / DEPT(특정 사업자+부서)
-- =============================================================

-- 1) 폴더(트리)
create table if not exists library_folders (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  parent_id  uuid references library_folders(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_library_folders_parent on library_folders (parent_id);

-- 2) 파일(메타) — 실체는 storage_path
create table if not exists library_files (
  id            uuid primary key default gen_random_uuid(),
  folder_id     uuid references library_folders(id) on delete set null,
  title         text not null,
  description   text,
  file_name     text not null,                 -- 원본 파일명(다운로드 시)
  mime          text,
  size_bytes    bigint not null default 0,
  storage_path  text not null,                 -- library 버킷 내 경로
  version       integer not null default 1,
  visibility    text not null default 'ALL',   -- ALL / COMPANY / DEPT
  company_id    uuid references companies(id) on delete set null, -- COMPANY/DEPT 범위
  department    text,                          -- DEPT 범위(field_options department value)
  uploaded_by   uuid references profiles(id) on delete set null,
  uploader_name text,
  download_count integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_library_files_folder on library_files (folder_id);
create index if not exists idx_library_files_scope on library_files (visibility, company_id, department);

-- 3) 즐겨찾기(직원별)
create table if not exists library_favorites (
  profile_id uuid not null references profiles(id) on delete cascade,
  file_id    uuid not null references library_files(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, file_id)
);

-- 4) RLS — 로그인 사용자 SELECT(쓰기는 service-role + 서버액션 가드)
alter table library_folders enable row level security;
alter table library_files enable row level security;
alter table library_favorites enable row level security;
do $$ begin
  drop policy if exists library_folders_select on library_folders;
  create policy library_folders_select on library_folders for select using (auth.role() = 'authenticated');
  drop policy if exists library_files_select on library_files;
  create policy library_files_select on library_files for select using (auth.role() = 'authenticated');
  drop policy if exists library_favorites_all on library_favorites;
  create policy library_favorites_all on library_favorites for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
end $$;

-- 5) Storage 버킷(비공개)
insert into storage.buckets (id, name, public)
values ('library', 'library', false)
on conflict (id) do nothing;
do $$ begin
  drop policy if exists library_bucket_all on storage.objects;
  create policy library_bucket_all on storage.objects for all
    using (bucket_id = 'library') with check (bucket_id = 'library');
end $$;

-- 6) 기본 폴더 시드
insert into library_folders (name, sort_order) values
  ('업무양식', 1),
  ('사내규정·정책', 2),
  ('교육자료', 3),
  ('계약·법무', 4),
  ('기타', 9)
on conflict do nothing;

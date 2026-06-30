-- =============================================================
-- 원생(students) — winner-kids members 동기화 대상
--   거래처 카드 마스터-디테일과 동일한 UI(EntityWorkspace)로 표시.
--   source_ref("wks:members:{id}")로 멱등 upsert. 쓰기는 서비스롤(동기화)로,
--   읽기는 authenticated 세션으로. company_id 스코핑(선택).
-- =============================================================

create table if not exists students (
  id               uuid primary key default gen_random_uuid(),
  source_ref       text unique,                       -- "wks:members:{id}" 멱등 동기화 키
  company_id       uuid references companies(id) on delete set null,
  is_active        boolean not null default true,
  name             text not null,
  gender           text,
  birthday         date,
  school           text,
  grade            text,
  class_name       text,
  guardian_name    text,
  guardian_phone   text,
  student_phone    text,
  address          text,
  status           text not null default '재원' check (status in ('재원','휴원','퇴원')),
  enrollment_date  date,
  homeroom_teacher text,
  memo             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_students_status  on students (status);
create index if not exists idx_students_company on students (company_id);

alter table students enable row level security;
do $$ begin
  drop policy if exists students_select on students;
  create policy students_select on students for select using (auth.role() = 'authenticated');
end $$;

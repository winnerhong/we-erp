-- =============================================================
-- 위너 통합 ERP — Phase 5b: 인증 + 권한(RLS)
--   로그인(Supabase Auth) 도입. 2단계 역할: ADMIN(관리자) / MEMBER(일반).
--   읽기 = 로그인 사용자만(RLS). 쓰기 = 서버액션이 service-role로 수행하고
--          액션에서 역할을 검증(기초등록=ADMIN, 운영=로그인 전체).
-- =============================================================

do $$ begin
  create type app_role as enum ('ADMIN', 'MEMBER');
exception when duplicate_object then null; end $$;

-- ---------- 프로필(앱 사용자) : auth.users 와 1:1 ----------
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  name        text,
  role        app_role not null default 'MEMBER',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table profiles enable row level security;
do $$ begin
  drop policy if exists profiles_select_auth on profiles;
  create policy profiles_select_auth on profiles
    for select using (auth.role() = 'authenticated');
end $$;

-- ---------- 데이터 테이블 RLS: using(true) → 로그인 사용자 SELECT 전용 ----------
-- 쓰기 정책은 두지 않음(서버액션의 service-role 클라이언트가 RLS 우회 + 액션에서 역할 검증).
do $$
declare t text;
begin
  foreach t in array array[
    'companies','accounts','partners','employees',
    'receipts','tax_invoices','purchase_requests',
    'leave_requests','payrolls'
  ] loop
    -- 기존 임시 전체허용 정책 제거
    execute format('drop policy if exists %I on %I', t || '_all_phase0', t);
    -- 로그인 사용자 읽기 전용 정책
    execute format('drop policy if exists %I on %I', t || '_select_auth', t);
    execute format(
      'create policy %I on %I for select using (auth.role() = ''authenticated'')',
      t || '_select_auth', t
    );
  end loop;
end $$;

-- ---------- Storage(receipts) : 로그인 사용자만 ----------
-- (실제 이미지 표시는 service-role 서명 URL이라 RLS 무관하지만 방어적으로 잠금)
do $$ begin
  drop policy if exists receipts_bucket_all on storage.objects;
  drop policy if exists receipts_bucket_auth on storage.objects;
  create policy receipts_bucket_auth on storage.objects for select
    using (bucket_id = 'receipts' and auth.role() = 'authenticated');
end $$;

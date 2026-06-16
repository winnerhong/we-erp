-- =============================================================
-- 사용자 등급(역할) 확장 — 관리자/일반 외 사용자 정의 등급을 만들 수 있게.
--   * roles: 등급 정의(기본 ADMIN/MEMBER + 추가 등급).
--   * profiles.role, role_menu_permissions.role: app_role enum → text 로 전환
--     (어떤 등급 키든 저장 가능). 관리자(ADMIN)는 앱에서 항상 전체 접근.
-- =============================================================

-- 등급 테이블
create table if not exists roles (
  key         text primary key,
  label       text not null,
  is_admin    boolean not null default false,
  sort_order  int not null default 100,
  created_at  timestamptz not null default now()
);
insert into roles (key, label, is_admin, sort_order) values
  ('ADMIN', '관리자', true, 0),
  ('MEMBER', '일반', false, 1)
on conflict (key) do nothing;

alter table roles enable row level security;
do $$ begin
  drop policy if exists roles_select_auth on roles;
  create policy roles_select_auth on roles for select using (auth.role() = 'authenticated');
end $$;

-- profiles.role: enum → text (기본값 유지)
alter table profiles alter column role drop default;
alter table profiles alter column role type text using role::text;
alter table profiles alter column role set default 'MEMBER';

-- role_menu_permissions.role: enum → text
alter table role_menu_permissions alter column role type text using role::text;

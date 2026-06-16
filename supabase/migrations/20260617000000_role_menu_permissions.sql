-- =============================================================
-- 메뉴별 접근 권한 — 역할(role)마다 볼 수 있는 메뉴를 제어.
--   관리자(ADMIN)는 항상 전체 접근(앱에서 우회). 일반(MEMBER)만 제어 대상.
--   menu_key = 사이드바 메뉴 경로(href). allowed=false 면 그 역할에게 숨김.
-- =============================================================

create table if not exists role_menu_permissions (
  role       app_role not null,
  menu_key   text not null,
  allowed    boolean not null default true,
  primary key (role, menu_key)
);

alter table role_menu_permissions enable row level security;
do $$ begin
  drop policy if exists role_menu_select_auth on role_menu_permissions;
  create policy role_menu_select_auth on role_menu_permissions
    for select using (auth.role() = 'authenticated');
end $$;

-- 일반(MEMBER) 기본값: 모든 메뉴 허용(이후 관리 화면에서 끄기)
insert into role_menu_permissions (role, menu_key, allowed) values
  ('MEMBER','/',true),
  ('MEMBER','/daily',true),
  ('MEMBER','/companies',true),
  ('MEMBER','/partners',true),
  ('MEMBER','/employees',true),
  ('MEMBER','/accounts',true),
  ('MEMBER','/receipts',true),
  ('MEMBER','/tax-invoices',true),
  ('MEMBER','/bank',true),
  ('MEMBER','/purchases',true),
  ('MEMBER','/hr',true)
on conflict (role, menu_key) do nothing;

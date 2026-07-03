-- =============================================================
-- 메뉴 권한을 사업자별로 분리 — role_menu_permissions 에 company_id 추가.
--   company_id = null  → 기본(전체 회사 공통) 규칙 (기존 행은 전부 여기 해당)
--   company_id = <id>  → 그 사업자 전용 오버라이드 (기본을 덮어씀)
--   해석: 활성 사업자 오버라이드 → 없으면 기본(null) → 없으면 앱 기본값.
-- PK(role,menu_key) 는 company_id 를 스코프에 넣기 위해 대리키(id)로 교체.
-- =============================================================

alter table role_menu_permissions add column if not exists id uuid not null default gen_random_uuid();
alter table role_menu_permissions add column if not exists company_id uuid references companies(id) on delete cascade;

-- 기존 복합 PK 제거 후 대리키로 교체
alter table role_menu_permissions drop constraint if exists role_menu_permissions_pkey;
alter table role_menu_permissions add constraint role_menu_permissions_pkey primary key (id);

-- 스코프 유일성: (회사, 역할, 메뉴). null(전역)도 하나만 존재하도록 nulls not distinct.
create unique index if not exists uq_rmp_scope
  on role_menu_permissions (company_id, role, menu_key) nulls not distinct;

-- 롤백:
--   drop index if exists uq_rmp_scope;
--   alter table role_menu_permissions drop constraint if exists role_menu_permissions_pkey;
--   delete from role_menu_permissions where company_id is not null;  -- 오버라이드 제거
--   alter table role_menu_permissions drop column if exists company_id;
--   alter table role_menu_permissions drop column if exists id;
--   alter table role_menu_permissions add primary key (role, menu_key);

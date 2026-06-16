-- =============================================================
-- 고용형태·권한 등 드롭다운 '종류'를 사용자가 직접 추가/관리
--   고정 enum → 텍스트로 전환하고, 옵션 목록은 field_options 테이블로 관리.
-- =============================================================

-- 1) employees.employment_type / role 를 enum → text 로 (커스텀 값 저장 가능)
alter table employees alter column employment_type drop default;
alter table employees alter column employment_type type text using employment_type::text;
alter table employees alter column employment_type set default 'FULL_TIME';

alter table employees alter column role drop default;
alter table employees alter column role type text using role::text;
alter table employees alter column role set default 'STAFF';

-- 2) 옵션 목록 테이블
create table if not exists field_options (
  id          uuid primary key default gen_random_uuid(),
  category    text not null,                 -- 'employment_type' | 'role'
  value       text not null,                 -- 저장값(코드 또는 라벨)
  label       text not null,                 -- 표시명
  color       text default 'neutral',        -- 색상 톤 키
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (category, value)
);

alter table field_options enable row level security;
do $$ begin
  drop policy if exists field_options_select_auth on field_options;
  create policy field_options_select_auth on field_options
    for select using (auth.role() = 'authenticated');
end $$;

-- 3) 기존 값 시드 (있으면 유지)
insert into field_options (category, value, label, color, sort_order) values
  ('employment_type','FULL_TIME','정규직','emerald',1),
  ('employment_type','CONTRACT','계약직','blue',2),
  ('employment_type','FREELANCER','프리랜서','violet',3),
  ('employment_type','HOURLY','시급제','amber',4),
  ('role','STAFF','직원','neutral',1),
  ('role','MANAGER','부서장','indigo',2),
  ('role','ACCOUNTANT','경리/회계','sky',3),
  ('role','ADMIN','관리자','rose',4)
on conflict (category, value) do nothing;

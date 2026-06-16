-- =============================================================
-- 직원 로그인 계정 — 아이디(username) 로그인 + 직원↔계정 연결
--   * profiles.username: 한글 아이디 로그인용(이메일은 가상으로 합성).
--   * employees.profile_id: 직원과 로그인 계정(profiles)을 1:1 연결.
--   winner-kids 강사 계정(username/password)을 그대로 가져올 수 있도록 지원.
-- =============================================================

alter table profiles add column if not exists username text;
create unique index if not exists uq_profiles_username on profiles(username) where username is not null;

alter table employees add column if not exists profile_id uuid references profiles(id) on delete set null;
create index if not exists idx_employees_profile on employees(profile_id);

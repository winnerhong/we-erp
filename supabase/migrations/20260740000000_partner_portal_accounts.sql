-- =============================================================
-- 거래처 포털 계정 — 거래처(어린이집·기관)가 직접 로그인해 자기 정보를 보는 계정.
--   profiles.partner_id 가 채워진 계정 = 거래처 포털 전용(직원 기능 접근 불가).
--   role 은 'PARTNER' 로 표시하되, 실제 판별은 partner_id 유무로 한다.
--   거래처 삭제 시 연결 프로필도 함께 제거(cascade). auth.users 는 앱에서 별도 정리.
-- =============================================================

alter table profiles add column if not exists partner_id uuid references partners(id) on delete cascade;

create index if not exists idx_profiles_partner on profiles(partner_id) where partner_id is not null;

-- 롤백:
--   drop index if exists idx_profiles_partner;
--   alter table profiles drop column if exists partner_id;

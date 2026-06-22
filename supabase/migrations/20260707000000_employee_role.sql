-- =============================================================
-- 직원 셀프 서비스 — 'EMPLOYEE'(직원) 역할 추가.
--   직원 계정은 ERP 메뉴 접근이 기본 차단되고 개인 페이지(/me)만 사용.
--   (proxy.ts 가 EMPLOYEE 는 기본 차단 + /me 로 리다이렉트. 관리자가 권한관리에서
--    특정 메뉴를 allowed=true 로 열어주면 그 메뉴만 추가 접근 가능)
-- =============================================================

insert into roles (key, label, is_admin, sort_order) values
  ('EMPLOYEE', '직원', false, 2)
on conflict (key) do nothing;

-- =============================================================
-- 직원 상태(status) — 관리형 항목 (재직/휴직/퇴사/계약종료 등)
--   기존 is_active(활성/비활성) 토글 대신 다중 상태를 기록.
-- =============================================================

alter table employees add column if not exists status text default '재직';

insert into field_options (category, value, label, color, sort_order) values
  ('employee_status','재직','재직','emerald',1),
  ('employee_status','휴직','휴직','amber',2),
  ('employee_status','퇴사','퇴사','rose',3),
  ('employee_status','계약종료','계약종료','neutral',4)
on conflict (category, value) do nothing;

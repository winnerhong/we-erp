-- =============================================================
-- 거래처 구분(category) 드롭다운 옵션 — field_options 로 관리
--   기존 거래처 category 값(협력사/기관/장소)과 일치하도록 value=label.
-- =============================================================

insert into field_options (category, value, label, color, sort_order) values
  ('partner_category','협력사','협력사','blue',1),
  ('partner_category','기관','기관','emerald',2),
  ('partner_category','장소','장소','amber',3),
  ('partner_category','기타','기타','neutral',4)
on conflict (category, value) do nothing;

-- =============================================================
-- 급여 비과세수당 항목별 관리
--   payrolls.nontax_items : {항목값: 금액} (예: {"식대":200000, "차량유지비":200000})
--   비과세 항목 목록은 field_options(category='nontax_item') 에서 추가/삭제.
-- =============================================================

alter table payrolls add column if not exists nontax_items jsonb not null default '{}'::jsonb;

-- 기본 비과세 항목 시드(없을 때만)
insert into field_options (category, value, label, color, sort_order)
select v.category, v.value, v.label, v.color, v.sort_order
from (values
  ('nontax_item', '식대',       '식대',       'green', 1),
  ('nontax_item', '차량유지비', '차량유지비', 'blue',  2),
  ('nontax_item', '보육수당',   '보육수당',   'amber', 3)
) as v(category, value, label, color, sort_order)
where not exists (select 1 from field_options f where f.category = 'nontax_item');

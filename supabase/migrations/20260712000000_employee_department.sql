-- 직원 부서(팀) — 관리형 드롭다운(field_options) 값 저장
alter table employees add column if not exists department text;  -- field_options(category=department)

insert into field_options (category, value, label, color, sort_order) values
  ('department','MGMT','경영지원',null,1),
  ('department','EDU','교육',null,2),
  ('department','OPS','운영',null,3),
  ('department','SALES','영업',null,4),
  ('department','DEV','개발',null,5)
on conflict (category, value) do nothing;

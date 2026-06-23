-- 직원 직급(job_rank)·직책(job_title) — 관리형 드롭다운(field_options) 값 저장
alter table employees add column if not exists job_rank text;   -- 직급: 사원·대리·과장 등
alter table employees add column if not exists job_title text;  -- 직책: 팀원·팀장·대표 등

-- 기본 옵션 시드(⚙ 항목에서 자유롭게 추가·수정 가능)
insert into field_options (category, value, label, color, sort_order) values
  ('job_rank','STAFF','사원',null,1),
  ('job_rank','SENIOR','주임',null,2),
  ('job_rank','ASSISTANT_MANAGER','대리',null,3),
  ('job_rank','MANAGER','과장',null,4),
  ('job_rank','DEPUTY_GM','차장',null,5),
  ('job_rank','GM','부장',null,6),
  ('job_title','MEMBER','팀원',null,1),
  ('job_title','TEAM_LEAD','팀장',null,2),
  ('job_title','DIRECTOR','실장',null,3),
  ('job_title','EXECUTIVE','이사',null,4),
  ('job_title','CEO','대표',null,5)
on conflict (category, value) do nothing;

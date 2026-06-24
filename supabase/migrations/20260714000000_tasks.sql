-- =============================================================
-- 업무공유캘린더 — 직원별·업무별 todo / 캘린더 / 칸반 공유
--   tasks(업무) + task_assignees(담당자 N) + task_comments(협업 댓글) + task_checklist(세부 체크)
--   날짜=date, 시간 지정은 'HH:MM'(현지=KST) 문자열(근태와 동일 규칙).
--   매니저 개념: employees.is_manager=true → 자기 사업자 직원에게 업무 배정 가능.
-- =============================================================

-- 0) 매니저 플래그(직원)
alter table employees add column if not exists is_manager boolean not null default false;

-- 1) 업무
create table if not exists tasks (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid references companies(id) on delete set null,
  title        text not null,
  description  text,
  category     text,                              -- field_options(category='task_category')
  status       text not null default 'TODO',      -- TODO/DOING/DONE/HOLD
  priority     text not null default 'NORMAL',    -- LOW/NORMAL/HIGH/URGENT
  start_date   date,
  due_date     date,
  all_day      boolean not null default true,
  start_time   text,                              -- 'HH:MM'
  end_time     text,                              -- 'HH:MM'
  progress     integer not null default 0,        -- 0~100
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_tasks_company_due on tasks (company_id, due_date);
create index if not exists idx_tasks_status on tasks (status);
create index if not exists idx_tasks_dates on tasks (start_date, due_date);

-- 2) 담당자(다대다 — 한 업무에 여러 명)
create table if not exists task_assignees (
  task_id     uuid not null references tasks(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (task_id, employee_id)
);
create index if not exists idx_task_assignees_emp on task_assignees (employee_id);

-- 3) 진행 메모/댓글
create table if not exists task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  author_id  uuid references profiles(id) on delete set null,
  author_name text,                               -- 표시용 캐시(작성 시점 이름)
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_task_comments_task on task_comments (task_id, created_at);

-- 4) 세부 체크리스트
create table if not exists task_checklist (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  label      text not null,
  done       boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_task_checklist_task on task_checklist (task_id, sort_order);

-- 5) RLS — 로그인 사용자 SELECT 전용(쓰기는 service-role + 서버액션 가드)
alter table tasks enable row level security;
alter table task_assignees enable row level security;
alter table task_comments enable row level security;
alter table task_checklist enable row level security;
do $$ begin
  drop policy if exists tasks_select on tasks;
  create policy tasks_select on tasks for select using (auth.role() = 'authenticated');
  drop policy if exists task_assignees_select on task_assignees;
  create policy task_assignees_select on task_assignees for select using (auth.role() = 'authenticated');
  drop policy if exists task_comments_select on task_comments;
  create policy task_comments_select on task_comments for select using (auth.role() = 'authenticated');
  drop policy if exists task_checklist_select on task_checklist;
  create policy task_checklist_select on task_checklist for select using (auth.role() = 'authenticated');
end $$;

-- 6) 업무 카테고리 기본 시드(색은 캘린더 칩 색)
insert into field_options (category, value, label, color, sort_order) values
  ('task_category','영업','영업','blue',1),
  ('task_category','행정','행정','neutral',2),
  ('task_category','회계','회계','sky',3),
  ('task_category','현장','현장','amber',4),
  ('task_category','교육','교육','violet',5),
  ('task_category','마케팅','마케팅','rose',6),
  ('task_category','기타','기타','emerald',7)
on conflict (category, value) do nothing;

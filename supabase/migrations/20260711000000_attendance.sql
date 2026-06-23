-- =============================================================
-- 근태(출퇴근) — 직원이 웹에서 출근/퇴근을 찍고, 표준 근무시간 기준으로 지각·조퇴 자동판정
--   시간은 TZ 문제를 피하려 'HH:MM'(현지=KST) 문자열로 저장, 날짜는 work_date.
-- =============================================================
create table if not exists attendance (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete set null,
  employee_id   uuid not null references employees(id) on delete cascade,
  work_date     date not null,
  check_in      text,                  -- 'HH:MM'
  check_out     text,                  -- 'HH:MM'
  work_minutes  integer,               -- 근무시간(분) = 퇴근 - 출근 (휴게 미차감)
  status        text not null default 'NORMAL',  -- NORMAL/LATE/EARLY/LATE_EARLY/ABSENT/LEAVE
  work_mode     text not null default 'OFFICE',  -- OFFICE/REMOTE/FIELD/TRIP (근무상태)
  memo          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (employee_id, work_date)
);
create index if not exists idx_attendance_company_date on attendance (company_id, work_date);
create index if not exists idx_attendance_emp_date on attendance (employee_id, work_date);

alter table attendance enable row level security;
do $$ begin
  drop policy if exists attendance_select on attendance;
  create policy attendance_select on attendance for select using (auth.role() = 'authenticated');
end $$;

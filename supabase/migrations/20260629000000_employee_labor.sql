-- =============================================================
-- 직원 노무관리 확장 (1·2·3순위)
--   인사기록 / 근로조건 / 4대보험 / 퇴사 컬럼 + 근로계약서·서류함·인사이력 테이블
-- =============================================================

-- ---------- 인사기록(인적사항) ----------
alter table employees add column if not exists birth date;                 -- 생년월일
alter table employees add column if not exists resident_no text;           -- 주민등록번호(민감 — 보관 주의)
alter table employees add column if not exists address text;               -- 주소
alter table employees add column if not exists emergency_contact text;     -- 비상연락처
alter table employees add column if not exists emergency_relation text;     -- 비상연락처 관계
alter table employees add column if not exists dependents integer;         -- 부양가족 수(본인 포함, 간이세액표용)
alter table employees add column if not exists children_under20 integer;   -- 20세 이하 자녀 수

-- ---------- 근로조건 ----------
alter table employees add column if not exists weekly_hours numeric;       -- 주 소정근로시간
alter table employees add column if not exists work_days text;             -- 근무요일(예: 월~금)
alter table employees add column if not exists work_start text;            -- 근무 시작시각(HH:MM)
alter table employees add column if not exists work_end text;              -- 근무 종료시각(HH:MM)
alter table employees add column if not exists probation_end date;         -- 수습 종료일
alter table employees add column if not exists contract_end date;          -- 계약 만료일(계약직)

-- ---------- 4대보험 ----------
alter table employees add column if not exists ins_pension boolean default true;     -- 국민연금
alter table employees add column if not exists ins_health boolean default true;      -- 건강보험
alter table employees add column if not exists ins_employment boolean default true;  -- 고용보험
alter table employees add column if not exists ins_industrial boolean default true;  -- 산재보험
alter table employees add column if not exists ins_acquired_on date;       -- 취득(자격취득)일
alter table employees add column if not exists ins_lost_on date;           -- 상실(자격상실)일

-- ---------- 퇴사 ----------
alter table employees add column if not exists resigned_on date;           -- 퇴사일
alter table employees add column if not exists resign_reason text;          -- 퇴사사유(자진/권고/계약만료/해고 등)

-- ---------- 근로계약서 ----------
create table if not exists labor_contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete set null,
  employee_id uuid references employees(id) on delete cascade,
  contract_type text,        -- 정규직/계약직/시급제 등
  start_date date,           -- 계약 시작
  end_date date,             -- 계약 종료(null=기간의 정함 없음)
  wage_type text,            -- MONTHLY/HOURLY
  wage_amount numeric,       -- 기본급(월) 또는 시급
  work_hours text,           -- 소정근로시간/근무시간 메모
  signed_on date,            -- 작성·서명일
  file_url text,             -- 스캔/PDF(data URL)
  memo text,
  created_at timestamptz not null default now()
);
create index if not exists labor_contracts_emp_idx on labor_contracts (employee_id);

-- ---------- 직원 서류함(증빙) ----------
create table if not exists employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  doc_type text,             -- 통장사본/주민등록등본/자격증/이직확인서/건강검진 등
  title text,
  file_url text,             -- 파일(data URL) 또는 외부 링크
  issued_on date,            -- 발급/제출일
  expires_on date,           -- 만료일(자격증·검진 등)
  memo text,
  created_at timestamptz not null default now()
);
create index if not exists employee_documents_emp_idx on employee_documents (employee_id);

-- ---------- 인사 발령/변동 이력 ----------
create table if not exists employee_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  event_date date,
  event_type text,           -- 입사/승진/부서이동/급여변동/휴직/복직/계약갱신/퇴사 등
  title text,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists employee_events_emp_idx on employee_events (employee_id);

-- ---------- RLS (로그인 사용자 SELECT 전용; 쓰기는 service-role) ----------
alter table labor_contracts enable row level security;
alter table employee_documents enable row level security;
alter table employee_events enable row level security;
do $$ begin
  drop policy if exists labor_contracts_select_auth on labor_contracts;
  create policy labor_contracts_select_auth on labor_contracts
    for select using (auth.role() = 'authenticated');
  drop policy if exists employee_documents_select_auth on employee_documents;
  create policy employee_documents_select_auth on employee_documents
    for select using (auth.role() = 'authenticated');
  drop policy if exists employee_events_select_auth on employee_events;
  create policy employee_events_select_auth on employee_events
    for select using (auth.role() = 'authenticated');
end $$;

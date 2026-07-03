-- =============================================================
-- 전자결재 — 지출결의·구매·휴가·일반 문서를 결재선(순차 승인)으로.
--  approvals(문서) + approval_steps(결재선 단계). current_step = 현재 대기 단계 순번.
-- =============================================================
create table if not exists approvals (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid references companies(id) on delete set null,
  doc_type       text not null default 'GENERAL',  -- GENERAL/EXPENSE/PURCHASE/LEAVE
  title          text not null,
  amount         numeric,
  content        text,
  requester_id   uuid references profiles(id) on delete set null,
  requester_name text,
  status         text not null default 'PENDING',  -- PENDING/APPROVED/REJECTED/CANCELED
  current_step   integer not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_approvals_status on approvals (status, created_at desc);
create index if not exists idx_approvals_requester on approvals (requester_id, created_at desc);
create index if not exists idx_approvals_company on approvals (company_id, created_at desc);

create table if not exists approval_steps (
  id            uuid primary key default gen_random_uuid(),
  approval_id   uuid not null references approvals(id) on delete cascade,
  step_order    integer not null,
  approver_id   uuid references profiles(id) on delete set null,
  approver_name text,
  status        text not null default 'WAITING',   -- WAITING/APPROVED/REJECTED
  comment       text,
  acted_at      timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_approval_steps_appr on approval_steps (approval_id, step_order);
create index if not exists idx_approval_steps_approver on approval_steps (approver_id, status);

alter table approvals enable row level security;
alter table approval_steps enable row level security;
do $$ begin
  drop policy if exists approvals_select on approvals;
  create policy approvals_select on approvals for select using (auth.role() = 'authenticated');
  drop policy if exists approval_steps_select on approval_steps;
  create policy approval_steps_select on approval_steps for select using (auth.role() = 'authenticated');
end $$;

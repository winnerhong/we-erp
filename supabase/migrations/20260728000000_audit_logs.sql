-- =============================================================
-- 감사추적(Audit Trail) — 누가·언제·무엇을 바꿨는지 필드 단위 변경이력.
--  - 쓰기 액션에서 best-effort 로 기록(실패해도 본 작업엔 영향 없음).
--  - changes: CREATE=신규값, UPDATE={필드:{from,to}}, DELETE=삭제 스냅샷.
-- =============================================================
create table if not exists audit_logs (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid references companies(id) on delete set null,
  actor_id     uuid references profiles(id) on delete set null,
  actor_name   text,
  entity_table text not null,
  entity_id    text,
  action       text not null,               -- 'CREATE' | 'UPDATE' | 'DELETE'
  label        text,                         -- 사람이 읽는 대상 이름(있으면)
  changes      jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists idx_audit_created on audit_logs (created_at desc);
create index if not exists idx_audit_entity on audit_logs (entity_table, entity_id);
create index if not exists idx_audit_company on audit_logs (company_id, created_at desc);
create index if not exists idx_audit_actor on audit_logs (actor_id, created_at desc);

alter table audit_logs enable row level security;
do $$ begin
  drop policy if exists audit_logs_select on audit_logs;
  create policy audit_logs_select on audit_logs for select using (auth.role() = 'authenticated');
end $$;

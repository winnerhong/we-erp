-- =============================================================
-- 거래처 외부 가져오기 지원 — 구분(category) + 출처(source_ref)
--   winner-kids(wks) 의 협력사/기관/장소를 거래처로 가져올 때 사용.
--   source_ref 로 재실행 시 중복 없이 갱신(upsert).
-- =============================================================

alter table partners add column if not exists category text;       -- 장소/강사/협력사/기관 등
alter table partners add column if not exists source_ref text;      -- 예: 'wks:agencies:<uuid>'

-- source_ref 유니크(널은 서로 충돌하지 않음) → upsert onConflict 대상
create unique index if not exists uq_partners_source_ref on partners(source_ref);

create index if not exists idx_partners_category on partners(category);

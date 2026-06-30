-- =============================================================
-- 3차 모듈5 — 현장 데이터 수집(강사 출석·진도)
--   거래내역(체육수업 회차)에 출석 인원·진도/특이사항을 강사가 현장에서 입력.
--   강사 본인(transactions.instructor_id) 만 수정 가능(서버액션 가드).
-- =============================================================
alter table transactions add column if not exists present_count integer;   -- 출석 인원
alter table transactions add column if not exists progress_note text;       -- 진도/특이사항
alter table transactions add column if not exists completed_at timestamptz; -- 현장 완료 체크 시각

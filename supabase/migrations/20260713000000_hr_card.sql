-- 인사카드 — 직원이 /me 에서 자가입력하면 회사 기록(employees)에 즉시 반영
alter table employees add column if not exists name_en text;        -- 영문이름
alter table employees add column if not exists nationality text;     -- 국적
alter table employees add column if not exists gender text;          -- 성별
-- 반복항목(가족·학력·경력·자격) 묶음
alter table employees add column if not exists hr_extra jsonb not null default '{}'::jsonb;

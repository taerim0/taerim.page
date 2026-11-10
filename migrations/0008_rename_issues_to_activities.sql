-- 0008: 이슈 → 활동 (설계 15-8). 표 이름만 바꾸고 기존 행은 그대로 + 꼬리표 칸 2개
-- 꼬리표: 활동마다 바꿀 수 있는 작은 블록 (예: 입사, 동아리). 비우면 화면에 기본 "활동" / "Activity"

ALTER TABLE issues RENAME TO activities;
ALTER TABLE activities ADD COLUMN label TEXT;     -- 20자까지, 한 줄
ALTER TABLE activities ADD COLUMN label_en TEXT;  -- 영어 꼬리표 (선택)

DROP INDEX issues_date;
CREATE INDEX activities_date ON activities (date DESC, id DESC);

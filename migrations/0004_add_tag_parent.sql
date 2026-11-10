-- 0004: 태그 상하관계 (설계 14)
-- 태그마다 부모(상위 태그)는 하나까지. 없으면 NULL (맨 위 태그)
-- 상하관계는 블로그 전체에 하나이고, 글에는 직접 고른 태그만 저장한다 (상위 태그는 보여 줄 때 계산)
-- 순환(자기 자신·자기 하위를 부모로)은 코드에서 막는다
-- 부모 태그 행이 지워지면 자식은 맨 위 태그가 된다

ALTER TABLE tags ADD COLUMN parent_id INTEGER REFERENCES tags (id) ON DELETE SET NULL;

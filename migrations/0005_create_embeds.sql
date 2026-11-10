-- 0005: 임베드 카드 정보 (설계 13-9)
-- 관리자 Worker가 받아서 저장하고(7일 지나면 다시), 공개 사이트 빌드는 여기 저장된 것만 읽는다
-- 대표 그림 파일은 R2에 embed-{해시}.{확장자}로, 여기는 그 이름만

CREATE TABLE embeds (
  url         TEXT    PRIMARY KEY,            -- 글에 쓴 주소 그대로
  kind        TEXT    NOT NULL CHECK (kind IN ('repo', 'link')),  -- GitHub 저장소 / 일반 링크
  ok          INTEGER NOT NULL,               -- 1 = 정보를 받음, 0 = 못 받음(단순 카드)
  title       TEXT,
  description TEXT,
  site_name   TEXT,
  image       TEXT,                           -- R2 이름 (예: embed-3f9a1c2b7d4e.png). 없으면 NULL
  stars       INTEGER,                        -- 저장소 별 개수
  language    TEXT,                           -- 저장소 주 언어
  fetched_at  TEXT    NOT NULL                -- 받은(또는 실패한) 시각, ISO 8601 UTC
);

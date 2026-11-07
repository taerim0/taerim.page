-- 0001: 글·작업본·태그 테이블
-- 이미 적용한 마이그레이션은 고치지 않는다. 바꿀 일이 생기면 0002_… 파일을 새로 만든다.
-- 시각은 모두 ISO 8601 UTC 문자열 (예: 2026-11-07T10:00:00.000Z) → 글자 순서 = 시간 순서

-- 글. 아직 공개하지 않은 초안은 여기서 바로 고치고, 공개된 글의 수정본은 post_drafts에 둔다.
CREATE TABLE posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,  -- AUTOINCREMENT: 지운 번호를 다시 쓰지 않음
  title        TEXT    NOT NULL,
  body         TEXT    NOT NULL,                   -- Markdown 원본 (렌더링 결과는 저장하지 않음)
  summary      TEXT,                               -- 소개글 (없으면 NULL)
  thumbnail    TEXT,                               -- 대표 이미지 (없으면 NULL → 보여줄 때 기본 이미지)
  status       TEXT    NOT NULL CHECK (status IN ('draft', 'published')),
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL,
  published_at TEXT,                               -- 처음 공개한 시각 (공개 전 NULL)
  deleted_at   TEXT                                -- 휴지통에 넣은 시각 (정상 글이면 NULL)
);

-- 공개된 글의 작업본 (글당 최대 1개). 글을 완전 삭제하면 같이 지워진다.
CREATE TABLE post_drafts (
  post_id    INTEGER PRIMARY KEY REFERENCES posts (id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  summary    TEXT,
  thumbnail  TEXT,
  tags       TEXT    NOT NULL DEFAULT '[]',        -- 작업본의 태그 이름 목록(JSON). 반영할 때 post_tags로 옮긴다
  updated_at TEXT    NOT NULL
);

-- 태그 (나중에 카테고리). 이름은 정리된 값(소문자, 띄어쓰기는 -)이고 겹치지 않는다.
-- 어떤 글에도 안 쓰이게 된 태그도 남겨 두고, 목록에서만 뺀다.
CREATE TABLE tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT    NOT NULL UNIQUE
);

-- 글-태그 연결. 글이나 태그가 지워지면 연결도 같이 지워진다.
-- 태그는 항상 이름순으로 돌려주므로 순서 칸은 두지 않는다.
CREATE TABLE post_tags (
  post_id INTEGER NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

-- 목록 정렬·거르기용 색인 (최신이 앞, 시각이 같으면 id가 큰 글이 앞)
CREATE INDEX idx_posts_by_updated   ON posts (deleted_at, updated_at DESC, id DESC);
CREATE INDEX idx_posts_by_published ON posts (deleted_at, status, published_at DESC, id DESC);
CREATE INDEX idx_posts_trash        ON posts (deleted_at DESC, id DESC) WHERE deleted_at IS NOT NULL;
-- "이 태그가 붙은 글" 찾기용
CREATE INDEX idx_post_tags_by_tag   ON post_tags (tag_id, post_id);

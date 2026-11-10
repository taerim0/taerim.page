-- 0003: 글 번역본 (설계 12)
-- 한글 글(posts)마다 언어별로 공개본 하나 + 초안 하나까지. posts / post_drafts 와 같은 짝
-- 언어 코드('en')는 코드에서 지원 목록으로 확인한다 (언어를 늘릴 때 마이그레이션이 필요 없게 CHECK를 두지 않음)
-- 글을 완전 삭제하면 번역본도 같이 지워진다

-- 공개된 번역본 (공개 사이트 /en/… 에 나가는 것)
CREATE TABLE post_translations (
  post_id      INTEGER NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  lang         TEXT    NOT NULL,
  title        TEXT    NOT NULL,
  summary      TEXT,                          -- 없으면 NULL
  body         TEXT    NOT NULL,              -- Markdown
  source_hash  TEXT    NOT NULL,              -- 번역할 때 한글(제목·요약·본문)의 해시 → 다르면 "원문 바뀜"
  published_at TEXT    NOT NULL,              -- 처음 공개한 시각 (내렸다가 다시 공개해도 유지하지 않음)
  updated_at   TEXT    NOT NULL,              -- 마지막으로 공개(반영)한 시각
  PRIMARY KEY (post_id, lang)
);

-- 번역 초안 (LLM 결과가 들어오고, 관리자가 고치는 곳. 공개하면 위로 옮겨지고 지워진다)
CREATE TABLE post_translation_drafts (
  post_id     INTEGER NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  lang        TEXT    NOT NULL,
  title       TEXT    NOT NULL,
  summary     TEXT,
  body        TEXT    NOT NULL,
  source_hash TEXT    NOT NULL,
  model       TEXT,                           -- 번역한 모델 (기록용). 직접 쓰거나 공개본을 되돌린 것이면 NULL
  updated_at  TEXT    NOT NULL,
  PRIMARY KEY (post_id, lang)
);

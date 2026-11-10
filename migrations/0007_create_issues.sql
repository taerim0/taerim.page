-- 0007: 이슈 (설계 15-5): 아카이브·홈에 보이는 짧은 기록 한 덩어리. 자기 페이지 없음
-- 저장하면 공개 대상 (초안 없음), 지우면 바로 지움

CREATE TABLE issues (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT    NOT NULL,   -- YYYY-MM-DD (한국 날짜)
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL,   -- Markdown, 빈 글자 가능
  title_en   TEXT,               -- 영어 (없으면 영어 페이지에 한국어)
  body_en    TEXT,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);

CREATE INDEX issues_date ON issues (date DESC, id DESC);

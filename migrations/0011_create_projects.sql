-- 0011: 프로젝트 (설계 18): /projects 카드. 글 표와 따로, 태그는 글과 같은 tags 표를 같이 씀
-- 저장하면 바로 공개 대상(초안 없음, visible로 숨기기), 지우면 휴지통처럼 deleted_at만 (되살리기·완전 삭제)

CREATE TABLE projects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL,
  summary    TEXT,
  thumbnail  TEXT,               -- /images/… 또는 https://…, 없으면 기본 그림
  started_on TEXT    NOT NULL,   -- YYYY-MM
  ended_on   TEXT,               -- YYYY-MM, 없으면 진행 중 "~"
  status     TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'paused')),
  repo_url   TEXT,
  site_url   TEXT,
  body       TEXT    NOT NULL DEFAULT '',  -- Markdown, 상세 페이지 때 씀
  sort_order INTEGER NOT NULL,   -- 작을수록 앞
  visible    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL,
  deleted_at TEXT
);

CREATE INDEX projects_order ON projects (deleted_at, sort_order, id);

-- 프로젝트-태그 연결. 프로젝트나 태그가 지워지면 연결도 같이
CREATE TABLE project_tags (
  project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, tag_id)
);

CREATE INDEX project_tags_by_tag ON project_tags (tag_id, project_id);

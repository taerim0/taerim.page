-- 0006: 사이트 설정 (설계 15-3): 소개 카드(이름·사진·한 줄 소개)·사이트 소개·링크
-- 한 줄짜리 표 (id = 1). 내용은 JSON 하나 — 칸이 늘어도 마이그레이션 없이
-- 저장한 적 없으면 행이 없음 → 코드의 기본값

CREATE TABLE site_settings (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  data       TEXT    NOT NULL,   -- JSON (src/settings/types.ts의 SiteSettings)
  updated_at TEXT    NOT NULL
);

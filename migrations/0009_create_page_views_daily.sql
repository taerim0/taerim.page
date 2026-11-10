-- 0009: 조회수 (설계 2-2, docs/05). Cloudflare Web Analytics가 센 날짜 × 주소별 조회 수
-- 매일 GitHub Actions(scripts/collect-views.ts)가 최근 며칠을 받아 덮어씀 → 정확한 값을 계속 쌓음

CREATE TABLE page_views_daily (
  date   TEXT    NOT NULL,             -- YYYY-MM-DD (UTC)
  path   TEXT    NOT NULL,             -- 예) /posts/3, /en/posts/3
  views  INTEGER NOT NULL DEFAULT 0,   -- 조회 수 (page views, 봇 제외)
  visits INTEGER NOT NULL DEFAULT 0,   -- 방문 수 (받아만 둠)
  PRIMARY KEY (date, path)
);

-- 0002: 이미지 정보 (파일 내용은 R2에, 여기는 목록·크기 정보만)
-- 이름 = 내용 해시(SHA-256 앞 12자) + 확장자 = R2 키 = 공개 주소 /images/{name}
-- 같은 내용은 같은 이름이라 한 번만 저장된다

CREATE TABLE images (
  name          TEXT    PRIMARY KEY,          -- 예) 3f9a1c2b7d4e.webp
  original_name TEXT    NOT NULL,             -- 올릴 때 파일 이름 (alt 기본값, 관리용)
  content_type  TEXT    NOT NULL CHECK (content_type IN ('image/webp', 'image/gif')),
  width         INTEGER NOT NULL,             -- 픽셀
  height        INTEGER NOT NULL,
  size          INTEGER NOT NULL,             -- 바이트
  created_at    TEXT    NOT NULL              -- ISO 8601 UTC
);

-- 0010: 글 종류 (설계 17): 글(post) = 다른 사람이 읽는 글 / 노트(note) = 공부 정리
-- 지금 있는 글은 모두 '글'. 글 번호(id)는 둘이 같이 씀
ALTER TABLE posts ADD COLUMN kind TEXT NOT NULL DEFAULT 'post' CHECK (kind IN ('post', 'note'));
CREATE INDEX posts_kind ON posts (kind);

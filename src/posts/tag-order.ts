/**
 * 태그 이름 순서. 태그는 어디서든 항상 이 순서(이름순)로 돌려준다.
 *
 * D1(SQLite)의 기본 정렬은 UTF-8 바이트 순서이고, 이것은 유니코드 코드 포인트 순서와 같다.
 * JavaScript의 기본 비교(a < b)는 UTF-16 단위로 비교해서 이모지 같은 일부 글자에서 순서가 달라지므로,
 * 코드 포인트로 직접 비교해 메모리 저장소와 D1 저장소의 결과를 똑같이 맞춘다.
 */
export function compareTagNames(a: string, b: string): number {
  const left = a[Symbol.iterator]();
  const right = b[Symbol.iterator]();
  for (;;) {
    const x = left.next();
    const y = right.next();
    if (x.done || y.done) return x.done === y.done ? 0 : x.done ? -1 : 1;
    const difference = x.value.codePointAt(0)! - y.value.codePointAt(0)!;
    if (difference !== 0) return difference;
  }
}

/** 태그 이름 목록을 이름순으로 정렬한 새 목록 */
export function sortTagNames(tags: readonly string[]): string[] {
  return [...tags].sort(compareTagNames);
}

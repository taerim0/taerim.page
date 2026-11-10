import { compareTagNames, sortTagNames } from "./tag-order.ts";
import type { TagParent } from "./types.ts";

/**
 * 태그 트리 (설계 14). 저장소의 "태그 → 부모" 목록으로 만들고, 계산만 한다 (순수).
 * 관리자 서비스·공개 사이트 빌드·편집 화면(lib.js)이 같이 쓴다.
 *
 * - 글에는 직접 고른 태그만 저장되고, 상위 태그는 withAncestors로 그때그때 붙인다 (A안)
 * - 트리 순서: 맨 위 태그들부터 깊이 우선, 형제끼리는 이름순 → "개발, 프론트엔드, react, 블로그"
 * - 목록에 없는 태그는 맨 위 태그로 본다. 데이터에 순환이 있어도 멈추지 않게 방문 표시로 끊는다
 */
export class TagTree {
  readonly #parent = new Map<string, string | null>();
  readonly #children = new Map<string | null, string[]>();
  readonly #order = new Map<string, number>();

  constructor(parents: readonly TagParent[]) {
    for (const { name, parent } of parents) this.#parent.set(name, parent);
    // 부모가 목록에 없으면 그 부모도 맨 위 태그로 더해 둔다
    for (const parent of [...this.#parent.values()]) if (parent !== null && !this.#parent.has(parent)) this.#parent.set(parent, null);
    for (const [name, parent] of this.#parent) {
      const list = this.#children.get(parent) ?? [];
      list.push(name);
      this.#children.set(parent, list);
    }
    for (const list of this.#children.values()) list.sort(compareTagNames);
    // 트리 순서 번호 (순환에 걸린 태그는 방문 안 된 채 남으므로 끝에 이름순으로)
    const visit = (name: string) => {
      if (this.#order.has(name)) return;
      this.#order.set(name, this.#order.size);
      for (const child of this.#children.get(name) ?? []) visit(child);
    };
    for (const root of this.#children.get(null) ?? []) visit(root);
    for (const name of sortTagNames([...this.#parent.keys()])) visit(name);
  }

  /** 알고 있는 모든 태그 (트리 순) */
  names(): string[] {
    return [...this.#order.keys()];
  }

  parentOf(name: string): string | null {
    return this.#parent.get(name) ?? null;
  }

  /** 맨 위부터 바로 위 부모까지. 예) react → ["개발", "프론트엔드"] */
  ancestorsOf(name: string): string[] {
    const chain: string[] = [];
    const seen = new Set([name]);
    for (let parent = this.parentOf(name); parent !== null && !seen.has(parent); parent = this.parentOf(parent)) {
      seen.add(parent);
      chain.unshift(parent);
    }
    return chain;
  }

  /** 바로 아래 태그들 (이름순). null이면 맨 위 태그들 */
  childrenOf(name: string | null): string[] {
    return [...(this.#children.get(name) ?? [])];
  }

  /** 아래 모든 태그 (자기 자신 빼고, 트리 순) */
  descendantsOf(name: string): string[] {
    const found: string[] = [];
    const seen = new Set([name]);
    const walk = (current: string) => {
      for (const child of this.#children.get(current) ?? []) {
        if (seen.has(child)) continue;
        seen.add(child);
        found.push(child);
        walk(child);
      }
    };
    walk(name);
    return found;
  }

  /** child의 부모를 parent로 하면 순환이 생기는지 (자기 자신이거나 자기 하위를 부모로) */
  wouldCycle(child: string, parent: string): boolean {
    return child === parent || this.descendantsOf(child).includes(parent);
  }

  /** 태그들 + 그 상위 태그들 (중복 없이, 트리 순). 글에 "상위 태그도 같이 붙어" 보이게 */
  withAncestors(tags: readonly string[]): string[] {
    const all = new Set<string>();
    for (const tag of tags) {
      for (const ancestor of this.ancestorsOf(tag)) all.add(ancestor);
      all.add(tag);
    }
    return this.sort([...all]);
  }

  /** 트리 순으로 정렬한 새 목록 (모르는 태그는 끝에 이름순) */
  sort(names: readonly string[]): string[] {
    return [...names].sort((a, b) => {
      const x = this.#order.get(a);
      const y = this.#order.get(b);
      if (x !== undefined && y !== undefined) return x - y;
      if (x !== undefined) return -1;
      if (y !== undefined) return 1;
      return compareTagNames(a, b);
    });
  }

  /** 트리에서의 깊이 (맨 위 = 0) */
  depthOf(name: string): number {
    return this.ancestorsOf(name).length;
  }
}

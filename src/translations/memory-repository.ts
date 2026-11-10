import type { TranslationRepository } from "./repository.ts";
import type { PublishedTranslation, TranslationDraft, TranslationLang, TranslationSummary } from "./types.ts";

const key = (postId: number, lang: TranslationLang) => `${postId}:${lang}`;
const byPostId = (a: { postId: number }, b: { postId: number }) => a.postId - b.postId;

/** 메모리 저장소 (테스트·개발용). 넣을 때·돌려줄 때 복사본을 쓴다 */
export class MemoryTranslationRepository implements TranslationRepository {
  readonly #published = new Map<string, PublishedTranslation>();
  readonly #drafts = new Map<string, TranslationDraft>();

  async getPublished(postId: number, lang: TranslationLang): Promise<PublishedTranslation | null> {
    const found = this.#published.get(key(postId, lang));
    return found ? { ...found } : null;
  }

  async getDraft(postId: number, lang: TranslationLang): Promise<TranslationDraft | null> {
    const found = this.#drafts.get(key(postId, lang));
    return found ? { ...found } : null;
  }

  async saveDraft(draft: TranslationDraft): Promise<void> {
    this.#drafts.set(key(draft.postId, draft.lang), { ...draft });
  }

  async deleteDraft(postId: number, lang: TranslationLang): Promise<boolean> {
    return this.#drafts.delete(key(postId, lang));
  }

  async publishDraft(postId: number, lang: TranslationLang, at: string): Promise<PublishedTranslation | null> {
    const k = key(postId, lang);
    const draft = this.#drafts.get(k);
    if (!draft) return null;
    const published: PublishedTranslation = {
      postId,
      lang,
      title: draft.title,
      summary: draft.summary,
      body: draft.body,
      sourceHash: draft.sourceHash,
      publishedAt: this.#published.get(k)?.publishedAt ?? at,
      updatedAt: at,
    };
    this.#published.set(k, published);
    this.#drafts.delete(k);
    return { ...published };
  }

  async unpublish(postId: number, lang: TranslationLang, at: string): Promise<boolean> {
    const k = key(postId, lang);
    const published = this.#published.get(k);
    if (!published) return false;
    if (!this.#drafts.has(k)) {
      const { title, summary, body, sourceHash } = published;
      this.#drafts.set(k, { postId, lang, title, summary, body, sourceHash, model: null, updatedAt: at });
    }
    this.#published.delete(k);
    return true;
  }

  async listPublished(lang: TranslationLang): Promise<PublishedTranslation[]> {
    return [...this.#published.values()].filter((t) => t.lang === lang).map((t) => ({ ...t })).sort(byPostId);
  }

  async listSummaries(lang: TranslationLang): Promise<TranslationSummary[]> {
    const summaries = new Map<number, TranslationSummary>();
    const entry = (postId: number) => {
      let found = summaries.get(postId);
      if (!found) summaries.set(postId, (found = { postId, publishedSourceHash: null, draftSourceHash: null }));
      return found;
    };
    for (const t of this.#published.values()) if (t.lang === lang) entry(t.postId).publishedSourceHash = t.sourceHash;
    for (const d of this.#drafts.values()) if (d.lang === lang) entry(d.postId).draftSourceHash = d.sourceHash;
    return [...summaries.values()].sort(byPostId);
  }
}

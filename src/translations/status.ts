/**
 * 번역 상태 (관리자 화면 표시용). 저장하지 않고 그때그때 계산한다.
 *
 * - published: 공개본이 있음 (공개 사이트에 나감)
 * - hasDraft: 초안이 있음 (LLM 결과·고치는 중, 아직 안 나감)
 * - outdated: 공개본을 번역한 뒤 한글이 바뀜 → "원문 바뀜, 다시 번역 필요"
 *             (공개본은 그대로 계속 나간다. 설계 12 결정)
 * - draftOutdated: 초안을 만든 뒤 한글이 바뀜
 */
export interface TranslationStatus {
  published: boolean;
  hasDraft: boolean;
  outdated: boolean;
  draftOutdated: boolean;
}

/**
 * @param currentHash 지금 공개된 한글의 sourceHash
 * @param publishedHash 공개본의 sourceHash (없으면 null)
 * @param draftHash 초안의 sourceHash (없으면 null)
 */
export function translationStatus(
  currentHash: string,
  publishedHash: string | null,
  draftHash: string | null,
): TranslationStatus {
  return {
    published: publishedHash !== null,
    hasDraft: draftHash !== null,
    outdated: publishedHash !== null && publishedHash !== currentHash,
    draftOutdated: draftHash !== null && draftHash !== currentHash,
  };
}

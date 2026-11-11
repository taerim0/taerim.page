/**
 * R2(Cloudflare 파일 저장소)에서 우리가 쓰는 부분만 정의한 타입.
 * d1.ts와 같은 이유로 공식 타입 패키지 대신 필요한 만큼만 적는다.
 * 실제 R2 연결은 이 모양을 그대로 만족한다.
 */

/** get()으로 꺼낸 파일 */
export interface R2ObjectBody {
  /** 파일 내용 (한 번만 읽을 수 있음) */
  body: ReadableStream<Uint8Array>;
  /** 바이트 */
  size: number;
  httpMetadata?: { contentType?: string };
}

/** R2 버킷 */
export interface R2Bucket {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  /** 없으면 null */
  get(key: string): Promise<R2ObjectBody | null>;
  /** 지우기 (없어도 오류 아님) */
  delete(key: string): Promise<void>;
}

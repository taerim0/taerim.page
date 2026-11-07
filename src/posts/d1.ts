/**
 * D1(Cloudflare의 SQLite DB)에서 우리가 쓰는 부분만 정의한 타입.
 *
 * Cloudflare 공식 타입 패키지 대신 필요한 만큼만 직접 적는다.
 * - 패키지를 더 설치하지 않아도 되고, 브라우저 타입(DOM)과 충돌하지 않는다.
 * - 나중에 다른 SQLite(예: Node 내장 sqlite, Turso)로 옮길 때 이 모양만 맞춰 주면 된다.
 *
 * 실제 D1 연결(env.DB)은 이 모양을 그대로 만족한다.
 */

/** SQL의 ? 자리에 넣을 수 있는 값 */
export type D1Value = string | number | null;

/** 실행 결과 */
export interface D1Result<Row = Record<string, unknown>> {
  /** SELECT로 읽은 행들 */
  results: Row[];
  meta: {
    /** INSERT·UPDATE·DELETE로 바뀐 행 수 */
    changes: number;
    /** 마지막으로 INSERT한 행의 id */
    last_row_id: number;
  };
}

/** 값을 넣어 실행할 준비가 된 SQL 한 문장 */
export interface D1PreparedStatement {
  /** ? 자리에 순서대로 값을 넣는다 (SQL 문자열에 값을 직접 이어 붙이지 않는다 → SQL 주입 방지) */
  bind(...values: D1Value[]): D1PreparedStatement;
  /** 첫 번째 행만. 없으면 null */
  first<Row = Record<string, unknown>>(): Promise<Row | null>;
  /** 모든 행 */
  all<Row = Record<string, unknown>>(): Promise<D1Result<Row>>;
  /** 실행만 (INSERT·UPDATE·DELETE) */
  run(): Promise<D1Result>;
}

/** D1 데이터베이스 */
export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  /**
   * 여러 문장을 **한 트랜잭션**으로 실행한다.
   * 하나라도 실패하면 전부 취소되고 오류가 난다. 결과는 문장 순서대로.
   */
  batch<Row = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<Row>[]>;
}

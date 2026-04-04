export type PrimitiveValue = string | number | boolean | null;

export type QueryRow = Record<string, PrimitiveValue>;

export interface QueryResult<R extends QueryRow = QueryRow> {
  rows: R[];
  rowCount: number;
}

export interface PoolConfig {
  max?: number;
  slowQueryThresholdMs?: number;
  maxRecentQueries?: number;
  onSlowQuery?: (record: SlowQueryRecord) => void;
}

export interface ColumnSnapshot {
  name: string;
  type: string;
  primaryKey: boolean;
}

export interface TableSnapshot {
  name: string;
  columns: ColumnSnapshot[];
  rowCount: number;
}

export type IndexKind = 'primary' | 'index';

export interface IndexSnapshot {
  name: string;
  table: string;
  columns: string[];
  kind: IndexKind;
}

export interface PoolStatsSnapshot {
  max: number;
  active: number;
  idle: number;
  ended: boolean;
}

export interface PoolSnapshot {
  stats: PoolStatsSnapshot;
  tables: TableSnapshot[];
  indexes: IndexSnapshot[];
}

export type QueryOperation =
  | 'create_table'
  | 'create_index'
  | 'insert'
  | 'select'
  | 'update'
  | 'delete';

export type SlowQueryReason = 'no_matching_index';

export interface QueryLogEntry {
  sql: string;
  params: PrimitiveValue[];
  operation: QueryOperation;
  table: string | null;
  rowCount: number;
  usedIndex?: string;
  slowQueryReason?: SlowQueryReason;
  timestamp: number;
}

export interface SlowQueryRecord {
  sql: string;
  params: PrimitiveValue[];
  operation: Extract<QueryOperation, 'select' | 'update' | 'delete'>;
  table: string;
  whereColumns: string[];
  reason: SlowQueryReason;
  timestamp: number;
}

export interface PoolEventMap {
  type: 'pool';
  action: 'client_acquired' | 'client_released' | 'ended';
  stats: PoolStatsSnapshot;
  timestamp: number;
}

export interface SchemaEventMap {
  type: 'schema';
  action: 'table_created' | 'index_created';
  table: string;
  snapshot: PoolSnapshot;
  timestamp: number;
}

export interface QueryEventMap {
  type: 'query';
  query: QueryLogEntry;
  timestamp: number;
}

export type PoolEvent = PoolEventMap | SchemaEventMap | QueryEventMap;

export type PoolEventListener = (event: PoolEvent) => void;

export interface PoolClient {
  query<R extends QueryRow = QueryRow>(sql: string, params?: PrimitiveValue[]): Promise<QueryResult<R>>;
  release(): void;
}

export class MockPgError extends Error {
  readonly code: string;

  constructor(message: string, code = 'MOCK_PG_ERROR') {
    super(message);
    this.name = 'MockPgError';
    this.code = code;
  }
}

import { MockPgError, type PrimitiveValue } from './types.js';

export type ComparisonOperator = '=' | '!=' | '<' | '<=' | '>' | '>=';

export interface LiteralValueNode {
  kind: 'literal';
  value: PrimitiveValue;
}

export interface ParamValueNode {
  kind: 'param';
  index: number;
}

export type ValueNode = LiteralValueNode | ParamValueNode;

export interface ConditionNode {
  column: string;
  operator: ComparisonOperator;
  value: ValueNode;
}

export interface CreateTableStatement {
  type: 'create_table';
  table: string;
  columns: Array<{
    name: string;
    dataType: string;
    primaryKey: boolean;
  }>;
}

export interface CreateIndexStatement {
  type: 'create_index';
  name: string;
  table: string;
  columns: string[];
}

export interface InsertStatement {
  type: 'insert';
  table: string;
  columns: string[];
  rows: ValueNode[][];
}

export interface SelectStatement {
  type: 'select';
  table: string;
  columns: '*' | string[];
  where: ConditionNode[];
  orderBy?: {
    column: string;
    direction: 'ASC' | 'DESC';
  };
  limit?: number;
}

export interface UpdateStatement {
  type: 'update';
  table: string;
  assignments: Array<{
    column: string;
    value: ValueNode;
  }>;
  where: ConditionNode[];
}

export interface DeleteStatement {
  type: 'delete';
  table: string;
  where: ConditionNode[];
}

export type Statement =
  | CreateTableStatement
  | CreateIndexStatement
  | InsertStatement
  | SelectStatement
  | UpdateStatement
  | DeleteStatement;

function normalizeIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed.toLowerCase();
}

function trimStatement(sql: string): string {
  const trimmed = sql.trim();
  return trimmed.endsWith(';') ? trimmed.slice(0, -1).trim() : trimmed;
}

function isIdentifierChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9_]/.test(char);
}

function findKeywordTopLevel(input: string, keyword: string, start = 0): number {
  const upper = input.toUpperCase();
  let inString = false;
  let depth = 0;

  for (let index = start; index <= input.length - keyword.length; index += 1) {
    const char = input[index]!;

    if (char === "'") {
      if (inString && input[index + 1] === "'") {
        index += 1;
        continue;
      }
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '(') {
      depth += 1;
      continue;
    }

    if (char === ')') {
      depth -= 1;
      continue;
    }

    if (depth !== 0) {
      continue;
    }

    if (upper.slice(index, index + keyword.length) === keyword) {
      const before = index === 0 ? undefined : input[index - 1];
      const after = input[index + keyword.length];
      if (!isIdentifierChar(before) && !isIdentifierChar(after)) {
        return index;
      }
    }
  }

  return -1;
}

function splitTopLevel(input: string, separator: ',' | 'AND'): string[] {
  const parts: string[] = [];
  let current = '';
  let inString = false;
  let depth = 0;
  let index = 0;

  while (index < input.length) {
    const char = input[index]!;

    if (char === "'") {
      current += char;
      if (inString && input[index + 1] === "'") {
        current += "'";
        index += 2;
        continue;
      }
      inString = !inString;
      index += 1;
      continue;
    }

    if (!inString) {
      if (char === '(') {
        depth += 1;
      } else if (char === ')') {
        depth -= 1;
      }

      if (depth === 0) {
        if (separator === ',' && char === ',') {
          parts.push(current.trim());
          current = '';
          index += 1;
          continue;
        }

        if (
          separator === 'AND' &&
          input.slice(index, index + 3).toUpperCase() === 'AND' &&
          !isIdentifierChar(input[index - 1]) &&
          !isIdentifierChar(input[index + 3])
        ) {
          parts.push(current.trim());
          current = '';
          index += 3;
          continue;
        }
      }
    }

    current += char;
    index += 1;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function parseValue(token: string): ValueNode {
  const trimmed = token.trim();
  const paramMatch = trimmed.match(/^\$(\d+)$/);
  if (paramMatch) {
    return { kind: 'param', index: Number(paramMatch[1]) };
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return { kind: 'literal', value: trimmed.slice(1, -1).replace(/''/g, "'") };
  }

  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return { kind: 'literal', value: Number(trimmed) };
  }

  if (/^true$/i.test(trimmed)) {
    return { kind: 'literal', value: true };
  }

  if (/^false$/i.test(trimmed)) {
    return { kind: 'literal', value: false };
  }

  if (/^null$/i.test(trimmed)) {
    return { kind: 'literal', value: null };
  }

  throw new MockPgError(`Unsupported value token: ${trimmed}`, 'UNSUPPORTED_VALUE');
}

function parseConditions(rawWhere: string): ConditionNode[] {
  const where = rawWhere.trim();
  if (!where) {
    return [];
  }

  if (findKeywordTopLevel(where, 'OR') >= 0 || findKeywordTopLevel(where, 'IN') >= 0 || findKeywordTopLevel(where, 'LIKE') >= 0) {
    throw new MockPgError('Only AND-combined comparison predicates are supported', 'UNSUPPORTED_WHERE');
  }

  return splitTopLevel(where, 'AND').map((segment) => {
    const match = segment.match(/^(.+?)\s*(<=|>=|!=|=|<|>)\s*(.+)$/);
    if (!match) {
      throw new MockPgError(`Invalid WHERE condition: ${segment}`, 'INVALID_WHERE');
    }

    return {
      column: normalizeIdentifier(match[1]!),
      operator: match[2]! as ComparisonOperator,
      value: parseValue(match[3]!),
    };
  });
}

function parseCreateTable(sql: string): CreateTableStatement {
  const match = sql.match(/^CREATE\s+TABLE\s+([A-Za-z_][A-Za-z0-9_"]*)\s*\(([\s\S]+)\)$/i);
  if (!match) {
    throw new MockPgError('Invalid CREATE TABLE statement', 'INVALID_CREATE_TABLE');
  }

  const columns = splitTopLevel(match[2]!, ',').map((definition) => {
    const tokens = definition.trim().split(/\s+/);
    if (tokens.length < 2) {
      throw new MockPgError(`Invalid column definition: ${definition}`, 'INVALID_COLUMN');
    }

    const name = normalizeIdentifier(tokens[0]!);
    const upperTokens = tokens.map((token) => token.toUpperCase());
    const primaryKey = upperTokens.at(-2) === 'PRIMARY' && upperTokens.at(-1) === 'KEY';
    const typeTokens = primaryKey ? tokens.slice(1, -2) : tokens.slice(1);
    if (typeTokens.length === 0) {
      throw new MockPgError(`Missing column type for ${name}`, 'INVALID_COLUMN');
    }

    return {
      name,
      dataType: typeTokens.join(' ').toUpperCase(),
      primaryKey,
    };
  });

  return {
    type: 'create_table',
    table: normalizeIdentifier(match[1]!),
    columns,
  };
}

function parseCreateIndex(sql: string): CreateIndexStatement {
  const match = sql.match(/^CREATE\s+INDEX\s+([A-Za-z_][A-Za-z0-9_"]*)\s+ON\s+([A-Za-z_][A-Za-z0-9_"]*)\s*\((.+)\)$/i);
  if (!match) {
    throw new MockPgError('Invalid CREATE INDEX statement', 'INVALID_CREATE_INDEX');
  }

  return {
    type: 'create_index',
    name: normalizeIdentifier(match[1]!),
    table: normalizeIdentifier(match[2]!),
    columns: splitTopLevel(match[3]!, ',').map(normalizeIdentifier),
  };
}

function extractInsertTuples(rawValues: string): string[] {
  const tuples: string[] = [];
  let inString = false;
  let depth = 0;
  let current = '';

  for (let index = 0; index < rawValues.length; index += 1) {
    const char = rawValues[index]!;

    if (char === "'") {
      current += char;
      if (inString && rawValues[index + 1] === "'") {
        current += "'";
        index += 1;
        continue;
      }
      inString = !inString;
      continue;
    }

    if (!inString && char === '(') {
      if (depth === 0) {
        current = '';
      } else {
        current += char;
      }
      depth += 1;
      continue;
    }

    if (!inString && char === ')') {
      depth -= 1;
      if (depth === 0) {
        tuples.push(current.trim());
        current = '';
        continue;
      }
    }

    if (depth > 0) {
      current += char;
    }
  }

  if (tuples.length === 0) {
    throw new MockPgError('INSERT must include at least one value tuple', 'INVALID_INSERT');
  }

  return tuples;
}

function parseInsert(sql: string): InsertStatement {
  const match = sql.match(/^INSERT\s+INTO\s+([A-Za-z_][A-Za-z0-9_"]*)\s*\((.+)\)\s+VALUES\s+([\s\S]+)$/i);
  if (!match) {
    throw new MockPgError('Invalid INSERT statement', 'INVALID_INSERT');
  }

  const columns = splitTopLevel(match[2]!, ',').map(normalizeIdentifier);
  const rows = extractInsertTuples(match[3]!).map((tuple) => splitTopLevel(tuple, ',').map(parseValue));

  return {
    type: 'insert',
    table: normalizeIdentifier(match[1]!),
    columns,
    rows,
  };
}

function parseSelect(sql: string): SelectStatement {
  const fromIndex = findKeywordTopLevel(sql, 'FROM');
  if (fromIndex < 0) {
    throw new MockPgError('SELECT must include FROM', 'INVALID_SELECT');
  }

  const rawColumns = sql.slice(6, fromIndex).trim();
  const remainder = sql.slice(fromIndex + 4).trim();
  const whereIndex = findKeywordTopLevel(remainder, 'WHERE');
  const orderIndex = findKeywordTopLevel(remainder, 'ORDER BY');
  const limitIndex = findKeywordTopLevel(remainder, 'LIMIT');
  const clauseStarts = [whereIndex, orderIndex, limitIndex].filter((value) => value >= 0);
  const tableEnd = clauseStarts.length === 0 ? remainder.length : Math.min(...clauseStarts);
  const table = normalizeIdentifier(remainder.slice(0, tableEnd));

  let where: ConditionNode[] = [];
  if (whereIndex >= 0) {
    const whereEnd = [orderIndex, limitIndex].filter((value) => value > whereIndex);
    const end = whereEnd.length === 0 ? remainder.length : Math.min(...whereEnd);
    where = parseConditions(remainder.slice(whereIndex + 5, end));
  }

  let orderBy: SelectStatement['orderBy'];
  if (orderIndex >= 0) {
    const orderEnd = limitIndex > orderIndex ? limitIndex : remainder.length;
    const orderClause = remainder.slice(orderIndex + 'ORDER BY'.length, orderEnd).trim();
    const [columnToken, directionToken] = orderClause.split(/\s+/);
    if (!columnToken) {
      throw new MockPgError('ORDER BY requires a column', 'INVALID_ORDER_BY');
    }
    orderBy = {
      column: normalizeIdentifier(columnToken),
      direction: directionToken?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC',
    };
  }

  let limit: number | undefined;
  if (limitIndex >= 0) {
    const limitClause = remainder.slice(limitIndex + 5).trim();
    if (!/^\d+$/.test(limitClause)) {
      throw new MockPgError('LIMIT must be a positive integer literal', 'INVALID_LIMIT');
    }
    limit = Number(limitClause);
  }

  return {
    type: 'select',
    table,
    columns: rawColumns === '*' ? '*' : splitTopLevel(rawColumns, ',').map(normalizeIdentifier),
    where,
    ...(orderBy ? { orderBy } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };
}

function parseUpdate(sql: string): UpdateStatement {
  const setIndex = findKeywordTopLevel(sql, 'SET');
  if (setIndex < 0) {
    throw new MockPgError('UPDATE must include SET', 'INVALID_UPDATE');
  }

  const table = normalizeIdentifier(sql.slice(6, setIndex));
  const remainder = sql.slice(setIndex + 3).trim();
  const whereIndex = findKeywordTopLevel(remainder, 'WHERE');
  const assignmentText = whereIndex >= 0 ? remainder.slice(0, whereIndex).trim() : remainder;
  const whereText = whereIndex >= 0 ? remainder.slice(whereIndex + 5).trim() : '';

  const assignments = splitTopLevel(assignmentText, ',').map((segment) => {
    const match = segment.match(/^(.+?)\s*=\s*(.+)$/);
    if (!match) {
      throw new MockPgError(`Invalid assignment: ${segment}`, 'INVALID_UPDATE');
    }
    return {
      column: normalizeIdentifier(match[1]!),
      value: parseValue(match[2]!),
    };
  });

  return {
    type: 'update',
    table,
    assignments,
    where: parseConditions(whereText),
  };
}

function parseDelete(sql: string): DeleteStatement {
  if (!/^DELETE\s+FROM\s+/i.test(sql)) {
    throw new MockPgError('Invalid DELETE statement', 'INVALID_DELETE');
  }

  const remainder = sql.replace(/^DELETE\s+FROM\s+/i, '').trim();
  const whereIndex = findKeywordTopLevel(remainder, 'WHERE');
  return {
    type: 'delete',
    table: normalizeIdentifier(whereIndex >= 0 ? remainder.slice(0, whereIndex) : remainder),
    where: parseConditions(whereIndex >= 0 ? remainder.slice(whereIndex + 5).trim() : ''),
  };
}

export function parseSql(sql: string): Statement {
  const normalized = trimStatement(sql);

  if (/^CREATE\s+TABLE\b/i.test(normalized)) {
    return parseCreateTable(normalized);
  }

  if (/^CREATE\s+INDEX\b/i.test(normalized)) {
    return parseCreateIndex(normalized);
  }

  if (/^INSERT\s+INTO\b/i.test(normalized)) {
    return parseInsert(normalized);
  }

  if (/^SELECT\b/i.test(normalized)) {
    return parseSelect(normalized);
  }

  if (/^UPDATE\b/i.test(normalized)) {
    return parseUpdate(normalized);
  }

  if (/^DELETE\b/i.test(normalized)) {
    return parseDelete(normalized);
  }

  throw new MockPgError('Unsupported SQL statement', 'UNSUPPORTED_SQL');
}

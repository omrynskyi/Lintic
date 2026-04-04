# lintic-mock-pg

Lightweight PostgreSQL-style mock for Lintic WebContainer assessments, powered by `pg-mem`.

## Usage

```ts
import { Pool } from 'lintic-mock-pg';

const pool = new Pool({ max: 4 });

await pool.query(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT,
    age INTEGER
  )
`);

await pool.query('CREATE INDEX users_email_idx ON users (email)');
await pool.query('INSERT INTO users (id, email, age) VALUES ($1, $2, $3)', [1, 'alice@example.com', 30]);

const result = await pool.query(
  'SELECT id, email FROM users WHERE email = $1 ORDER BY id DESC LIMIT 1',
  ['alice@example.com'],
);

console.log(result.rows);
console.log(pool.getSnapshot());
console.log(pool.getRecentQueries());
```

## Supported SQL

- `CREATE TABLE`
- `CREATE INDEX`
- `INSERT`
- `SELECT` with `WHERE`, `ORDER BY`, `LIMIT`
- `UPDATE`
- `DELETE`
- joins and broader PostgreSQL syntax that `pg-mem` supports

This package keeps a stable Lintic-focused inspection API on top of `pg-mem`, so later frontend work can render a database tab without coupling to the underlying emulator internals.

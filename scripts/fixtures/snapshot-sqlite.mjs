import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';

/** D1-shaped adapter over actual SQLite, including atomic batch rollback. */
export function createSnapshotSqliteDatabase({ filename = ':memory:' } = {}) {
  const sqlite = new DatabaseSync(filename);
  const directory = new URL('../../drizzle/', import.meta.url);
  for (const name of readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL(name, directory), 'utf8'));
  }
  let failBatchAt = -1;
  let failReads = false;
  class Statement {
    constructor(sql, values = []) { this.sql = sql; this.values = values; }
    bind(...values) { return new Statement(this.sql, values); }
    execute() {
      const results = sqlite.prepare(this.sql).all(...this.values).map(row => ({ ...row }));
      return { success: true, results, meta: { changes: sqlite.prepare('SELECT changes() AS changed').get().changed } };
    }
    async all() { if (failReads) throw new Error('simulated unavailable database'); return this.execute(); }
  }
  const db = {
    prepare: sql => new Statement(sql),
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map((statement, index) => {
          if (index === failBatchAt) { failBatchAt = -1; throw new Error('simulated transactional failure'); }
          return statement.execute();
        });
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return { db, sqlite, close: () => sqlite.close(), failNextBatchAt: index => { failBatchAt = index; }, failReads: value => { failReads = value; } };
}

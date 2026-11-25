/*
  Small SQL helpers shared by the D1-backed teaching stores.

  Everything here takes the binding explicitly: the stores are module-level
  functions, not classes, because the Worker builds one binding per request and
  there is no per-isolate connection to keep.
*/

/** The D1 binding the teaching stores read and write. */
export type Db = D1Database

function statement(db: Db, sql: string, params: unknown[]) {
  return params.length ? db.prepare(sql).bind(...params) : db.prepare(sql)
}

export async function query<T>(db: Db, sql: string, ...params: unknown[]): Promise<T[]> {
  const result = await statement(db, sql, params).all<T>()
  return result.results ?? []
}

export async function queryOne<T>(db: Db, sql: string, ...params: unknown[]): Promise<T | null> {
  return (await statement(db, sql, params).first<T>()) ?? null
}

/** Run one statement and report how many rows it changed. */
export async function execute(db: Db, sql: string, ...params: unknown[]): Promise<number> {
  const result = await statement(db, sql, params).run()
  return result.meta.changes ?? 0
}

/** `?, ?, ?` for an IN (...) list. Never call this with an empty list. */
export const placeholders = (count: number) => Array.from({ length: count }, () => '?').join(', ')

/**
 * Insert many rows with one prepared statement, split into chunks so a large
 * seed or a bulk move stays inside D1's statement batch limit.
 */
export async function insertAll(db: Db, sql: string, rows: unknown[][]): Promise<void> {
  for (let i = 0; i < rows.length; i += 90) {
    const chunk = rows.slice(i, i + 90).map((params) => db.prepare(sql).bind(...params))
    if (chunk.length) await db.batch(chunk)
  }
}

export const nowIso = () => new Date().toISOString()

/** Ids keep the readable prefix the fixtures used, plus enough entropy to survive a same-millisecond retry. */
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

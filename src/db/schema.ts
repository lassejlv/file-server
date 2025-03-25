import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

const generateId = () => Bun.randomUUIDv7()
const generateDate = () => sql`current_timestamp`

export const files = sqliteTable('files', {
  id: text().primaryKey().$defaultFn(generateId),
  path: text().notNull().unique(),
  name: text().notNull(),
  size: integer().notNull(),
  storage_type: text().notNull(),
  is_private: integer({ mode: 'boolean' }).notNull().default(false),
  created_at: text().notNull().$defaultFn(generateDate),
  updated_at: text().notNull().$defaultFn(generateDate).$onUpdateFn(generateDate),
})

export type SelectFile = typeof files.$inferSelect
export type InsertFile = typeof files.$inferInsert

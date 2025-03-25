import { drizzle } from 'drizzle-orm/bun-sqlite'
import { Database } from 'bun:sqlite'
import * as schema from './schema'

const sqlite = new Database(process.env.FILE_SERVER_SQLITE_PATH || './data.db')
export const db = drizzle(sqlite, { schema })

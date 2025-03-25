import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: 'src/db/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.FILE_SERVER_SQLITE_PATH || './data.db',
  },
})

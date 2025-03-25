import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { LocalDriverUpload } from '../drivers/local'
import type { BunFile } from 'bun'
import { db } from '../db'
import { files } from '../db/schema'

const MAX_FILE_SIZE = Number(process.env.FILE_SERVER_MAX_FILE_SIZE) || 50 * 1024 * 1024 // 50MB
const ALLOWED_FILE_TYPES = process.env.FILE_SERVER_ALLOWED_FILE_TYPES?.split(',') || []
const STORAGE_TYPE = process.env.FILE_SERVER_STORAGE_TYPE

const UploadSchema = z.object({
  file: z.any().refine((file: BunFile) => file instanceof File, 'file is not a File'),
})

const router = new Hono()

router.post('/', zValidator('form', UploadSchema), async (c) => {
  const body = c.req.valid('form')

  if (body.file.size > MAX_FILE_SIZE) throw new Error('File too large')
  if (!ALLOWED_FILE_TYPES.includes(body.file.type)) throw new Error('File type not allowed')
  if (!STORAGE_TYPE) throw new Error('No storage type specified')

  let file_path = ''

  switch (STORAGE_TYPE) {
    case 'local':
      const filePath = await LocalDriverUpload(body.file, process.env.FILE_SERVER_STORAGE_PATH || './files')

      if (!filePath) throw new Error('Failed to upload file')

      file_path = filePath
      break

    default:
      throw new Error('Unknown storage type')
  }

  const new_file = await db
    .insert(files)
    .values({
      path: file_path,
      name: body.file.name,
      size: body.file.size,
      storage_type: STORAGE_TYPE,
    })
    .returning()

  return c.json({ file_path: `/files/uploads/${new_file[0]?.id}`, storage_type: STORAGE_TYPE, data: new_file[0] })
})

export default router

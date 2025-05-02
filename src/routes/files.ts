import { Hono } from 'hono'
import { db } from '../db'
import { eq } from 'drizzle-orm'
import { files } from '../db/schema'
import { LocalDriverGetFile } from '../drivers/local'
import { S3DriverGetFile } from '../drivers/s3'
import { zValidator } from '@hono/zod-validator'
import * as z from 'zod'

const router = new Hono()

router.get('/uploads/:id', async (c) => {
  const id = c.req.param('id')
  const file = await db.query.files.findFirst({ where: eq(files.id, id) })

  if (!file) throw new Error('File not found')

  if (file.is_private) return new Response(null, { status: 404 })

  const file_path = file.path

  switch (file.storage_type) {
    case 'local':
      const file_data = await LocalDriverGetFile(file_path)

      if (!file_data) throw new Error('File not found')
      return new Response(file_data.stream(), {
        headers: {
          'Content-Type': file_data.type,
          'Content-Length': file.size.toString(),
          'Cache-Control': 'public, max-age=31536000',
          'Accept-Ranges': 'bytes',
          ETag: `${file.id}`,
        },
      })
    case 's3':
      const file_data_s3 = await S3DriverGetFile(file_path)
      if (!file_data_s3) throw new Error('File not found')

      return new Response(file_data_s3, {
        headers: {
          'Content-Type': file.path.split('.').pop() || 'application/octet-stream',
          'Content-Length': file.size.toString(),
          'Cache-Control': 'public, max-age=31536000',
          'Accept-Ranges': 'bytes',
          ETag: `${file.id}`,
        },
      })
    default:
      throw new Error('Unknown storage type')
  }
})

router.get(
  '/uploads',
  zValidator(
    'query',
    z.object({
      limit: z
        .string()
        .optional()
        .refine((val) => isNaN(Number(val)), { message: 'limit must be a number' }),
    })
  ),
  async (c) => {
    const { limit } = c.req.valid('query')
    const limitNumber = limit ? parseInt(limit) : 10
    const filesList = await db.query.files.findMany({
      where: eq(files.is_private, false),
      limit: limitNumber,
    })

    if (!filesList) throw new Error('No files found')
    const filesData = filesList.map((file) => ({
      id: file.id,
      name: file.name,
      size: file.size,
      storage_type: file.storage_type,
      created_at: file.created_at,
    }))

    return c.json(filesData, 200)
  }
)

export default router

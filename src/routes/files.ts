import { Hono } from 'hono'
import { db } from '../db'
import { eq } from 'drizzle-orm'
import { files } from '../db/schema'
import { LocalDriverGetFile } from '../drivers/local'
import { S3DriverGetFile} from "../drivers/s3"

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

export default router

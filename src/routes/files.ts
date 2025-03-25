import { Hono } from 'hono'
import { db } from '../db'
import { eq } from 'drizzle-orm'
import { files } from '../db/schema'
import { LocalDriverGetFile } from '../drivers/local'

const router = new Hono()

router.get('/uploads/:id', async (c) => {
  const id = c.req.param('id')
  const file = await db.query.files.findFirst({ where: eq(files.id, id) })

  if (!file) throw new Error('File not found')

  if (file.is_private) return new Response(null, { status: 404 })

  const file_path = file.path

  switch (file.storage_type) {
    case 'local':
      const file = await LocalDriverGetFile(file_path, id)
      console.log(file)

      if (!file) throw new Error('File not found')
      return new Response(file.stream(), {
        headers: {
          'Content-Type': file.type,
          'Cache-Control': 'public, max-age=31536000',
        },
      })
    default:
      throw new Error('Unknown storage type')
  }
})

export default router

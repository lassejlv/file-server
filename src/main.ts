import { Hono } from 'hono'
import UploadRouter from './routes/upload'
import FilesRouter from './routes/files'

const app = new Hono()

app.route('/upload', UploadRouter)
app.route('/files', FilesRouter)

app.onError((err, c) => {
  c.status(500)
  return c.json({ error: err.message })
})

export default app

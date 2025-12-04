import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import * as z from 'zod'
import {
  LocalDriverUpload,
  LocalDriverInitChunkedUpload,
  LocalDriverUploadChunk,
  LocalDriverCompleteChunkedUpload,
  LocalDriverAbortChunkedUpload,
} from '../drivers/local'
import { S3DriverUpload, S3DriverInitChunkedUpload, S3DriverUploadChunk, S3DriverCompleteChunkedUpload, S3DriverAbortChunkedUpload } from '../drivers/s3'
import type { BunFile } from 'bun'
import { db } from '../db'
import { files } from '../db/schema'

const MAX_FILE_SIZE = Number(process.env.FILE_SERVER_MAX_FILE_SIZE) || 10 * 1024 * 1024 * 1024 // 10GB (chunked uploads support larger files)
const ALLOWED_FILE_TYPES = process.env.FILE_SERVER_ALLOWED_FILE_TYPES?.split(',') || []
const STORAGE_TYPE = process.env.FILE_SERVER_STORAGE_TYPE

// In-memory store for active chunked uploads (in production, use Redis or DB)
const activeUploads = new Map<string, { fileName: string; fileType: string; totalChunks: number; totalSize: number; storageType: string; createdAt: number }>()

// Cleanup old uploads every 5 minutes
setInterval(() => {
  const now = Date.now()
  const maxAge = 60 * 60 * 1000 // 1 hour
  for (const [uploadId, upload] of activeUploads.entries()) {
    if (now - upload.createdAt > maxAge) {
      activeUploads.delete(uploadId)
      if (upload.storageType === 'local') {
        LocalDriverAbortChunkedUpload(process.env.FILE_SERVER_STORAGE_PATH || './files', uploadId)
      } else if (upload.storageType === 's3') {
        S3DriverAbortChunkedUpload(uploadId)
      }
    }
  }
}, 5 * 60 * 1000)

const UploadSchema = z.object({
  file: z.any().refine((file: BunFile) => file instanceof File, 'file is not a File'),
})

const InitChunkedUploadSchema = z.object({
  fileName: z.string().min(1),
  fileType: z.string(),
  totalChunks: z.coerce.number().int().positive(),
  totalSize: z.coerce.number().int().positive(),
})

const ChunkUploadSchema = z.object({
  uploadId: z.string().uuid(),
  chunkIndex: z.coerce.number().int().min(0),
  chunk: z.any().refine((file: BunFile) => file instanceof File, 'chunk is not a File'),
})

const CompleteUploadSchema = z.object({
  uploadId: z.string().uuid(),
})

const router = new Hono()

// Legacy single-file upload (kept for backwards compatibility)
router.post('/', zValidator('form', UploadSchema), async (c) => {
  const body = c.req.valid('form')

  if (body.file.size > MAX_FILE_SIZE) throw new Error('File too large')
  if (!ALLOWED_FILE_TYPES.includes(body.file.type) && !ALLOWED_FILE_TYPES.includes('*')) throw new Error('File type not allowed')
  if (!STORAGE_TYPE) throw new Error('No storage type specified')

  let file_path = ''

  switch (STORAGE_TYPE) {
    case 'local':
      const filePath = await LocalDriverUpload(body.file, process.env.FILE_SERVER_STORAGE_PATH || './files')

      if (!filePath) throw new Error('Failed to upload file')

      file_path = filePath
      break
    case 's3':
      const filePathS3 = await S3DriverUpload(body.file)

      if (!filePathS3) throw new Error('Failed to upload file to S3')

      file_path = filePathS3
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

// Initialize chunked upload
router.post('/init', zValidator('json', InitChunkedUploadSchema), async (c) => {
  const { fileName, fileType, totalChunks, totalSize } = c.req.valid('json')

  if (totalSize > MAX_FILE_SIZE) throw new Error('File too large')
  if (!ALLOWED_FILE_TYPES.includes(fileType) && !ALLOWED_FILE_TYPES.includes('*')) throw new Error('File type not allowed')
  if (!STORAGE_TYPE) throw new Error('No storage type specified')

  let uploadId: string | null = null

  switch (STORAGE_TYPE) {
    case 'local':
      uploadId = await LocalDriverInitChunkedUpload(process.env.FILE_SERVER_STORAGE_PATH || './files')
      break
    case 's3':
      uploadId = await S3DriverInitChunkedUpload()
      break
    default:
      throw new Error('Unknown storage type')
  }

  if (!uploadId) throw new Error('Failed to initialize chunked upload')

  activeUploads.set(uploadId, {
    fileName,
    fileType,
    totalChunks,
    totalSize,
    storageType: STORAGE_TYPE,
    createdAt: Date.now(),
  })

  return c.json({ uploadId, message: 'Chunked upload initialized' })
})

// Upload a single chunk
router.post('/chunk', zValidator('form', ChunkUploadSchema), async (c) => {
  const { uploadId, chunkIndex, chunk } = c.req.valid('form')

  const uploadInfo = activeUploads.get(uploadId)
  if (!uploadInfo) throw new Error('Upload not found or expired')

  if (chunkIndex >= uploadInfo.totalChunks) throw new Error('Invalid chunk index')

  let success = false

  switch (uploadInfo.storageType) {
    case 'local':
      success = await LocalDriverUploadChunk(process.env.FILE_SERVER_STORAGE_PATH || './files', uploadId, chunkIndex, chunk)
      break
    case 's3':
      success = await S3DriverUploadChunk(uploadId, chunkIndex, chunk)
      break
    default:
      throw new Error('Unknown storage type')
  }

  if (!success) throw new Error('Failed to upload chunk')

  return c.json({ success: true, chunkIndex, message: `Chunk ${chunkIndex + 1}/${uploadInfo.totalChunks} uploaded` })
})

// Complete chunked upload
router.post('/complete', zValidator('json', CompleteUploadSchema), async (c) => {
  const { uploadId } = c.req.valid('json')

  const uploadInfo = activeUploads.get(uploadId)
  if (!uploadInfo) throw new Error('Upload not found or expired')

  let filePath: string | null = null

  switch (uploadInfo.storageType) {
    case 'local':
      filePath = await LocalDriverCompleteChunkedUpload(process.env.FILE_SERVER_STORAGE_PATH || './files', uploadId, uploadInfo.fileName, uploadInfo.totalChunks)
      break
    case 's3':
      filePath = await S3DriverCompleteChunkedUpload(uploadId, uploadInfo.fileName, uploadInfo.totalChunks)
      break
    default:
      throw new Error('Unknown storage type')
  }

  if (!filePath) throw new Error('Failed to complete chunked upload')

  // Clean up from active uploads
  activeUploads.delete(uploadId)

  const new_file = await db
    .insert(files)
    .values({
      path: filePath,
      name: uploadInfo.fileName,
      size: uploadInfo.totalSize,
      storage_type: uploadInfo.storageType,
    })
    .returning()

  return c.json({ file_path: `/files/uploads/${new_file[0]?.id}`, storage_type: uploadInfo.storageType, data: new_file[0] })
})

// Abort chunked upload
router.post('/abort', zValidator('json', CompleteUploadSchema), async (c) => {
  const { uploadId } = c.req.valid('json')

  const uploadInfo = activeUploads.get(uploadId)
  activeUploads.delete(uploadId)

  if (uploadInfo) {
    switch (uploadInfo.storageType) {
      case 'local':
        await LocalDriverAbortChunkedUpload(process.env.FILE_SERVER_STORAGE_PATH || './files', uploadId)
        break
      case 's3':
        await S3DriverAbortChunkedUpload(uploadId)
        break
    }
  }

  return c.json({ success: true, message: 'Upload aborted' })
})

export default router

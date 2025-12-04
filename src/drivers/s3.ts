import { type BunFile, s3 } from 'bun'
import { mkdir, readdir, unlink, rmdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

export const S3DriverUpload = async (file: BunFile): Promise<string | null> => {
  try {
    if (!file.name) return null
    const fileName = `${file.name.slice(0, file.name.lastIndexOf('.'))}-${Bun.randomUUIDv7()}-${file.name.slice(file.name.lastIndexOf('.'))}`
    const path = `uploads/${fileName}`
    await s3.write(path, file)
    return `/uploads/${fileName}`
  } catch (error) {
    console.error(error)
    return ''
  }
}

export const S3DriverGetFile = async (path: string): Promise<ArrayBuffer | null> => {
  try {
    const s3File = await s3.file(path).arrayBuffer()
    return s3File
  } catch (error) {
    console.error(error)
    return null
  }
}

export const S3DriverDeleteFile = async (path: string): Promise<boolean> => {
  try {
    await s3.file(path).delete()
    return true
  } catch (error) {
    console.error(error)
    return false
  }
}

// Chunked upload functions for S3
// Uses temp local storage for chunks, then streams to S3 on complete

const S3_CHUNKS_DIR = join(tmpdir(), 'file-server-s3-chunks')

export const S3DriverInitChunkedUpload = async (): Promise<string | null> => {
  try {
    const uploadId = Bun.randomUUIDv7()
    const chunksDir = join(S3_CHUNKS_DIR, uploadId)
    await mkdir(chunksDir, { recursive: true })
    return uploadId
  } catch (error) {
    console.error('Failed to init S3 chunked upload:', error)
    return null
  }
}

export const S3DriverUploadChunk = async (uploadId: string, chunkIndex: number, chunk: BunFile): Promise<boolean> => {
  try {
    const chunksDir = join(S3_CHUNKS_DIR, uploadId)
    const chunkPath = join(chunksDir, `chunk_${chunkIndex.toString().padStart(6, '0')}`)
    await Bun.write(chunkPath, chunk)
    return true
  } catch (error) {
    console.error('Failed to upload S3 chunk:', error)
    return false
  }
}

export const S3DriverCompleteChunkedUpload = async (uploadId: string, fileName: string, totalChunks: number): Promise<string | null> => {
  try {
    const chunksDir = join(S3_CHUNKS_DIR, uploadId)
    const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : ''
    const baseName = fileName.includes('.') ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName
    const finalFileName = `${baseName}-${Bun.randomUUIDv7()}${ext}`
    const s3Path = `uploads/${finalFileName}`

    // Read all chunks in order
    const chunkFiles = await readdir(chunksDir)
    chunkFiles.sort()

    if (chunkFiles.length !== totalChunks) {
      throw new Error(`Expected ${totalChunks} chunks but found ${chunkFiles.length}`)
    }

    // Concatenate all chunks into a single buffer
    const chunks: Uint8Array[] = []
    for (const chunkFile of chunkFiles) {
      const chunkPath = join(chunksDir, chunkFile)
      const chunkData = await Bun.file(chunkPath).arrayBuffer()
      chunks.push(new Uint8Array(chunkData))
    }

    const totalSize = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
    const finalData = new Uint8Array(totalSize)
    let offset = 0
    for (const chunk of chunks) {
      finalData.set(chunk, offset)
      offset += chunk.length
    }

    // Upload to S3
    await s3.write(s3Path, finalData)

    // Cleanup temp chunks
    for (const chunkFile of chunkFiles) {
      await unlink(join(chunksDir, chunkFile))
    }
    await rmdir(chunksDir)

    return `/uploads/${finalFileName}`
  } catch (error) {
    console.error('Failed to complete S3 chunked upload:', error)
    return null
  }
}

export const S3DriverAbortChunkedUpload = async (uploadId: string): Promise<boolean> => {
  try {
    const chunksDir = join(S3_CHUNKS_DIR, uploadId)
    const chunkFiles = await readdir(chunksDir).catch(() => [])
    for (const chunkFile of chunkFiles) {
      await unlink(join(chunksDir, chunkFile)).catch(() => {})
    }
    await rmdir(chunksDir).catch(() => {})
    return true
  } catch (error) {
    console.error('Failed to abort S3 chunked upload:', error)
    return false
  }
}

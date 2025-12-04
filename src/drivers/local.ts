import type { BunFile } from 'bun'
import { mkdir, readdir, unlink, rmdir } from 'node:fs/promises'
import { join } from 'path'

export const LocalDriverUpload = async (file: BunFile, path: string): Promise<string | null> => {
  try {
    if (!file.name) return null
    const fileName = `${file.name.slice(0, file.name.lastIndexOf('.'))}-${Bun.randomUUIDv7()}-${file.name.slice(file.name.lastIndexOf('.'))}`
    const filePath = `${path}/${fileName}`

    await Bun.write(filePath, file)

    return filePath
  } catch (error) {
    console.error(error)
    return null
  }
}

// Chunked upload functions
export const LocalDriverInitChunkedUpload = async (basePath: string): Promise<string | null> => {
  try {
    const uploadId = Bun.randomUUIDv7()
    const chunksDir = join(basePath, '.chunks', uploadId)
    await mkdir(chunksDir, { recursive: true })
    return uploadId
  } catch (error) {
    console.error('Failed to init chunked upload:', error)
    return null
  }
}

export const LocalDriverUploadChunk = async (basePath: string, uploadId: string, chunkIndex: number, chunk: BunFile): Promise<boolean> => {
  try {
    const chunksDir = join(basePath, '.chunks', uploadId)
    const chunkPath = join(chunksDir, `chunk_${chunkIndex.toString().padStart(6, '0')}`)
    await Bun.write(chunkPath, chunk)
    return true
  } catch (error) {
    console.error('Failed to upload chunk:', error)
    return false
  }
}

export const LocalDriverCompleteChunkedUpload = async (basePath: string, uploadId: string, fileName: string, totalChunks: number): Promise<string | null> => {
  try {
    const chunksDir = join(basePath, '.chunks', uploadId)
    const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : ''
    const baseName = fileName.includes('.') ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName
    const finalFileName = `${baseName}-${Bun.randomUUIDv7()}${ext}`
    const finalPath = join(basePath, finalFileName)

    // Read all chunks in order and write to final file
    const chunkFiles = await readdir(chunksDir)
    chunkFiles.sort() // Ensures chunk_000000, chunk_000001, etc. are in order

    if (chunkFiles.length !== totalChunks) {
      throw new Error(`Expected ${totalChunks} chunks but found ${chunkFiles.length}`)
    }

    // Create a write stream by concatenating all chunks
    const chunks: Uint8Array[] = []
    for (const chunkFile of chunkFiles) {
      const chunkPath = join(chunksDir, chunkFile)
      const chunkData = await Bun.file(chunkPath).arrayBuffer()
      chunks.push(new Uint8Array(chunkData))
    }

    // Concatenate all chunks
    const totalSize = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
    const finalData = new Uint8Array(totalSize)
    let offset = 0
    for (const chunk of chunks) {
      finalData.set(chunk, offset)
      offset += chunk.length
    }

    await Bun.write(finalPath, finalData)

    // Cleanup: delete chunk files and directory
    for (const chunkFile of chunkFiles) {
      await unlink(join(chunksDir, chunkFile))
    }
    await rmdir(chunksDir)

    return finalPath
  } catch (error) {
    console.error('Failed to complete chunked upload:', error)
    return null
  }
}

export const LocalDriverAbortChunkedUpload = async (basePath: string, uploadId: string): Promise<boolean> => {
  try {
    const chunksDir = join(basePath, '.chunks', uploadId)
    const chunkFiles = await readdir(chunksDir).catch(() => [])
    for (const chunkFile of chunkFiles) {
      await unlink(join(chunksDir, chunkFile)).catch(() => {})
    }
    await rmdir(chunksDir).catch(() => {})
    return true
  } catch (error) {
    console.error('Failed to abort chunked upload:', error)
    return false
  }
}

export const LocalDriverGetFile = async (path: string): Promise<BunFile | null> => {
  try {
    const file = Bun.file(path)
    return file
  } catch (error) {
    console.error(error)
    return null
  }
}

export const LocalDriverDeleteFile = async (path: string): Promise<boolean> => {
  try {
    const file = Bun.file(path)
    await file.delete()
    return true
  } catch (error) {
    console.error(error)
    return false
  }
}

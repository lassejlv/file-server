import type { BunFile } from 'bun'
import { CacheFile, redis } from '../lib/redis'

export const LocalDriverUpload = async (file: BunFile, path: string): Promise<string | null> => {
  try {
    if (!file.name) return null
    const buffer = await file.arrayBuffer()
    const fileName = `${file.name.slice(0, file.name.lastIndexOf('.'))}-${Bun.randomUUIDv7()}-${file.name.slice(file.name.lastIndexOf('.'))}`
    const filePath = `${path}/${fileName}`

    await Bun.write(filePath, Buffer.from(buffer))

    return filePath
  } catch (error) {
    console.error(error)
    return null
  }
}

export const LocalDriverGetFile = async (path: string, id: string): Promise<BunFile | null> => {
  try {
    const is_cached = await redis.get(id)

    if (is_cached) {
      return Bun.file(is_cached)
    }

    const file = Bun.file(path)
    const buffer = await file.arrayBuffer()
    await CacheFile(id, buffer)
    return file
  } catch (error) {
    console.error(error)
    return null
  }
}

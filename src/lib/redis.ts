import Redis from 'ioredis'

export const redis = new Redis(process.env.FILE_SERVER_REDIS_URL as string)

export const CacheFile = async (key: string, buffer: ArrayBuffer) => {
  await redis.set(key, Buffer.from(buffer), 'EX', 60 * 60 * 24) // 1 day
}

export const GetFileFromCache = async (key: string) => {
  return await redis.get(key)
}

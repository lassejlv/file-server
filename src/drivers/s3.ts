import { type BunFile, s3 } from 'bun'

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

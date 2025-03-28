import  { type BunFile, s3 } from "bun";

export const S3DriverUpload = async (file: BunFile, path: string): Promise<string | null> => {
  try {
    await s3.write(path, file)
    return `/files/uploads/${path}`
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

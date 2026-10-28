import { postFormData } from './http'
import type { ImageUploadResult, ImageUploadTarget } from '@/types/api'

/** 上传封面仅取得图片地址，作品仍由原有新增或修改接口保存。 */
export function uploadImage(file: File, targetType: ImageUploadTarget, signal?: AbortSignal) {
  const body = new FormData()
  body.append('file', file)
  body.append('targetType', targetType)
  return postFormData<ImageUploadResult>('/uploads/images', body, signal)
}

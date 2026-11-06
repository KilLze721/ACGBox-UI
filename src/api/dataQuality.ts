import { get } from './http'
import type { DataQualityPage, DataQualityQuery } from '@/types/api'

export function getDataQualityPage(query: DataQualityQuery, signal?: AbortSignal) {
  return get<DataQualityPage>('/data-quality/page', { ...query }, signal)
}

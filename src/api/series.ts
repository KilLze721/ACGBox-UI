import { get } from './http'
import type { PageResult, SeriesSummary } from '@/types/api'

export function getSeriesPage(pageNum = 1, pageSize = 100, signal?: AbortSignal) {
  return get<PageResult<SeriesSummary>>('/series/page', { pageNum, pageSize }, signal)
}

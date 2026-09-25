import { get } from './http'
import type { PageResult, SeriesSummary } from '@/types/api'

export function getSeriesPage(pageNum = 1, pageSize = 100, signal?: AbortSignal, name = '') {
  return get<PageResult<SeriesSummary>>('/series/page', { pageNum, pageSize, name }, signal)
}

export function getSeriesById(id: number, signal?: AbortSignal) {
  return get<SeriesSummary>(`/series/${id}`, {}, signal)
}

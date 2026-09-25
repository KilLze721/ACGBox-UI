import { get, post } from './http'
import type { PageResult, SeriesSummary } from '@/types/api'

export interface SeriesPayload {
  name: string
  description: string | null
}

export function getSeriesPage(pageNum = 1, pageSize = 100, signal?: AbortSignal, name = '') {
  return get<PageResult<SeriesSummary>>('/series/page', { pageNum, pageSize, name }, signal)
}

export function getSeriesById(id: number, signal?: AbortSignal) {
  return get<SeriesSummary>(`/series/${id}`, {}, signal)
}

export function createSeries(payload: SeriesPayload, signal?: AbortSignal) {
  return post<SeriesSummary>('/series/create', payload, signal)
}

export function updateSeries(payload: SeriesPayload & { id: number }, signal?: AbortSignal) {
  return post<SeriesSummary>('/series/update', payload, signal)
}

export function deleteSeries(ids: number[], signal?: AbortSignal) {
  return post<null>('/series/delete', ids, signal)
}

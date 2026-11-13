import { get, post } from './http'
import type { PageResult, SeriesSummary, SeriesWorksResult, SortDirection } from '@/types/api'

export interface SeriesPayload {
  name: string
  description: string | null
}

export function getSeriesPage(
  pageNum = 1,
  pageSize = 100,
  signal?: AbortSignal,
  name = '',
  sortBy?: 'NAME_INITIAL',
  sortDirection?: SortDirection,
) {
  return get<PageResult<SeriesSummary>>(
    '/series/page',
    { pageNum, pageSize, name, sortBy, sortDirection },
    signal,
  )
}

export function getSeriesById(id: number, signal?: AbortSignal) {
  return get<SeriesSummary>(`/series/${id}`, {}, signal)
}

// 在同一个请求中读取系列简介及按日期排列的作品页。
export function getSeriesWorks(id: number, pageNum: number, pageSize: number, signal?: AbortSignal) {
  return get<SeriesWorksResult>(`/series/${id}/works`, { pageNum, pageSize }, signal)
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

import { get, post } from './http'
import type { AnimePageItem, AnimePageQuery, PageResult } from '@/types/api'

export function getAnimePage(query: AnimePageQuery, signal?: AbortSignal) {
  return get<PageResult<AnimePageItem>>('/anime/page', query, signal)
}

export function deleteAnime(ids: number[], signal?: AbortSignal) {
  return post<null>('/anime/delete', { ids }, signal)
}

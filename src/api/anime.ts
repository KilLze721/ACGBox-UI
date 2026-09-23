import { get, post } from './http'
import type {
  AnimeDetail,
  AnimePageItem,
  AnimePageQuery,
  AnimePayload,
  PageResult,
} from '@/types/api'

export function getAnimePage(query: AnimePageQuery, signal?: AbortSignal) {
  return get<PageResult<AnimePageItem>>('/anime/page', query, signal)
}

export function deleteAnime(ids: number[], signal?: AbortSignal) {
  return post<null>('/anime/delete', ids, signal)
}

export function getAnimeDetail(id: number, signal?: AbortSignal) {
  return get<AnimeDetail>(`/anime/${id}`, {}, signal)
}

export function createAnime(payload: AnimePayload, signal?: AbortSignal) {
  return post<AnimeDetail>('/anime/create', payload, signal)
}

export function updateAnime(payload: AnimePayload & { id: number }, signal?: AbortSignal) {
  return post<AnimeDetail>('/anime/update', payload, signal)
}

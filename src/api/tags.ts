import { get, post } from './http'
import type { NamedOption, PageResult } from '@/types/api'

export function getTagPage(pageNum = 1, pageSize = 10, signal?: AbortSignal, name = '') {
  return get<PageResult<NamedOption>>('/tags/page', { pageNum, pageSize, name }, signal)
}

export function getTagById(id: number, signal?: AbortSignal) {
  return get<NamedOption>(`/tags/${id}`, {}, signal)
}

export function createTag(payload: { name: string }) {
  return post<NamedOption>('/tags/create', payload)
}

export function updateTag(payload: NamedOption) {
  return post<NamedOption>('/tags/update', payload)
}

export function deleteTags(ids: number[]) {
  return post<null>('/tags/delete', ids)
}

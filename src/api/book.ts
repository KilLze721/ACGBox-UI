import { get, post } from './http'
import type { PageResult, SortableNamedOption } from '@/types/api'
import type { BookDetail, BookPageItem, BookPageQuery, BookPayload } from '@/types/book'

export function getBookPage(query: BookPageQuery, signal?: AbortSignal) {
  return get<PageResult<BookPageItem>>('/book/page', query, signal)
}
export function getBookDetail(id: number, signal?: AbortSignal) {
  return get<BookDetail>(`/book/${id}`, {}, signal)
}
export function createBook(payload: BookPayload) {
  return post<BookDetail>('/book/create', payload)
}
export function updateBook(payload: BookPayload & { id: number }) {
  return post<BookDetail>('/book/update', payload)
}
export function deleteBooks(ids: number[]) {
  return post<null>('/book/delete', ids)
}
export function getBookTypes(signal?: AbortSignal) {
  return get<SortableNamedOption[]>('/book-type/list', {}, signal)
}
export function getBookTypeById(id: number, signal?: AbortSignal) {
  return get<SortableNamedOption>(`/book-type/${id}`, {}, signal)
}
export function createBookType(payload: { name: string; sortOrder: number }) {
  return post<SortableNamedOption>('/book-type/create', payload)
}
export function updateBookType(payload: { id: number; name: string; sortOrder: number }) {
  return post<SortableNamedOption>('/book-type/update', payload)
}
export function deleteBookTypes(ids: number[]) {
  return post<null>('/book-type/delete', ids)
}

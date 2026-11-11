import { get, post } from './http'
import type { PageResult, Person, SortDirection } from '@/types/api'

export function getPersonsPage(
  pageNum: number,
  pageSize: number,
  name = '',
  signal?: AbortSignal,
  sortBy?: 'NAME_INITIAL',
  sortDirection?: SortDirection,
) {
  return get<PageResult<Person>>(
    '/persons/page',
    { pageNum, pageSize, name, sortBy, sortDirection },
    signal,
  )
}

export function getPersonById(id: number, signal?: AbortSignal) {
  return get<Person>(`/persons/${id}`, {}, signal)
}

export function createPerson(payload: { name: string; description: string | null }) {
  return post<Person>('/persons/create', payload)
}

export function updatePerson(payload: { id: number; name: string; description: string | null }) {
  return post<Person>('/persons/update', payload)
}

export function deletePersons(ids: number[]) {
  return post<null>('/persons/delete', ids)
}

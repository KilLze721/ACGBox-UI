import { get, post } from './http'
import type {
  PageResult,
  UserAccount,
  UserAccountCreateDTO,
  UserAccountDTO,
  UserAccountPageQuery,
} from '@/types/api'

export function getUsersPage(query: UserAccountPageQuery, signal?: AbortSignal) {
  return get<PageResult<UserAccount>>('/admin/users/page', query, signal)
}

export function getUserById(id: number, signal?: AbortSignal) {
  return get<UserAccount>(`/admin/users/${id}`, {}, signal)
}

export function createUser(payload: UserAccountCreateDTO) {
  return post<UserAccount>('/admin/users/create', payload)
}

export function updateUser(payload: UserAccountDTO) {
  return post<UserAccount>('/admin/users/update', payload)
}

export function resetUserPassword(payload: {
  id: number
  currentPassword: string
  newPassword: string
}) {
  return post<null>('/admin/users/reset-password', payload)
}

export function deleteUser(payload: { id: number; currentPassword: string }) {
  return post<null>('/admin/users/delete', payload)
}

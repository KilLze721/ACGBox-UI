import { post } from './http'
import type { LoginResult } from '@/types/api'

export function loginByUsername(payload: { username: string; password: string }) {
  return post<LoginResult>('/admin/login/username', payload)
}

export function loginByEmail(payload: { email: string; password: string }) {
  return post<LoginResult>('/admin/login/email-password', payload)
}

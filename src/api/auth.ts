import { post } from './http'
import type { LoginResult } from '@/types/api'

export function loginByUsername(payload: { username: string; password: string }) {
  return post<LoginResult>('/admin/login/username', payload)
}

export function loginByEmail(payload: { email: string; password: string }) {
  return post<LoginResult>('/admin/login/email-password', payload)
}

export function sendLoginEmailCode(payload: { email: string }) {
  return post<null>('/admin/login/email-code/send', payload)
}

export function loginByEmailCode(payload: { email: string; verificationCode: string }) {
  return post<LoginResult>('/admin/login/email-code', payload)
}

export function logout() {
  return post<null>('/admin/logout', {})
}

import { get, post } from './http'
import type {
  LoginResult,
  UserAccount,
  UserAccountEmailChangeVO,
  UserAccountEmailPurpose,
} from '@/types/api'

export function getCurrentAccount(signal?: AbortSignal) {
  return get<UserAccount>('/admin/account', {}, signal)
}

export function changeCurrentAccountPassword(payload: {
  currentPassword: string
  newPassword: string
}) {
  return post<LoginResult>('/admin/account/change-password', payload)
}

export function sendCurrentAccountEmailCode(payload: {
  purpose: UserAccountEmailPurpose
  email?: string
  emailChangeToken?: string
}) {
  return post<null>('/admin/account/email/code', payload)
}

export function verifyCurrentAccountEmail(payload: { currentEmailCode: string }) {
  return post<UserAccountEmailChangeVO>('/admin/account/email/verify-current', payload)
}

export function bindCurrentAccountEmail(payload: {
  email: string
  newEmailCode: string
  emailChangeToken?: string
}) {
  return post<LoginResult>('/admin/account/email', payload)
}

export function unbindCurrentAccountEmail(payload: { verificationCode: string }) {
  return post<LoginResult>('/admin/account/email/unbind', payload)
}

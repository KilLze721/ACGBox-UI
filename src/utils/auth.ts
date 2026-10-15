import type { LoginResult } from '@/types/api'

export const authExpiredEvent = 'acgbox:unauthorized'

export function getToken(): string | null {
  const token = sessionStorage.getItem('acgbox-token')
  const expiresAt = sessionStorage.getItem('acgbox-token-expires-at')
  if (token && expiresAt && Date.now() >= Number(expiresAt)) {
    clearLogin()
    return null
  }
  return token
}

export function saveLogin(result: LoginResult) {
  const { token, expiresIn, id, username, role } = result
  sessionStorage.setItem('acgbox-token', token)
  sessionStorage.setItem('acgbox-token-expires-at', String(Date.now() + expiresIn * 1000))
  sessionStorage.setItem('acgbox-user', JSON.stringify({ id, username, role }))
}

export function getCurrentUser(): Pick<LoginResult, 'id' | 'username' | 'role'> | null {
  const user = sessionStorage.getItem('acgbox-user')
  if (!user) return null
  try {
    return JSON.parse(user)
  } catch {
    return null
  }
}

export function clearLogin() {
  sessionStorage.removeItem('acgbox-token')
  sessionStorage.removeItem('acgbox-token-expires-at')
  sessionStorage.removeItem('acgbox-user')
}

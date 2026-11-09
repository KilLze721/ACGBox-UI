import type { LoginResult } from '@/types/api'

export const authExpiredEvent = 'acgbox:unauthorized'
const tokenKey = 'acgbox-token'
const expiresKey = 'acgbox-token-expires-at'
const userKey = 'acgbox-user'
const loginKeys = [expiresKey, userKey, tokenKey]
let expiryTimer: number | undefined

function clearSessionLogin() {
  loginKeys.forEach((key) => sessionStorage.removeItem(key))
}

function scheduleExpiry() {
  window.clearTimeout(expiryTimer)
  expiryTimer = undefined
  const expiresAt = localStorage.getItem(expiresKey)
  if (!localStorage.getItem(tokenKey) || !expiresAt) return
  const remaining = Number(expiresAt) - Date.now()
  if (remaining <= 0 || !Number.isFinite(remaining)) {
    clearLogin()
    window.dispatchEvent(new Event(authExpiredEvent))
    return
  }
  // 长有效期分段计时，唤醒后重新核对服务端返回的截止时间。
  expiryTimer = window.setTimeout(scheduleExpiry, Math.min(remaining, 2147483647))
}

export function getToken(): string | null {
  // 只在尚无持久登录时迁移旧会话，迁移后清除旧副本。
  if (!localStorage.getItem(tokenKey) && sessionStorage.getItem(tokenKey)) {
    loginKeys.forEach((key) => {
      const value = sessionStorage.getItem(key)
      if (value !== null) localStorage.setItem(key, value)
    })
  }
  clearSessionLogin()
  const token = localStorage.getItem(tokenKey)
  const expiresAt = localStorage.getItem(expiresKey)
  if (
    token &&
    expiresAt &&
    (!Number.isFinite(Number(expiresAt)) || Date.now() >= Number(expiresAt))
  ) {
    clearLogin()
    window.dispatchEvent(new Event(authExpiredEvent))
    return null
  }
  return token
}

export function saveLogin(result: LoginResult) {
  const { token, expiresIn, id, username, role } = result
  localStorage.setItem(expiresKey, String(Date.now() + expiresIn * 1000))
  localStorage.setItem(userKey, JSON.stringify({ id, username, role }))
  localStorage.setItem(tokenKey, token)
  clearSessionLogin()
  scheduleExpiry()
}

export function getCurrentUser(): Pick<LoginResult, 'id' | 'username' | 'role'> | null {
  if (!getToken()) return null
  const user = localStorage.getItem(userKey)
  if (!user) return null
  try {
    return JSON.parse(user)
  } catch {
    return null
  }
}

export function clearLogin() {
  window.clearTimeout(expiryTimer)
  expiryTimer = undefined
  clearSessionLogin()
  loginKeys.forEach((key) => localStorage.removeItem(key))
}

export function initializeAuth(onAccountChange: () => void) {
  getToken()
  scheduleExpiry()
  function syncLogin(event: StorageEvent) {
    if (event.storageArea !== localStorage || (event.key !== tokenKey && event.key !== null)) return
    // 延迟到达的旧事件不能影响另一个标签刚保存的新登录。
    if (event.key === tokenKey && event.newValue !== localStorage.getItem(tokenKey)) return
    clearSessionLogin()
    if (!getToken()) {
      window.clearTimeout(expiryTimer)
      window.dispatchEvent(new Event(authExpiredEvent))
    } else {
      scheduleExpiry()
      onAccountChange()
    }
  }
  function checkExpiry() {
    if (localStorage.getItem(tokenKey)) scheduleExpiry()
  }
  window.addEventListener('storage', syncLogin)
  window.addEventListener('focus', checkExpiry)
  document.addEventListener('visibilitychange', checkExpiry)
  return () => {
    window.clearTimeout(expiryTimer)
    window.removeEventListener('storage', syncLogin)
    window.removeEventListener('focus', checkExpiry)
    document.removeEventListener('visibilitychange', checkExpiry)
  }
}

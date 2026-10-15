import type { ApiResult } from '@/types/api'
import { authExpiredEvent, clearLogin, getToken } from '@/utils/auth'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api'

async function parseResult<T>(
  response: Response,
  requestToken: string | null,
  loginRequest = false,
): Promise<T> {
  if (response.status === 401) {
    // 只清理本次请求使用的登录状态，避免旧请求影响刚完成的新登录。
    if (!loginRequest && requestToken === sessionStorage.getItem('acgbox-token')) {
      clearLogin()
      window.dispatchEvent(new Event(authExpiredEvent))
    }
    throw new Error(loginRequest ? '登录失败，请检查账号和密码。' : '登录已失效，请重新登录。')
  }
  if (response.status === 403) {
    throw new Error('此账号无管理端访问权限。')
  }
  if (!response.ok) {
    throw new Error(`请求失败（HTTP ${response.status}）`)
  }

  const result = (await response.json()) as ApiResult<T>
  if (result.code !== 200) {
    throw new Error(result.message || '接口返回失败')
  }

  return result.data
}

export async function get<T>(path: string, query: object = {}, signal?: AbortSignal): Promise<T> {
  const searchParams = new URLSearchParams()

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === '') return
    searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value))
  })

  const queryString = searchParams.toString()
  const token = getToken()
  const response = await fetch(`${apiBaseUrl}${path}${queryString ? `?${queryString}` : ''}`, {
    signal,
    headers: getHeaders(token),
  })

  return parseResult<T>(response, token)
}

export async function post<T>(path: string, body: object, signal?: AbortSignal): Promise<T> {
  const loginRequest = path.startsWith('/admin/login/')
  const token = loginRequest ? null : getToken()
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    signal,
    headers: {
      ...getHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  return parseResult<T>(response, token, loginRequest)
}

/**
 * 读取登录令牌并生成公共请求头。
 */
function getHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

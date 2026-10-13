import type { ApiResult } from '@/types/api'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api'

async function parseResult<T>(response: Response): Promise<T> {
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
  const response = await fetch(`${apiBaseUrl}${path}${queryString ? `?${queryString}` : ''}`, {
    signal,
    headers: getHeaders(),
  })

  return parseResult<T>(response)
}

export async function post<T>(path: string, body: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    signal,
    headers: {
      ...getHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  return parseResult<T>(response)
}

/**
 * 读取登录令牌并生成公共请求头。
 */
function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  const token = sessionStorage.getItem('acgbox-token')
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}


import type { ApiResult } from '@/types/api'
import { authExpiredEvent, clearLogin, getToken } from '@/utils/auth'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api'

export class ApiError extends Error {
  constructor(
    message: string,
    public data?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function parseResult<T>(
  response: Response,
  requestToken: string | null,
  loginRequest = false,
  multipartRequest = false,
  tooLargeMessage = '图片不能超过 5 MiB，上传请求不能超过 6 MiB。',
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
  if (multipartRequest && response.status === 413) {
    let message = ''
    try {
      const result = (await response.json()) as ApiResult<unknown>
      if (typeof result.message === 'string') message = result.message
    } catch {
      // 代理可能返回空响应或 HTML，使用明确的上传大小提示。
    }
    throw new Error(message || tooLargeMessage)
  }
  if (!response.ok) {
    throw new Error(`请求失败（HTTP ${response.status}）`)
  }

  const result = (await response.json()) as ApiResult<T>
  if (result.code !== 200) {
    throw new ApiError(result.message || '接口返回失败', result.data)
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

/** 提交文件表单，Content-Type 和 boundary 由浏览器生成。 */
export async function postFormData<T>(
  path: string,
  body: FormData,
  signal?: AbortSignal,
  tooLargeMessage?: string,
): Promise<T> {
  const token = getToken()
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    signal,
    headers: getHeaders(token),
    body,
  })
  return parseResult<T>(response, token, false, true, tooLargeMessage)
}

/** 下载需鉴权的文件，JSON 错误仍交给统一认证与业务错误处理。 */
export async function downloadFile(path: string, body?: object, signal?: AbortSignal) {
  const token = getToken()
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: body ? 'POST' : 'GET',
    signal,
    headers: {
      ...getHeaders(token),
      Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!response.ok || contentType.includes('json')) {
    await parseResult(response, token)
    throw new Error('未收到 Excel 文件，请重试。')
  }
  if (!contentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
    throw new Error('服务器返回的文件格式不正确。')
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
  let filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? 'ACGBox.xlsx'
  if (encoded) {
    try {
      filename = decodeURIComponent(encoded)
    } catch {
      /* 使用普通文件名作为回退。 */
    }
  }
  filename = filename.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
  if (!filename.toLowerCase().endsWith('.xlsx')) filename = 'ACGBox.xlsx'
  return { blob: await response.blob(), filename }
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

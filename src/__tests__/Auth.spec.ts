import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import router from '@/router'
import { get } from '@/api/http'
import { clearLogin } from '@/utils/auth'

afterEach(() => vi.unstubAllGlobals())

describe('管理端认证接入', () => {
  it('未登录访问管理页面转到登录页，保留原始路由参数', async () => {
    clearLogin()
    await router.push('/admin/series?name=测试系列')
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/admin/series?name=测试系列')
    expect(document.title).toBe('登录 · ACGBox')
  })

  it('已有令牌仍通过现有请求头发送，过期状态阻止管理路由访问', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ code: 200, data: [] }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    await get('/region/list')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/region/list',
      expect.objectContaining({
        headers: { Accept: 'application/json', Authorization: 'Bearer test-admin-token' },
      }),
    )
    sessionStorage.setItem('acgbox-token-expires-at', String(Date.now() - 1))
    await router.push('/admin/regions')
    expect(router.currentRoute.value.path).toBe('/login')
    expect(sessionStorage.getItem('acgbox-token')).toBeNull()
  })

  it('空响应的 HTTP 401 清理认证状态并转到登录页，403保留登录态并提示权限错误', async () => {
    await router.push('/admin/regions')
    const json = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401, json })),
    )
    await expect(get('/region/list')).rejects.toThrow('登录已失效')
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
    expect(router.currentRoute.value.query.reason).toBe('expired')
    expect(sessionStorage.getItem('acgbox-token')).toBeNull()
    expect(json).not.toHaveBeenCalled()
    sessionStorage.setItem('acgbox-token', 'valid-token')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 403, json })),
    )
    await expect(get('/region/list')).rejects.toThrow('无管理端访问权限')
    expect(sessionStorage.getItem('acgbox-token')).toBe('valid-token')
  })

  it('旧请求的401不清理新登录的令牌', async () => {
    let resolveRequest!: (value: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveRequest = resolve
          }),
      ),
    )
    const pending = get('/region/list')
    sessionStorage.setItem('acgbox-token', 'new-login-token')
    resolveRequest({ ok: false, status: 401 } as Response)
    await expect(pending).rejects.toThrow('登录已失效')
    expect(sessionStorage.getItem('acgbox-token')).toBe('new-login-token')
  })
})

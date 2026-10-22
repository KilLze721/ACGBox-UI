import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import App from '@/App.vue'
import router from '@/router'

const wrappers: VueWrapper[] = []
function mockApi() {
  let failure = ''
  let status = 200
  let hold = false
  let release: (() => void) | undefined
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname.endsWith('/admin/logout')) {
      if (hold)
        await new Promise<void>((resolve) => {
          release = resolve
        })
      return {
        ok: status === 200,
        status,
        json: async () => ({ code: failure ? 400 : 200, message: failure, data: null }),
      }
    }
    const data = url.pathname.endsWith('/page')
      ? { pageNum: 1, pageSize: 10, total: 0, pages: 0, rows: [] }
      : []
    return { ok: true, status: 200, json: async () => ({ code: 200, data }) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return {
    fetchMock,
    logoutRequests: () =>
      fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/admin/logout')),
    fail: (message: string) => {
      failure = message
    },
    expire: () => {
      status = 401
    },
    hold: () => {
      hold = true
    },
    release: () => release?.(),
  }
}
async function render(path = '/admin/dashboard') {
  sessionStorage.setItem('acgbox-user', JSON.stringify({ id: 1, username: 'Admin', role: 'ADMIN' }))
  sessionStorage.setItem('acgbox-token-expires-at', String(Date.now() + 3600000))
  await router.push(path)
  const wrapper = mount(App, { attachTo: document.body, global: { plugins: [router] } })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
async function clickLogout(wrapper: VueWrapper) {
  await wrapper.get('.avatar-button').trigger('click')
  await wrapper.get('.user-menu-logout').trigger('click')
  await flushPromises()
}
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
})

describe('退出登录', () => {
  it('携带当前令牌调用退出接口，成功清除本地登录状态并返回登录页', async () => {
    const api = mockApi()
    const wrapper = await render()
    await clickLogout(wrapper)
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
    expect(api.logoutRequests()).toHaveLength(1)
    expect(api.fetchMock).toHaveBeenCalledWith(
      '/api/admin/logout',
      expect.objectContaining({
        method: 'POST',
        body: '{}',
        headers: expect.objectContaining({ Authorization: 'Bearer test-admin-token' }),
      }),
    )
    expect(sessionStorage.getItem('acgbox-token')).toBeNull()
    expect(sessionStorage.getItem('acgbox-user')).toBeNull()
    expect(sessionStorage.getItem('acgbox-token-expires-at')).toBeNull()
    expect(router.currentRoute.value.path).toBe('/login')
    expect(wrapper.find('.workspace-tabbar').exists()).toBe(false)
    await router.push('/admin/dashboard')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('请求期间禁用退出按钮，避免重复提交', async () => {
    const api = mockApi()
    api.hold()
    const wrapper = await render()
    await clickLogout(wrapper)
    await wrapper.get('.avatar-button').trigger('click')
    const button = wrapper.get('.user-menu-logout')
    expect(button.text()).toContain('正在退出')
    expect(button.attributes('disabled')).toBeDefined()
    await button.trigger('click')
    expect(api.logoutRequests()).toHaveLength(1)
    expect(sessionStorage.getItem('acgbox-token')).toBe('test-admin-token')
    api.release()
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('退出失败保留用户和页面，显示后端错误并允许重试', async () => {
    const api = mockApi()
    api.fail('退出服务暂不可用')
    const wrapper = await render()
    await clickLogout(wrapper)
    expect(wrapper.get('.user-menu-error').text()).toBe('退出服务暂不可用')
    expect(sessionStorage.getItem('acgbox-token')).toBe('test-admin-token')
    expect(sessionStorage.getItem('acgbox-user')).not.toBeNull()
    expect(router.currentRoute.value.path).toBe('/admin/dashboard')
    api.fail('')
    await wrapper.get('.user-menu-logout').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
    expect(api.logoutRequests()).toHaveLength(2)
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('过期令牌的 401 沿用现有认证清理流程', async () => {
    const api = mockApi()
    api.expire()
    const wrapper = await render()
    await clickLogout(wrapper)
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
    expect(sessionStorage.getItem('acgbox-token')).toBeNull()
    expect(router.currentRoute.value.path).toBe('/login')
    expect(wrapper.find('.user-menu-error').exists()).toBe(false)
  })

  it('退出前检查未保存标签，取消时保留输入，确认放弃后才退出', async () => {
    const api = mockApi()
    const wrapper = await render('/admin/anime/create')
    await wrapper.get('input[placeholder="输入正式名称"]').setValue('尚未保存的作品')
    await clickLogout(wrapper)
    const body = new DOMWrapper(document.body)
    expect(body.get('.workspace-close-layer').text()).toContain('尚未保存')
    expect(body.get('.workspace-close-layer').text()).toContain('退出登录将关闭所有页面')
    expect(api.logoutRequests()).toHaveLength(0)
    await body.get('.workspace-close-layer .secondary-button').trigger('click')
    expect(wrapper.get('input[placeholder="输入正式名称"]').element).toHaveProperty(
      'value',
      '尚未保存的作品',
    )
    expect(sessionStorage.getItem('acgbox-token')).not.toBeNull()
    await clickLogout(wrapper)
    await body.get('.workspace-close-layer .primary-button').trigger('click')
    await flushPromises()
    expect(api.logoutRequests()).toHaveLength(1)
    expect(router.currentRoute.value.path).toBe('/login')
  })
})

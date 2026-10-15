import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import router from '@/router'
import LoginView from '@/views/LoginView.vue'
import { clearLogin } from '@/utils/auth'

const loginResult = {
  token: 'server-issued-test-token',
  expiresIn: 7200,
  id: 1,
  username: 'admin',
  role: 'ADMIN',
}
const wrappers: ReturnType<typeof mount>[] = []

function renderLogin() {
  const wrapper = mount(LoginView, { global: { plugins: [router] } })
  wrappers.push(wrapper)
  return wrapper
}

function response(code = 200, message = '操作成功') {
  return {
    ok: true,
    status: 200,
    json: async () => ({ code, message, data: code === 200 ? loginResult : null }),
  } as Response
}

beforeEach(async () => {
  clearLogin()
  await router.push('/login')
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
})

describe('登录页面', () => {
  it('切换账号与邮箱模式，校验必填和邮箱格式，支持密码显示切换', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = renderLogin()
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('#identityError').text()).toBe('请输入账号。')
    expect(wrapper.get('#passwordError').text()).toBe('请输入密码。')
    await wrapper.get('#emailTab').trigger('click')
    expect(wrapper.get('#identityInput').attributes('name')).toBe('email')
    expect(wrapper.get('#identityError').text()).toBe('')
    await wrapper.get('#identityInput').setValue('invalid-email')
    await wrapper.get('#identityInput').trigger('blur')
    expect(wrapper.get('#identityError').text()).toContain('邮箱格式不正确')
    await wrapper.get('#passwordInput').setValue('secret')
    await wrapper.get('.password-toggle').trigger('click')
    expect(wrapper.get('#passwordInput').attributes('type')).toBe('text')
    await wrapper.get('form').trigger('submit')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(wrapper.find('[name="captcha"]').exists()).toBe(false)
    expect(wrapper.find('[name="code"]').exists()).toBe(false)
  })

  it('账号登录只提交用户名和原始密码，保存真实响应并进入默认页面', async () => {
    const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => response())
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = renderLogin()
    sessionStorage.setItem('acgbox-token', 'old-token')
    await wrapper.get('#identityInput').setValue(' Admin ')
    await wrapper.get('#passwordInput').setValue(' secret ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/login/username',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'Admin', password: ' secret ' }),
      }),
    )
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Authorization')
    expect(sessionStorage.getItem('acgbox-token')).toBe(loginResult.token)
    expect(JSON.parse(sessionStorage.getItem('acgbox-user')!)).toEqual({
      id: 1,
      username: 'admin',
      role: 'ADMIN',
    })
    expect(Number(sessionStorage.getItem('acgbox-token-expires-at'))).toBeGreaterThan(Date.now())
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/admin/dashboard'))
  })

  it('邮箱登录保留大小写，提交期间禁止重复提交，完成后恢复原管理地址', async () => {
    await router.push({ path: '/login', query: { redirect: '/admin/anime?keyword=测试动画' } })
    let resolveRequest!: (value: Response) => void
    const fetchMock = vi.fn(
      (_input: string, _init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = renderLogin()
    await wrapper.get('#emailTab').trigger('click')
    await wrapper.get('#identityInput').setValue('Admin@Example.com')
    await wrapper.get('#passwordInput').setValue('secret')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('.submit-button').attributes('disabled')).toBeDefined()
    expect(wrapper.get('#usernameTab').attributes('disabled')).toBeDefined()
    await wrapper.get('form').trigger('submit')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/login/email-password',
      expect.objectContaining({
        body: JSON.stringify({ email: 'Admin@Example.com', password: 'secret' }),
      }),
    )
    resolveRequest(response())
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/admin/anime'))
    expect(router.currentRoute.value.query.keyword).toBe('测试动画')
  })

  it('展示服务端登录失败信息，不写入成功状态，允许再次提交', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(500, '此账号已被禁用')),
    )
    const wrapper = renderLogin()
    await wrapper.get('#identityInput').setValue('admin')
    await wrapper.get('#passwordInput').setValue('secret')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('此账号已被禁用')
    expect(sessionStorage.getItem('acgbox-token')).toBeNull()
    expect(wrapper.get('.submit-button').attributes('disabled')).toBeUndefined()
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('外部跳转地址不作为登录后的目标', async () => {
    await router.push({ path: '/login', query: { redirect: '//example.com' } })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response()),
    )
    const wrapper = renderLogin()
    await wrapper.get('#identityInput').setValue('admin')
    await wrapper.get('#passwordInput').setValue('secret')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/admin/dashboard'))
  })
})

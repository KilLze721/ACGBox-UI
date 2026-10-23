import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import router from '@/router'
import LoginView from '@/views/admin/login/LoginView.vue'
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
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('登录页面', () => {
  async function renderEmailCodeLogin() {
    const wrapper = renderLogin()
    await wrapper.get('#emailTab').trigger('click')
    await wrapper.get('.credential-mode').trigger('click')
    return wrapper
  }

  it.each(['username', 'email', 'email-code'])(
    '%s 登录错误使用固定提示区域，清除错误不增减表单行',
    async (mode) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => response(500, '账号或密码错误')),
      )
      const wrapper = mode === 'email-code' ? await renderEmailCodeLogin() : renderLogin()
      if (mode === 'email') await wrapper.get('#emailTab').trigger('click')
      const slot = wrapper.get('.feedback-slot').element
      const submitButton = wrapper.get('.submit-button').element
      const rowCount = wrapper.get('form').element.children.length
      expect(rowCount).toBe(3)
      expect(wrapper.get('#passwordInput').element.closest('.field')?.contains(slot)).toBe(true)
      expect(wrapper.get('#passwordInput').attributes('aria-describedby')).toBe(slot.id)
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
      await wrapper
        .get('#identityInput')
        .setValue(mode === 'username' ? 'admin' : 'Editor@Example.com')
      await wrapper.get('#passwordInput').setValue(mode === 'email-code' ? '003821' : 'secret')
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(wrapper.get('.feedback-slot').element).toBe(slot)
      expect(wrapper.get('form').element.children.length).toBe(rowCount)
      expect(wrapper.get('.feedback-slot [role="alert"]').text()).toBe('账号或密码错误')
      expect(wrapper.get('.feedback-slot [role="alert"]').attributes('tabindex')).toBe('0')
      expect(wrapper.get('.submit-button').element).toBe(submitButton)
      await wrapper.get('#passwordInput').setValue(mode === 'email-code' ? '003822' : 'retry')
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
      expect(wrapper.get('.feedback-slot').element).toBe(slot)
      expect(wrapper.get('form').element.children.length).toBe(rowCount)
    },
  )

  it('较长的接口错误保留完整文字，仍显示在同一提示区域', async () => {
    const message = '登录服务暂不可用，请检查网络连接后重试。'.repeat(20)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(500, message)),
    )
    const wrapper = renderLogin()
    await wrapper.get('#identityInput').setValue('admin')
    await wrapper.get('#passwordInput').setValue('secret')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('.feedback-slot [role="alert"]').text()).toBe(message)
    expect(wrapper.get('.submit-button').attributes('disabled')).toBeUndefined()
  })

  it('仅在邮箱登录提供验证码切换，替换原密码栏并可切回密码登录', async () => {
    const wrapper = renderLogin()
    expect(wrapper.find('.credential-mode').exists()).toBe(false)
    await wrapper.get('#emailTab').trigger('click')
    expect(wrapper.get('.credential-mode').text()).toBe('验证码登录')
    expect(wrapper.find('.field-label .credential-mode').exists()).toBe(false)
    expect(wrapper.get('.input-shell + .credential-help .credential-mode').text()).toBe(
      '验证码登录',
    )
    await wrapper.get('#passwordInput').setValue('old-password')
    await wrapper.get('.credential-mode').trigger('click')
    expect(wrapper.find('[name="password"]').exists()).toBe(false)
    expect(wrapper.get('[name="verificationCode"]').attributes('autocomplete')).toBe(
      'one-time-code',
    )
    expect(wrapper.find('.password-toggle').exists()).toBe(false)
    expect(wrapper.get('.credential-help .credential-mode').text()).toBe('密码登录')
    await wrapper.get('#passwordInput').setValue('003821')
    await wrapper.get('.credential-mode').trigger('click')
    expect(wrapper.get('#passwordInput').attributes('type')).toBe('password')
    expect((wrapper.get('#passwordInput').element as HTMLInputElement).value).toBe('')
    await wrapper.get('#usernameTab').trigger('click')
    expect(wrapper.find('.credential-mode').exists()).toBe(false)
    expect(wrapper.find('.send-code').exists()).toBe(false)
  })

  it('验证码登录保留邮箱大小写和验证码前导零，不发送密码或旧令牌', async () => {
    const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => response())
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = await renderEmailCodeLogin()
    sessionStorage.setItem('acgbox-token', 'stale-token')
    await wrapper.get('#identityInput').setValue('Editor@Example.com')
    await wrapper.get('#passwordInput').setValue('003821')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/login/email-code',
      expect.objectContaining({
        body: JSON.stringify({ email: 'Editor@Example.com', verificationCode: '003821' }),
      }),
    )
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Authorization')
    expect(sessionStorage.getItem('acgbox-token')).toBe(loginResult.token)
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/admin/dashboard'))
  })

  it('校验邮箱与六位验证码，修改邮箱后清空旧验证码', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = await renderEmailCodeLogin()
    await wrapper.get('.send-code').trigger('click')
    expect(wrapper.get('#identityError').text()).toBe('请输入邮箱。')
    await wrapper.get('#identityInput').setValue('invalid')
    await wrapper.get('.send-code').trigger('click')
    expect(wrapper.get('#identityError').text()).toContain('邮箱格式不正确')
    await wrapper.get('#identityInput').setValue('Editor@Example.com')
    await wrapper.get('#passwordInput').setValue('12ab')
    expect((wrapper.get('#passwordInput').element as HTMLInputElement).value).toBe('12')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('#passwordError').text()).toBe('请输入 6 位数字验证码。')
    expect(fetchMock).not.toHaveBeenCalled()
    await wrapper.get('#passwordInput').setValue('003821')
    await wrapper.get('#identityInput').setValue('Other@Example.com')
    expect((wrapper.get('#passwordInput').element as HTMLInputElement).value).toBe('')
  })

  it('发送验证码只提交邮箱，禁止并发发送与登录，切换模式不会重置冷却', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    let resolveRequest!: (value: Response) => void
    const fetchMock = vi.fn(
      (_input: string, _init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = await renderEmailCodeLogin()
    sessionStorage.setItem('acgbox-token', 'stale-token')
    await wrapper.get('#identityInput').setValue('Editor@Example.com')
    await wrapper.get('.send-code').trigger('click')
    expect(wrapper.get('.send-code').text()).toBe('发送中…')
    expect(wrapper.get('.credential-mode').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.submit-button').attributes('disabled')).toBeDefined()
    await wrapper.get('.send-code').trigger('click')
    await wrapper.get('form').trigger('submit')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/login/email-code/send',
      expect.objectContaining({
        body: JSON.stringify({ email: 'Editor@Example.com' }),
      }),
    )
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Authorization')
    resolveRequest({
      ok: true,
      status: 200,
      json: async () => ({ code: 200, data: null }),
    } as Response)
    await flushPromises()
    expect(wrapper.get('#passwordError').text()).toContain('符合条件的邮箱')
    expect(wrapper.get('.send-code').attributes('disabled')).toBeDefined()
    await wrapper.get('.credential-mode').trigger('click')
    await wrapper.get('.credential-mode').trigger('click')
    expect(wrapper.get('.send-code').attributes('disabled')).toBeDefined()
    await wrapper.get('#usernameTab').trigger('click')
    await wrapper.get('#emailTab').trigger('click')
    await wrapper.get('.credential-mode').trigger('click')
    await wrapper.get('#identityInput').setValue('Editor@Example.com')
    expect(wrapper.get('.send-code').attributes('disabled')).toBeDefined()
    await vi.advanceTimersByTimeAsync(61_000)
    expect(wrapper.get('.send-code').attributes('disabled')).toBeUndefined()
  })

  it.each([
    '验证码邮件发送失败，请稍后重试',
    'Failed to fetch',
    '验证码发送过于频繁，请 60 秒后重试',
  ])('发送错误保留冷却并展示实际错误：%s', async (message) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error(message)
      }),
    )
    const wrapper = await renderEmailCodeLogin()
    await wrapper.get('#identityInput').setValue('Editor@Example.com')
    await wrapper.get('.send-code').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain(message)
    expect(wrapper.get('.send-code').attributes('disabled')).toBeDefined()
    expect(sessionStorage.getItem('acgbox-token')).toBeNull()
  })

  it('验证码错误不产生登录状态，并允许重试', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(500, '验证码错误或已过期，请重新获取')),
    )
    const wrapper = await renderEmailCodeLogin()
    await wrapper.get('#identityInput').setValue('Editor@Example.com')
    await wrapper.get('#passwordInput').setValue('003821')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('验证码错误或已过期')
    expect(sessionStorage.getItem('acgbox-token')).toBeNull()
    expect(wrapper.get('.submit-button').attributes('disabled')).toBeUndefined()
  })

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

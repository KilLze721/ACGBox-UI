import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, KeepAlive, ref } from 'vue'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import AccountProfileView from '@/views/admin/AccountProfileView.vue'
import App from '@/App.vue'
import router from '@/router'
import type { UserAccount } from '@/types/api'

const initial: UserAccount = {
  id: 9134567,
  username: 'Editor',
  email: 'Editor@Example.com',
  role: 'EDITOR',
  enabled: true,
  emailVerifiedAt: '2026-10-20T09:30:00',
  createdAt: '2026-09-01T12:00:00',
  updatedAt: '2026-10-20T09:30:00',
}
const proof = 'A'.repeat(43)
const wrappers: VueWrapper[] = []
function mockApi(overrides: Partial<UserAccount> = {}) {
  let account = { ...initial, ...overrides }
  let readError = '',
    sendError = '',
    saveError = '',
    verifyError = ''
  let hold = '',
    resolvePending: (() => void) | undefined
  let tokenVersion = 0
  const requests: {
    path: string
    body: Record<string, string>
    authorization: string | undefined
  }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = new URL(String(input), 'http://localhost').pathname
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      const authorization = (init?.headers as Record<string, string>)?.Authorization
      requests.push({ path, body, authorization })
      if (hold === path)
        await new Promise<void>((resolve) => {
          resolvePending = resolve
        })
      let data: unknown = null,
        message = ''
      if (path === '/api/admin/account') {
        if (readError) throw new Error(readError)
        data = { ...account }
      } else if (path.endsWith('/email/code')) message = sendError
      else if (path.endsWith('/email/verify-current')) {
        message = verifyError
        data = { emailChangeToken: proof, expiresIn: 300 }
      } else if (path.startsWith('/api/admin/account/')) {
        message = saveError
        if (!message) {
          if (path.endsWith('/email'))
            account = { ...account, email: body.email, emailVerifiedAt: '2026-10-22T12:00:00' }
          if (path.endsWith('/email/unbind'))
            account = { ...account, email: null, emailVerifiedAt: null }
          data = {
            token: `rotated-token-${++tokenVersion}`,
            expiresIn: 86400,
            id: account.id,
            username: account.username,
            role: account.role,
          }
        }
      } else if (path.endsWith('/page'))
        data = { pageNum: 1, pageSize: 20, total: 0, pages: 0, rows: [] }
      else data = []
      return {
        ok: true,
        status: 200,
        json: async () => ({ code: message ? 400 : 200, message, data }),
      }
    }),
  )
  return {
    requests,
    readError: (value: string) => {
      readError = value
    },
    sendError: (value: string) => {
      sendError = value
    },
    saveError: (value: string) => {
      saveError = value
    },
    verifyError: (value: string) => {
      verifyError = value
    },
    hold: (value: string) => {
      hold = value
    },
    release: () => resolvePending?.(),
  }
}
async function render() {
  const wrapper = mount(AccountProfileView, { attachTo: document.body })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
function body() {
  return new DOMWrapper(document.body)
}
async function submitEmail() {
  await body().get('#flowSubmit').trigger('click')
  await flushPromises()
}
async function verifyOld(wrapper: VueWrapper) {
  await wrapper.get('#primaryEmailAction').trigger('click')
  await body().get('#oldCode').setValue('012345')
  await submitEmail()
}
async function discardFlow() {
  await body().get('[aria-label="关闭邮箱设置"]').trigger('click')
  if (body().find('.account-confirm-layer .primary-button').exists())
    await body().get('.account-confirm-layer .primary-button').trigger('click')
  await flushPromises()
}
function fakeClock() {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
}
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
})

describe('个人账号', () => {
  it('解绑按钮包含图标；两个密码可独立显示和隐藏，切换不提交或改变密码', async () => {
    const api = mockApi()
    const wrapper = await render()
    expect(wrapper.get('#unbindEmailAction').find('svg').exists()).toBe(true)
    await wrapper.get('#passwordToggle').trigger('click')
    await wrapper.get('#currentPassword').setValue(' Current Secret ')
    await wrapper.get('#newPassword').setValue(' New Secret ')
    expect(wrapper.get('#currentPassword').attributes('type')).toBe('password')
    expect(wrapper.get('#newPassword').attributes('type')).toBe('password')
    const currentToggle = wrapper.get('[aria-label="显示当前密码"]')
    expect(currentToggle.attributes('type')).toBe('button')
    expect(currentToggle.attributes('aria-controls')).toBe('currentPassword')
    await currentToggle.trigger('click')
    expect(wrapper.get('#currentPassword').attributes('type')).toBe('text')
    expect(wrapper.get('#newPassword').attributes('type')).toBe('password')
    expect(wrapper.get('[aria-label="隐藏当前密码"]').attributes('aria-pressed')).toBe('true')
    await wrapper.get('[aria-label="显示新密码"]').trigger('click')
    expect(wrapper.get('#newPassword').attributes('type')).toBe('text')
    await wrapper.get('[aria-label="隐藏当前密码"]').trigger('click')
    expect(wrapper.get('#currentPassword').attributes('type')).toBe('password')
    expect(wrapper.get('#currentPassword').element).toHaveProperty('value', ' Current Secret ')
    expect(api.requests).toHaveLength(1)
    await wrapper.get('#passwordForm').trigger('submit')
    await flushPromises()
    expect(api.requests[1]!.body).toEqual({
      currentPassword: ' Current Secret ',
      newPassword: ' New Secret ',
    })
    expect(wrapper.get('#currentPassword').attributes('type')).toBe('password')
    expect(wrapper.get('#newPassword').attributes('type')).toBe('password')
    expect(wrapper.get('#newPassword').element).toHaveProperty('value', '')
  })

  it('密码表单缓存停用后恢复隐藏，保留尚未提交的输入；放弃草稿后清空并保持隐藏', async () => {
    mockApi()
    const show = ref(true)
    const Host = defineComponent({
      components: { AccountProfileView, KeepAlive },
      setup: () => ({ show }),
      template: '<KeepAlive><AccountProfileView v-if="show" /></KeepAlive>',
    })
    const wrapper = mount(Host, { attachTo: document.body })
    wrappers.push(wrapper)
    await flushPromises()
    await wrapper.get('#passwordToggle').trigger('click')
    await wrapper.get('#newPassword').setValue('draft-secret')
    await wrapper.get('[aria-label="显示新密码"]').trigger('click')
    show.value = false
    await flushPromises()
    show.value = true
    await flushPromises()
    expect(wrapper.get('#newPassword').attributes('type')).toBe('password')
    expect(wrapper.get('#newPassword').element).toHaveProperty('value', 'draft-secret')
    await wrapper.get('[aria-label="显示新密码"]').trigger('click')
    await wrapper.get('#passwordToggle').trigger('click')
    await body().get('.account-confirm-layer .primary-button').trigger('click')
    await wrapper.get('#passwordToggle').trigger('click')
    expect(wrapper.get('#newPassword').attributes('type')).toBe('password')
    expect(wrapper.get('#newPassword').element).toHaveProperty('value', '')
  })

  it('发信请求期间阻止重复提交与关闭；不同用途分别维护冷却', async () => {
    const api = mockApi()
    api.hold('/api/admin/account/email/code')
    const wrapper = await render()
    await wrapper.get('#primaryEmailAction').trigger('click')
    await body().get('#sendOldCode').trigger('click')
    await body().get('#sendOldCode').trigger('click')
    await body().get('[aria-label="关闭邮箱设置"]').trigger('click')
    expect(body().find('.account-drawer').exists()).toBe(true)
    expect(api.requests.filter((request) => request.path.endsWith('/email/code'))).toHaveLength(1)
    expect(
      (wrapper.vm as unknown as { getCloseState: () => { submitting: boolean } }).getCloseState()
        .submitting,
    ).toBe(true)
    api.release()
    await flushPromises()
    expect(body().get('#sendOldCode').attributes('disabled')).toBeDefined()
    await discardFlow()
    await wrapper.get('#unbindEmailAction').trigger('click')
    expect(body().get('#sendOldCode').attributes('disabled')).toBeUndefined()
  })

  it('请求本人资料且不展示 ID；失败时关闭修改入口，支持重试', async () => {
    const api = mockApi()
    api.readError('账号加载失败')
    const wrapper = await render()
    expect(wrapper.text()).toContain('暂时无法读取账号资料')
    expect(wrapper.find('#passwordToggle').exists()).toBe(false)
    api.readError('')
    await wrapper.get('.status-panel button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain(initial.username)
    expect(wrapper.text()).toContain(initial.email)
    expect(wrapper.text()).not.toContain(String(initial.id))
    expect(wrapper.text()).toContain('只读')
    expect(api.requests.every((request) => request.path === '/api/admin/account')).toBe(true)
  })

  it('密码按 UTF-8 字节验证，72 字节边界通过且保留空格和大小写，先更新令牌再刷新', async () => {
    const api = mockApi()
    const wrapper = await render()
    await wrapper.get('#passwordToggle').trigger('click')
    await wrapper.get('#passwordForm').trigger('submit')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('#currentPassword').element)
    await wrapper.get('#currentPassword').setValue(' Old Pass ')
    await wrapper.get('#newPassword').setValue('密'.repeat(25))
    await wrapper.get('#passwordForm').trigger('submit')
    expect(wrapper.text()).toContain('新密码不能超过 72 个 UTF-8 字节')
    expect(api.requests).toHaveLength(1)
    const password = ' ' + '密'.repeat(23) + 'A '
    expect(new TextEncoder().encode(password)).toHaveLength(72)
    await wrapper.get('#newPassword').setValue(password)
    await wrapper.get('#passwordForm').trigger('submit')
    await flushPromises()
    expect(api.requests[1]!.body).toEqual({ currentPassword: ' Old Pass ', newPassword: password })
    expect(api.requests[2]!.authorization).toBe('Bearer rotated-token-1')
    expect(sessionStorage.getItem('acgbox-token')).toBe('rotated-token-1')
    expect(wrapper.get('#newPassword').element).toHaveProperty('value', '')
    expect(wrapper.text()).toContain('密码已更新')
  })

  it('不禁止新旧密码相同；保存成功而资料刷新失败不会误报保存失败', async () => {
    const api = mockApi()
    const wrapper = await render()
    await wrapper.get('#passwordToggle').trigger('click')
    await wrapper.get('#currentPassword').setValue('same-password')
    await wrapper.get('#newPassword').setValue('same-password')
    api.readError('刷新失败')
    await wrapper.get('#passwordForm').trigger('submit')
    await flushPromises()
    expect(api.requests[1]!.path).toBe('/api/admin/account/change-password')
    expect(wrapper.text()).toContain('密码已更新')
    expect(wrapper.text()).toContain('资料保存成功，但刷新失败')
    expect(sessionStorage.getItem('acgbox-token')).toBe('rotated-token-1')
    expect(wrapper.find('#passwordToggle').exists()).toBe(false)
  })

  it('首次绑定使用 BIND 与原始邮箱大小写，验证码保留前导零，校验失败聚焦字段', async () => {
    const api = mockApi({ email: null, emailVerifiedAt: null })
    const wrapper = await render()
    await wrapper.get('#primaryEmailAction').trigger('click')
    await submitEmail()
    expect(document.activeElement).toBe(body().get('#newEmail').element)
    await body().get('#newEmail').setValue('New@Example.com')
    await body().get('#sendNewCode').trigger('click')
    await flushPromises()
    expect(api.requests[1]!.body).toEqual({ purpose: 'BIND', email: 'New@Example.com' })
    await body().get('#newCode').setValue('abc123')
    await submitEmail()
    expect(body().get('#newCodeError').text()).toContain('6 位数字')
    await body().get('#newCode').setValue('001234')
    await submitEmail()
    expect(api.requests[2]!.body).toEqual({ email: 'New@Example.com', newEmailCode: '001234' })
    expect(api.requests[3]!.authorization).toBe('Bearer rotated-token-1')
    expect(wrapper.text()).toContain('New@Example.com')
    expect(body().find('.success-view').exists()).toBe(true)
  })

  it('未验证邮箱固定为当前地址，补验证不传换绑凭证', async () => {
    const api = mockApi({ emailVerifiedAt: null })
    const wrapper = await render()
    await wrapper.get('#verifyEmailAction').trigger('click')
    expect(body().get('#newEmail').attributes('readonly')).toBeDefined()
    expect(body().get('#newEmail').element).toHaveProperty('value', initial.email)
    await body().get('#sendNewCode').trigger('click')
    await flushPromises()
    await body().get('#newCode').setValue('000001')
    await submitEmail()
    expect(api.requests[1]!.body).toEqual({ purpose: 'BIND', email: initial.email })
    expect(api.requests[2]!.body).toEqual({ email: initial.email, newEmailCode: '000001' })
    expect(wrapper.find('#verifyEmailAction').exists()).toBe(false)
  })

  it('换绑先验证原邮箱，凭证仅用于新邮箱发信和保存；保存前保留原邮箱', async () => {
    const api = mockApi()
    const wrapper = await render()
    await wrapper.get('#primaryEmailAction').trigger('click')
    expect(body().find('#newEmail').exists()).toBe(false)
    await body().get('#sendOldCode').trigger('click')
    await flushPromises()
    expect(api.requests[1]!.body).toEqual({ purpose: 'CHANGE' })
    await body().get('#oldCode').setValue('012345')
    await submitEmail()
    expect(api.requests[2]!.body).toEqual({ currentEmailCode: '012345' })
    expect(sessionStorage.getItem('acgbox-token')).toBe('test-admin-token')
    expect(body().get('.proof-time').text()).toContain('05:00')
    await body().get('#newEmail').setValue('Changed@Example.com')
    await body().get('#sendNewCode').trigger('click')
    await flushPromises()
    expect(api.requests[3]!.body).toEqual({
      purpose: 'BIND',
      email: 'Changed@Example.com',
      emailChangeToken: proof,
    })
    expect(wrapper.get('.email-address').text()).toBe(initial.email)
    await body().get('#newCode').setValue('001234')
    await submitEmail()
    expect(api.requests[4]!.body).toEqual({
      email: 'Changed@Example.com',
      newEmailCode: '001234',
      emailChangeToken: proof,
    })
    expect(api.requests[5]!.authorization).toBe('Bearer rotated-token-1')
    expect(api.requests.every((request) => !request.authorization?.includes(proof))).toBe(true)
    expect(Object.values(sessionStorage).join('')).not.toContain(proof)
    expect(wrapper.get('.email-address').text()).toBe('Changed@Example.com')
  })

  it('解绑只发送 UNBIND 和 verificationCode，不要求密码，成功后显示未绑定', async () => {
    const api = mockApi()
    const wrapper = await render()
    await wrapper.get('#unbindEmailAction').trigger('click')
    expect(body().find('.account-drawer input[type="password"]').exists()).toBe(false)
    await body().get('#sendOldCode').trigger('click')
    await flushPromises()
    await body().get('#oldCode').setValue('000123')
    await submitEmail()
    expect(api.requests[1]!.body).toEqual({ purpose: 'UNBIND' })
    expect(api.requests[2]!.body).toEqual({ verificationCode: '000123' })
    expect(api.requests[3]!.authorization).toBe('Bearer rotated-token-1')
    expect(wrapper.text()).toContain('尚未绑定邮箱')
    expect(body().get('.success-view').text()).toContain('仍可使用用户名与密码登录')
  })

  it('换绑凭证按截止时间到期回退，后台时间跳跃后也不能提交过期凭证', async () => {
    fakeClock()
    const api = mockApi()
    const wrapper = await render()
    await verifyOld(wrapper)
    await body().get('#newEmail').setValue('New@Example.com')
    await body().get('#newCode').setValue('000001')
    vi.setSystemTime(Date.now() + 301000)
    await submitEmail()
    expect(body().find('#oldCode').exists()).toBe(true)
    expect(body().find('#newEmail').exists()).toBe(false)
    expect(body().text()).toContain('验证已过期')
    expect(
      api.requests.filter((request) => request.path === '/api/admin/account/email'),
    ).toHaveLength(0)
    expect(wrapper.get('.email-address').text()).toBe(initial.email)
  })

  it('同用途冷却在关闭抽屉后继续，改邮箱清空验证码但不重置冷却', async () => {
    fakeClock()
    const api = mockApi({ email: null, emailVerifiedAt: null })
    const wrapper = await render()
    await wrapper.get('#primaryEmailAction').trigger('click')
    await body().get('#newEmail').setValue('One@Example.com')
    await body().get('#sendNewCode').trigger('click')
    await flushPromises()
    await body().get('#newCode').setValue('012345')
    await body().get('#newEmail').setValue('Two@Example.com')
    expect(body().get('#newCode').element).toHaveProperty('value', '')
    expect(body().get('#sendNewCode').attributes('disabled')).toBeDefined()
    await discardFlow()
    await wrapper.get('#primaryEmailAction').trigger('click')
    expect(body().get('#sendNewCode').text()).toContain('60 秒后重发')
    await vi.advanceTimersByTimeAsync(61000)
    expect(body().get('#sendNewCode').attributes('disabled')).toBeUndefined()
    expect(api.requests.filter((request) => request.path.endsWith('/email/code'))).toHaveLength(1)
  })

  it.each(['验证码邮件发送失败，请稍后重试', '验证码服务暂不可用，请稍后重试', 'Failed to fetch'])(
    '发送失败保留冷却：%s',
    async (message) => {
      const api = mockApi({ email: null, emailVerifiedAt: null })
      api.sendError(message)
      const wrapper = await render()
      await wrapper.get('#primaryEmailAction').trigger('click')
      await body().get('#newEmail').setValue('One@Example.com')
      await body().get('#sendNewCode').trigger('click')
      await flushPromises()
      expect(body().get('.send-status').text()).toContain(message)
      expect(body().get('#sendNewCode').attributes('disabled')).toBeDefined()
      expect(body().text()).not.toContain('验证码已发送')
    },
  )

  it.each(['邮箱验证码功能尚未启用', '邮件服务尚未配置', '此邮箱已被使用'])(
    '明确限流前校验错误不制造冷却：%s',
    async (message) => {
      const api = mockApi({ email: null, emailVerifiedAt: null })
      api.sendError(message)
      const wrapper = await render()
      await wrapper.get('#primaryEmailAction').trigger('click')
      await body().get('#newEmail').setValue('One@Example.com')
      await body().get('#sendNewCode').trigger('click')
      await flushPromises()
      expect(body().get('.send-status').text()).toContain(message)
      expect(body().get('#sendNewCode').attributes('disabled')).toBeUndefined()
    },
  )

  it('验证码错误保留换绑凭证以便重试，凭证错误则返回原邮箱验证', async () => {
    const api = mockApi()
    const wrapper = await render()
    await verifyOld(wrapper)
    await body().get('#newEmail').setValue('New@Example.com')
    await body().get('#newCode').setValue('001234')
    api.saveError('验证码错误或已过期，请重新获取')
    await submitEmail()
    expect(body().find('#newEmail').exists()).toBe(true)
    expect(body().get('.notice[role="alert"]').text()).toContain('验证码错误')
    api.saveError('邮箱换绑凭证无效或已过期，请重新验证原邮箱')
    await submitEmail()
    expect(body().find('#oldCode').exists()).toBe(true)
    expect(body().find('#newEmail').exists()).toBe(false)
    expect(wrapper.get('.email-address').text()).toBe(initial.email)
  })

  it('未保存确认、Escape、焦点约束与滚动恢复；提交期间阻止重复操作', async () => {
    const api = mockApi()
    const wrapper = await render()
    await wrapper.get('#passwordToggle').trigger('click')
    await wrapper.get('#currentPassword').setValue('old')
    await wrapper.get('#newPassword').setValue('new')
    await wrapper.get('#passwordToggle').trigger('click')
    await flushPromises()
    expect(body().get('#discardTitle').text()).toContain('放弃未保存')
    expect(document.body.style.overflow).toBe('hidden')
    const last = body().get<HTMLButtonElement>('.account-confirm-layer .primary-button')
    last.element.focus()
    await last.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(
      body().get('.account-confirm-layer .secondary-button').element,
    )
    await body()
      .get('.account-confirm-layer .secondary-button')
      .trigger('keydown', { key: 'Escape' })
    expect(wrapper.get('#newPassword').element).toHaveProperty('value', 'new')
    const state = () =>
      (
        wrapper.vm as unknown as { getCloseState: () => { dirty: boolean; submitting: boolean } }
      ).getCloseState()
    expect(state().dirty).toBe(true)
    api.hold('/api/admin/account/change-password')
    await wrapper.get('#passwordForm').trigger('submit')
    await wrapper.get('#passwordForm').trigger('submit')
    expect(state().submitting).toBe(true)
    expect(
      api.requests.filter((request) => request.path.endsWith('/change-password')),
    ).toHaveLength(1)
    api.release()
    await flushPromises()
    expect(state()).toEqual({ dirty: false, submitting: false })
    expect(document.body.style.overflow).toBe('')
    expect(wrapper.element.inert).toBe(false)
  })

  it('切换邮箱流程会先确认密码草稿，关闭抽屉清除验证码和换绑凭证', async () => {
    mockApi()
    const wrapper = await render()
    await wrapper.get('#passwordToggle').trigger('click')
    await wrapper.get('#newPassword').setValue('draft')
    await wrapper.get('#primaryEmailAction').trigger('click')
    expect(body().find('.account-drawer').exists()).toBe(false)
    await body().get('.account-confirm-layer .primary-button').trigger('click')
    await body().get('#oldCode').setValue('012345')
    await submitEmail()
    await discardFlow()
    await wrapper.get('#primaryEmailAction').trigger('click')
    expect(body().find('.proof-time').exists()).toBe(false)
    expect(body().get('#oldCode').element).toHaveProperty('value', '')
    expect(body().find('#newEmail').exists()).toBe(false)
  })

  it('缓存停用时释放锁并暂停计时，重新激活按当前时间检查凭证，卸载清理监听和定时器', async () => {
    fakeClock()
    mockApi()
    const show = ref(true)
    const Host = defineComponent({
      components: { AccountProfileView, KeepAlive },
      setup: () => ({ show }),
      template: '<KeepAlive><AccountProfileView v-if="show" /></KeepAlive>',
    })
    const wrapper = mount(Host, { attachTo: document.body })
    wrappers.push(wrapper)
    await flushPromises()
    await verifyOld(wrapper)
    expect(document.body.style.overflow).toBe('hidden')
    show.value = false
    await flushPromises()
    expect(document.body.style.overflow).toBe('')
    expect(body().find('.account-drawer').exists()).toBe(false)
    vi.setSystemTime(Date.now() + 301000)
    show.value = true
    await flushPromises()
    expect(body().find('#oldCode').exists()).toBe(true)
    wrapper.unmount()
    wrappers.pop()
    expect(document.body.style.overflow).toBe('')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('编辑权限可通过账号菜单进入并复用标签；用户角色不能进入', async () => {
    const api = mockApi()
    sessionStorage.setItem(
      'acgbox-user',
      JSON.stringify({ id: 2, username: 'Editor', role: 'EDITOR' }),
    )
    await router.push('/admin/dashboard')
    const wrapper = mount(App, { attachTo: document.body, global: { plugins: [router] } })
    wrappers.push(wrapper)
    await wrapper.get('.avatar-button').trigger('click')
    await wrapper.findAll('[role="menuitem"]')[0]!.trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/admin/account'))
    await flushPromises()
    expect(wrapper.findAll('.workspace-tab')).toHaveLength(2)
    await wrapper.get('.workspace-tab-main[href="/admin/dashboard"]').trigger('click')
    await flushPromises()
    await wrapper.get('.avatar-button').trigger('click')
    await wrapper.findAll('[role="menuitem"]')[0]!.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.workspace-tab')).toHaveLength(2)
    expect(wrapper.get('.workspace-tab.active').text()).toContain('个人账号')
    expect(wrapper.find('a.nav-item[href="/admin/account"]').exists()).toBe(false)
    expect(api.requests.some((request) => request.path.startsWith('/api/admin/users'))).toBe(false)
    sessionStorage.setItem('acgbox-user', JSON.stringify({ id: 3, username: 'User', role: 'USER' }))
    await router.push('/admin/dashboard')
    await router.push('/admin/account')
    expect(router.currentRoute.value.path).toBe('/admin/dashboard')
  })
})

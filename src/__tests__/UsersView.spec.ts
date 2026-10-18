import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import UsersView from '@/views/admin/UsersView.vue'
import App from '@/App.vue'
import router from '@/router'
import type { UserAccount, UserAccountDTO } from '@/types/api'

const account: UserAccount = {
  id: 987654321,
  username: 'ArchiveEditor',
  email: 'editor@example.com',
  role: 'EDITOR',
  enabled: true,
  emailVerifiedAt: '2026-01-01T12:00:00',
  createdAt: '2026-01-01T12:00:00',
  updatedAt: '2026-01-02T12:00:00',
}
const wrappers: VueWrapper[] = []
function mockApi(initial: UserAccount[] = [account]) {
  let accounts = initial.map((user) => ({ ...user }))
  let failure = ''
  let pending: (() => void) | undefined
  let holdMutation = false
  const requests: { path: string; params: URLSearchParams; body?: Record<string, unknown> }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      requests.push({ path: url.pathname, params: url.searchParams, body })
      if (holdMutation && init?.method === 'POST')
        await new Promise<void>((resolve) => {
          pending = resolve
        })
      if (failure && init?.method === 'POST')
        return { ok: true, status: 200, json: async () => ({ code: 400, message: failure }) }
      let data: unknown = null
      if (url.pathname.endsWith('/users/page')) {
        const pageNum = Number(url.searchParams.get('pageNum'))
        const pageSize = Number(url.searchParams.get('pageSize'))
        const rows = accounts.filter(
          (user) =>
            (!url.searchParams.get('username') ||
              user.username
                .toLowerCase()
                .includes(url.searchParams.get('username')!.toLowerCase())) &&
            (!url.searchParams.get('email') ||
              user.email?.toLowerCase().includes(url.searchParams.get('email')!.toLowerCase())) &&
            (!url.searchParams.get('role') || user.role === url.searchParams.get('role')) &&
            (!url.searchParams.has('enabled') ||
              user.enabled === (url.searchParams.get('enabled') === 'true')),
        )
        data = {
          pageNum,
          pageSize,
          total: rows.length,
          pages: Math.ceil(rows.length / pageSize),
          rows: rows.slice((pageNum - 1) * pageSize, pageNum * pageSize),
        }
      } else if (url.pathname.endsWith('/users/create')) {
        const created = { ...account, ...body, id: 88, emailVerifiedAt: null }
        accounts.push(created)
        data = created
      } else if (url.pathname.endsWith('/users/update')) {
        accounts = accounts.map((user) =>
          user.id === body.id
            ? {
                ...user,
                ...(body as UserAccountDTO),
                emailVerifiedAt: user.email !== body.email ? null : user.emailVerifiedAt,
              }
            : user,
        )
        data = accounts.find((user) => user.id === body.id)
      } else if (url.pathname.endsWith('/users/delete'))
        accounts = accounts.filter((user) => user.id !== body.id)
      else if (/\/users\/\d+$/.test(url.pathname))
        data = accounts.find((user) => user.id === Number(url.pathname.split('/').pop()))
      return { ok: true, status: 200, json: async () => ({ code: 200, data }) }
    }),
  )
  return {
    requests,
    reject: (message: string) => {
      failure = message
    },
    hold: () => {
      holdMutation = true
    },
    release: () => pending?.(),
  }
}
async function render() {
  const wrapper = mount(UsersView, { attachTo: document.body })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
function body() {
  return new DOMWrapper(document.body)
}
async function openDetail(wrapper: VueWrapper, username = account.username) {
  await wrapper.get(`[aria-label="编辑用户 ${username}"]`).trigger('click')
  await flushPromises()
}
async function select(selector: string, text: string) {
  await body().get(selector).trigger('click')
  const option = body()
    .findAll('.archive-select-option')
    .find((item) => item.text() === text)!
  await option.trigger('click')
}
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
})

describe('用户管理', () => {
  it('弹窗获取键盘焦点、限制 Tab 范围，关闭后保留抽屉并恢复焦点与滚动状态', async () => {
    mockApi()
    const wrapper = await render()
    await openDetail(wrapper)
    const opener = body().get<HTMLButtonElement>('.detail-actions .secondary-button')
    opener.element.focus()
    await opener.trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(body().get('#dialogNewPassword').element)
    const confirm = body().get<HTMLButtonElement>('.dialog-actions .primary-button')
    confirm.element.focus()
    await confirm.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(body().get('#dialogNewPassword').element)
    await body().get('#dialogNewPassword').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(body().find('.users-action-layer').exists()).toBe(false)
    expect(document.activeElement).toBe(opener.element)
    expect(document.body.style.overflow).toBe('hidden')
    await opener.trigger('keydown', { key: 'Escape' })
    expect(body().find('.drawer').exists()).toBe(false)
    expect(document.body.style.overflow).toBe('')
  })

  it('使用真实分页总数，不展示数据库 ID，并提交已停用筛选与分页参数', async () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({
      ...account,
      id: index + 100,
      username: `Editor${index}`,
      enabled: false,
    }))
    const { requests } = mockApi(rows)
    const wrapper = await render()
    expect(wrapper.findAll('.stat-copy strong').map((item) => item.text())).toEqual([
      '25',
      '0',
      '25',
    ])
    expect(wrapper.findAll('th').map((item) => item.text())).toEqual([
      '账号',
      '邮箱',
      '角色',
      '状态',
      '创建时间',
      '操作',
    ])
    expect(wrapper.get('.user-table').text()).not.toContain('987654321')
    await wrapper.get('#filterUsername').setValue(' Editor ')
    await select('#filterRole', '编辑')
    await select('#filterEnabled', '已停用')
    await wrapper.get('.filter-row').trigger('submit')
    await flushPromises()
    const last = requests[requests.length - 1]!
    expect(Object.fromEntries(last.params)).toEqual({
      pageNum: '1',
      pageSize: '20',
      username: 'Editor',
      role: 'EDITOR',
      enabled: 'false',
    })
    await wrapper.get('[aria-label="下一页"]').trigger('click')
    await flushPromises()
    expect(requests[requests.length - 1]!.params.get('pageNum')).toBe('2')
    await select('#usersPageSize', '50 条')
    await flushPromises()
    expect(requests[requests.length - 1]!.params.get('pageNum')).toBe('1')
    expect(requests[requests.length - 1]!.params.get('pageSize')).toBe('50')
    expect(wrapper.get('#filterUsername').element).toHaveProperty('value', 'Editor')
  })

  it('新增校验必填、用户名、邮箱和密码字节数，角色仅允许编辑或用户', async () => {
    const { requests } = mockApi()
    const wrapper = await render()
    await wrapper.get('.hero-actions button').trigger('click')
    await body().get('#userCreateForm').trigger('submit')
    expect(body().text()).toContain('请输入用户名。')
    expect(body().text()).toContain('请输入初始密码。')
    await body().get('#formUsername').setValue('bad@name')
    await body().get('#formEmail').setValue('not-email')
    await body().get('#formPassword').setValue('密'.repeat(25))
    await body().get('#userCreateForm').trigger('submit')
    expect(body().text()).toContain('用户名不能包含 @')
    expect(body().text()).toContain('请输入有效邮箱')
    expect(body().text()).toContain('72 个 UTF-8 字节')
    expect(requests.filter((request) => request.path.endsWith('/create'))).toHaveLength(0)
    await body().get('#formRole').trigger('click')
    expect(
      body()
        .findAll('.archive-select-option')
        .map((option) => option.text()),
    ).toEqual(['编辑', '用户'])
    await body().findAll('.archive-select-option')[0]!.trigger('click')
    await body().get('#formUsername').setValue('  NewEditor  ')
    await body().get('#formEmail').setValue('')
    await body().get('#formPassword').setValue(' Raw Password ')
    await body().get('#userCreateForm').trigger('submit')
    await flushPromises()
    expect(requests.find((request) => request.path.endsWith('/create'))!.body).toEqual({
      username: 'NewEditor',
      email: null,
      password: ' Raw Password ',
      role: 'EDITOR',
      enabled: true,
    })
    expect(body().find('.drawer').exists()).toBe(false)
    expect(wrapper.text()).toContain('NewEditor')
  })

  it('逐项更新保留其他字段；邮箱改变才要求操作者密码，撤回修改后清除密码', async () => {
    const { requests } = mockApi()
    const wrapper = await render()
    await openDetail(wrapper)
    expect(requests.some((request) => request.path.endsWith(`/users/${account.id}`))).toBe(true)
    await body().get('[aria-label="编辑用户名"]').trigger('click')
    await body().get('#editUsername').setValue('Renamed')
    await body().get('.inline-editor').trigger('submit')
    await flushPromises()
    expect(requests.find((request) => request.path.endsWith('/update'))!.body).toEqual({
      id: account.id,
      username: 'Renamed',
      email: account.email,
      role: 'EDITOR',
      enabled: true,
    })
    await body().get('[aria-label="编辑邮箱"]').trigger('click')
    await body().get('#editEmail').setValue('invalid')
    await body().get('.inline-editor').trigger('submit')
    expect(body().text()).toContain('请输入有效邮箱')
    await body().get('#editEmail').setValue('new@example.com')
    await body().get('.inline-editor').trigger('submit')
    expect(body().text()).toContain('修改邮箱需要输入当前管理员密码')
    await body().get('#operatorPassword').setValue(' Admin Secret ')
    await body().get('#editEmail').setValue(account.email!)
    expect(body().find('#operatorPassword').exists()).toBe(false)
    await body().get('#editEmail').setValue('new@example.com')
    expect(body().get('#operatorPassword').element).toHaveProperty('value', '')
    await body().get('#operatorPassword').setValue(' Admin Secret ')
    await body().get('.inline-editor').trigger('submit')
    await flushPromises()
    const updates = requests.filter((request) => request.path.endsWith('/update'))
    expect(updates).toHaveLength(2)
    expect(updates[1]!.body).toEqual({
      id: account.id,
      username: 'Renamed',
      email: 'new@example.com',
      role: 'EDITOR',
      enabled: true,
      currentPassword: ' Admin Secret ',
    })
    expect(body().find('input[type="password"]').exists()).toBe(false)
    expect(body().text()).not.toContain('Admin Secret')
  })

  it('管理员的角色和状态不可修改，不能删除，但可以重置密码', async () => {
    mockApi([{ ...account, role: 'ADMIN' }])
    const wrapper = await render()
    await openDetail(wrapper)
    expect(body().find('[aria-label="编辑角色"]').exists()).toBe(false)
    expect(body().find('[aria-label="编辑账号状态"]').exists()).toBe(false)
    expect(body().get('.detail-actions .danger-button').attributes('disabled')).toBeDefined()
    await body().get('.detail-actions .secondary-button').trigger('click')
    expect(body().get('#usersActionTitle').text()).toBe('重置用户密码')
  })

  it('重置密码验证必填和字节数，提交期间不能重复请求或关闭，成功清除凭据', async () => {
    const api = mockApi()
    const wrapper = await render()
    await openDetail(wrapper)
    await body().get('.detail-actions .secondary-button').trigger('click')
    await body().get('.users-action-layer form').trigger('submit')
    expect(body().text()).toContain('请输入当前管理员密码')
    await body().get('#dialogNewPassword').setValue('密'.repeat(25))
    await body().get('#dialogCurrentPassword').setValue(' Admin Password ')
    await body().get('.users-action-layer form').trigger('submit')
    expect(body().text()).toContain('新密码不能超过 72')
    await body().get('#dialogNewPassword').setValue(' New Password ')
    api.hold()
    await body().get('.users-action-layer form').trigger('submit')
    await body().get('.users-action-layer form').trigger('submit')
    await body().get('.users-action-layer').trigger('keydown', { key: 'Escape' })
    expect(api.requests.filter((request) => request.path.endsWith('/reset-password'))).toHaveLength(
      1,
    )
    expect(body().find('.users-action-layer').exists()).toBe(true)
    expect(
      (wrapper.vm as unknown as { getCloseState: () => { submitting: boolean } }).getCloseState()
        .submitting,
    ).toBe(true)
    api.release()
    await flushPromises()
    expect(api.requests.find((request) => request.path.endsWith('/reset-password'))!.body).toEqual({
      id: account.id,
      currentPassword: ' Admin Password ',
      newPassword: ' New Password ',
    })
    expect(body().find('.users-action-layer').exists()).toBe(false)
    expect(body().find('input[type="password"]').exists()).toBe(false)
    expect(document.body.style.overflow).toBe('hidden')
    await body().get('[aria-label="关闭用户抽屉"]').trigger('click')
    expect(document.body.style.overflow).toBe('')
  })

  it('删除使用单个 ID 与管理员密码，接口失败不关闭弹窗，不显示虚假成功', async () => {
    const api = mockApi()
    const wrapper = await render()
    await openDetail(wrapper)
    await body().get('.detail-actions .danger-button').trigger('click')
    expect(body().get('.users-action-layer').text()).not.toContain(String(account.id))
    await body().get('.users-action-layer form').trigger('submit')
    expect(api.requests.filter((request) => request.path.endsWith('/delete'))).toHaveLength(0)
    await body().get('#dialogCurrentPassword').setValue('wrong-password')
    api.reject('当前密码不正确')
    await body().get('.users-action-layer form').trigger('submit')
    await flushPromises()
    expect(body().get('.dialog-alert').text()).toBe('当前密码不正确')
    expect(body().text()).not.toContain('账号已删除')
    api.reject('')
    await body().get('#dialogCurrentPassword').setValue('correct-password')
    await body().get('.users-action-layer form').trigger('submit')
    await flushPromises()
    expect(api.requests.filter((request) => request.path.endsWith('/delete'))[1]!.body).toEqual({
      id: account.id,
      currentPassword: 'correct-password',
    })
    expect(body().find('.drawer').exists()).toBe(false)
    expect(wrapper.text()).toContain('暂无用户账号')
    expect(document.body.style.overflow).toBe('')
  })

  it('读取失败提供重试入口，接口重复用户名错误保留新增输入', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('网络连接失败')
      }),
    )
    const wrapper = await render()
    expect(wrapper.text()).toContain('账号读取失败')
    expect(wrapper.text()).toContain('网络连接失败')
    const api = mockApi()
    await wrapper.get('.empty-state button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.user-table').exists()).toBe(true)
    await wrapper.get('.hero-actions button').trigger('click')
    await body().get('#formUsername').setValue('ArchiveEditor')
    await body().get('#formPassword').setValue('test-password')
    api.reject('用户名已存在')
    await body().get('#userCreateForm').trigger('submit')
    await flushPromises()
    expect(body().get('.form-alert').text()).toBe('用户名已存在')
    expect(body().get('#formUsername').element).toHaveProperty('value', 'ArchiveEditor')
    expect(body().text()).not.toContain('用户已创建')
  })

  it('沿用顶部标签未保存保护状态：未改为空，编辑及提交中正确标记', async () => {
    mockApi()
    const wrapper = await render()
    const state = () =>
      (
        wrapper.vm as unknown as { getCloseState: () => { dirty: boolean; submitting: boolean } }
      ).getCloseState()
    await wrapper.get('.hero-actions button').trigger('click')
    expect(state()).toEqual({ dirty: false, submitting: false })
    await body().get('#formUsername').setValue('unsaved')
    expect(state().dirty).toBe(true)
    await body().get('[aria-label="关闭用户抽屉"]').trigger('click')
    await openDetail(wrapper)
    await body().get('[aria-label="编辑用户名"]').trigger('click')
    expect(state().dirty).toBe(false)
    await body().get('#editUsername').setValue('changed')
    expect(state().dirty).toBe(true)
  })

  it('用户管理路由与侧栏仅对管理员开放，编辑账号不能直接进入', async () => {
    mockApi()
    sessionStorage.setItem(
      'acgbox-user',
      JSON.stringify({ id: 1, username: 'Admin', role: 'ADMIN' }),
    )
    await router.push('/admin/users')
    const wrapper = mount(App, { global: { plugins: [router] } })
    wrappers.push(wrapper)
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/admin/users')
    expect(wrapper.find('a[href="/admin/users"]').exists()).toBe(true)
    wrapper.unmount()
    wrappers.pop()
    sessionStorage.setItem(
      'acgbox-user',
      JSON.stringify({ id: 2, username: 'Editor', role: 'EDITOR' }),
    )
    await router.push('/admin/dashboard')
    await router.push('/admin/users')
    expect(router.currentRoute.value.path).toBe('/admin/dashboard')
    const editorWrapper = mount(App, { global: { plugins: [router] } })
    wrappers.push(editorWrapper)
    expect(editorWrapper.find('a[href="/admin/users"]').exists()).toBe(false)
  })
})

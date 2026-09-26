import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import App from '@/App.vue'
import router from '@/router'
import TagsView from '@/views/admin/TagsView.vue'

type Tag = { id: number; name: string }

function mockApi() {
  const tags: Tag[] = [
    { id: 17, name: '奇幻' },
    { id: 23, name: '科幻' },
    { id: 41, name: '冒险' },
    { id: 58, name: '治愈' },
    { id: 62, name: '日常' },
    { id: 75, name: '校园' },
  ]
  const requests: Array<{ path: string; query: string; method: string; body?: unknown }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      requests.push({ path: url.pathname, query: url.search, method, body })
      let data: unknown = null
      let code = 200
      let message = '操作成功'
      if (url.pathname.endsWith('/tags/page')) {
        const pageNum = Number(url.searchParams.get('pageNum'))
        const pageSize = Number(url.searchParams.get('pageSize'))
        const name = url.searchParams.get('name') ?? ''
        const rows = tags.filter((tag) => tag.name.includes(name))
        data = {
          pageNum,
          pageSize,
          total: rows.length,
          pages: Math.ceil(rows.length / pageSize),
          rows: rows.slice((pageNum - 1) * pageSize, pageNum * pageSize),
        }
      } else if (/\/tags\/\d+$/.test(url.pathname)) {
      data = tags.find((tag) => tag.id === Number(url.pathname.split('/').pop()))
      } else if (url.pathname.endsWith('/tags/create') || url.pathname.endsWith('/tags/update')) {
        if (tags.some((tag) => tag.name === body.name && tag.id !== body.id)) {
          code = 500
          message = '此标签已存在'
        } else if (url.pathname.endsWith('/tags/create')) {
          data = { id: 99, name: body.name }
          tags.unshift(data as Tag)
        } else {
          const tag = tags.find((item) => item.id === body.id)!
          tag.name = body.name
          data = tag
        }
      } else if (url.pathname.endsWith('/tags/delete')) {
        for (const id of body as number[]) {
          const index = tags.findIndex((tag) => tag.id === id)
          if (index >= 0) tags.splice(index, 1)
        }
      }
      return { ok: true, status: 200, json: async () => ({ code, message, data }) }
    }),
  )
  return requests
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
})

describe('标签管理页面', () => {
  it('沿用现有管理布局和标签管理路由入口', async () => {
    mockApi()
    await router.push('/admin/dashboard')
    const wrapper = mount(App, { attachTo: document.body, global: { plugins: [router] } })

    await wrapper.get('a.nav-item[href="/admin/tags"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/admin/tags')
    expect(wrapper.find('.workspace-tab.active').text()).toContain('标签管理')
    expect(wrapper.find('.tags-management').exists()).toBe(true)
    await wrapper.get('.tags-hero .primary-button').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('.tags-drawer')?.textContent).toContain('新增标签')
    wrapper.unmount()
  })

  it('只展示名称和操作，搜索与分页使用标签分页接口', async () => {
    const requests = mockApi()
    await router.push('/admin/tags')
    const wrapper = mount(TagsView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.findAll('.tags-table th').map((cell) => cell.text())).toEqual([
      '',
      '标签名称',
      '操作',
    ])
    expect(wrapper.find('.tags-table').text()).not.toContain('17')
    expect(wrapper.find('[aria-label^="查看"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('标签总数')
    const bulkDelete = wrapper.get('.tags-header-actions .danger-button')
    expect(bulkDelete.attributes('disabled')).toBeDefined()
    await bulkDelete.trigger('click')
    expect(document.body.querySelector('.tags-dialog')).toBeNull()
    await wrapper.get('input[aria-label="选择标签 奇幻"]').setValue(true)
    expect(bulkDelete.attributes('disabled')).toBeUndefined()
    await wrapper.get('input[aria-label="选择标签 奇幻"]').setValue(false)

    await wrapper.get('.tags-search input').setValue('科幻')
    await wrapper.get('.tags-filter').trigger('submit')
    await flushPromises()
    expect(wrapper.get('.tags-name').text()).toBe('科幻')
    expect(
      requests.some(
        (request) =>
          request.path === '/api/tags/page' &&
          request.query.includes('name=%E7%A7%91%E5%B9%BB') &&
          request.query.includes('pageNum=1'),
      ),
    ).toBe(true)

    await wrapper.get('#tagsPageSize').trigger('click')
    await wrapper.get('.archive-select-option').trigger('click')
    await flushPromises()
    expect(
      requests.some(
        (request) => request.path === '/api/tags/page' && request.query.includes('pageSize=5'),
      ),
    ).toBe(true)
    await wrapper.get('.tags-filter .ghost-button').trigger('click')
    await flushPromises()
    await wrapper.get('button[aria-label="下一页"]').trigger('click')
    await flushPromises()
    expect(
      requests.some(
        (request) =>
          request.path === '/api/tags/page' &&
          request.query.includes('pageNum=2') &&
          request.query.includes('pageSize=5'),
      ),
    ).toBe(true)
    wrapper.unmount()
  })

  it('新增与修改都在抽屉，重复名称使用接口错误提示', async () => {
    const requests = mockApi()
    await router.push('/admin/tags')
    const wrapper = mount(TagsView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()

    await wrapper.get('.tags-hero .primary-button').trigger('click')
    expect(document.body.querySelector('.tags-drawer')?.textContent).toContain('新增标签')
    const form = document.body.querySelector<HTMLFormElement>('#tagEditorForm')!
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(document.body.querySelector('.tags-error')?.textContent).toContain('不能为空')
    expect(requests.some((request) => request.path === '/api/tags/create')).toBe(false)

    const nameInput = document.body.querySelector<HTMLInputElement>('#tagsEditorName')!
    nameInput.value = '奇幻'
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(document.body.querySelector('.tags-error')?.textContent).toContain('已存在')
    expect(document.body.querySelector('.tags-drawer')).not.toBeNull()

    nameInput.value = '动作'
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(
      requests.find(
        (request) => request.path === '/api/tags/create' && (request.body as Tag).name === '动作',
      )?.body,
    ).toEqual({ name: '动作' })
    expect(wrapper.text()).toContain('动作')

    await wrapper.get('button[aria-label="编辑标签 动作"]').trigger('click')
    await flushPromises()
    expect(requests.some((request) => request.path === '/api/tags/99')).toBe(true)
    expect(document.body.querySelector<HTMLInputElement>('#tagsEditorName')?.value).toBe('动作')
    const editInput = document.body.querySelector<HTMLInputElement>('#tagsEditorName')!
    editInput.value = '动作片'
    editInput.dispatchEvent(new Event('input', { bubbles: true }))
    document.body
      .querySelector<HTMLFormElement>('#tagEditorForm')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(requests.find((request) => request.path === '/api/tags/update')?.body).toEqual({
      id: 99,
      name: '动作片',
    })
    expect(wrapper.text()).toContain('动作片')
    wrapper.unmount()
  })

  it('删除弹窗要求确认，提交所选标签 ID 但不显示 ID', async () => {
    const requests = mockApi()
    await router.push('/admin/tags')
    const wrapper = mount(TagsView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()

    await wrapper.get('button[aria-label="删除标签 奇幻"]').trigger('click')
    expect(document.body.querySelector('.tags-dialog')?.textContent).toContain('奇幻')
    expect(document.body.querySelector('.tags-dialog')?.textContent).not.toContain('17')
    document.body.querySelector<HTMLButtonElement>('.tags-dialog-actions .danger-button')!.click()
    await flushPromises()
    expect(document.body.querySelector('.tags-dialog .tags-error')?.textContent).toContain(
      '请先勾选',
    )
    expect(requests.some((request) => request.path === '/api/tags/delete')).toBe(false)

    const checkbox = document.body.querySelector<HTMLInputElement>('.tags-delete-check input')!
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    document.body.querySelector<HTMLButtonElement>('.tags-dialog-actions .danger-button')!.click()
    await flushPromises()
    expect(requests.find((request) => request.path === '/api/tags/delete')?.body).toEqual([17])
    expect(wrapper.text()).not.toContain('奇幻')
    wrapper.unmount()
  })

  it('支持勾选多条标签后批量删除', async () => {
    const requests = mockApi()
    await router.push('/admin/tags')
    const wrapper = mount(TagsView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()

    await wrapper.get('input[aria-label="选择标签 奇幻"]').setValue(true)
    await wrapper.get('input[aria-label="选择标签 科幻"]').setValue(true)
    await wrapper.get('.tags-header-actions .danger-button').trigger('click')
    expect(document.body.querySelector('.tags-delete-preview')?.textContent).toContain('奇幻、科幻')
    expect(document.body.querySelector('.tags-delete-preview')?.textContent).not.toContain('17')
    const checkbox = document.body.querySelector<HTMLInputElement>('.tags-delete-check input')!
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    document.body.querySelector<HTMLButtonElement>('.tags-dialog-actions .danger-button')!.click()
    await flushPromises()

    expect(requests.find((request) => request.path === '/api/tags/delete')?.body).toEqual([17, 23])
    expect(wrapper.text()).not.toContain('奇幻')
    expect(wrapper.text()).not.toContain('科幻')
    wrapper.unmount()
  })
})

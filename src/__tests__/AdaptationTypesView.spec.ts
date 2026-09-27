import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import router from '@/router'
import AdaptationTypesView from '@/views/admin/AdaptationTypesView.vue'

function mockApi() {
  const requests: Array<{ path: string; body?: unknown }> = []
  let types = [
    { id: 2, name: '漫画改' },
    { id: 3, name: '小说改' },
    { id: 1, name: '原创' },
  ]
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = new URL(String(input), 'http://localhost').pathname
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      requests.push({ path, body })
      let data: unknown = null
      if (path.endsWith('/adaptation-type/list')) data = [...types]
      else if (path.endsWith('/adaptation-type/2')) data = types.find((item) => item.id === 2)
      else if (path.endsWith('/adaptation-type/create')) {
        const created = { id: 4, name: body.name }
        types = [...types, created]
        data = created
      } else if (path.endsWith('/adaptation-type/update')) {
        types = types.map((item) => (item.id === body.id ? body : item))
        data = body
      } else if (path.endsWith('/adaptation-type/delete')) {
        types = types.filter((item) => !body.includes(item.id))
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ code: 200, message: '操作成功', data }),
      }
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

describe('改编类型管理页面', () => {
  it('全量读取并按名称筛选，列表不展示数据库 ID 或详情入口', async () => {
    const requests = mockApi()
    await router.push('/admin/adaptation-types')
    const wrapper = mount(AdaptationTypesView, {
      attachTo: document.body,
      global: { plugins: [router] },
    })
    await flushPromises()

    expect(requests.some((request) => request.path === '/api/adaptation-type/list')).toBe(true)
    expect(wrapper.findAll('.adaptation-table th').map((cell) => cell.text())).toEqual([
      '',
      '改编类型名称',
      '操作',
    ])
    expect(wrapper.find('.adaptation-table').text()).not.toContain('#2')
    expect(wrapper.find('[title="查看详情"]').exists()).toBe(false)
    await wrapper.get('.adaptation-search input').setValue('漫画')
    await wrapper.get('.adaptation-filter').trigger('submit')
    expect(wrapper.findAll('.adaptation-table tbody tr')).toHaveLength(1)
    expect(wrapper.find('.adaptation-table tbody').text()).toContain('漫画改')
    await wrapper.get('.adaptation-filter .ghost-button').trigger('click')
    expect(wrapper.findAll('.adaptation-table tbody tr')).toHaveLength(3)
    wrapper.unmount()
  })

  it('新增和修改均通过抽屉提交已有接口，修改时按 ID 回填', async () => {
    const requests = mockApi()
    await router.push('/admin/adaptation-types')
    const wrapper = mount(AdaptationTypesView, {
      attachTo: document.body,
      global: { plugins: [router] },
    })
    await flushPromises()

    await wrapper.get('.adaptation-hero .primary-button').trigger('click')
    expect(document.body.querySelector('.adaptation-drawer')?.textContent).toContain('新增改编类型')
    document.body
      .querySelector<HTMLFormElement>('#adaptationEditorForm')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(document.body.querySelector('.adaptation-error')?.textContent).toContain('不能为空')
    const input = document.body.querySelector<HTMLInputElement>('#adaptationEditorName')!
    input.value = '游戏改'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    document.body
      .querySelector<HTMLFormElement>('#adaptationEditorForm')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(
      requests.find((request) => request.path === '/api/adaptation-type/create')?.body,
    ).toEqual({ name: '游戏改' })
    expect(document.body.querySelector('.adaptation-drawer')).toBeNull()

    await wrapper.get('button[aria-label="编辑改编类型 漫画改"]').trigger('click')
    await flushPromises()
    expect(requests.some((request) => request.path === '/api/adaptation-type/2')).toBe(true)
    expect(document.body.querySelector<HTMLInputElement>('#adaptationEditorName')?.value).toBe(
      '漫画改',
    )
    const editInput = document.body.querySelector<HTMLInputElement>('#adaptationEditorName')!
    editInput.value = '漫画改编'
    editInput.dispatchEvent(new Event('input', { bubbles: true }))
    document.body
      .querySelector<HTMLFormElement>('#adaptationEditorForm')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(
      requests.find((request) => request.path === '/api/adaptation-type/update')?.body,
    ).toEqual({ id: 2, name: '漫画改编' })
    expect(wrapper.find('.adaptation-table').text()).toContain('漫画改编')
    wrapper.unmount()
  })

  it('删除需勾选确认，批量请求只使用内部 ID', async () => {
    const requests = mockApi()
    await router.push('/admin/adaptation-types')
    const wrapper = mount(AdaptationTypesView, {
      attachTo: document.body,
      global: { plugins: [router] },
    })
    await flushPromises()
    expect(
      wrapper.get('.adaptation-header-actions .danger-button').attributes('disabled'),
    ).toBeDefined()
    await wrapper.get('[aria-label="选择当前结果全部类型"]').setValue(true)
    await wrapper.get('.adaptation-header-actions .danger-button').trigger('click')
    expect(document.body.querySelector('.adaptation-dialog')?.textContent).not.toContain('ID')
    document.body
      .querySelector<HTMLButtonElement>('.adaptation-dialog-actions .danger-button')
      ?.click()
    await flushPromises()
    expect(document.body.querySelector('.adaptation-delete-error')?.textContent).toContain(
      '请先勾选',
    )
    expect(requests.some((request) => request.path === '/api/adaptation-type/delete')).toBe(false)
    const checkbox = document.body.querySelector<HTMLInputElement>(
      '.adaptation-delete-check input',
    )!
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    document.body
      .querySelector<HTMLButtonElement>('.adaptation-dialog-actions .danger-button')
      ?.click()
    await flushPromises()
    expect(
      requests.find((request) => request.path === '/api/adaptation-type/delete')?.body,
    ).toEqual([2, 3, 1])
    expect(wrapper.text()).toContain('暂无改编类型')
    wrapper.unmount()
  })
})

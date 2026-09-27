import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import router from '@/router'
import RegionsView from '@/views/admin/RegionsView.vue'

function mockApi() {
  const requests: Array<{ path: string; body?: unknown }> = []
  let regions = [
    { id: 2, name: '日本' },
    { id: 3, name: '中国' },
    { id: 1, name: '美国' },
  ]
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = new URL(String(input), 'http://localhost').pathname
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      requests.push({ path, body })
      let data: unknown = null
      if (path.endsWith('/region/list')) data = [...regions]
      else if (path.endsWith('/region/2')) data = regions.find((region) => region.id === 2)
      else if (path.endsWith('/region/create')) {
        const created = { id: 4, name: body.name }
        regions = [...regions, created]
        data = created
      } else if (path.endsWith('/region/update')) {
        regions = regions.map((region) => (region.id === body.id ? body : region))
        data = body
      } else if (path.endsWith('/region/delete')) {
        regions = regions.filter((region) => !body.includes(region.id))
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

describe('地区管理页面', () => {
  it('读取地区列表并按名称筛选，不展示数据库 ID 或详情入口', async () => {
    const requests = mockApi()
    await router.push('/admin/regions')
    const wrapper = mount(RegionsView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()

    expect(requests.some((request) => request.path === '/api/region/list')).toBe(true)
    expect(wrapper.findAll('.regions-table th').map((cell) => cell.text())).toEqual([
      '',
      '地区名称',
      '操作',
    ])
    expect(wrapper.find('.regions-table').text()).not.toContain('#2')
    expect(wrapper.find('[title="查看详情"]').exists()).toBe(false)
    await wrapper.get('.regions-search input').setValue('日本')
    await wrapper.get('.regions-filter').trigger('submit')
    expect(wrapper.findAll('.regions-table tbody tr')).toHaveLength(1)
    await wrapper.get('.regions-filter .ghost-button').trigger('click')
    expect(wrapper.findAll('.regions-table tbody tr')).toHaveLength(3)
    wrapper.unmount()
  })

  it('新增与修改使用抽屉和实际接口，并在修改时回填', async () => {
    const requests = mockApi()
    await router.push('/admin/regions')
    const wrapper = mount(RegionsView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()

    await wrapper.get('.regions-hero .primary-button').trigger('click')
    expect(document.body.querySelector('.regions-drawer')?.textContent).toContain('新增地区')
    document.body.querySelector<HTMLFormElement>('#regionsEditorForm')?.requestSubmit()
    await flushPromises()
    expect(document.body.querySelector('.regions-error')?.textContent).toContain('不能为空')
    const input = document.body.querySelector<HTMLInputElement>('#regionsEditorName')!
    input.value = '韩国'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    document.body.querySelector<HTMLFormElement>('#regionsEditorForm')?.requestSubmit()
    await flushPromises()
    expect(requests.find((request) => request.path === '/api/region/create')?.body).toEqual({
      name: '韩国',
    })
    expect(document.body.querySelector('.regions-drawer')).toBeNull()

    await wrapper.get('button[aria-label="编辑地区 日本"]').trigger('click')
    await flushPromises()
    expect(requests.some((request) => request.path === '/api/region/2')).toBe(true)
    expect(document.body.querySelector<HTMLInputElement>('#regionsEditorName')?.value).toBe('日本')
    const editInput = document.body.querySelector<HTMLInputElement>('#regionsEditorName')!
    editInput.value = '日本地区'
    editInput.dispatchEvent(new Event('input', { bubbles: true }))
    document.body.querySelector<HTMLFormElement>('#regionsEditorForm')?.requestSubmit()
    await flushPromises()
    expect(requests.find((request) => request.path === '/api/region/update')?.body).toEqual({
      id: 2,
      name: '日本地区',
    })
    wrapper.unmount()
  })

  it('删除需勾选确认，批量删除使用内部 ID', async () => {
    const requests = mockApi()
    await router.push('/admin/regions')
    const wrapper = mount(RegionsView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()

    expect(
      wrapper.get('.regions-header-actions .danger-button').attributes('disabled'),
    ).toBeDefined()
    await wrapper.get('[aria-label="选择当前结果全部地区"]').setValue(true)
    await wrapper.get('.regions-header-actions .danger-button').trigger('click')
    expect(document.body.querySelector('.regions-dialog')?.textContent).not.toContain('ID')
    document.body
      .querySelector<HTMLButtonElement>('.regions-dialog-actions .danger-button')
      ?.click()
    await flushPromises()
    expect(document.body.querySelector('.regions-delete-error')?.textContent).toContain('请先勾选')
    expect(requests.some((request) => request.path === '/api/region/delete')).toBe(false)
    const checkbox = document.body.querySelector<HTMLInputElement>('.regions-delete-check input')!
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    document.body
      .querySelector<HTMLButtonElement>('.regions-dialog-actions .danger-button')
      ?.click()
    await flushPromises()
    expect(
      (requests.find((request) => request.path === '/api/region/delete')?.body as number[]).sort(),
    ).toEqual([1, 2, 3])
    expect(wrapper.text()).toContain('暂无地区')
    wrapper.unmount()
  })
})

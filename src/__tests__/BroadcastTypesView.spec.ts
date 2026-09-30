import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import router from '@/router'
import BroadcastTypesView from '@/views/admin/BroadcastTypesView.vue'

function mockApi() {
  const requests: Array<{ path: string; body?: unknown }> = []
  let broadcast = [
    { id: 2, name: 'TV' },
    { id: 3, name: 'WEB' },
    { id: 1, name: 'OVA' },
  ]
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = new URL(String(input), 'http://localhost').pathname
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      requests.push({ path, body })
      let data: unknown = null
      if (path.endsWith('/broadcast-type/list')) data = [...broadcast]
      else if (path.endsWith('/broadcast-type/2')) data = broadcast.find((type) => type.id === 2)
      else if (path.endsWith('/broadcast-type/create')) {
        const created = { id: 4, name: body.name }
        broadcast = [...broadcast, created]
        data = created
      } else if (path.endsWith('/broadcast-type/update')) {
        broadcast = broadcast.map((type) => (type.id === body.id ? body : type))
        data = body
      } else if (path.endsWith('/broadcast-type/delete')) {
        broadcast = broadcast.filter((type) => !body.includes(type.id))
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

describe('放送类型管理页面', () => {
  it('读取放送类型列表并按名称筛选，不展示数据库 ID 或详情入口', async () => {
    const requests = mockApi()
    await router.push('/admin/broadcast-types')
    const wrapper = mount(BroadcastTypesView, {
      attachTo: document.body,
      global: { plugins: [router] },
    })
    await flushPromises()

    expect(requests.some((request) => request.path === '/api/broadcast-type/list')).toBe(true)
    expect(wrapper.findAll('.broadcast-table th').map((cell) => cell.text())).toEqual([
      '',
      '放送类型名称',
      '操作',
    ])
    expect(wrapper.find('.broadcast-table').text()).not.toContain('#2')
    expect(wrapper.find('[title="查看详情"]').exists()).toBe(false)
    await wrapper.get('.broadcast-search input').setValue('TV')
    await wrapper.get('.broadcast-filter').trigger('submit')
    expect(wrapper.findAll('.broadcast-table tbody tr')).toHaveLength(1)
    await wrapper.get('.broadcast-filter .ghost-button').trigger('click')
    expect(wrapper.findAll('.broadcast-table tbody tr')).toHaveLength(3)
    wrapper.unmount()
  })

  it('新增与修改使用抽屉和实际接口，并在修改时回填', async () => {
    const requests = mockApi()
    await router.push('/admin/broadcast-types')
    const wrapper = mount(BroadcastTypesView, {
      attachTo: document.body,
      global: { plugins: [router] },
    })
    await flushPromises()

    await wrapper.get('.broadcast-hero .primary-button').trigger('click')
    expect(document.body.querySelector('.broadcast-drawer')?.textContent).toContain('新增放送类型')
    document.body.querySelector<HTMLFormElement>('#broadcastEditorForm')?.requestSubmit()
    await flushPromises()
    expect(document.body.querySelector('.broadcast-error')?.textContent).toContain('不能为空')
    const input = document.body.querySelector<HTMLInputElement>('#broadcastEditorName')!
    input.value = '剧场版'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    document.body.querySelector<HTMLFormElement>('#broadcastEditorForm')?.requestSubmit()
    await flushPromises()
    expect(requests.find((request) => request.path === '/api/broadcast-type/create')?.body).toEqual(
      {
        name: '剧场版',
      },
    )
    expect(document.body.querySelector('.broadcast-drawer')).toBeNull()

    await wrapper.get('button[aria-label="编辑放送类型 TV"]').trigger('click')
    await flushPromises()
    expect(requests.some((request) => request.path === '/api/broadcast-type/2')).toBe(true)
    expect(document.body.querySelector<HTMLInputElement>('#broadcastEditorName')?.value).toBe('TV')
    const editInput = document.body.querySelector<HTMLInputElement>('#broadcastEditorName')!
    editInput.value = 'TV放送类型'
    editInput.dispatchEvent(new Event('input', { bubbles: true }))
    document.body.querySelector<HTMLFormElement>('#broadcastEditorForm')?.requestSubmit()
    await flushPromises()
    expect(requests.find((request) => request.path === '/api/broadcast-type/update')?.body).toEqual(
      {
        id: 2,
        name: 'TV放送类型',
      },
    )
    wrapper.unmount()
  })

  it('删除需勾选确认，批量删除使用内部 ID', async () => {
    const requests = mockApi()
    await router.push('/admin/broadcast-types')
    const wrapper = mount(BroadcastTypesView, {
      attachTo: document.body,
      global: { plugins: [router] },
    })
    await flushPromises()

    expect(
      wrapper.get('.broadcast-header-actions .danger-button').attributes('disabled'),
    ).toBeDefined()
    await wrapper.get('[aria-label="选择当前结果全部放送类型"]').setValue(true)
    await wrapper.get('.broadcast-header-actions .danger-button').trigger('click')
    expect(document.body.querySelector('.broadcast-dialog')?.textContent).not.toContain('ID')
    document.body
      .querySelector<HTMLButtonElement>('.broadcast-dialog-actions .danger-button')
      ?.click()
    await flushPromises()
    expect(document.body.querySelector('.broadcast-delete-error')?.textContent).toContain(
      '请先勾选',
    )
    expect(requests.some((request) => request.path === '/api/broadcast-type/delete')).toBe(false)
    const checkbox = document.body.querySelector<HTMLInputElement>('.broadcast-delete-check input')!
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    document.body
      .querySelector<HTMLButtonElement>('.broadcast-dialog-actions .danger-button')
      ?.click()
    await flushPromises()
    expect(
      (
        requests.find((request) => request.path === '/api/broadcast-type/delete')?.body as number[]
      ).sort(),
    ).toEqual([1, 2, 3])
    expect(wrapper.text()).toContain('暂无放送类型')
    wrapper.unmount()
  })
})

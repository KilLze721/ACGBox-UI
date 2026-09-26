import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import router from '@/router'
import SeriesView from '@/views/admin/SeriesView.vue'

const initialSeries = { id: 7, name: '葬送的芙莉莲', description: '系列说明' }
const linkedAnime = {
  id: 17,
  name: '葬送的芙莉莲',
  coverImageUrl: null,
  series: initialSeries,
}
function mockApi() {
  const requests: Array<{ path: string; query: string; method: string; body?: unknown }> = []
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    requests.push({ path: url.pathname, query: url.search, method, body })
    let data: unknown = null
    if (url.pathname.endsWith('/series/page')) {
      const match =
        !url.searchParams.get('name') || initialSeries.name.includes(url.searchParams.get('name')!)
      data = {
        pageNum: Number(url.searchParams.get('pageNum')),
        pageSize: Number(url.searchParams.get('pageSize')),
        total: match ? 1 : 0,
        pages: match ? 1 : 0,
        rows: match ? [initialSeries] : [],
      }
    } else if (url.pathname.endsWith('/series/7')) data = initialSeries
    else if (url.pathname.endsWith('/anime/page')) {
      const keyword = url.searchParams.get('keyword')
      const rows = [linkedAnime].filter(
        (anime) => !keyword || anime.name.includes(keyword) || anime.series?.name.includes(keyword),
      )
      data = { pageNum: 1, pageSize: 20, total: rows.length, pages: 1, rows }
    } else if (url.pathname.endsWith('/series/create'))
      data = { id: 8, name: body.name, description: body.description }
    else if (url.pathname.endsWith('/series/update'))
      data = { id: body.id, name: body.name, description: body.description }
    return { ok: true, status: 200, json: async () => ({ code: 200, message: '操作成功', data }) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return requests
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
})

describe('系列管理页面', () => {
  it('系列详情链接可在刷新后按系列 ID 打开对应抽屉', async () => {
    const requests = mockApi()
    await router.push('/admin/series/7')
    expect(router.currentRoute.value.fullPath).toBe('/admin/series?detail=7')

    const wrapper = mount(SeriesView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()

    expect(document.body.querySelector('.series-drawer')?.textContent).toContain('系列详情')
    expect(document.body.querySelector('.series-drawer')?.textContent).toContain(initialSeries.name)
    expect(requests.some((request) => request.path === '/api/series/7')).toBe(true)
    wrapper.unmount()
  })

  it('分页、搜索、详情关联和动画列表搜索跳转使用实际接口', async () => {
    const requests = mockApi()
    await router.push('/admin/series')
    const wrapper = mount(SeriesView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('系列档案列表')
    expect(wrapper.text()).toContain(initialSeries.name)
    expect(wrapper.findAll('.series-table th').map((cell) => cell.text())).not.toContain('ID')
    expect(wrapper.find('.series-table').text()).not.toContain('#7')
    expect(requests.some((request) => request.path === '/api/series/page')).toBe(true)
    expect(wrapper.get('.series-search input').attributes('type')).toBe('text')
    expect(wrapper.find('.series-search button').exists()).toBe(false)

    await wrapper.get('#seriesPageSize').trigger('click')
    expect(wrapper.get('.page-size-select').classes()).toContain('placement-top')
    await wrapper.get('.archive-select-option').trigger('click')
    await flushPromises()
    expect(
      requests.some(
        (request) => request.path === '/api/series/page' && request.query.includes('pageSize=5'),
      ),
    ).toBe(true)

    await wrapper.get('.series-search input').setValue('不存在')
    await wrapper.get('.series-filter').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('没有匹配的系列')
    await wrapper.get('.series-filter .ghost-button').trigger('click')
    await flushPromises()

    await wrapper.get('.series-row-name').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('.series-drawer')?.textContent).toContain('系列说明')
    expect(document.body.querySelector('.series-drawer')?.textContent).not.toContain('系列 ID')
    expect(document.body.querySelector('.series-work-item.related')?.textContent).toContain(
      linkedAnime.name,
    )
    ;(document.body.querySelector('.series-work-item.related') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/admin/anime'))
    expect(router.currentRoute.value.query.keyword).toBe(linkedAnime.name)
    expect(router.currentRoute.value.query.detail).toBeUndefined()
    wrapper.unmount()
  })

  it('新增系列只保存名称和说明，不提供关联编辑或修改动画', async () => {
    const requests = mockApi()
    await router.push('/admin/series')
    const wrapper = mount(SeriesView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()
    await wrapper.get('.series-hero .primary-button').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('.series-association-controls')).toBeNull()
    expect(document.body.querySelector('.series-work-list')).toBeNull()

    const nameInput = document.body.querySelector<HTMLInputElement>('#seriesName')!
    nameInput.value = '新系列'
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))

    document.body
      .querySelector<HTMLFormElement>('#seriesEditorForm')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(requests.find((request) => request.path === '/api/series/create')?.body).toEqual({
      name: '新系列',
      description: null,
    })
    expect(requests.some((request) => request.path.startsWith('/api/anime/'))).toBe(false)
    expect(document.body.querySelector('.series-toast')?.textContent).toContain('系列保存成功')
    wrapper.unmount()
  })

  it('删除需要二次确认，提交系列 ID 数组', async () => {
    const requests = mockApi()
    await router.push('/admin/series')
    const wrapper = mount(SeriesView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()
    await wrapper.get('.series-row-actions .danger').trigger('click')
    expect(document.body.querySelector('.series-delete-note')?.textContent).toContain(
      '若仍有作品关联此系列',
    )
    const check = document.body.querySelector('.series-delete-check')!
    const note = document.body.querySelector('.series-delete-note')!
    expect(check.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    ;(
      document.body.querySelector('.series-dialog-actions .danger-button') as HTMLButtonElement
    ).click()
    await flushPromises()
    expect(document.body.querySelector('.series-dialog .series-checkbox-error')?.textContent).toContain(
      '请先勾选',
    )
    expect(requests.some((request) => request.path === '/api/series/delete')).toBe(false)
    const confirmation = document.body.querySelector<HTMLInputElement>(
      '.series-delete-check input',
    )!
    confirmation.checked = true
    confirmation.dispatchEvent(new Event('change', { bubbles: true }))
    ;(
      document.body.querySelector('.series-dialog-actions .danger-button') as HTMLButtonElement
    ).click()
    await flushPromises()
    expect(requests.find((request) => request.path === '/api/series/delete')?.body).toEqual([7])
    wrapper.unmount()
  })

  it('编辑抽屉只修改系列信息，不读取或改写动画关联', async () => {
    const requests = mockApi()
    await router.push('/admin/series')
    const wrapper = mount(SeriesView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()
    await wrapper.get('.series-row-actions button[title="编辑"]').trigger('click')
    await flushPromises()
    expect(document.body.querySelector<HTMLInputElement>('#seriesName')?.value).toBe(
      initialSeries.name,
    )
    expect(document.body.querySelector<HTMLTextAreaElement>('#seriesDescription')?.value).toBe(
      initialSeries.description,
    )
    expect(document.body.querySelector('.series-association-controls')).toBeNull()
    const nameInput = document.body.querySelector<HTMLInputElement>('#seriesName')!
    nameInput.value = '葬送的芙莉莲系列'
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    document.body
      .querySelector<HTMLFormElement>('#seriesEditorForm')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(requests.find((request) => request.path === '/api/series/update')?.body).toEqual({
      id: 7,
      name: '葬送的芙莉莲系列',
      description: initialSeries.description,
    })
    expect(requests.some((request) => request.path.startsWith('/api/anime/'))).toBe(false)
    wrapper.unmount()
  })
})

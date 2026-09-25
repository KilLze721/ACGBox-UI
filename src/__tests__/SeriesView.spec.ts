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
const freeAnime = {
  id: 19,
  name: '未归属动画',
  coverImageUrl: null,
  series: null,
}

function mockApi() {
  const requests: Array<{ path: string; method: string; body?: unknown }> = []
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    requests.push({ path: url.pathname, method, body })
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
      const rows = [linkedAnime, freeAnime].filter(
        (anime) => !keyword || anime.name.includes(keyword) || anime.series?.name.includes(keyword),
      )
      data = { pageNum: 1, pageSize: 20, total: rows.length, pages: 1, rows }
    } else if (url.pathname.endsWith('/anime/19')) {
      data = {
        id: 19,
        name: freeAnime.name,
        episodeCount: 12,
        broadcastTypeId: 1,
        adaptationTypeId: 1,
        regionId: 1,
        airDate: '2026-09-01',
        coverImageUrl: null,
        status: 1,
        description: null,
        aliasNames: [],
        companies: [],
        externalLinks: [],
        tagIds: [],
        seriesId: null,
        seriesSortOrder: null,
        personalRatingScore: null,
      }
    } else if (url.pathname.endsWith('/anime/17')) {
      data = {
        id: 17,
        name: linkedAnime.name,
        episodeCount: 28,
        broadcastTypeId: 1,
        adaptationTypeId: 2,
        regionId: 1,
        airDate: '2023-09-29',
        coverImageUrl: null,
        status: 3,
        description: '原有介绍',
        aliasNames: ['原有别名'],
        companies: [],
        externalLinks: [],
        tagIds: [17],
        seriesId: 7,
        seriesSortOrder: 2,
        personalRatingScore: 8,
      }
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
  it('分页、搜索、详情关联和动画详情跳转使用实际接口', async () => {
    const requests = mockApi()
    await router.push('/admin/series')
    const wrapper = mount(SeriesView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('系列档案列表')
    expect(wrapper.text()).toContain(initialSeries.name)
    expect(requests.some((request) => request.path === '/api/series/page')).toBe(true)

    await wrapper.get('.series-search input').setValue('不存在')
    await wrapper.get('.series-filter').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('没有匹配的系列')
    await wrapper.get('.series-filter .ghost-button').trigger('click')
    await flushPromises()

    await wrapper.get('.series-row-name').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('.series-drawer')?.textContent).toContain('系列说明')
    expect(document.body.querySelector('.series-work-item.related')?.textContent).toContain(
      linkedAnime.name,
    )
    ;(document.body.querySelector('.series-work-item.related') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/admin/anime'))
    expect(router.currentRoute.value.query.detail).toBe('17')
    wrapper.unmount()
  })

  it('新增系列时用实际动画 ID 建立关联，漫画演示项不提交', async () => {
    const requests = mockApi()
    await router.push('/admin/series')
    const wrapper = mount(SeriesView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()
    await wrapper.get('.series-hero .primary-button').trigger('click')
    await flushPromises()

    const nameInput = document.body.querySelector<HTMLInputElement>('#seriesName')!
    nameInput.value = '新系列'
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    const choice = document.body.querySelector<HTMLSelectElement>(
      'select[aria-label="选择关联内容"]',
    )!
    choice.value = 'anime:19'
    choice.dispatchEvent(new Event('change', { bubbles: true }))
    ;(
      document.body.querySelector('.series-association-controls > button') as HTMLButtonElement
    ).click()
    await flushPromises()
    expect(document.body.querySelector('.series-work-list')?.textContent).toContain(freeAnime.name)

    const type = document.body.querySelector<HTMLSelectElement>(
      'select[aria-label="关联作品类型"]',
    )!
    type.value = 'manga'
    type.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 280))
    await flushPromises()
    choice.value = 'manga:201'
    choice.dispatchEvent(new Event('change', { bubbles: true }))
    ;(
      document.body.querySelector('.series-association-controls > button') as HTMLButtonElement
    ).click()
    await flushPromises()
    expect(document.body.querySelector('.series-work-list')?.textContent).toContain('仅前端演示')

    document.body
      .querySelector<HTMLFormElement>('#seriesEditorForm')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(requests.find((request) => request.path === '/api/series/create')?.body).toEqual({
      name: '新系列',
      description: null,
    })
    expect(
      (
        requests.find((request) => request.path === '/api/anime/update')?.body as {
          seriesId: number
        }
      ).seriesId,
    ).toBe(8)
    expect(requests.some((request) => request.path.includes('/manga/'))).toBe(false)
    expect(document.body.querySelector('.series-toast')?.textContent).toContain('未保存到服务器')
    wrapper.unmount()
  })

  it('删除需要二次确认，提交系列 ID 数组', async () => {
    const requests = mockApi()
    await router.push('/admin/series')
    const wrapper = mount(SeriesView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()
    await wrapper.get('.series-row-actions .danger').trigger('click')
    ;(
      document.body.querySelector('.series-dialog-actions .danger-button') as HTMLButtonElement
    ).click()
    await flushPromises()
    expect(document.body.querySelector('.series-dialog .series-error')?.textContent).toContain(
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

  it('编辑抽屉回填已有系列，移除动画关联时保留其他动画字段', async () => {
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
    expect(document.body.querySelector('.series-work-list')?.textContent).toContain(
      linkedAnime.name,
    )
    ;(
      document.body.querySelector(
        '.series-work-item button[aria-label="移除 葬送的芙莉莲"]',
      ) as HTMLButtonElement
    ).click()
    document.body
      .querySelector<HTMLFormElement>('#seriesEditorForm')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(requests.find((request) => request.path === '/api/series/update')?.body).toEqual({
      id: 7,
      name: initialSeries.name,
      description: initialSeries.description,
    })
    expect(requests.find((request) => request.path === '/api/anime/update')?.body).toMatchObject({
      id: 17,
      seriesId: null,
      seriesSortOrder: null,
      aliasNames: ['原有别名'],
      tagIds: [17],
      description: '原有介绍',
    })
    wrapper.unmount()
  })
})

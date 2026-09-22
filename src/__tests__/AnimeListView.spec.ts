import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AnimeListView from '@/views/admin/anime/AnimeListView.vue'

const animeRow = {
  id: 15,
  name: '葬送的芙莉莲',
  aliasNames: ['Frieren'],
  tags: [{ id: 18, name: '奇幻' }],
  episodeCount: 28,
  broadcastType: { id: 1, name: 'TV' },
  adaptationType: { id: 2, name: '漫画改' },
  airDate: '2023-09-29',
  coverImageUrl: null,
  status: 3,
  region: { id: 1, name: '日本' },
  companies: [{ companyId: 5, companyName: 'MADHOUSE', role: '制作' }],
  externalLinks: [],
  personalRating: 8,
  series: { id: 7, name: '葬送的芙莉莲', description: null },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('动画管理分页查询页面', () => {
  it('加载分页数据并使用表单条件重新查询', async () => {
    const fetchMock = vi
      .fn<
        (input: string | URL | Request) => Promise<{
          ok: boolean
          status: number
          json: () => Promise<unknown>
        }>
      >()
      .mockImplementation(async (input) => {
        const url = new URL(String(input), 'http://localhost')
        let data: unknown

        if (url.pathname.endsWith('/anime/page')) {
          const pageSize = Number(url.searchParams.get('pageSize'))
          data = {
            pageNum: Number(url.searchParams.get('pageNum')),
            pageSize,
            total: 15,
            pages: Math.ceil(15 / pageSize),
            rows: pageSize === 1 ? [animeRow] : [animeRow],
          }
        } else if (url.pathname.endsWith('/tags/page')) {
          data = { pageNum: 1, pageSize: 100, total: 1, pages: 1, rows: animeRow.tags }
        } else if (url.pathname.endsWith('/companies/page')) {
          data = { pageNum: 1, pageSize: 10, total: 0, pages: 0, rows: [] }
        } else {
          data = []
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ code: 200, message: '操作成功', data }),
        }
      })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mount(AnimeListView, {
      global: {
        stubs: {
          RouterLink: {
            props: ['to'],
            template: '<a :href="to"><slot /></a>',
          },
        },
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('葬送的芙莉莲')
    expect(wrapper.text()).toContain('共 15 条记录')
    expect(wrapper.find('.tag-match-control').text()).toContain('全部满足')
    expect(wrapper.find('.tag-match-control').text()).toContain('满足其一')

    await wrapper.find('.multi-select-trigger').trigger('click')
    expect(wrapper.findAll('.tag-option')).toHaveLength(1)

    await wrapper.find('.dropdown-search').setValue('不存在')
    expect(wrapper.findAll('.tag-option')).toHaveLength(0)

    await wrapper.find('.dropdown-search').setValue('奇幻')
    const tagOption = wrapper.find('.tag-option')
    await tagOption.trigger('click')
    expect(tagOption.classes()).toContain('selected')
    expect(tagOption.text()).toBe('奇幻')

    await wrapper.find('#status').trigger('click')
    const completedOption = wrapper
      .findAll('.archive-select-option')
      .find((option) => option.text() === '已完结')
    expect(completedOption).toBeDefined()
    await completedOption?.trigger('click')
    expect(wrapper.find('#status').text()).toContain('已完结')

    await wrapper.find('.date-filter-group input[type="checkbox"]').setValue(true)
    await wrapper.find('#broadcastStartDate').setValue('2020')
    await wrapper.find('#broadcastStartDate').trigger('blur')
    await wrapper.find('#broadcastEndDate').setValue('2026-9')
    await wrapper.find('#broadcastEndDate').trigger('blur')
    expect((wrapper.find('#broadcastEndDate').element as HTMLInputElement).value).toBe('2026-09')

    await wrapper.find('input[placeholder="输入动画名称、别名或系列"]').setValue('芙莉莲')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const animeRequests = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/anime/page'))
    expect(animeRequests.some((url) => url.includes('keyword=%E8%8A%99%E8%8E%89%E8%8E%B2'))).toBe(
      true,
    )
    expect(animeRequests.some((url) => url.includes('status=3'))).toBe(true)
    expect(animeRequests.some((url) => url.includes('broadcastStartDate=2020'))).toBe(true)
    expect(animeRequests.some((url) => url.includes('broadcastEndDate=2026-09'))).toBe(true)

    const requestCount = animeRequests.length
    await wrapper.find('#broadcastStartDate').setValue('2027')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('#broadcastEndDateError').text()).toContain('结束日期不能早于开始日期')
    const requestsAfterInvalidRange = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes('/anime/page'),
    )
    expect(requestsAfterInvalidRange).toHaveLength(requestCount)

    wrapper.unmount()
  })
})

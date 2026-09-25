import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import router from '@/router'
import AnimeEditorForm from '@/views/admin/anime/AnimeEditorForm.vue'

let wrapper: VueWrapper | undefined
let submittedPayload: Record<string, unknown> | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  submittedPayload = undefined
  vi.unstubAllGlobals()
})

function stubRequests() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      let data: unknown = []
      if (url.pathname.endsWith('/tags/page')) {
        data = { pageNum: 1, pageSize: 100, total: 0, pages: 0, rows: [] }
      } else if (url.pathname.endsWith('/companies/page')) {
        const matches = url.searchParams.get('name') !== '不存在的公司'
        data = {
          pageNum: Number(url.searchParams.get('pageNum')),
          pageSize: 10,
          total: matches ? 1 : 0,
          pages: matches ? 1 : 0,
          rows: matches ? [{ id: 3, name: '京都动画', description: null }] : [],
        }
      } else if (url.pathname.endsWith('/series/page')) {
        data = {
          pageNum: Number(url.searchParams.get('pageNum')),
          pageSize: 10,
          total: 1,
          pages: 1,
          rows: [{ id: 5, name: '物语系列', description: null }],
        }
      } else if (url.pathname.endsWith('/companies/3')) {
        data = { id: 3, name: '京都动画', description: null }
      } else if (url.pathname.endsWith('/series/5')) {
        data = { id: 5, name: '物语系列', description: null }
      } else if (url.pathname.endsWith('/anime/15')) {
        data = {
          id: 15,
          name: '测试动画',
          broadcastTypeId: 1,
          adaptationTypeId: 2,
          regionId: 4,
          status: 1,
          airDate: '2026-09-25',
          episodeCount: null,
          personalRatingScore: null,
          coverImageUrl: null,
          description: null,
          aliasNames: [],
          tagIds: [],
          companies: [{ companyId: 3, role: '动画制作' }],
          externalLinks: [{ title: '官网', url: 'https://example.com', sortOrder: 0 }],
          seriesId: 5,
          seriesSortOrder: 1,
        }
      } else if (url.pathname.endsWith('/anime/create')) {
        submittedPayload = JSON.parse(String(init?.body)) as Record<string, unknown>
        data = { id: 20 }
      } else if (url.pathname.endsWith('/broadcast-type/list')) {
        data = [{ id: 1, name: 'TV' }]
      } else if (url.pathname.endsWith('/adaptation-type/list')) {
        data = [{ id: 2, name: '原创' }]
      } else if (url.pathname.endsWith('/region/list')) {
        data = [{ id: 4, name: '日本' }]
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ code: 200, message: '操作成功', data }),
      }
    }),
  )
}

async function selectArchiveOption(id: string) {
  await wrapper!.find(id).trigger('click')
  await wrapper!.find('.archive-select-menu .archive-select-option').trigger('click')
}

async function fillRequiredFields() {
  await wrapper!.find('input[placeholder="输入正式名称"]').setValue('新动画')
  await selectArchiveOption('#animeBroadcastType')
  await selectArchiveOption('#animeAdaptationType')
  await selectArchiveOption('#animeRegion')
  await selectArchiveOption('#animeStatus')
  await wrapper!.find('#animeAirDate').setValue('2026-09-25')
}

async function addCompanyRow() {
  await wrapper!
    .findAll('button.anime-inline-button')
    .find((button) => button.text().includes('添加公司'))
    ?.trigger('click')
}

describe('新增和修改动画的关联资料', () => {
  it('新增时远程选择公司与系列，并提交实际 ID 和自定义职责', async () => {
    stubRequests()
    await router.push('/admin/anime/create')
    wrapper = mount(AnimeEditorForm, {
      props: { mode: 'create' },
      attachTo: document.body,
      global: { plugins: [router] },
    })
    await flushPromises()
    await addCompanyRow()
    await wrapper.find('#animeCompany-0').setValue('京都')
    await new Promise((resolve) => window.setTimeout(resolve, 300))
    await flushPromises()
    expect(wrapper.find('.anime-entity-option').text()).toBe('京都动画')
    await wrapper.find('.anime-entity-option').trigger('mousedown')
    await wrapper.find('#animeCompanyRole-0').setValue('原画协力')

    await wrapper.find('#animeSeries').setValue('物语')
    await new Promise((resolve) => window.setTimeout(resolve, 300))
    await flushPromises()
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([input]) => String(input).includes('name=%E7%89%A9%E8%AF%AD')),
    ).toBe(true)
    await wrapper.findAll('.anime-entity-option')[1]?.trigger('mousedown')

    await fillRequiredFields()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    document.querySelector<HTMLButtonElement>('.anime-confirm-actions .primary-button')?.click()
    await flushPromises()

    expect(submittedPayload?.companies).toEqual([{ companyId: 3, role: '原画协力' }])
    expect(submittedPayload?.seriesId).toBe(5)
    wrapper.unmount()
    wrapper = undefined
  })

  it('修改时按 ID 回填已有公司和系列名称', async () => {
    stubRequests()
    await router.push('/admin/anime/15/edit')
    wrapper = mount(AnimeEditorForm, {
      props: { mode: 'edit', animeId: 15 },
      attachTo: document.body,
      global: { plugins: [router] },
    })
    await flushPromises()

    expect((wrapper.find('#animeCompany-0').element as HTMLInputElement).value).toBe('京都动画')
    expect((wrapper.find('#animeSeries').element as HTMLInputElement).value).toBe('物语系列')
    expect((wrapper.find('#animeCompanyRole-0').element as HTMLInputElement).value).toBe('动画制作')
    expect((wrapper.find('#animeExternalTitle-0').element as HTMLInputElement).value).toBe('官网')
  })

  it('输入不存在或未选中的公司名称时提示并阻止提交', async () => {
    stubRequests()
    await router.push('/admin/anime/create')
    wrapper = mount(AnimeEditorForm, {
      props: { mode: 'create' },
      attachTo: document.body,
      global: { plugins: [router] },
    })
    await flushPromises()
    await addCompanyRow()
    await fillRequiredFields()
    await wrapper.find('#animeCompany-0').setValue('不存在的公司')
    expect(wrapper.find('#animeCompany-0-error').exists()).toBe(false)
    await new Promise((resolve) => window.setTimeout(resolve, 300))
    await flushPromises()
    expect(wrapper.text()).toContain('未找到该制作公司，请检查名称。')
    expect(wrapper.find('#animeCompany-0-error').text()).toBe('该公司名称不存在')
    expect(wrapper.find('#animeCompany-0').attributes('aria-invalid')).toBe('true')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.find('#animeCompany-0-error').text()).toBe('该公司名称不存在')
    expect(submittedPayload).toBeUndefined()
  })

  it('公司名称为空时不建立关联，即使已添加空白公司行', async () => {
    stubRequests()
    await router.push('/admin/anime/create')
    wrapper = mount(AnimeEditorForm, {
      props: { mode: 'create' },
      attachTo: document.body,
      global: { plugins: [router] },
    })
    await flushPromises()
    await addCompanyRow()
    await wrapper.find('#animeCompanyRole-0').setValue('动画制作')
    await fillRequiredFields()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    document.querySelector<HTMLButtonElement>('.anime-confirm-actions .primary-button')?.click()
    await flushPromises()

    expect(submittedPayload?.companies).toEqual([])
  })

  it('未选择系列时按暂不关联提交 null', async () => {
    stubRequests()
    await router.push('/admin/anime/create')
    wrapper = mount(AnimeEditorForm, {
      props: { mode: 'create' },
      attachTo: document.body,
      global: { plugins: [router] },
    })
    await flushPromises()
    await fillRequiredFields()
    await wrapper.find('#animeSeries').setValue('未选中的系列文字')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    document.querySelector<HTMLButtonElement>('.anime-confirm-actions .primary-button')?.click()
    await flushPromises()

    expect(submittedPayload?.seriesId).toBeNull()
    expect(submittedPayload?.seriesSortOrder).toBeNull()
  })
})

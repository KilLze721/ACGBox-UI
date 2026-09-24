import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import App from '@/App.vue'
import router from '@/router'
import AnimeListView from '@/views/admin/anime/AnimeListView.vue'

afterEach(() => vi.unstubAllGlobals())

const animeRow = {
  id: 15,
  name: '测试动画',
  aliasNames: [],
  tags: [],
  episodeCount: 12,
  broadcastType: { id: 1, name: 'TV' },
  adaptationType: { id: 1, name: '原创' },
  airDate: '2026-09-26',
  coverImageUrl: null,
  status: 1,
  region: { id: 1, name: '日本' },
  companies: [],
  externalLinks: [],
  personalRating: null,
  series: null,
}

function stubCatalogRequests(withAnime = false) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input), 'http://localhost').pathname
      let data: unknown = []
      if (path.endsWith('/anime/page')) {
        data = {
          pageNum: 1,
          pageSize: 10,
          total: withAnime ? 1 : 0,
          pages: withAnime ? 1 : 0,
          rows: withAnime ? [animeRow] : [],
        }
      } else if (path.endsWith('/page')) {
        data = { pageNum: 1, pageSize: 10, total: 0, pages: 0, rows: [] }
      } else if (path.endsWith('/anime/15')) {
        data = {
          id: animeRow.id,
          name: animeRow.name,
          episodeCount: animeRow.episodeCount,
          broadcastTypeId: 1,
          adaptationTypeId: 1,
          regionId: 1,
          airDate: animeRow.airDate,
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
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ code: 200, message: '操作成功', data }),
      }
    }),
  )
}

describe('工作台页面标签', () => {
  it('顶部标签切回动画管理时只刷新当前实例的资料列表', async () => {
    stubCatalogRequests()
    await router.push('/admin/dashboard')
    const wrapper = mount(App, { attachTo: document.body, global: { plugins: [router] } })

    await wrapper.find('a.nav-item[href="/admin/anime"]').trigger('click')
    await flushPromises()
    const pageUid = wrapper.findComponent(AnimeListView).vm.$.uid
    const fetchMock = vi.mocked(fetch)
    const countRequests = (suffix: string) =>
      fetchMock.mock.calls.filter(([input]) =>
        new URL(String(input), 'http://localhost').pathname.endsWith(suffix),
      ).length
    expect(countRequests('/anime/page')).toBe(5)
    const catalogCount = countRequests('/broadcast-type/list')
    await wrapper.find('input[placeholder="输入动画名称、别名或系列"]').setValue('保留的筛选输入')

    await wrapper.find('.workspace-tab-main[href="/admin/dashboard"]').trigger('click')
    await flushPromises()
    expect(countRequests('/anime/page')).toBe(5)
    await wrapper.find('.workspace-tab-main[href="/admin/anime"]').trigger('click')
    await flushPromises()

    expect(wrapper.findComponent(AnimeListView).vm.$.uid).toBe(pageUid)
    expect(
      (wrapper.find('input[placeholder="输入动画名称、别名或系列"]').element as HTMLInputElement)
        .value,
    ).toBe('保留的筛选输入')
    expect(countRequests('/anime/page')).toBe(6)
    expect(countRequests('/broadcast-type/list')).toBe(catalogCount)
    wrapper.unmount()
  })

  it('菜单重复打开独立实例，标签切换保留输入，关闭后新建空实例', async () => {
    stubCatalogRequests()
    await router.push('/admin/dashboard')
    const wrapper = mount(App, { attachTo: document.body, global: { plugins: [router] } })

    await wrapper.find('a.nav-item[href="/admin/anime"]').trigger('click')
    await flushPromises()
    const firstPageUid = wrapper.findComponent(AnimeListView).vm.$.uid
    await wrapper.find('input[placeholder="输入动画名称、别名或系列"]').setValue('第一标签')

    await wrapper.find('a.nav-item[href="/admin/anime"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.workspace-tab')).toHaveLength(3)
    expect(wrapper.find('.workspace-tab.active').text()).toContain('动画管理(2)')
    expect(
      (wrapper.find('input[placeholder="输入动画名称、别名或系列"]').element as HTMLInputElement)
        .value,
    ).toBe('')
    await wrapper.find('input[placeholder="输入动画名称、别名或系列"]').setValue('第二标签')

    const firstTab = wrapper
      .findAll('.workspace-tab')
      .find((tab) => tab.find('.workspace-tab-main').text() === '动画管理')
    await firstTab?.find('.workspace-tab-main').trigger('click')
    await flushPromises()
    expect(wrapper.findComponent(AnimeListView).vm.$.uid).toBe(firstPageUid)
    expect(
      (wrapper.find('input[placeholder="输入动画名称、别名或系列"]').element as HTMLInputElement)
        .value,
    ).toBe('第一标签')

    await wrapper.find('button[aria-label="关闭 动画管理(2)"]').trigger('click')
    await flushPromises()
    await wrapper.find('a.nav-item[href="/admin/anime"]').trigger('click')
    await flushPromises()
    expect(
      (wrapper.find('input[placeholder="输入动画名称、别名或系列"]').element as HTMLInputElement)
        .value,
    ).toBe('')

    await wrapper.find('a.nav-item[href="/admin/dashboard"]').trigger('click')
    await wrapper.find('a.nav-item[href="/admin/dashboard"]').trigger('click')
    await flushPromises()
    expect(
      wrapper.findAll('.workspace-tab').filter((tab) => tab.text().includes('数据概览')),
    ).toHaveLength(1)
    wrapper.unmount()
  })

  it('未保存的新增动画阻止单个及批量关闭，确认后才销毁实例', async () => {
    stubCatalogRequests()
    await router.push('/admin/anime')
    const wrapper = mount(App, { attachTo: document.body, global: { plugins: [router] } })
    await router.push('/admin/anime/create')
    await flushPromises()
    await wrapper.find('input[placeholder="输入正式名称"]').setValue('未保存作品')

    await wrapper.find('button[aria-label="关闭 新增动画"]').trigger('click')
    await flushPromises()
    expect(document.querySelector('.workspace-close-layer')).not.toBeNull()
    document.querySelector<HTMLButtonElement>('.workspace-close-layer .secondary-button')?.click()
    await flushPromises()
    expect(
      (wrapper.find('input[placeholder="输入正式名称"]').element as HTMLInputElement).value,
    ).toBe('未保存作品')

    await router.push('/admin/anime')
    await flushPromises()
    await wrapper.find('button[aria-label="关闭其他页面标签"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.workspace-tab.active').text()).toContain('新增动画')
    expect(document.querySelector('.workspace-close-layer')?.textContent).toContain('新增动画')
    document.querySelector<HTMLButtonElement>('.workspace-close-layer .secondary-button')?.click()
    await flushPromises()
    expect(wrapper.findAll('.workspace-tab')).toHaveLength(3)

    await router.push('/admin/anime')
    await flushPromises()
    await wrapper.find('button[aria-label="关闭其他页面标签"]').trigger('click')
    await flushPromises()
    document.querySelector<HTMLButtonElement>('.workspace-close-layer .primary-button')?.click()
    await flushPromises()
    expect(wrapper.findAll('.workspace-tab')).toHaveLength(2)
    expect(router.currentRoute.value.path).toBe('/admin/anime')
    wrapper.unmount()
  })

  it('编辑抽屉随标签隐藏并恢复，关闭标签前检查未保存修改', async () => {
    stubCatalogRequests(true)
    await router.push('/admin/dashboard')
    const wrapper = mount(App, { attachTo: document.body, global: { plugins: [router] } })
    await wrapper.find('a.nav-item[href="/admin/anime"]').trigger('click')
    await flushPromises()
    await wrapper.find('button[aria-label="编辑 测试动画"]').trigger('click')
    await flushPromises()

    const editInput = document.querySelector<HTMLInputElement>(
      '.anime-crud-drawer input[placeholder="输入正式名称"]',
    )!
    editInput.value = '修改后的动画'
    editInput.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    expect(document.body.style.overflow).toBe('hidden')

    await wrapper.find('.workspace-tab-main[href="/admin/dashboard"]').trigger('click')
    await flushPromises()
    expect(getComputedStyle(document.querySelector('.anime-crud-backdrop')!).display).toBe('none')
    expect(document.body.style.overflow).not.toBe('hidden')

    await wrapper.find('button[aria-label="关闭 动画管理"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.workspace-tab.active').text()).toContain('动画管理')
    expect(document.querySelector('.workspace-close-layer')).not.toBeNull()
    expect(
      document.querySelector<HTMLInputElement>(
        '.anime-crud-drawer input[placeholder="输入正式名称"]',
      )?.value,
    ).toBe('修改后的动画')

    document.querySelector<HTMLButtonElement>('.workspace-close-layer .primary-button')?.click()
    await flushPromises()
    expect(wrapper.findAll('.workspace-tab')).toHaveLength(1)
    expect(document.body.style.overflow).not.toBe('hidden')
    wrapper.unmount()
  })

  it('未填写的新建页直接关闭，批量关闭会列出所有未保存页面', async () => {
    stubCatalogRequests()
    await router.push('/admin/dashboard')
    const wrapper = mount(App, { attachTo: document.body, global: { plugins: [router] } })

    await router.push('/admin/anime/create')
    await flushPromises()
    await wrapper.find('button[aria-label="关闭 新增动画"]').trigger('click')
    await flushPromises()
    expect(document.querySelector('.workspace-close-layer')).toBeNull()
    expect(wrapper.findAll('.workspace-tab')).toHaveLength(1)

    await router.push('/admin/anime/create')
    await flushPromises()
    await wrapper.find('input[placeholder="输入正式名称"]').setValue('第一部')
    await router.push('/admin/anime/create?__workspaceTab=second')
    await flushPromises()
    await wrapper.find('input[placeholder="输入正式名称"]').setValue('第二部')

    const firstCreateTab = wrapper
      .findAll('.workspace-tab')
      .find((tab) => tab.find('.workspace-tab-main').text() === '新增动画')
    await firstCreateTab?.find('.workspace-tab-main').trigger('click')
    await flushPromises()
    expect(
      (wrapper.find('input[placeholder="输入正式名称"]').element as HTMLInputElement).value,
    ).toBe('第一部')
    await wrapper.find('.workspace-tab-main[title="新增动画(2)"]').trigger('click')
    await flushPromises()
    expect(
      (wrapper.find('input[placeholder="输入正式名称"]').element as HTMLInputElement).value,
    ).toBe('第二部')
    await router.push('/admin/dashboard')
    await flushPromises()

    await wrapper.find('button[aria-label="关闭其他页面标签"]').trigger('click')
    await flushPromises()
    const warning = document.querySelector('.workspace-close-layer')?.textContent ?? ''
    expect(warning).toContain('新增动画')
    expect(warning).toContain('新增动画(2)')
    document.querySelector<HTMLButtonElement>('.workspace-close-layer .secondary-button')?.click()
    await flushPromises()
    expect(wrapper.findAll('.workspace-tab')).toHaveLength(3)
    wrapper.unmount()
  })

  it('只打开编辑抽屉而未修改资料时可直接关闭标签', async () => {
    stubCatalogRequests(true)
    await router.push('/admin/dashboard')
    const wrapper = mount(App, { attachTo: document.body, global: { plugins: [router] } })
    await wrapper.find('a.nav-item[href="/admin/anime"]').trigger('click')
    await flushPromises()
    await wrapper.find('button[aria-label="编辑 测试动画"]').trigger('click')
    await flushPromises()

    await wrapper.find('button[aria-label="关闭 动画管理"]').trigger('click')
    await flushPromises()
    expect(document.querySelector('.workspace-close-layer')).toBeNull()
    expect(wrapper.findAll('.workspace-tab')).toHaveLength(1)
    expect(document.body.style.overflow).not.toBe('hidden')
    wrapper.unmount()
  })

  it('提交期间阻止关闭，保存结束后不再提示未保存内容', async () => {
    let finishSave!: (response: unknown) => void
    const saveResponse = new Promise<unknown>((resolve) => {
      finishSave = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const path = new URL(String(input), 'http://localhost').pathname
        if (path.endsWith('/anime/create')) return saveResponse
        let data: unknown = []
        if (path.endsWith('/broadcast-type/list')) data = [{ id: 1, name: 'TV' }]
        else if (path.endsWith('/adaptation-type/list')) data = [{ id: 1, name: '原创' }]
        else if (path.endsWith('/region/list')) data = [{ id: 1, name: '日本' }]
        else if (path.endsWith('/page'))
          data = { pageNum: 1, pageSize: 10, total: 0, pages: 0, rows: [] }
        return {
          ok: true,
          status: 200,
          json: async () => ({ code: 200, message: '操作成功', data }),
        }
      }),
    )

    await router.push('/admin/dashboard')
    const wrapper = mount(App, { attachTo: document.body, global: { plugins: [router] } })
    await router.push('/admin/anime/create')
    await flushPromises()
    await wrapper.find('input[placeholder="输入正式名称"]').setValue('准备保存的动画')
    for (const id of ['animeBroadcastType', 'animeAdaptationType', 'animeRegion', 'animeStatus']) {
      await wrapper.find(`#${id}`).trigger('click')
      await wrapper.find('.archive-select-menu .archive-select-option').trigger('click')
    }
    await wrapper.find('#animeAirDate').setValue('2026-09-26')
    await wrapper.find('.anime-editor-actions button[type="submit"]').trigger('click')
    await flushPromises()
    document.querySelector<HTMLButtonElement>('.anime-confirm-backdrop .primary-button')?.click()
    await flushPromises()

    await wrapper.find('button[aria-label="关闭 新增动画"]').trigger('click')
    await flushPromises()
    expect(document.querySelector('.workspace-close-layer')?.textContent).toContain('正在提交')
    expect(wrapper.findAll('.workspace-tab')).toHaveLength(2)

    finishSave({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        message: '操作成功',
        data: { id: 16, name: '准备保存的动画' },
      }),
    })
    await flushPromises()
    expect(document.querySelector('.workspace-close-layer')).toBeNull()
    await wrapper.find('button[aria-label="关闭 新增动画"]').trigger('click')
    await flushPromises()
    expect(document.querySelector('.workspace-close-layer')).toBeNull()
    wrapper.unmount()
  })
})

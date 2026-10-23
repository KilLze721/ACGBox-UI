import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import router from '@/router'
import App from '@/App.vue'
import AnimeListView from '@/views/admin/anime/AnimeListView.vue'
import TagsView from '@/views/admin/tags/TagsView.vue'
import SeriesView from '@/views/admin/series/SeriesView.vue'
import CompaniesView from '@/views/admin/companies/CompaniesView.vue'
import UsersView from '@/views/admin/users/UsersView.vue'
import AnimeEditorForm from '@/views/admin/anime/AnimeEditorForm.vue'
import AnimeSuggestionInput from '@/components/admin/AnimeSuggestionInput.vue'
import { defaultPreferences, savePreferences } from '@/utils/preferences'

const wrappers: VueWrapper[] = []
const requests: URL[] = []
beforeEach(() => {
  localStorage.removeItem('acgbox-preferences')
  sessionStorage.setItem('acgbox-user', JSON.stringify({ id: 1, username: 'admin', role: 'ADMIN' }))
  requests.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input, 'http://localhost')
      requests.push(url)
      let data: unknown = []
      if (url.pathname.endsWith('/page'))
        data = {
          pageNum: Number(url.searchParams.get('pageNum')),
          pageSize: Number(url.searchParams.get('pageSize')),
          total: 0,
          pages: 0,
          rows: [],
        }
      if (url.pathname.endsWith('/anime/page'))
        data = {
          pageNum: 1,
          pageSize: Number(url.searchParams.get('pageSize')),
          total: 1,
          pages: 1,
          rows: [
            {
              id: 15,
              name: '测试动画',
              aliasNames: [],
              tags: [],
              episodeCount: null,
              broadcastType: { id: 1, name: 'TV' },
              adaptationType: { id: 2, name: '原创' },
              airDate: '2026-01-01',
              coverImageUrl: null,
              status: 2,
              region: { id: 4, name: '日本' },
              companies: [],
              externalLinks: [],
              personalRating: null,
              series: null,
            },
          ],
        }
      if (url.pathname.endsWith('/region/list')) data = [{ id: 4, name: '日本' }]
      if (url.pathname.endsWith('/broadcast-type/list')) data = [{ id: 1, name: 'TV' }]
      if (url.pathname.endsWith('/adaptation-type/list')) data = [{ id: 2, name: '原创' }]
      if (url.pathname.endsWith('/admin/system/health'))
        data = {
          checkedAt: '2026-10-23T04:00:00Z',
          database: { status: 'UP', message: '连接正常' },
          redis: { status: 'UP', message: '连接正常' },
          smtp: { status: 'DISABLED', message: '邮箱验证码功能未启用' },
        }
      if (url.pathname.endsWith('/anime/15'))
        data = {
          id: 15,
          name: '已有动画',
          broadcastTypeId: 1,
          adaptationTypeId: 2,
          regionId: 4,
          status: 2,
          airDate: '2026-01-01',
          episodeCount: null,
          personalRatingScore: null,
          coverImageUrl: null,
          description: '',
          aliasNames: [],
          tagIds: [],
          companies: [],
          externalLinks: [],
          seriesId: null,
          seriesSortOrder: null,
        }
      return { ok: true, status: 200, json: async () => ({ code: 200, data }) }
    }),
  )
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
  localStorage.removeItem('acgbox-preferences')
  document.body.innerHTML = ''
})

describe('偏好在实际页面的应用', () => {
  it('切换顶部标签不覆盖原列表，新开同路由实例才采用新偏好', async () => {
    savePreferences({ ...defaultPreferences(), sortBy: 'PERSONAL_RATING', sortDirection: 'ASC' })
    await router.push('/admin/dashboard')
    const wrapper = mount(App, { attachTo: document.body, global: { plugins: [router] } })
    wrappers.push(wrapper)
    await wrapper.get('a.nav-item[href="/admin/anime"]').trigger('click')
    await flushPromises()
    const uid = wrapper.findComponent(AnimeListView).vm.$.uid
    await wrapper.get('#pageSize').trigger('click')
    await wrapper
      .findAll('.archive-select-option')
      .find((option) => option.text() === '10 条')!
      .trigger('click')
    await flushPromises()
    await wrapper.get('a.nav-item[href="/admin/settings"]').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(wrapper.find('.settings-page').exists()).toBe(true))
    await wrapper.get('[aria-labelledby="sizeLabel"] button:last-child').trigger('click')
    await wrapper.get('[aria-labelledby="sortLabel"] button:first-child').trigger('click')
    await wrapper.get('#sortDirection').trigger('click')
    await wrapper.get('form.settings-form').trigger('submit')
    await wrapper.get('.workspace-tab-main[href="/admin/anime"]').trigger('click')
    await flushPromises()
    expect(wrapper.findComponent(AnimeListView).vm.$.uid).toBe(uid)
    expect(wrapper.get('#pageSize').text()).toContain('10 条')
    const lastQuery = requests.filter((url) => url.pathname === '/api/anime/page').slice(-1)[0]!
    expect(lastQuery.searchParams.get('pageSize')).toBe('10')
    expect(lastQuery.searchParams.get('sortBy')).toBe('PERSONAL_RATING')
    expect(lastQuery.searchParams.get('sortDirection')).toBe('ASC')
    await wrapper.get('a.nav-item[href="/admin/anime"]').trigger('click')
    await flushPromises()
    expect(wrapper.findComponent(AnimeListView).vm.$.uid).not.toBe(uid)
    expect(wrapper.get('#pageSize').text()).toContain('50 条')
    expect(wrapper.get('.sort-summary').text()).toContain('开始放送日期')
  })

  it.each([
    {
      name: '动画',
      view: AnimeListView,
      route: '/admin/anime',
      path: '/api/anime/page',
      sizeId: '#pageSize',
      fallback: 50,
    },
    {
      name: '标签',
      view: TagsView,
      route: '/admin/tags',
      path: '/api/tags/page',
      sizeId: '#tagsPageSize',
      fallback: 50,
    },
    {
      name: '系列',
      view: SeriesView,
      route: '/admin/series',
      path: '/api/series/page',
      sizeId: '#seriesPageSize',
      fallback: 50,
    },
    {
      name: '公司',
      view: CompaniesView,
      route: '/admin/companies',
      path: '/api/companies/page',
      sizeId: '#companiesPageSize',
      fallback: 50,
    },
    {
      name: '用户',
      view: UsersView,
      route: '/admin/users',
      path: '/api/admin/users/page',
      sizeId: '#usersPageSize',
      fallback: 50,
    },
  ])(
    '$name列表初始化使用兼容条数，临时选择保持不变，重置才重读偏好',
    async ({ view, route, path, sizeId, fallback }) => {
      savePreferences({
        ...defaultPreferences(),
        pageSize: 50,
        sortBy: 'PERSONAL_RATING',
        sortDirection: 'ASC',
      })
      await router.push(route)
      const wrapper = mount(view, { attachTo: document.body, global: { plugins: [router] } })
      wrappers.push(wrapper)
      await flushPromises()
      const listRequests = () =>
        requests.filter((url) => url.pathname === path && url.searchParams.get('pageSize') !== '1')
      expect(listRequests().slice(-1)[0]?.searchParams.get('pageSize')).toBe(String(fallback))
      if (route === '/admin/anime') {
        expect(listRequests().slice(-1)[0]?.searchParams.get('sortBy')).toBe('PERSONAL_RATING')
        expect(listRequests().slice(-1)[0]?.searchParams.get('sortDirection')).toBe('ASC')
      }
      await wrapper.get(sizeId).trigger('click')
      expect(wrapper.findAll('.archive-select-option').map((option) => option.text())).toEqual(['10 条', '20 条', '50 条'])
      await wrapper
        .findAll('.archive-select-option')
        .find((option) => option.text() === '10 条')!
        .trigger('click')
      await flushPromises()
      savePreferences({ ...defaultPreferences(), pageSize: 20 })
      expect(wrapper.get(sizeId).text()).toContain('10 条')
      const form = wrapper.find('form')
      if (form.exists()) await form.trigger('submit')
      else
        await wrapper
          .findAll('button')
          .find((button) => button.text() === '搜索')
          ?.trigger('click')
      await flushPromises()
      expect(listRequests().slice(-1)[0]?.searchParams.get('pageSize')).toBe('10')
      if (route === '/admin/anime' || route === '/admin/users')
        await wrapper.get('form').trigger('reset')
      else
        await wrapper
          .findAll('button')
          .find((button) => button.text() === '重置')!
          .trigger('click')
      await flushPromises()
      expect(listRequests().slice(-1)[0]?.searchParams.get('pageSize')).toBe('20')
      if (route === '/admin/anime')
        expect(listRequests().slice(-1)[0]?.searchParams.get('sortBy')).toBe('BROADCAST_DATE')
    },
  )

  it('新建表单使用默认地区、类型及建议快照，已打开表单不被覆盖', async () => {
    savePreferences({
      ...defaultPreferences(),
      regionId: '4',
      broadcastTypeId: '1',
      companyRoles: ['自定义职责'],
      linkTitles: ['自定义标题'],
    })
    await router.push('/admin/anime/create')
    const wrapper = mount(AnimeEditorForm, {
      props: { mode: 'create' },
      attachTo: document.body,
      global: { plugins: [router] },
    })
    wrappers.push(wrapper)
    await flushPromises()
    expect(wrapper.get('#animeRegion').text()).toContain('日本')
    expect(wrapper.get('#animeBroadcastType').text()).toContain('TV')
    expect(
      (wrapper.vm as unknown as { getCloseState(): { dirty: boolean } }).getCloseState().dirty,
    ).toBe(false)
    await wrapper.get('input[placeholder="输入正式名称"]').setValue('未提交动画')
    savePreferences(defaultPreferences())
    expect(wrapper.get('#animeRegion').text()).toContain('日本')
    expect(
      (wrapper.get('input[placeholder="输入正式名称"]').element as HTMLInputElement).value,
    ).toBe('未提交动画')
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('添加公司'))!
      .trigger('click')
    expect(wrapper.findComponent(AnimeSuggestionInput).props('suggestions')).toEqual(['自定义职责'])
    const next = mount(AnimeEditorForm, {
      props: { mode: 'create' },
      global: { plugins: [router] },
    })
    wrappers.push(next)
    await flushPromises()
    expect(next.get('#animeRegion').text()).toContain('请选择地区')
  })

  it('修改已有作品不使用新建偏好，失效默认值不作为新表单的有效关联', async () => {
    savePreferences({
      ...defaultPreferences(),
      regionId: '99',
      broadcastTypeId: '99',
      companyRoles: ['不应覆盖'],
    })
    await router.push('/admin/anime/create')
    const fresh = mount(AnimeEditorForm, {
      props: { mode: 'create' },
      global: { plugins: [router] },
    })
    wrappers.push(fresh)
    await flushPromises()
    expect(fresh.get('#animeRegion').text()).toContain('请选择地区')
    expect(fresh.get('#animeBroadcastType').text()).toContain('请选择放送类型')
    await router.push('/admin/anime')
    const edit = mount(AnimeEditorForm, {
      props: { mode: 'edit', animeId: 15 },
      global: { plugins: [router] },
    })
    wrappers.push(edit)
    await flushPromises()
    expect(edit.get('#animeRegion').text()).toContain('日本')
    expect(edit.get('#animeBroadcastType').text()).toContain('TV')
    await edit
      .findAll('button')
      .find((button) => button.text().includes('添加公司'))!
      .trigger('click')
    expect(edit.findComponent(AnimeSuggestionInput).props('suggestions')).toEqual([
      '动画制作',
      '制作协力',
      '3DCG',
    ])
  })
})

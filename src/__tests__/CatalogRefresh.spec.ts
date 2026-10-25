import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import router from '@/router'
import App from '@/App.vue'
import AnimeEditorForm from '@/views/admin/anime/AnimeEditorForm.vue'
import AnimeListView from '@/views/admin/anime/AnimeListView.vue'
import SettingsView from '@/views/admin/settings/SettingsView.vue'
import { notifyCatalogChanged } from '@/utils/catalogChanges'
import type { SortableNamedOption } from '@/types/api'

const wrappers: VueWrapper[] = []
let broadcast: SortableNamedOption[]
let adaptation: SortableNamedOption[]
let failCatalog: boolean
let withAnime: boolean
const requests: string[] = []
beforeEach(() => {
  broadcast = [
    { id: 1, name: 'Z类型', sortOrder: 0 },
    { id: 2, name: 'A类型', sortOrder: 10 },
  ]
  adaptation = [{ id: 3, name: '原创', sortOrder: 0 }]
  failCatalog = false
  withAnime = false
  requests.length = 0
  localStorage.removeItem('acgbox-preferences')
  sessionStorage.setItem('acgbox-user', JSON.stringify({ id: 1, username: 'admin', role: 'ADMIN' }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const path = new URL(input, 'http://localhost').pathname
      requests.push(path)
      let data: unknown = []
      if (path.endsWith('/broadcast-type/list')) {
        if (failCatalog) throw new Error('字典暂不可用')
        data = [...broadcast]
      } else if (path.endsWith('/adaptation-type/list')) data = [...adaptation]
      else if (path.endsWith('/broadcast-type/1')) data = broadcast.find((row) => row.id === 1)
      else if (path.endsWith('/broadcast-type/update')) {
        const payload = JSON.parse(String(init?.body))
        broadcast = broadcast
          .map((row) => (row.id === payload.id ? payload : row))
          .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
        data = payload
      } else if (path.endsWith('/region/list')) data = [{ id: 4, name: '日本' }]
      else if (path.endsWith('/admin/system/health'))
        data = {
          checkedAt: '2026-10-25T00:00:00Z',
          database: { status: 'UP', message: '连接正常' },
          redis: { status: 'NOT_CHECKED', message: '未检测' },
          smtp: { status: 'DISABLED', message: '未启用' },
        }
      else if (withAnime && path.endsWith('/anime/page'))
        data = {
          pageNum: 1,
          pageSize: 20,
          total: 1,
          pages: 1,
          rows: [
            {
              id: 15,
              name: '已有动画',
              aliasNames: ['别名甲', '别名乙'],
              tags: [],
              episodeCount: null,
              broadcastType: broadcast[0],
              adaptationType: adaptation[0],
              airDate: '2006-09-26',
              coverImageUrl: null,
              status: 1,
              region: { id: 4, name: '日本' },
              companies: [
                { companyId: 6, companyName: '公司甲', role: '动画制作', sortOrder: 0 },
                { companyId: 7, companyName: '公司乙', role: '制作协力', sortOrder: 1 },
              ],
              externalLinks: [],
              personalRating: null,
              series: null,
            },
          ],
        }
      else if (withAnime && path.endsWith('/anime/15'))
        data = {
          id: 15,
          name: '已有动画',
          aliasNames: ['别名甲', '别名乙'],
          tagIds: [],
          episodeCount: null,
          broadcastTypeId: 1,
          adaptationTypeId: 3,
          airDate: '2006-09-26',
          coverImageUrl: null,
          status: 1,
          description: null,
          regionId: 4,
          companies: [
            { companyId: 6, role: '动画制作', sortOrder: 0 },
            { companyId: 7, role: '制作协力', sortOrder: 1 },
          ],
          externalLinks: [],
          personalRatingScore: null,
          seriesId: null,
          seriesSortOrder: null,
        }
      else if (withAnime && path.includes('/companies/'))
        data = { id: 6, name: path.endsWith('/6') ? '公司甲' : '公司乙', description: null }
      else if (path.endsWith('/page'))
        data = { pageNum: 1, pageSize: 20, total: 0, pages: 0, rows: [] }
      return { ok: true, status: 200, json: async () => ({ code: 200, data }) }
    }),
  )
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
  localStorage.removeItem('acgbox-preferences')
  document.body.innerHTML = ''
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
})
function closeState(wrapper: VueWrapper) {
  return (wrapper.vm as unknown as { getCloseState(): { dirty: boolean } }).getCloseState()
}
async function choose(wrapper: VueWrapper, id: string, label: string) {
  await wrapper.get(id).trigger('click')
  const root = wrapper.get(id).element.closest('.archive-select')!
  const option = [...root.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
    (item) => item.textContent?.trim() === label,
  )!
  option.click()
  await flushPromises()
}

describe('字典排序更新与消费者同步', () => {
  it.each(['别名', '公司'])(
    '仅调整%s顺序也触发关闭和退出登录保护，取消后保留排序',
    async (kind) => {
      withAnime = true
      await router.push('/admin/anime')
      const wrapper = mount(App, { attachTo: document.body, global: { plugins: [router] } })
      wrappers.push(wrapper)
      await flushPromises()
      await wrapper.get('button[aria-label="编辑 已有动画"]').trigger('click')
      await flushPromises()
      document.querySelector<HTMLButtonElement>(`[aria-label="下移${kind} 1"]`)!.click()
      await flushPromises()
      expect(closeState(wrapper.findComponent(AnimeEditorForm)).dirty).toBe(true)
      await wrapper.get('[aria-label="关闭 动画管理"]').trigger('click')
      await flushPromises()
      expect(document.querySelector('.workspace-close-layer')?.textContent).toContain('未保存')
      document.querySelector<HTMLButtonElement>('.workspace-close-layer .secondary-button')!.click()
      await flushPromises()
      await wrapper.get('.avatar-button').trigger('click')
      await wrapper.get('.user-menu-logout').trigger('click')
      await flushPromises()
      expect(document.querySelector('.workspace-close-layer')?.textContent).toContain(
        '退出登录将关闭所有页面',
      )
      expect(requests.some((path) => path.endsWith('/admin/logout'))).toBe(false)
      document.querySelector<HTMLButtonElement>('.workspace-close-layer .secondary-button')!.click()
      await flushPromises()
      document.querySelector<HTMLButtonElement>(`[aria-label="上移${kind} 2"]`)!.click()
      await flushPromises()
      expect(closeState(wrapper.findComponent(AnimeEditorForm)).dirty).toBe(false)
    },
  )

  it('真实字典保存后，缓存的新建表单激活时刷新；选中 ID 和未保存输入保留，再激活不重复读取', async () => {
    await router.push('/admin/anime/create')
    const wrapper = mount(App, { attachTo: document.body, global: { plugins: [router] } })
    wrappers.push(wrapper)
    await flushPromises()
    const editor = wrapper.findComponent(AnimeEditorForm)
    const uid = editor.vm.$.uid
    await editor.get('input[placeholder="输入正式名称"]').setValue('尚未保存的动画')
    await choose(editor, '#animeBroadcastType', 'Z类型')
    await wrapper.get('a.nav-item[href="/admin/broadcast-types"]').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(wrapper.find('.broadcast-management').exists()).toBe(true))
    await flushPromises()
    await wrapper.get('button[aria-label="编辑放送类型 Z类型"]').trigger('click')
    await flushPromises()
    const name = document.querySelector<HTMLInputElement>('#broadcastEditorName')!
    name.value = 'Z类型已更新'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    const sort = document.querySelector<HTMLInputElement>('#broadcastEditorSortOrder')!
    sort.value = '20'
    sort.dispatchEvent(new Event('input', { bubbles: true }))
    document
      .querySelector<HTMLFormElement>('#broadcastEditorForm')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    const beforeReturn = requests.filter((path) => path.endsWith('/broadcast-type/list')).length
    await wrapper.get('.workspace-tab-main[href="/admin/anime/create"]').trigger('click')
    await flushPromises()
    const returned = wrapper.findComponent(AnimeEditorForm)
    expect(returned.vm.$.uid).toBe(uid)
    expect(
      (returned.get('input[placeholder="输入正式名称"]').element as HTMLInputElement).value,
    ).toBe('尚未保存的动画')
    expect(returned.get('#animeBroadcastType').text()).toContain('Z类型已更新')
    expect(closeState(returned).dirty).toBe(true)
    await returned.get('#animeBroadcastType').trigger('click')
    expect(
      returned
        .findAll('#animeBroadcastType + .archive-select-menu [role="option"]')
        .map((option) => option.text()),
    ).toEqual(['A类型', 'Z类型已更新'])
    expect(requests.filter((path) => path.endsWith('/broadcast-type/list'))).toHaveLength(
      beforeReturn + 1,
    )
    await wrapper.get('.workspace-tab-main[href="/admin/broadcast-types"]').trigger('click')
    await flushPromises()
    await wrapper.get('.workspace-tab-main[href="/admin/anime/create"]').trigger('click')
    await flushPromises()
    expect(requests.filter((path) => path.endsWith('/broadcast-type/list'))).toHaveLength(
      beforeReturn + 1,
    )
    await wrapper.get('[aria-label="关闭 新增动画"]').trigger('click')
    await flushPromises()
    expect(document.querySelector('.workspace-close-layer')?.textContent).toContain('未保存')
    document.querySelector<HTMLButtonElement>('.workspace-close-layer .secondary-button')!.click()
    await flushPromises()
    expect(
      (
        wrapper.findComponent(AnimeEditorForm).get('input[placeholder="输入正式名称"]')
          .element as HTMLInputElement
      ).value,
    ).toBe('尚未保存的动画')
  })

  it('活动表单刷新类型选项，不改变任何草稿或其未保存判断；失败保留旧选项并可重试', async () => {
    await router.push('/admin/anime/create')
    const wrapper = mount(AnimeEditorForm, {
      props: { mode: 'create' },
      attachTo: document.body,
      global: { plugins: [router] },
    })
    wrappers.push(wrapper)
    await flushPromises()
    await choose(wrapper, '#animeAdaptationType', '原创')
    await wrapper.get('input[placeholder="输入正式名称"]').setValue('保留草稿')
    adaptation = [
      { id: 8, name: '漫画改', sortOrder: -9 },
      { id: 3, name: '原创已更新', sortOrder: 0 },
    ]
    notifyCatalogChanged('adaptation')
    await flushPromises()
    expect(wrapper.get('#animeAdaptationType').text()).toContain('原创已更新')
    expect(
      (wrapper.get('input[placeholder="输入正式名称"]').element as HTMLInputElement).value,
    ).toBe('保留草稿')
    failCatalog = true
    notifyCatalogChanged('broadcast')
    await flushPromises()
    expect(wrapper.get('.anime-catalog-warning').text()).toContain('字典暂不可用')
    expect(closeState(wrapper).dirty).toBe(true)
    failCatalog = false
    await wrapper.get('.anime-catalog-warning button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.anime-catalog-warning').exists()).toBe(false)
  })

  it('系统设置刷新默认放送类型选项但不覆盖未保存偏好', async () => {
    await router.push('/admin/settings')
    const wrapper = mount(SettingsView, { attachTo: document.body, global: { plugins: [router] } })
    wrappers.push(wrapper)
    await flushPromises()
    await choose(wrapper, '#broadcastTypeId', 'Z类型')
    await wrapper.get('#linkTitlesInput').setValue('未保存建议')
    broadcast = [
      { id: 2, name: 'A类型', sortOrder: -1 },
      { id: 1, name: 'Z类型更新', sortOrder: 0 },
    ]
    notifyCatalogChanged('broadcast')
    await flushPromises()
    expect(wrapper.get('#broadcastTypeId').text()).toContain('Z类型更新')
    expect((wrapper.get('#linkTitlesInput').element as HTMLInputElement).value).toBe('未保存建议')
    expect(closeState(wrapper).dirty).toBe(true)
    await wrapper.get('#broadcastTypeId').trigger('click')
    expect(
      wrapper
        .findAll('#broadcastTypeId + .archive-select-menu [role="option"]')
        .map((option) => option.text()),
    ).toEqual(['不预设', 'A类型', 'Z类型更新'])
  })

  it('动画筛选更新选项，不清空尚未查询的输入，不重新查询动画列表', async () => {
    await router.push('/admin/anime')
    const wrapper = mount(AnimeListView, { attachTo: document.body, global: { plugins: [router] } })
    wrappers.push(wrapper)
    await flushPromises()
    const keyword = wrapper.find('input[placeholder*="动画名称"]')
    await keyword.setValue('未查询关键词')
    const before = requests.filter((path) => path.endsWith('/anime/page')).length
    broadcast = [
      { id: 2, name: 'A类型', sortOrder: -1 },
      { id: 1, name: 'Z类型更新', sortOrder: 0 },
    ]
    notifyCatalogChanged('broadcast')
    await flushPromises()
    expect((keyword.element as HTMLInputElement).value).toBe('未查询关键词')
    expect(requests.filter((path) => path.endsWith('/anime/page'))).toHaveLength(before)
  })
})

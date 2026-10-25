import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import App from '@/App.vue'
import router from '@/router'
import AnimeEditorForm from '@/views/admin/anime/AnimeEditorForm.vue'
import AnimeEntitySelect from '@/components/admin/AnimeEntitySelect.vue'
import BroadcastTypesView from '@/views/admin/broadcast-types/BroadcastTypesView.vue'
import AdaptationTypesView from '@/views/admin/adaptation-types/AdaptationTypesView.vue'
import { notifyCatalogChanged } from '@/utils/catalogChanges'
import type { AnimeDetail, AnimePayload, SortableNamedOption } from '@/types/api'

const wrappers: VueWrapper[] = []
const requests: Array<{ path: string; body?: AnimePayload & { sortOrder?: number } }> = []
let broadcast: SortableNamedOption[]
let adaptation: SortableNamedOption[]
let detail: AnimeDetail
let failCatalog = false
let failSave = false
let holdCatalog: Promise<void> | undefined
let releaseCatalog: (() => void) | undefined
let holdSave: Promise<void> | undefined
let releaseSave: (() => void) | undefined

beforeEach(() => {
  requests.length = 0
  failCatalog = false
  failSave = false
  holdCatalog = undefined
  holdSave = undefined
  localStorage.removeItem('acgbox-preferences')
  sessionStorage.setItem('acgbox-user', JSON.stringify({ id: 1, username: '验收账号', role: 'ADMIN' }))
  broadcast = [
    { id: 1, name: '同组Z', sortOrder: -2147483648 },
    { id: 3, name: '其他M', sortOrder: 0 },
    { id: 7, name: '同组A', sortOrder: 0 },
  ]
  adaptation = [{ id: 2, name: '改编Z', sortOrder: -1 }, { id: 4, name: '改编A', sortOrder: 0 }]
  detail = {
    id: 91, name: '独立验收动画', broadcastTypeId: 1, adaptationTypeId: 2, regionId: 4,
    status: 3, airDate: '2026-01-01', episodeCount: 12, personalRatingScore: 4,
    coverImageUrl: null, description: '保留说明', aliasNames: ['别名Z', '别名A'], tagIds: [],
    companies: [{ companyId: 20, role: '主制', sortOrder: -2 }, { companyId: 10, role: '协制', sortOrder: 2147483647 }],
    externalLinks: [{ title: '官网', url: 'https://example.test/anime', sortOrder: 9 }],
    seriesId: null, seriesSortOrder: null,
  }
  // 所有请求均在内存中处理；保存模拟只用于比较前端载荷，不代表真实接口联调。
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input), 'http://localhost').pathname
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    requests.push({ path, body })
    let data: unknown = []
    if (path.endsWith('/broadcast-type/list')) {
      await holdCatalog
      if (failCatalog) throw new Error('验收字典暂不可用')
      data = broadcast.map((value) => ({ ...value }))
    } else if (path.endsWith('/adaptation-type/list')) data = adaptation.map((value) => ({ ...value }))
    else if (path.endsWith('/broadcast-type/1')) data = broadcast[0]
    else if (path.endsWith('/adaptation-type/2')) data = adaptation[0]
    else if (/\/(broadcast-type|adaptation-type)\/(create|update)$/.test(path)) {
      data = { id: body.id ?? 99, ...body }
    } else if (path.endsWith('/region/list')) data = [{ id: 4, name: '地区' }]
    else if (path.endsWith('/anime/91')) data = structuredClone(detail)
    else if (/\/companies\/\d+$/.test(path)) {
      const id = Number(path.split('/').pop())
      data = { id, name: `公司${id}`, description: null }
    } else if (path.endsWith('/anime/update')) {
      await holdSave
      if (failSave) return { ok: true, status: 200, json: async () => ({ code: 500, message: '验收保存失败' }) }
      detail = { ...detail, ...body, aliasNames: [...new Set(body.aliasNames)],
        companies: [...body.companies].sort((a, b) => a.sortOrder - b.sortOrder) }
      data = detail
    } else if (path.endsWith('/anime/page')) {
      data = { pageNum: 1, pageSize: 20, total: 1, pages: 1, rows: [{ ...detail,
        tags: [], broadcastType: broadcast[0], adaptationType: adaptation[0], region: { id: 4, name: '地区' },
        companies: detail.companies.map((value) => ({ ...value, companyName: `公司${value.companyId}` })), personalRating: 4, series: null }] }
    } else if (path.endsWith('/page')) data = { pageNum: 1, pageSize: 100, total: 0, pages: 0, rows: [] }
    return { ok: true, status: 200, json: async () => ({ code: 200, data }) }
  }))
})

afterEach(() => {
  releaseCatalog?.()
  releaseSave?.()
  releaseCatalog = undefined
  releaseSave = undefined
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
  localStorage.removeItem('acgbox-preferences')
  document.body.innerHTML = ''
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
})

function closeState(wrapper: VueWrapper) {
  return (wrapper.vm as unknown as { getCloseState(): { dirty: boolean; submitting: boolean } }).getCloseState()
}
async function editor() {
  await router.push('/admin/anime')
  const wrapper = mount(AnimeEditorForm, { props: { mode: 'edit', animeId: 91 },
    attachTo: document.body, global: { plugins: [router] } })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
async function save(wrapper: VueWrapper) {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  const confirmation = document.querySelector<HTMLButtonElement>('.anime-confirm-actions .primary-button')
  expect(confirmation).not.toBeNull()
  confirmation!.click()
  await flushPromises()
}
const writes = () => requests.filter((request) => request.path.endsWith('/anime/update'))
const countCatalog = () => requests.filter((request) => request.path.endsWith('/broadcast-type/list')).length

describe('排序独立验收：字典界面契约', () => {
  for (const [prefix, View, key] of [
    ['broadcast', BroadcastTypesView, 'broadcast-type'], ['adaptation', AdaptationTypesView, 'adaptation-type'],
  ] as const) {
    it(`${prefix} 保留服务端同值顺序，筛选只取子集`, async () => {
      await router.push(`/admin/${key}s`)
      const wrapper = mount(View, { attachTo: document.body, global: { plugins: [router] } })
      wrappers.push(wrapper)
      await flushPromises()
      const source = prefix === 'broadcast' ? broadcast : adaptation
      expect(wrapper.findAll(`.${prefix}-name`).map((node) => node.text())).toEqual(source.map((row) => row.name))
      await wrapper.get(`.${prefix}-search input`).setValue(prefix === 'broadcast' ? '同组' : '改编')
      await wrapper.get(`.${prefix}-filter`).trigger('submit')
      expect(wrapper.findAll(`.${prefix}-name`).map((node) => node.text()))
        .toEqual(prefix === 'broadcast' ? ['同组Z', '同组A'] : ['改编Z', '改编A'])
    })

    it(`${prefix} 新增整数默认值、输入拒绝与边界提交`, async () => {
      await router.push(`/admin/${key}s`)
      const wrapper = mount(View, { attachTo: document.body, global: { plugins: [router] } })
      wrappers.push(wrapper)
      await flushPromises()
      await wrapper.get(`.${prefix}-hero .primary-button`).trigger('click')
      const name = document.querySelector<HTMLInputElement>(`#${prefix}EditorName`)!
      const order = document.querySelector<HTMLInputElement>(`#${prefix}EditorSortOrder`)!
      expect(order.value).toBe('0')
      name.value = '独立新增'
      name.dispatchEvent(new Event('input', { bubbles: true }))
      for (const value of ['1.5', '-0.5', '2147483648', '-2147483649']) {
        order.value = value
        order.dispatchEvent(new Event('input', { bubbles: true }))
        document.querySelector<HTMLFormElement>(`#${prefix}EditorForm`)!
          .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
        await flushPromises()
        expect(order.getAttribute('aria-invalid')).toBe('true')
        expect(order.value).toBe(value)
        expect(requests.some((request) => request.path.endsWith(`/${key}/create`))).toBe(false)
      }
      order.value = '-2147483648'
      order.dispatchEvent(new Event('input', { bubbles: true }))
      document.querySelector<HTMLFormElement>(`#${prefix}EditorForm`)!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await flushPromises()
      expect(requests.find((request) => request.path.endsWith(`/${key}/create`))?.body)
        .toEqual({ name: '独立新增', sortOrder: -2147483648 })
    })
  }
})

describe('排序独立验收：关联与草稿', () => {
  it('普通职责编辑保留原负数与最大排序值，外链和整数评分载荷不回归', async () => {
    const wrapper = await editor()
    await wrapper.get('#animeCompanyRole-0').setValue('仅改职责')
    await save(wrapper)
    expect(writes()[0]?.body?.companies).toEqual([
      { companyId: 20, role: '仅改职责', sortOrder: -2 }, { companyId: 10, role: '协制', sortOrder: 2147483647 },
    ])
    expect(writes()[0]?.body?.externalLinks).toEqual(detail.externalLinks)
    expect(writes()[0]?.body?.personalRatingScore).toBe(4)
    expect(writes()[0]?.body?.episodeCount).toBe(12)
  })

  it('最大排序值已占用时新增公司仍在末尾，刷新回填顺序不变', async () => {
    const wrapper = await editor()
    await wrapper.findAll('.anime-inline-button').find((button) => button.text().includes('添加公司'))!.trigger('click')
    const selection = wrapper.findAllComponents(AnimeEntitySelect)[2]!
    selection.vm.$emit('update:modelValue', '30')
    selection.vm.$emit('update:selectedName', '公司30')
    await flushPromises()
    await save(wrapper)
    expect(writes()[0]?.body?.companies?.map((row) => row.companyId)).toEqual([20, 10, 30])
    expect(writes()[0]?.body?.companies?.map((row) => row.sortOrder)).toEqual([-2, 2147483647, 2147483647])
    wrapper.unmount()
    const reopened = await editor()
    expect([0, 1, 2].map((index) => (reopened.get(`#animeCompany-${index}`).element as HTMLInputElement).value))
      .toEqual(['公司20', '公司10', '公司30'])
  })

  it('公司移动保持名称职责对应，别名去空后仍提交字符串数组', async () => {
    const wrapper = await editor()
    expect(wrapper.get('[aria-label="上移公司 1"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[aria-label="下移别名 2"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[aria-label="下移公司 1"]').trigger('click')
    expect((wrapper.get('#animeCompany-0').element as HTMLInputElement).value).toBe('公司10')
    expect((wrapper.get('#animeCompanyRole-0').element as HTMLInputElement).value).toBe('协制')
    await wrapper.get('[aria-label="下移别名 1"]').trigger('click')
    await wrapper.findAll('.anime-inline-button').find((button) => button.text().includes('添加别名'))!.trigger('click')
    await wrapper.findAll('input[placeholder="输入别名"]')[2]!.setValue('  ')
    await save(wrapper)
    expect(writes()[0]?.body?.aliasNames).toEqual(['别名A', '别名Z'])
    expect(writes()[0]?.body?.companies).toEqual([
      { companyId: 10, role: '协制', sortOrder: 0 }, { companyId: 20, role: '主制', sortOrder: 1 },
    ])
  })

  it('提交中禁用移动与重复提交，保存失败保留排序草稿并可重试', async () => {
    const wrapper = await editor()
    await wrapper.get('[aria-label="下移公司 1"]').trigger('click')
    holdSave = new Promise<void>((resolve) => { releaseSave = resolve })
    failSave = true
    await save(wrapper)
    expect(closeState(wrapper)).toEqual({ dirty: true, submitting: true })
    expect(wrapper.get('[aria-label="下移公司 1"]').attributes('disabled')).toBeDefined()
    await wrapper.get('form').trigger('submit')
    expect(writes()).toHaveLength(1)
    releaseSave!()
    await flushPromises()
    expect(wrapper.text()).toContain('验收保存失败')
    expect(closeState(wrapper)).toEqual({ dirty: true, submitting: false })
    expect((wrapper.get('#animeCompany-0').element as HTMLInputElement).value).toBe('公司10')
    failSave = false
    await save(wrapper)
    expect(writes()).toHaveLength(2)
    expect(closeState(wrapper)).toEqual({ dirty: false, submitting: false })
  })

  it('字典失败重试保留编辑别名职责与选中 ID，恢复后不重读详情', async () => {
    const wrapper = await editor()
    await wrapper.findAll('input[placeholder="输入别名"]')[0]!.setValue('未保存别名')
    await wrapper.get('#animeCompanyRole-1').setValue('未保存职责')
    failCatalog = true
    notifyCatalogChanged('broadcast')
    await flushPromises()
    expect(wrapper.get('.anime-catalog-warning').text()).toContain('验收字典暂不可用')
    expect(wrapper.get('#animeBroadcastType').text()).toContain('同组Z')
    failCatalog = false
    broadcast = [broadcast[2]!, { ...broadcast[0]!, name: '同组Z已更新', sortOrder: 20 }]
    await wrapper.get('.anime-catalog-warning button').trigger('click')
    await flushPromises()
    expect(wrapper.get('#animeBroadcastType').text()).toContain('同组Z已更新')
    expect((wrapper.findAll('input[placeholder="输入别名"]')[0]!.element as HTMLInputElement).value).toBe('未保存别名')
    expect((wrapper.get('#animeCompanyRole-1').element as HTMLInputElement).value).toBe('未保存职责')
    expect(requests.filter((request) => request.path.endsWith('/anime/91'))).toHaveLength(1)
    await save(wrapper)
    expect(writes()[0]?.body?.broadcastTypeId).toBe(1)
  })

  it('字典请求未完成时合并并追赶新版本，不重置任何草稿', async () => {
    const wrapper = await editor()
    await wrapper.get('input[placeholder="输入正式名称"]').setValue('并发字典草稿')
    const initial = countCatalog()
    holdCatalog = new Promise<void>((resolve) => { releaseCatalog = resolve })
    notifyCatalogChanged('broadcast')
    await flushPromises()
    expect(countCatalog()).toBe(initial + 1)
    notifyCatalogChanged('broadcast')
    notifyCatalogChanged('adaptation')
    await flushPromises()
    expect(countCatalog()).toBe(initial + 1)
    releaseCatalog!()
    await flushPromises()
    expect(countCatalog()).toBe(initial + 2)
    expect((wrapper.get('input[placeholder="输入正式名称"]').element as HTMLInputElement).value).toBe('并发字典草稿')
    expect(closeState(wrapper).dirty).toBe(true)
  })

  it('缓存动画编辑页激活才刷新字典，无新变更时再激活不重复请求', async () => {
    await router.push('/admin/anime')
    const app = mount(App, { attachTo: document.body, global: { plugins: [router] } })
    wrappers.push(app)
    await flushPromises()
    await app.get('button[aria-label="编辑 独立验收动画"]').trigger('click')
    await flushPromises()
    const form = app.findComponent(AnimeEditorForm)
    await form.get('#animeCompanyRole-0').setValue('缓存职责')
    await app.get('a.nav-item[href="/admin/broadcast-types"]').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(app.find('.broadcast-management').exists()).toBe(true))
    const before = countCatalog()
    broadcast[0] = { ...broadcast[0]!, name: '缓存更新类型' }
    notifyCatalogChanged('broadcast')
    await flushPromises()
    const afterNotification = countCatalog()
    expect(afterNotification).toBe(before + 1)
    await app.get('.workspace-tab-main[href="/admin/anime"]').trigger('click')
    await flushPromises()
    expect(countCatalog()).toBe(afterNotification + 2)
    expect((app.findComponent(AnimeEditorForm).get('#animeCompanyRole-0').element as HTMLInputElement).value).toBe('缓存职责')
    await app.get('.workspace-tab-main[href="/admin/broadcast-types"]').trigger('click')
    await flushPromises()
    await app.get('.workspace-tab-main[href="/admin/anime"]').trigger('click')
    await flushPromises()
    expect(countCatalog()).toBe(afterNotification + 2)
  })

  it.each(['公司', '别名'])('仅移动%s顺序也阻止直接关闭工作区和退出登录', async (kind) => {
    await router.push('/admin/anime')
    const app = mount(App, { attachTo: document.body, global: { plugins: [router] } })
    wrappers.push(app)
    await flushPromises()
    await app.get('button[aria-label="编辑 独立验收动画"]').trigger('click')
    await flushPromises()
    await app.findComponent(AnimeEditorForm).get(`[aria-label="下移${kind} 1"]`).trigger('click')
    await app.get('[aria-label="关闭 动画管理"]').trigger('click')
    await flushPromises()
    expect(document.querySelector('.workspace-close-layer')?.textContent).toContain('未保存')
    document.querySelector<HTMLButtonElement>('.workspace-close-layer .secondary-button')!.click()
    await flushPromises()
    await app.get('.avatar-button').trigger('click')
    await app.get('.user-menu-logout').trigger('click')
    await flushPromises()
    expect(document.querySelector('.workspace-close-layer')?.textContent).toContain('退出登录将关闭所有页面')
    expect(requests.some((request) => request.path.endsWith('/admin/logout'))).toBe(false)
    document.querySelector<HTMLButtonElement>('.workspace-close-layer .secondary-button')!.click()
    await flushPromises()
    expect(closeState(app.findComponent(AnimeEditorForm)).dirty).toBe(true)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import router from '@/router'
import AnimeEditorForm from '@/views/admin/anime/AnimeEditorForm.vue'
import type { AnimeDetail, AnimePayload } from '@/types/api'

let wrapper: VueWrapper | undefined
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

function state() {
  return (
    wrapper!.vm as unknown as { getCloseState(): { dirty: boolean; submitting: boolean } }
  ).getCloseState()
}
async function save() {
  await wrapper!.get('form').trigger('submit')
  await flushPromises()
  document.querySelector<HTMLButtonElement>('.anime-confirm-actions .primary-button')!.click()
  await flushPromises()
}
async function render(mode: 'create' | 'edit' = 'edit', deferSave = false) {
  const original: AnimeDetail = {
    id: 15,
    name: '排序测试动画',
    broadcastTypeId: 1,
    adaptationTypeId: 2,
    regionId: 4,
    status: 1,
    airDate: '2006-09-26',
    episodeCount: null,
    personalRatingScore: null,
    coverImageUrl: null,
    description: null,
    aliasNames: ['别名乙', '别名甲'],
    tagIds: [],
    persons: [],
    companies: [
      { companyId: 7, role: '制作协力', sortOrder: -8 },
      { companyId: 3, role: '动画制作', sortOrder: 2147483647 },
    ],
    externalLinks: [],
    seriesId: null,
  }
  let submitted: AnimePayload | undefined
  let completeSave: ((failed: boolean) => void) | undefined
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const path = new URL(input, 'http://localhost').pathname
      let data: unknown = []
      if (path.endsWith('/broadcast-type/list')) data = [{ id: 1, name: 'TV', sortOrder: 0 }]
      else if (path.endsWith('/adaptation-type/list'))
        data = [{ id: 2, name: '原创', sortOrder: 0 }]
      else if (path.endsWith('/region/list')) data = [{ id: 4, name: '日本' }]
      else if (path.endsWith('/tags/page')) data = { rows: [], pages: 0 }
      else if (path.endsWith('/anime/15')) data = original
      else if (path.endsWith('/companies/page'))
        data = { pageNum: 1, pageSize: 10, total: 1, pages: 1, rows: [{ id: 9, name: '新公司' }] }
      else if (path.includes('/companies/'))
        data = {
          id: Number(path.split('/').pop()),
          name: path.endsWith('/7') ? '公司乙' : '公司甲',
          description: null,
        }
      else if (path.endsWith('/anime/update') || path.endsWith('/anime/create')) {
        submitted = JSON.parse(String(init?.body))
        if (deferSave) {
          const failed = await new Promise<boolean>((resolve) => {
            completeSave = resolve
          })
          if (failed)
            return {
              ok: true,
              status: 200,
              json: async () => ({ code: 500, message: '保存失败，请重试' }),
            }
        }
        data = { ...original, ...submitted }
      }
      return { ok: true, status: 200, json: async () => ({ code: 200, data }) }
    }),
  )
  await router.push(mode === 'create' ? '/admin/anime/create' : '/admin/anime')
  wrapper = mount(AnimeEditorForm, {
    props: { mode, ...(mode === 'edit' ? { animeId: 15 } : {}) },
    attachTo: document.body,
    global: { plugins: [router] },
  })
  await flushPromises()
  return { payload: () => submitted, complete: (failed = false) => completeSave!(failed) }
}

describe('动画关联排序', () => {
  it('按返回顺序回填，普通职责修改不重置负数或稀疏排序值', async () => {
    const api = await render()
    expect(state().dirty).toBe(false)
    expect(
      wrapper!
        .findAll('input[placeholder="输入别名"]')
        .map((input) => (input.element as HTMLInputElement).value),
    ).toEqual(['别名乙', '别名甲'])
    expect((wrapper!.get('#animeCompany-0').element as HTMLInputElement).value).toBe('公司乙')
    expect((wrapper!.get('#animeCompany-1').element as HTMLInputElement).value).toBe('公司甲')
    await wrapper!.get('#animeCompanyRole-0').setValue('新的职责')
    await save()
    expect(api.payload()?.companies).toEqual([
      { companyId: 7, role: '新的职责', sortOrder: -8 },
      { companyId: 3, role: '动画制作', sortOrder: 2147483647 },
    ])
    expect(state().dirty).toBe(false)
    expect(wrapper!.emitted('saved')).toHaveLength(1)
  })

  it('上下移别名与公司，首尾禁用，数组顺序和有效行排序正确且纳入未保存检测', async () => {
    const api = await render()
    expect(wrapper!.get('[aria-label="上移别名 1"]').attributes('disabled')).toBeDefined()
    expect(wrapper!.get('[aria-label="下移别名 2"]').attributes('disabled')).toBeDefined()
    expect(wrapper!.get('[aria-label="上移公司 1"]').attributes('disabled')).toBeDefined()
    expect(wrapper!.get('[aria-label="下移公司 2"]').attributes('disabled')).toBeDefined()
    await wrapper!.get('[aria-label="下移别名 1"]').trigger('click')
    expect(state().dirty).toBe(true)
    await wrapper!.get('[aria-label="上移别名 2"]').trigger('click')
    expect(state().dirty).toBe(false)
    await wrapper!.get('[aria-label="上移别名 2"]').trigger('click')
    await wrapper!.get('[aria-label="下移公司 1"]').trigger('click')
    expect((wrapper!.get('#animeCompany-0').element as HTMLInputElement).value).toBe('公司甲')
    expect((wrapper!.get('#animeCompanyRole-0').element as HTMLInputElement).value).toBe('动画制作')
    await save()
    expect(api.payload()?.aliasNames).toEqual(['别名甲', '别名乙'])
    expect(api.payload()?.companies).toEqual([
      { companyId: 3, role: '动画制作', sortOrder: 0 },
      { companyId: 7, role: '制作协力', sortOrder: 1 },
    ])
  })

  it('已有最大排序值时新增公司仍在末尾，校验失败保留选择，空行不提交', async () => {
    const api = await render()
    const addCompany = () =>
      wrapper!
        .findAll('.anime-inline-button')
        .find((button) => button.text().includes('添加公司'))!
        .trigger('click')
    await addCompany()
    await wrapper!.get('#animeCompany-2').setValue('新公司')
    await vi.waitFor(() => expect(wrapper!.find('.anime-entity-option').exists()).toBe(true))
    await wrapper!.get('.anime-entity-option').trigger('mousedown')
    await addCompany()
    await wrapper!.get('input[placeholder="输入正式名称"]').setValue('')
    await wrapper!.get('form').trigger('submit')
    expect(api.payload()).toBeUndefined()
    expect((wrapper!.get('#animeCompany-2').element as HTMLInputElement).value).toBe('新公司')
    await wrapper!.get('input[placeholder="输入正式名称"]').setValue('排序测试动画')
    await save()
    expect(api.payload()?.companies?.map((company) => company.companyId)).toEqual([7, 3, 9])
    const orders = api.payload()!.companies!.map((company) => company.sortOrder!)
    expect(orders).toEqual([...orders].sort((left, right) => left - right))
    expect(Math.max(...orders)).toBeLessThanOrEqual(2147483647)
  })

  it('空别名和公司行移除后不污染顺序，别名保持字符串数组', async () => {
    const api = await render()
    const addAlias = () =>
      wrapper!
        .findAll('.anime-inline-button')
        .find((button) => button.text().includes('添加别名'))!
        .trigger('click')
    await addAlias()
    await wrapper!.get('[aria-label="上移别名 3"]').trigger('click')
    await addAlias()
    await wrapper!.findAll('input[placeholder="输入别名"]')[3]!.setValue('别名丙')
    await wrapper!.get('[aria-label="移除别名 1"]').trigger('click')
    await save()
    expect(api.payload()?.aliasNames).toEqual(['别名甲', '别名丙'])
  })

  it('提交期间禁止重复操作，保存失败保留排序草稿并允许重试', async () => {
    const api = await render('edit', true)
    await wrapper!.get('[aria-label="下移公司 1"]').trigger('click')
    await save()
    expect(state()).toEqual({ dirty: true, submitting: true })
    for (const button of wrapper!
      .findAll('.anime-repeat-actions button, .anime-inline-button')
      .filter((button) => button.text() !== '添加外链')) {
      expect(button.attributes('disabled')).toBeDefined()
    }
    await wrapper!.get('form').trigger('submit')
    expect(document.querySelector('.anime-confirm-dialog')).toBeNull()
    api.complete(true)
    await flushPromises()
    expect(wrapper!.text()).toContain('保存失败，请重试')
    expect((wrapper!.get('#animeCompany-0').element as HTMLInputElement).value).toBe('公司甲')
    expect(wrapper!.emitted('saved')).toBeUndefined()
    await save()
    expect(api.payload()?.companies?.map((company) => company.companyId)).toEqual([3, 7])
    api.complete()
    await flushPromises()
    expect(state()).toEqual({ dirty: false, submitting: false })
    expect(wrapper!.emitted('saved')).toHaveLength(1)
  })
})

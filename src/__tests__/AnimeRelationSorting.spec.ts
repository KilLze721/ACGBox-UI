import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import router from '@/router'
import AnimeEditorForm from '@/views/admin/anime/AnimeEditorForm.vue'
import AnimeEntitySelect from '@/components/admin/AnimeEntitySelect.vue'
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
    companies: [
      { companyId: 7, role: '制作协力', sortOrder: -8 },
      { companyId: 3, role: '动画制作', sortOrder: 20 },
    ],
    externalLinks: [],
    seriesId: null,
    seriesSortOrder: null,
  }
  let submitted: AnimePayload | undefined
  let completeSave: (() => void) | undefined
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
      else if (path.includes('/companies/'))
        data = {
          id: Number(path.split('/').pop()),
          name: path.endsWith('/7') ? '公司乙' : '公司甲',
          description: null,
        }
      else if (path.endsWith('/anime/update') || path.endsWith('/anime/create')) {
        submitted = JSON.parse(String(init?.body))
        if (deferSave)
          await new Promise<void>((resolve) => {
            completeSave = resolve
          })
        // 模拟已确认的保存、再读取契约，不代表真实数据库联调。
        original.aliasNames = [...new Set(submitted?.aliasNames ?? [])]
        original.companies = (submitted?.companies ?? [])
          .map((company, index) => ({
            ...company,
            sortOrder: company.sortOrder ?? index,
          }))
          .sort((left, right) => left.sortOrder - right.sortOrder)
        data = { ...original, ...submitted, companies: original.companies }
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
  return { payload: () => submitted, complete: () => completeSave!() }
}

describe('动画关联排序', () => {
  it('按模拟保存契约重新打开表单时，别名和公司仍为保存后的顺序', async () => {
    await render()
    await wrapper!.get('[aria-label="下移别名 1"]').trigger('click')
    await wrapper!.get('[aria-label="下移公司 1"]').trigger('click')
    await save()
    wrapper!.unmount()
    wrapper = mount(AnimeEditorForm, {
      props: { mode: 'edit', animeId: 15 },
      attachTo: document.body,
      global: { plugins: [router] },
    })
    await flushPromises()
    expect(
      wrapper
        .findAll('input[placeholder="输入别名"]')
        .map((input) => (input.element as HTMLInputElement).value),
    ).toEqual(['别名甲', '别名乙'])
    expect((wrapper.get('#animeCompany-0').element as HTMLInputElement).value).toBe('公司甲')
    expect((wrapper.get('#animeCompanyRole-0').element as HTMLInputElement).value).toBe('动画制作')
    expect(state().dirty).toBe(false)
  })

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
      { companyId: 3, role: '动画制作', sortOrder: 20 },
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

  it('新增公司位于已有排序末尾，空行不提交；校验失败后排序仍保留', async () => {
    const api = await render()
    const addCompany = () =>
      wrapper!
        .findAll('.anime-inline-button')
        .find((button) => button.text().includes('添加公司'))!
        .trigger('click')
    await addCompany()
    await wrapper!.get('[aria-label="上移公司 3"]').trigger('click')
    await wrapper!.get('[aria-label="上移公司 2"]').trigger('click')
    expect((wrapper!.get('#animeCompany-1').element as HTMLInputElement).value).toBe('公司乙')
    await wrapper!.get('input[placeholder="输入正式名称"]').setValue('')
    await wrapper!.get('form').trigger('submit')
    expect(api.payload()).toBeUndefined()
    await wrapper!.get('input[placeholder="输入正式名称"]').setValue('排序测试动画')
    await wrapper!.get('[aria-label="移除公司 1"]').trigger('click')
    await addCompany()
    const selection = wrapper!.findAllComponents(AnimeEntitySelect)[2]!
    selection.vm.$emit('update:modelValue', '9')
    selection.vm.$emit('update:selectedName', '新公司')
    await flushPromises()
    await save()
    expect(api.payload()?.companies).toEqual([
      { companyId: 7, role: '制作协力', sortOrder: 0 },
      { companyId: 3, role: '动画制作', sortOrder: 1 },
      { companyId: 9, role: null, sortOrder: 2 },
    ])
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
    expect(api.payload()?.aliasNames?.every((alias) => typeof alias === 'string')).toBe(true)
  })

  it('提交期间排序、增删按钮禁用，工作区识别提交状态且不重复提交', async () => {
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
    api.complete()
    await flushPromises()
    expect(state()).toEqual({ dirty: false, submitting: false })
  })
})

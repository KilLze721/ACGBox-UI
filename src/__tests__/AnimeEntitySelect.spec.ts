import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import AnimeEntitySelect from '@/components/admin/AnimeEntitySelect.vue'
import type { NamedOption, PageResult } from '@/types/api'

type Search = (
  name: string,
  pageNum: number,
  signal: AbortSignal,
) => Promise<PageResult<NamedOption>>

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('动画表单的远程关联选择', () => {
  it('修改搜索文字立即清除旧 ID，并从分页结果中选择实际 ID', async () => {
    const search = vi.fn<Search>(async (_name, pageNum) => ({
      pageNum,
      pageSize: 10,
      total: 11,
      pages: 2,
      rows: [{ id: pageNum === 1 ? 7 : 8, name: pageNum === 1 ? '京都动画' : '京都协力' }],
    }))
    wrapper = mount(AnimeEntitySelect, {
      props: {
        id: 'company',
        label: '制作公司',
        modelValue: '3',
        selectedName: '旧公司',
        placeholder: '输入公司名称搜索',
        search,
      },
    })

    await wrapper.find('input').setValue('京都')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([''])
    expect(wrapper.emitted('update:selectedName')?.[0]).toEqual(['京都'])
    await new Promise((resolve) => window.setTimeout(resolve, 300))
    await flushPromises()
    expect(search).toHaveBeenCalledWith('京都', 1, expect.any(AbortSignal))
    expect(wrapper.find('.anime-entity-option').text()).toBe('京都动画')

    await wrapper.find('.anime-entity-more').trigger('mousedown')
    await flushPromises()
    expect(search).toHaveBeenCalledWith('京都', 2, expect.any(AbortSignal))
    await wrapper.findAll('.anime-entity-option')[1]?.trigger('mousedown')
    expect(wrapper.emitted('update:modelValue')?.slice(-1)[0]).toEqual(['8'])
    expect(wrapper.emitted('update:selectedName')?.slice(-1)[0]).toEqual(['京都协力'])
  })

  it('显示搜索失败并允许重试，系列提供明确的不关联选项', async () => {
    const search = vi
      .fn<Search>(async () => ({
        pageNum: 1,
        pageSize: 10,
        total: 0,
        pages: 0,
        rows: [],
      }))
      .mockRejectedValueOnce(new Error('网络错误'))
    wrapper = mount(AnimeEntitySelect, {
      props: {
        id: 'series',
        label: '所属系列',
        modelValue: '',
        selectedName: '',
        placeholder: '暂不关联系列',
        emptyOption: '暂不关联系列',
        search,
      },
    })

    await wrapper.find('input').trigger('focus')
    await new Promise((resolve) => window.setTimeout(resolve, 10))
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('搜索失败')
    await wrapper.find('[role="alert"] button').trigger('mousedown')
    await new Promise((resolve) => window.setTimeout(resolve, 10))
    await flushPromises()
    expect(wrapper.text()).toContain('没有匹配结果')
    await wrapper.find('.anime-entity-option').trigger('mousedown')
    expect(wrapper.emitted('update:modelValue')?.slice(-1)[0]).toEqual([''])
    expect(wrapper.emitted('update:selectedName')?.slice(-1)[0]).toEqual([''])
  })

  it('公司名称无匹配时在输入框下方显示红字，失焦后仍完成校验', async () => {
    const search = vi.fn<Search>(async () => ({
      pageNum: 1,
      pageSize: 10,
      total: 0,
      pages: 0,
      rows: [],
    }))
    wrapper = mount(AnimeEntitySelect, {
      attachTo: document.body,
      props: {
        id: 'company',
        label: '制作公司',
        modelValue: '',
        selectedName: '不存在的公司',
        placeholder: '输入公司名称搜索',
        noResultsError: '该公司名称不存在',
        search,
      },
    })

    await wrapper.find('input').trigger('focus')
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await new Promise((resolve) => window.setTimeout(resolve, 10))
    await flushPromises()

    expect(wrapper.find('#company-error').text()).toBe('该公司名称不存在')
    expect(wrapper.find('input').attributes('aria-invalid')).toBe('true')
  })
})

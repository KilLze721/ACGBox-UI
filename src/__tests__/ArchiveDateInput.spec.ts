import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ArchiveDateInput from '@/components/admin/ArchiveDateInput.vue'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('动画放送日期选择器', () => {
  it('按年份和月份两步选择，并以四列月份网格展示', async () => {
    wrapper = mount(ArchiveDateInput, {
      attachTo: document.body,
      props: {
        id: 'broadcastDate',
        modelValue: '2026',
        label: '放送日期',
        placeholder: '例如 2026 或 2026-09',
        'onUpdate:modelValue': async (value: string) => {
          await wrapper?.setProps({ modelValue: value })
        },
      },
    })

    await wrapper.find('input').trigger('focus')
    expect(wrapper.find('.date-picker-panel').classes()).toContain('open')
    expect(
      wrapper.find('.date-picker-grid:not(.date-picker-month-grid) .date-picker-option.selected').text(),
    ).toBe('2026')

    const yearButton = wrapper
      .findAll('.date-picker-option')
      .find((option) => option.text() === '2026')
    await yearButton?.trigger('click')

    expect(wrapper.find('.date-picker-month-grid').exists()).toBe(true)
    expect(wrapper.findAll('.date-picker-month-grid .date-picker-option')).toHaveLength(12)
    expect(wrapper.findAll('.date-picker-month-grid .date-picker-option.selected')).toHaveLength(0)

    const septemberButton = wrapper
      .findAll('.date-picker-month-grid .date-picker-option')
      .find((option) => option.text() === '9月')
    await septemberButton?.trigger('click')

    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('2026-09')
    expect(wrapper.find('.date-picker-panel').classes()).not.toContain('open')
  })

  it('关闭未确认的选择器时保留原值', async () => {
    wrapper = mount(ArchiveDateInput, {
      attachTo: document.body,
      props: {
        id: 'broadcastDate',
        modelValue: '2026-09',
        label: '放送日期',
        placeholder: '例如 2026 或 2026-09',
        'onUpdate:modelValue': async (value: string) => {
          await wrapper?.setProps({ modelValue: value })
        },
      },
    })

    await wrapper.find('input').trigger('focus')
    expect(wrapper.find('.date-picker-month-grid .date-picker-option.selected').text()).toBe('9月')
    await wrapper.find('.date-picker-footer .date-picker-link').trigger('click')
    const yearButton = wrapper
      .findAll('.date-picker-option')
      .find((option) => option.text() === '2025')
    await yearButton?.trigger('click')
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('2026-09')
    expect(wrapper.find('.date-picker-panel').classes()).not.toContain('open')
  })

  it('手动输入年份或年月时切换并高亮对应面板', async () => {
    wrapper = mount(ArchiveDateInput, {
      attachTo: document.body,
      props: {
        id: 'broadcastDate',
        modelValue: '',
        label: '放送日期',
        placeholder: '例如 2006 或 2006-09',
        'onUpdate:modelValue': async (value: string) => {
          await wrapper?.setProps({ modelValue: value })
        },
      },
    })

    const input = wrapper.find('input')
    await input.trigger('focus')
    await input.setValue('2006')
    await flushPromises()
    expect(wrapper.find('.date-picker-month-grid').exists()).toBe(false)
    expect(wrapper.find('.date-picker-option.selected').text()).toBe('2006')

    await input.setValue('2006-09')
    await flushPromises()
    expect(wrapper.find('.date-picker-title').text()).toBe('2006 年')
    expect(wrapper.find('.date-picker-month-grid .date-picker-option.selected').text()).toBe('9月')

    await input.setValue('2006')
    await flushPromises()
    expect(wrapper.find('.date-picker-month-grid').exists()).toBe(false)
    expect(wrapper.find('.date-picker-option.selected').text()).toBe('2006')
  })
})

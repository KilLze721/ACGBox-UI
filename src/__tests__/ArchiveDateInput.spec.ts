import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
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
    const yearButton = wrapper
      .findAll('.date-picker-option')
      .find((option) => option.text() === '2025')
    await yearButton?.trigger('click')
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('2026-09')
    expect(wrapper.find('.date-picker-panel').classes()).not.toContain('open')
  })
})

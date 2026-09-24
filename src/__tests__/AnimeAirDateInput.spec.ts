import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import AnimeAirDateInput from '@/components/admin/AnimeAirDateInput.vue'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

function mountDateInput(modelValue = '') {
  wrapper = mount(AnimeAirDateInput, {
    attachTo: document.body,
    props: {
      id: 'animeAirDate',
      modelValue,
      'onUpdate:modelValue': async (value: string) => {
        await wrapper?.setProps({ modelValue: value })
      },
    },
  })
  return wrapper
}

describe('新增和修改动画的日期输入框', () => {
  it('按输入精度同步年份、月份和日期面板', async () => {
    const dateInput = mountDateInput()
    const input = dateInput.find('input')
    await input.trigger('focus')

    await input.setValue('2006')
    await flushPromises()
    expect(dateInput.find('.anime-date-year-grid').exists()).toBe(true)
    expect(dateInput.find('.anime-date-year-grid button.selected').text()).toBe('2006')

    await input.setValue('2006-09')
    await flushPromises()
    expect(dateInput.find('.anime-date-month-grid').exists()).toBe(true)
    expect(dateInput.find('.anime-date-month-grid button.selected').text()).toBe('9月')

    await input.setValue('2006-09-26')
    await flushPromises()
    expect(dateInput.find('.anime-date-grid').exists()).toBe(true)
    expect(dateInput.find('.anime-date-cell button.selected').text()).toBe('26')
  })

  it('完整的未补零日期在失焦时规范化，重新打开时定位日期页', async () => {
    const dateInput = mountDateInput('2006-8-6')
    const input = dateInput.find('input')
    await input.trigger('focus')
    expect(dateInput.find('.anime-date-cell button.selected').text()).toBe('6')

    await input.trigger('blur')
    await flushPromises()
    expect((input.element as HTMLInputElement).value).toBe('2006-08-06')

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await dateInput.vm.$nextTick()
    await input.trigger('focus')
    expect(dateInput.find('.anime-date-grid').exists()).toBe(true)
    expect(dateInput.find('.anime-date-cell button.selected').text()).toBe('6')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import router from '@/router'
import BroadcastTypesView from '@/views/admin/broadcast-types/BroadcastTypesView.vue'
import AdaptationTypesView from '@/views/admin/adaptation-types/AdaptationTypesView.vue'
import { parseSortOrder } from '@/utils/sortOrder'

const wrappers: VueWrapper[] = []
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
})

function closeState(wrapper: VueWrapper) {
  return (
    wrapper.vm as unknown as { getCloseState(): { dirty: boolean; submitting: boolean } }
  ).getCloseState()
}
function inputValue(selector: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(selector)!
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
async function submit(prefix: string) {
  document
    .querySelector<HTMLFormElement>(`#${prefix}EditorForm`)!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flushPromises()
}

describe('排序整数契约', () => {
  it.each([-2147483648, -1, 0, 2147483647])('接受边界和负数 %s', (number) => {
    expect(parseSortOrder(String(number))).toBe(number)
  })
  it.each(['', '1.5', '-0.5', '2147483648', '-2147483649', '1e2', 'NaN', 'Infinity'])(
    '拒绝非整数或越界 %s',
    (text) => {
      expect(parseSortOrder(text)).toBeNull()
    },
  )
})

for (const [prefix, path, View] of [
  ['broadcast', 'broadcast-type', BroadcastTypesView],
  ['adaptation', 'adaptation-type', AdaptationTypesView],
] as const) {
  describe(`${path} 排序交互`, () => {
    async function render() {
      const rows = [
        { id: 20, name: 'Z类型', sortOrder: -8 },
        { id: 3, name: 'B类型', sortOrder: 0 },
        { id: 9, name: 'A类型', sortOrder: 0 },
      ]
      const writes: Array<{ name: string; id?: number; sortOrder: number }> = []
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string, init?: RequestInit) => {
          const url = new URL(input, 'http://localhost')
          let data: unknown = rows
          if (url.pathname.endsWith('/20')) data = rows[0]
          if (init?.method === 'POST') {
            const payload = JSON.parse(String(init.body))
            writes.push(payload)
            data = { id: payload.id ?? 100, ...payload }
          }
          return { ok: true, status: 200, json: async () => ({ code: 200, data }) }
        }),
      )
      await router.push(`/admin/${path}s`)
      const wrapper = mount(View, { attachTo: document.body, global: { plugins: [router] } })
      wrappers.push(wrapper)
      await flushPromises()
      return { wrapper, writes }
    }

    it('遵循服务端顺序，名称筛选不覆盖排序，同值不改成名称排序', async () => {
      const { wrapper } = await render()
      const names = () =>
        wrapper.findAll(`.${prefix}-table tbody .${prefix}-name`).map((cell) => cell.text())
      expect(names()).toEqual(['Z类型', 'B类型', 'A类型'])
      expect(wrapper.findAll(`td.${prefix}-sort-cell`).map((cell) => cell.text())).toEqual([
        '-8',
        '0',
        '0',
      ])
      await wrapper.get(`.${prefix}-search input`).setValue('类型')
      await wrapper.get(`.${prefix}-filter`).trigger('submit')
      expect(names()).toEqual(['Z类型', 'B类型', 'A类型'])
    })

    it('回填原排序，仅修改排序也标记未保存；提交最小值和最大值', async () => {
      const { wrapper, writes } = await render()
      await wrapper.get(`.${prefix}-table tbody button[title="编辑"]`).trigger('click')
      await flushPromises()
      expect(document.querySelector<HTMLInputElement>(`#${prefix}EditorSortOrder`)!.value).toBe(
        '-8',
      )
      expect(closeState(wrapper).dirty).toBe(false)
      inputValue(`#${prefix}EditorSortOrder`, '-2147483648')
      expect(closeState(wrapper).dirty).toBe(true)
      await submit(prefix)
      expect(writes[0]).toEqual({ id: 20, name: 'Z类型', sortOrder: -2147483648 })
      expect(closeState(wrapper).dirty).toBe(false)
      await wrapper.get(`.${prefix}-hero .primary-button`).trigger('click')
      expect(document.querySelector<HTMLInputElement>(`#${prefix}EditorSortOrder`)!.value).toBe('0')
      inputValue(`#${prefix}EditorName`, '新类型')
      inputValue(`#${prefix}EditorSortOrder`, '2147483647')
      await submit(prefix)
      expect(writes[1]).toEqual({ name: '新类型', sortOrder: 2147483647 })
    })

    it('小数、空值和超范围值显示关联错误且不发送保存请求', async () => {
      const { wrapper, writes } = await render()
      await wrapper.get(`.${prefix}-hero .primary-button`).trigger('click')
      inputValue(`#${prefix}EditorName`, '新类型')
      for (const value of ['1.5', '', '2147483648', '-2147483649']) {
        inputValue(`#${prefix}EditorSortOrder`, value)
        await submit(prefix)
        expect(document.querySelector(`#${prefix}SortOrderError`)?.textContent).toContain('整数')
        expect(
          document.querySelector(`#${prefix}EditorSortOrder`)?.getAttribute('aria-invalid'),
        ).toBe('true')
      }
      expect(writes).toHaveLength(0)
    })
  })
}

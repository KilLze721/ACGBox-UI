import { nextTick, onBeforeUnmount, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'

const layers: symbol[] = []
let originalScroll: { body: string; html: string; padding: string } | null = null

// 书籍抽屉及其确认弹窗共用嵌套滚动锁和焦点约束，最后一层关闭后恢复页面状态。
export function useModalLayer(open: MaybeRefOrGetter<boolean>, dismiss: () => void) {
  const element = ref<HTMLElement>()
  const key = Symbol()
  let opener: HTMLElement | null = null
  function release() {
    const index = layers.indexOf(key)
    if (index < 0) return
    layers.splice(index, 1)
    if (!layers.length && originalScroll) {
      document.body.style.overflow = originalScroll.body
      document.documentElement.style.overflow = originalScroll.html
      document.documentElement.style.paddingRight = originalScroll.padding
      originalScroll = null
    }
    if (opener?.isConnected && opener.getClientRects().length) opener.focus()
  }
  watch(
    () => toValue(open),
    async (value) => {
      if (!value) {
        release()
        return
      }
      opener = document.activeElement as HTMLElement | null
      if (!layers.length) {
        originalScroll = {
          body: document.body.style.overflow,
          html: document.documentElement.style.overflow,
          padding: document.documentElement.style.paddingRight,
        }
        const width = window.innerWidth - document.documentElement.clientWidth
        if (width > 0)
          document.documentElement.style.paddingRight = `${parseFloat(getComputedStyle(document.documentElement).paddingRight) + width}px`
        document.body.style.overflow = document.documentElement.style.overflow = 'hidden'
      }
      layers.push(key)
      await nextTick()
      if (toValue(open)) element.value?.focus()
    },
    { immediate: true, flush: 'post' },
  )
  function onKeydown(event: KeyboardEvent) {
    if (!toValue(open) || layers[layers.length - 1] !== key) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      dismiss()
    }
    if (event.key !== 'Tab') return
    const items = Array.from(
      element.value?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
      ) ?? [],
    ).filter((item) => item.getClientRects().length)
    const first = items[0],
      last = items[items.length - 1]
    if (!first || !last) {
      event.preventDefault()
      element.value?.focus()
      return
    }
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === element.value)
    ) {
      event.preventDefault()
      last.focus()
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || !element.value?.contains(document.activeElement))
    ) {
      event.preventDefault()
      first.focus()
    }
  }
  document.addEventListener('keydown', onKeydown)
  // 在目标页面激活前释放旧层，避免与现有资料抽屉各自保存的滚动状态交叉覆盖。
  onBeforeRouteLeave(release)
  onBeforeRouteUpdate(release)
  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeydown)
    release()
  })
  return element
}

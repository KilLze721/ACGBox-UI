<script setup lang="ts">
import { onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue'

defineOptions({ inheritAttrs: false })

const topScrollbar = ref<HTMLDivElement>()
const viewport = ref<HTMLDivElement>()
const contentWidth = ref(0)
let table: HTMLTableElement | null = null
let resizeObserver: ResizeObserver | undefined
let contentObserver: MutationObserver | undefined

function measureOverflow() {
  const element = viewport.value
  contentWidth.value =
    table && element?.clientWidth && element.scrollWidth > element.clientWidth
      ? element.scrollWidth
      : 0
}

function observeTable() {
  const nextTable = viewport.value?.querySelector('table') ?? null
  if (nextTable !== table) {
    if (table) resizeObserver?.unobserve(table)
    table = nextTable
    if (table) resizeObserver?.observe(table)
  }
  measureOverflow()
}

// 上下滚动条共享同一个位置，尺寸变化或切换视图后以表格为准。
function syncTop() {
  const top = topScrollbar.value
  const body = viewport.value
  if (contentWidth.value && top && body && top.scrollLeft !== body.scrollLeft)
    top.scrollLeft = body.scrollLeft
}

function syncViewport() {
  const top = topScrollbar.value
  const body = viewport.value
  if (contentWidth.value && top && body && body.scrollLeft !== top.scrollLeft)
    body.scrollLeft = top.scrollLeft
}

watch(contentWidth, syncTop, { flush: 'post' })

onMounted(() => {
  const element = viewport.value!
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(measureOverflow)
    resizeObserver.observe(element)
  }
  // 加载、空结果和卡片视图会替换表格，只观察列表容器的直接子节点。
  contentObserver = new MutationObserver(observeTable)
  contentObserver.observe(element, { childList: true })
  observeTable()
})

onActivated(observeTable)
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  contentObserver?.disconnect()
})
</script>

<template>
  <div class="admin-table-scroll">
    <div
      v-show="contentWidth"
      ref="topScrollbar"
      class="admin-table-scroll-top"
      role="region"
      aria-label="表格顶部横向滚动"
      tabindex="0"
      @scroll.passive="syncViewport"
    >
      <div :style="{ width: `${contentWidth}px` }" aria-hidden="true"></div>
    </div>
    <div ref="viewport" class="admin-table-scroll-viewport" v-bind="$attrs" @scroll.passive="syncTop">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.admin-table-scroll,
.admin-table-scroll-viewport {
  min-width: 0;
}

.admin-table-scroll-viewport,
.admin-table-scroll-top {
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--ink-faint) var(--surface-muted);
}

.admin-table-scroll-top {
  min-height: 9px;
  overflow-y: hidden;
  background: var(--surface-muted);
  border-bottom: 1px solid var(--line);
}

.admin-table-scroll-top > div {
  height: 1px;
}

.admin-table-scroll-top:focus-visible {
  outline-offset: -2px;
}
</style>

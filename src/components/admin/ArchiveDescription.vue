<script setup lang="ts">
/**
 * 管理列表共用简介：默认展示两行，内容溢出时可原地展开，不撑宽名称列。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

const props = withDefaults(defineProps<{ text?: string | null; emptyText?: string }>(), {
  emptyText: '暂无简介',
})
const id = useId()
const summary = ref<HTMLElement>()
const expanded = ref(false)
const overflowing = ref(false)
const content = computed(() => (props.text?.trim() ? props.text : props.emptyText))
let observer: ResizeObserver | undefined

async function measure() {
  await nextTick()
  if (!expanded.value && summary.value)
    overflowing.value = summary.value.scrollHeight > summary.value.clientHeight + 1
}
watch(
  () => props.text,
  () => {
    expanded.value = false
    void measure()
  },
)
onMounted(() => {
  void measure()
  if (typeof ResizeObserver !== 'undefined' && summary.value) {
    observer = new ResizeObserver(() => void measure())
    observer.observe(summary.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div class="archive-description">
    <span
      :id="id"
      ref="summary"
      class="archive-description-summary"
      :class="{ expanded, empty: !text?.trim() }"
      :title="content"
      >{{ content }}</span
    >
    <button
      v-if="overflowing || expanded"
      type="button"
      :aria-expanded="expanded"
      :aria-controls="id"
      :aria-label="expanded ? '收起简介' : '展开完整简介'"
      @click="expanded = !expanded"
    >
      {{ expanded ? '收起' : '展开' }}
    </button>
  </div>
</template>

<style scoped>
.archive-description {
  min-width: 0;
  line-height: 1.8;
}
.archive-description-summary {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.archive-description-summary.expanded {
  display: block;
  -webkit-line-clamp: unset;
}
.archive-description-summary.empty {
  color: var(--ink-faint);
}
.archive-description button {
  padding: 2px 0;
  color: var(--accent-strong);
  background: transparent;
  font-size: inherit;
}
.archive-description button:hover {
  color: var(--accent);
}
</style>

<script setup lang="ts">
/** 关联内容类型切换，不合并动画与书籍的分页或总数。 */
defineProps<{ modelValue: 'anime' | 'book' }>()
defineEmits<{ 'update:modelValue': [value: 'anime' | 'book'] }>()
</script>
<template>
  <div class="related-content-tabs" role="group" aria-label="关联内容类型">
    <button
      type="button"
      :aria-pressed="modelValue === 'anime'"
      @click="$emit('update:modelValue', 'anime')"
    >
      动画
    </button>
    <button
      type="button"
      :aria-pressed="modelValue === 'book'"
      @click="$emit('update:modelValue', 'book')"
    >
      书籍
    </button>
  </div>
</template>
<style scoped>
.related-content-tabs {
  display: flex;
  gap: 7px;
  margin: 18px 0 10px;
}
.related-content-tabs button {
  min-height: 32px;
  padding: 5px 14px;
  color: var(--ink-soft);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 9px;
  font: 600 11px var(--font-body);
}
.related-content-tabs button[aria-pressed='true'] {
  color: var(--accent-strong);
  background: var(--accent-soft);
  border-color: var(--accent);
}
.related-content-tabs button:focus-visible {
  outline: 0;
  box-shadow: var(--focus);
}
</style>

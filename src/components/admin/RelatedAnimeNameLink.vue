<script setup lang="ts">
/** 关联动画共用名称按钮：只有名称可点击，沿用管理页面的搜索跳转语义。 */
defineProps<{ name: string; label?: string }>()
defineEmits<{ select: [] }>()
</script>

<template>
  <button
    type="button"
    class="related-anime-name"
    :aria-label="label || `搜索此动画：${name}`"
    :title="label || '搜索此动画'"
    @click="$emit('select')"
  >
    {{ name }}
  </button>
</template>

<style scoped>
.related-anime-name {
  width: fit-content;
  max-width: 100%;
  justify-self: start;
  padding: 0;
  color: var(--ink);
  background: transparent;
  border: 0;
  border-radius: 3px;
  font: 700 11px/1.5 var(--font-body);
  text-align: left;
  text-decoration: none;
  overflow-wrap: anywhere;
  cursor: pointer;
}
.related-anime-name:hover {
  color: var(--accent-strong);
}
.related-anime-name:focus-visible {
  outline: 0;
  box-shadow: var(--focus);
}
</style>

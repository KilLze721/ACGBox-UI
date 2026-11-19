<script setup lang="ts">
/** 动画、书籍列表与详情共用公开状态标识；兼容未返回字段的历史资料。 */
withDefaults(defineProps<{ isPublic?: boolean }>(), { isPublic: true })
</script>

<template>
  <span class="work-visibility-badge" :class="{ hidden: !isPublic }">
    {{ isPublic ? '公开' : '隐藏' }}
  </span>
</template>

<style scoped>
.work-visibility-badge {
  display: inline-flex;
  width: max-content;
  align-items: center;
  padding: 3px 8px;
  color: var(--success);
  background: var(--success-soft);
  border: 1px solid color-mix(in srgb, var(--success) 20%, transparent);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 650;
  line-height: 1.5;
  white-space: nowrap;
}
.work-visibility-badge.hidden {
  color: var(--ink-faint);
  background: var(--surface-muted);
  border-color: var(--line);
}
</style>

<script setup lang="ts">
import ReservedPage from '@/components/admin/ReservedPage.vue'

defineProps<{
  id: string
}>()
</script>

<template>
  <ReservedPage
    title="编辑动画"
    :description="`当前动画 ID：${id}。设计稿提供了编辑入口，但未提供编辑表单视觉稿。`"
    icon="anime"
  />
</template>

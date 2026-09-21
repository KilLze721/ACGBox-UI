<script setup lang="ts">
import ReservedPage from '@/components/admin/ReservedPage.vue'

defineProps<{
  id: string
}>()
</script>

<template>
  <ReservedPage
    title="动画详情"
    :description="`当前动画 ID：${id}。设计稿提供了查看入口，但未提供详情页视觉稿。`"
    icon="anime"
  />
</template>

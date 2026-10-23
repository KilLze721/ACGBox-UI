<script setup lang="ts">
/**
 * 数据概览入口：作为工作区固定首页，目前复用占位组件展示模块说明。
 * 此文件尚未实现统计图表或真实概览数据查询。
 */
import ReservedPage from '@/components/admin/ReservedPage.vue'
</script>

<template>
  <ReservedPage
    title="数据概览"
    description="汇总动画资料库的内容规模、更新动态和数据质量。当前页面作为固定工作台入口保留。"
    icon="dashboard"
  />
</template>

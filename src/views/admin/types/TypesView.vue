<script setup lang="ts">
/**
 * 旧类型管理占位页面：保留类型模块说明，不包含实际字典维护逻辑。
 * 当前旧类型管理路由已转向放送类型管理；放送类型和改编类型由各自页面维护。
 */
import ReservedPage from '@/components/admin/ReservedPage.vue'
</script>

<template>
  <ReservedPage
    title="类型管理"
    description="分别维护放送类型与改编类型等基础字典。该模块入口已通过页面标签导航保留。"
    icon="types"
  />
</template>

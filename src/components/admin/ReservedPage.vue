<script setup lang="ts">
/**
 * 未完成模块的通用占位组件：根据传入的标题、说明和图标展示统一入口提示。
 * 只负责说明性界面和返回入口，不请求或模拟业务数据。
 */
import { RouterLink } from 'vue-router'
import AdminIcon from './AdminIcon.vue'

defineProps<{
  title: string
  description: string
  icon: string
}>()
</script>

<template>
  <div class="reserved-page">
    <section class="reserved-page-card" :aria-labelledby="`${icon}-reserved-title`">
      <div class="reserved-page-visual" aria-hidden="true">
        <AdminIcon :name="icon" />
      </div>
      <div class="reserved-page-copy">
        <p class="reserved-page-eyebrow">ACGBox Workspace / Opened Tab</p>
        <h1 :id="`${icon}-reserved-title`">{{ title }}</h1>
        <p>{{ description }}</p>
        <RouterLink class="primary-button" to="/admin/anime">
          <AdminIcon name="back" />
          返回动画管理
        </RouterLink>
      </div>
    </section>
  </div>
</template>

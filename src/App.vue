<!-- 应用根组件：通过路由出口展示登录页、管理端布局或错误页，不直接承载业务表单。 -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { initializeAuth } from '@/utils/auth'

const router = useRouter()
const accountRevision = ref(0)
let releaseAuth: (() => void) | undefined
onMounted(() => {
  releaseAuth = initializeAuth(() => {
    // 其他标签重新登录后销毁旧账号的工作区缓存，并重新进入后台首页。
    accountRevision.value++
    void router.replace('/admin/dashboard')
  })
})
onBeforeUnmount(() => releaseAuth?.())
</script>
<template>
  <RouterView :key="accountRevision" />
</template>

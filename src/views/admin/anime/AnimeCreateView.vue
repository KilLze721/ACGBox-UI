<script setup lang="ts">
/**
 * 新增动画独立页面：以新增模式装载共用表单，并向工作区提供未保存和提交状态。
 * 保存成功或确认取消后关闭当前新增标签，优先返回已经打开的动画管理实例。
 */
import { inject, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AnimeEditorForm from './AnimeEditorForm.vue'

const router = useRouter()
const ownerFullPath = useRoute().fullPath
const editorForm = ref<InstanceType<typeof AnimeEditorForm> | null>(null)
const returnToAnimeList = inject<(fullPath: string) => Promise<void>>('returnToAnimeList')

function getCloseState() {
  return editorForm.value?.getCloseState() ?? { dirty: false, submitting: false }
}

defineExpose({ getCloseState })

function handleSaved() {
  void closeAndReturnToAnime()
}

function handleCancelled() {
  void closeAndReturnToAnime()
}

async function closeAndReturnToAnime() {
  if (returnToAnimeList) await returnToAnimeList(ownerFullPath)
  else await router.replace('/admin/anime')
}
</script>

<template>
  <main class="anime-create-page">
    <button
      class="ghost-button anime-create-back"
      type="button"
      @click="editorForm?.requestCancel()"
    >
      <span aria-hidden="true">←</span> 返回动画管理
    </button>
    <AnimeEditorForm
      ref="editorForm"
      mode="create"
      @saved="handleSaved"
      @cancelled="handleCancelled"
    />
  </main>
</template>

<style scoped src="@/assets/animeCreatePage.css"></style>

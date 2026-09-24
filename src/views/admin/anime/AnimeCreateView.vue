<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AnimeEditorForm from './AnimeEditorForm.vue'

const router = useRouter()
const editorForm = ref<InstanceType<typeof AnimeEditorForm> | null>(null)

function getCloseState() {
  return editorForm.value?.getCloseState() ?? { dirty: false, submitting: false }
}

defineExpose({ getCloseState })

function handleSaved() {
  void router.push('/admin/anime')
}
</script>

<template>
  <main class="anime-create-page">
    <button
      class="ghost-button anime-create-back"
      type="button"
      @click="router.push('/admin/anime')"
    >
      <span aria-hidden="true">←</span> 返回动画管理
    </button>
    <AnimeEditorForm
      ref="editorForm"
      mode="create"
      @saved="handleSaved"
      @cancelled="router.push('/admin/anime')"
    />
  </main>
</template>

<style scoped>
.anime-create-page {
  width: min(1180px, 100%);
  margin: 0 auto;
}
.anime-create-back {
  margin-bottom: 12px;
}
</style>

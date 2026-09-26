<script setup lang="ts">
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

<style scoped>
.anime-create-page {
  width: min(1240px, 100%);
  margin: 0 auto;
}
.anime-create-back {
  min-height: 38px;
  margin-bottom: 16px;
  font-size: 12px;
}
.anime-create-page :deep(.anime-editor-content),
.anime-create-page :deep(.anime-editor-form) {
  gap: 18px;
}
.anime-create-page :deep(.anime-editor-hero) {
  padding: 27px 30px;
}
.anime-create-page :deep(.anime-editor-hero .eyebrow) {
  font-size: 11px;
}
.anime-create-page :deep(.anime-editor-hero h1) {
  font-size: 28px;
}
.anime-create-page :deep(.anime-editor-hero h1 span),
.anime-create-page :deep(.anime-editor-hero p:last-child) {
  font-size: 12px;
}
.anime-create-page :deep(.anime-editor-actions button),
.anime-create-page :deep(.anime-editor-footer button) {
  min-height: 42px;
  font-size: 12px;
}
.anime-create-page :deep(.anime-editor-card) {
  padding: 24px;
}
.anime-create-page :deep(.anime-editor-section-head) {
  padding-bottom: 17px;
  margin-bottom: 19px;
}
.anime-create-page :deep(.anime-editor-section-head h2) {
  font-size: 17px;
}
.anime-create-page :deep(.anime-editor-section-head p) {
  font-size: 11px;
}
.anime-create-page :deep(.anime-editor-section-head > span) {
  font-size: 21px;
}
.anime-create-page :deep(.anime-editor-grid) {
  gap: 19px 17px;
}
.anime-create-page :deep(.anime-editor-grid .field > span),
.anime-create-page :deep(.anime-field-label) {
  margin-bottom: 8px;
  font-size: 12px;
}
.anime-create-page :deep(.anime-editor-grid .field > input:not([type='checkbox'])),
.anime-create-page :deep(.anime-cover-field > input),
.anime-create-page :deep(.anime-editor-grid .field textarea),
.anime-create-page :deep(.anime-repeat-row > input),
.anime-create-page :deep(.anime-entity-select > input),
.anime-create-page :deep(.anime-suggestion-input > input) {
  min-height: 44px;
  padding-right: 12px;
  padding-left: 12px;
  font-size: 12px;
}
.anime-create-page :deep(.anime-editor-grid .field textarea) {
  min-height: 112px;
  padding-top: 12px;
  padding-bottom: 12px;
}
.anime-create-page :deep(.archive-select-trigger),
.anime-create-page :deep(.anime-date-input),
.anime-create-page :deep(.anime-input-suffix) {
  height: 44px;
  font-size: 12px;
}
.anime-create-page :deep(.archive-select-option),
.anime-create-page :deep(.anime-entity-option),
.anime-create-page :deep(.anime-entity-more),
.anime-create-page :deep(.anime-suggestion-menu button) {
  min-height: 36px;
  font-size: 12px;
}
.anime-create-page :deep(.anime-date-input > input:not([type='checkbox'])) {
  font-size: 12px;
}
.anime-create-page :deep(.anime-date-trigger) {
  width: 40px;
  height: 38px;
}
.anime-create-page :deep(.anime-date-trigger svg),
.anime-create-page :deep(.anime-inline-button svg),
.anime-create-page :deep(.anime-remove-button svg) {
  width: 16px;
  height: 16px;
}
.anime-create-page :deep(.anime-date-panel) {
  width: min(330px, calc(100vw - 40px));
}
.anime-create-page :deep(.anime-date-panel-title) {
  font-size: 13px;
}
.anime-create-page :deep(.anime-date-year-grid button),
.anime-create-page :deep(.anime-date-month-grid button),
.anime-create-page :deep(.anime-date-cell button) {
  font-size: 12px;
}
.anime-create-page :deep(.anime-date-year-grid button),
.anime-create-page :deep(.anime-date-month-grid button) {
  min-height: 38px;
}
.anime-create-page :deep(.anime-date-cell) {
  height: 36px;
}
.anime-create-page :deep(.anime-date-weekdays),
.anime-create-page :deep(.anime-date-panel-foot button),
.anime-create-page :deep(.anime-date-panel-foot span) {
  font-size: 11px;
}
.anime-create-page :deep(.anime-input-suffix i),
.anime-create-page :deep(.anime-rating-value),
.anime-create-page :deep(.anime-rating-clear),
.anime-create-page :deep(.anime-switch-row small),
.anime-create-page :deep(.anime-muted-note),
.anime-create-page :deep(.field-error),
.anime-create-page :deep(.anime-entity-error),
.anime-create-page :deep(.anime-entity-state),
.anime-create-page :deep(.anime-suggestion-empty) {
  font-size: 11px;
}
.anime-create-page :deep(.anime-input-suffix input) {
  padding-left: 12px;
  font-size: 12px;
}
.anime-create-page :deep(.anime-entity-toggle) {
  width: 40px;
  height: 42px;
}
.anime-create-page :deep(.anime-cover-field) {
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 14px;
}
.anime-create-page :deep(.anime-cover-preview) {
  width: 76px;
  height: 96px;
  font-size: 10px;
}
.anime-create-page :deep(.anime-repeat-list),
.anime-create-page :deep(.anime-tag-picker) {
  gap: 9px;
}
.anime-create-page :deep(.anime-inline-button),
.anime-create-page :deep(.anime-tag-picker .tag-option) {
  min-height: 36px;
  font-size: 11px;
}
.anime-create-page :deep(.anime-inline-button) {
  padding: 0 12px;
  margin-top: 12px;
}
.anime-create-page :deep(.anime-remove-button) {
  width: 36px;
  height: 36px;
}
.anime-create-page :deep(.anime-repeat-row:has(.anime-entity-select)) {
  grid-template-columns: minmax(0, 1.4fr) minmax(120px, 0.8fr) 36px;
}
.anime-create-page :deep(.anime-link-row) {
  grid-template-columns: minmax(110px, 0.8fr) minmax(180px, 1.5fr) 82px 36px;
}
.anime-create-page :deep(.anime-switch-row strong) {
  font-size: 12px;
}
.anime-create-page :deep(.anime-rating-control) {
  min-height: 44px;
  gap: 3px;
}
.anime-create-page :deep(.anime-rating-star) {
  font-size: 23px;
}
.anime-create-page :deep(.anime-save-error) {
  font-size: 12px;
}
@media (max-width: 620px) {
  .anime-create-page :deep(.anime-editor-hero),
  .anime-create-page :deep(.anime-editor-card) {
    padding: 20px;
  }
  .anime-create-page :deep(.anime-editor-hero h1) {
    font-size: 25px;
  }
  .anime-create-page :deep(.anime-link-row) {
    grid-template-columns: 1fr 1fr 56px 36px;
  }
}
</style>

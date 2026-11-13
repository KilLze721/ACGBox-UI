<script setup lang="ts">
/** 动画与书籍详情共用的系列卡片，单独处理分页、加载和重试。 */
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { getSeriesWorks } from '@/api/series'
import { pageSizeValues } from '@/utils/preferences'
import type { SeriesWork, SeriesWorksResult } from '@/types/api'
import AdminIcon from './AdminIcon.vue'
import ArchiveSelect from './ArchiveSelect.vue'
import RelatedAnimeNameLink from './RelatedAnimeNameLink.vue'

const props = defineProps<{
  seriesId: number
  workType: SeriesWork['workType']
  workId: number
}>()
defineEmits<{ openSeries: [name: string]; select: [work: SeriesWork] }>()

const id = useId()
const pageSize = ref(20)
const pageSizeOptions = pageSizeValues.map((value) => ({ id: value, name: `${value} 条` }))
const result = ref<SeriesWorksResult>()
const loading = ref(false)
const errorMessage = ref('')
const works = computed(() => result.value?.works)
const summary = computed(() => {
  const page = works.value
  if (!page?.rows.length) return ''
  const start = (page.pageNum - 1) * page.pageSize + 1
  const end = start + page.rows.length - 1
  return `第 ${start}–${end} 条，共 ${page.total} 条`
})
let requestedPage = 1
let controller: AbortController | undefined

async function loadPage(pageNum: number) {
  controller?.abort()
  const request = new AbortController()
  controller = request
  requestedPage = pageNum
  loading.value = true
  errorMessage.value = ''
  try {
    const value = await getSeriesWorks(props.seriesId, pageNum, pageSize.value, request.signal)
    if (!request.signal.aborted) result.value = value
  } catch (error) {
    if (!request.signal.aborted)
      errorMessage.value = error instanceof Error ? error.message : '系列作品读取失败，请重试。'
  } finally {
    if (controller === request) loading.value = false
  }
}

watch(
  () => props.seriesId,
  () => {
    result.value = undefined
    pageSize.value = 20
    void loadPage(1)
  },
  { immediate: true },
)
onBeforeUnmount(() => controller?.abort())

function changePageSize(value: string) {
  const next = Number(value)
  if (next === pageSize.value) return
  pageSize.value = next
  void loadPage(1)
}

function isCurrent(work: SeriesWork) {
  return work.workType === props.workType && work.workId === props.workId
}

function workLabel(work: SeriesWork) {
  if (work.workType === 'ANIME') return '动画'
  return work.bookTypeName ? `书籍 · ${work.bookTypeName}` : '书籍'
}
</script>

<template>
  <section class="related-anime series-works" :aria-labelledby="id" :aria-busy="loading">
    <header>
      <div class="series-info">
        <h3 :id="id">所属系列</h3>
        <button
          v-if="result"
          class="anime-detail-series-link series-name"
          type="button"
          @click="$emit('openSeries', result.series.name)"
        >
          {{ result.series.name }}
        </button>
        <p v-if="result?.series.description?.trim()" class="series-description">
          {{ result.series.description }}
        </p>
      </div>
      <span v-if="works" class="related-count">共 {{ works.total }} 部作品</span>
    </header>
    <p v-if="loading" class="related-state" role="status">正在读取系列作品…</p>
    <p v-else-if="errorMessage" class="related-state related-error" role="alert">
      {{ errorMessage }}
      <button type="button" @click="loadPage(requestedPage)">重新读取系列作品</button>
    </p>
    <p v-else-if="!works?.rows.length" class="related-state">该系列暂无可展示作品。</p>
    <ul v-else class="related-rows" aria-label="系列作品">
      <li
        v-for="work in works.rows"
        :key="`${work.workType}-${work.workId}`"
        :aria-current="isCurrent(work) ? 'true' : undefined"
      >
        <img v-if="work.coverImageUrl" :src="work.coverImageUrl" alt="" loading="lazy" />
        <span v-else class="related-cover" aria-hidden="true">{{ work.name.slice(0, 1) }}</span>
        <div class="related-copy">
          <strong v-if="isCurrent(work)" class="current-work">{{ work.name }}</strong>
          <RelatedAnimeNameLink
            v-else
            :name="work.name"
            :label="`查看${work.workType === 'ANIME' ? '动画' : '书籍'}详情：${work.name}`"
            @select="$emit('select', work)"
          />
          <small>{{ workLabel(work) }}<span v-if="isCurrent(work)">· 当前作品</span></small>
        </div>
        <time v-if="work.releaseDate" class="related-meta" :datetime="work.releaseDate">
          {{ work.releaseDate }}
        </time>
        <span v-else class="related-meta">日期未填写</span>
      </li>
    </ul>
    <footer v-if="works?.total && !errorMessage" class="related-pagination">
      <span>{{ summary }}</span>
      <div class="related-pages">
        <ArchiveSelect
          :id="`${id}-page-size`"
          label="系列作品每页条数"
          :model-value="String(pageSize)"
          placeholder="每页条数"
          :options="pageSizeOptions"
          :show-placeholder-option="false"
          placement="top"
          @update:model-value="changePageSize"
        />
        <button
          type="button"
          aria-label="上一页系列作品"
          :disabled="loading || works.pageNum <= 1"
          @click="loadPage(works.pageNum - 1)"
        >
          <AdminIcon name="left" />
        </button>
        <span>{{ works.pageNum }} / {{ works.pages }}</span>
        <button
          type="button"
          aria-label="下一页系列作品"
          :disabled="loading || works.pageNum >= works.pages"
          @click="loadPage(works.pageNum + 1)"
        >
          <AdminIcon name="right" />
        </button>
      </div>
    </footer>
  </section>
</template>

<style scoped src="@/assets/relatedWorkList.css"></style>
<style scoped>
.series-works {
  margin-top: 12px;
}
.series-works header {
  align-items: flex-start;
}
.series-info {
  min-width: 0;
}
.series-name {
  max-width: 100%;
  margin-top: 6px;
  padding: 4px 8px;
  color: var(--accent-strong);
  background: var(--accent-soft);
  border-radius: 999px;
  text-align: left;
  overflow-wrap: anywhere;
}
.series-name:hover {
  border-color: var(--accent);
}
.series-description {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.related-rows {
  margin-top: 10px;
}
.related-rows li[aria-current='true'] {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
}
.current-work {
  color: var(--ink);
  font: 700 11px/1.5 var(--font-body);
  overflow-wrap: anywhere;
}
</style>

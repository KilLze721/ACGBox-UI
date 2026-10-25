<script setup lang="ts">
/** 人物、系列详情共用关联动画列表；分页与排序均由服务器完成，页面持有查询状态。 */
import { computed, useId } from 'vue'
import AdminIcon from './AdminIcon.vue'
import ArchiveSelect from './ArchiveSelect.vue'
import RelatedAnimeNameLink from './RelatedAnimeNameLink.vue'
import { pageSizeValues } from '@/utils/preferences'
import type { RelatedAnimeModel } from '@/utils/relatedAnime'
import type { AnimePageItem } from '@/types/api'

const props = defineProps<{
  model: RelatedAnimeModel
  title?: string
  description?: string
  roleLabel?: (anime: AnimePageItem) => string
}>()
defineEmits<{ select: [anime: AnimePageItem] }>()
const id = useId()
const pageSizeOptions = pageSizeValues.map((value) => ({ id: value, name: `${value} 条` }))
const summary = computed(() => {
  const page = props.model.state.page
  if (!page.total) return '共 0 条'
  const start = (page.pageNum - 1) * page.pageSize + 1
  return `第 ${start}–${Math.min(page.pageNum * page.pageSize, page.total)} 条，共 ${page.total} 条`
})
</script>

<template>
  <section class="related-anime" :aria-label="title || '关联动画'" :aria-busy="model.state.loading">
    <header>
      <div>
        <h3>{{ title || '关联动画' }}</h3>
        <p>{{ description || '点击动画名称，在动画管理中搜索此动画' }}</p>
      </div>
      <span class="related-count">{{
        model.state.loading
          ? '读取中'
          : model.state.error
            ? '读取失败'
            : `共 ${model.state.page.total} 条`
      }}</span>
    </header>
    <div class="related-sort" aria-label="关联动画排序">
      <button
        type="button"
        :class="{ selected: model.state.sortBy === 'BROADCAST_DATE' }"
        :aria-pressed="model.state.sortBy === 'BROADCAST_DATE'"
        @click="model.changeSort('BROADCAST_DATE')"
      >
        放送时间
      </button>
      <button
        type="button"
        :class="{ selected: model.state.sortBy === 'PERSONAL_RATING' }"
        :aria-pressed="model.state.sortBy === 'PERSONAL_RATING'"
        @click="model.changeSort('PERSONAL_RATING')"
      >
        个人评分
      </button>
      <button class="related-direction" type="button" @click="model.toggleDirection">
        {{ model.state.sortDirection === 'DESC' ? '倒序 ↓' : '正序 ↑' }}
      </button>
    </div>
    <p v-if="model.state.loading" class="related-state" role="status">正在读取关联动画…</p>
    <p v-else-if="model.state.error" class="related-state related-error" role="alert">
      {{ model.state.error }}<button type="button" @click="model.retry">重新读取</button>
    </p>
    <p v-else-if="!model.state.page.rows.length" class="related-state">暂无关联动画。</p>
    <ul v-else class="related-rows">
      <li v-for="anime in model.state.page.rows" :key="anime.id">
        <img
          v-if="anime.coverImageUrl"
          :src="anime.coverImageUrl"
          :alt="`${anime.name}封面`"
          loading="lazy"
        />
        <span v-else class="related-cover">{{ anime.name.slice(0, 1) }}</span>
        <div class="related-copy">
          <RelatedAnimeNameLink :name="anime.name" @select="$emit('select', anime)" />
          <small v-if="roleLabel">{{ roleLabel(anime) }}</small>
          <small v-else>搜索此动画 <AdminIcon name="right" /></small>
        </div>
        <div class="related-meta">
          <span>{{ anime.airDate || '放送日期未填写' }}</span
          ><span>评分 {{ anime.personalRating ?? '暂无' }}</span>
        </div>
      </li>
    </ul>
    <footer v-if="!model.state.loading && !model.state.error" class="related-pagination">
      <span>{{ summary }}</span>
      <div class="related-pages">
        <ArchiveSelect
          :id="`${id}-page-size`"
          label="关联动画每页条数"
          :model-value="String(model.state.pageSize)"
          placeholder="每页条数"
          :options="pageSizeOptions"
          :show-placeholder-option="false"
          placement="top"
          @update:model-value="model.changePageSize"
        />
        <button
          type="button"
          aria-label="上一页关联动画"
          :disabled="model.state.page.pageNum <= 1"
          @click="model.loadPage(model.state.page.pageNum - 1)"
        >
          <AdminIcon name="left" />
        </button>
        <span
          >{{ model.state.page.pages ? model.state.page.pageNum : 0 }} /
          {{ model.state.page.pages }}</span
        >
        <button
          type="button"
          aria-label="下一页关联动画"
          :disabled="model.state.page.pageNum >= model.state.page.pages"
          @click="model.loadPage(model.state.page.pageNum + 1)"
        >
          <AdminIcon name="right" />
        </button>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.related-anime {
  margin-top: 18px;
  padding: 16px;
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 14px;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line);
}
h3 {
  margin: 0;
  color: var(--ink);
  font: 700 14px/1.5 var(--font-display);
}
header p {
  margin: 3px 0 0;
  color: var(--ink-faint);
  font: 10px/1.6 var(--font-body);
}
.related-count {
  flex-shrink: 0;
  padding: 4px 8px;
  color: var(--accent-strong);
  background: var(--accent-soft);
  border-radius: 20px;
  font: 10px var(--font-body);
}
.related-sort {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 12px 0;
}
button {
  color: var(--ink-soft);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 9px;
  font: 11px/1.5 var(--font-body);
  cursor: pointer;
}
.related-sort button {
  min-height: 30px;
  padding: 5px 9px;
}
.related-sort .selected {
  color: var(--accent-strong);
  background: var(--accent-soft);
  border-color: var(--accent);
}
.related-direction {
  margin-left: auto;
}
button:focus-visible {
  outline: 0;
  box-shadow: var(--focus);
}
button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.related-state {
  padding: 20px 0;
  color: var(--ink-faint);
  font: 11px/1.7 var(--font-body);
  text-align: center;
}
.related-error {
  color: var(--danger);
}
.related-error button {
  margin: 8px;
  padding: 5px 10px;
}
.related-rows {
  display: grid;
  gap: 8px;
  padding: 0;
  margin: 0;
  list-style: none;
}
.related-rows li {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 10px;
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.related-rows img,
.related-cover {
  width: 34px;
  height: 48px;
  flex-shrink: 0;
  object-fit: cover;
  border-radius: 5px;
}
.related-cover {
  display: grid;
  place-items: center;
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.related-copy {
  flex: 1;
  min-width: 0;
}
.related-copy small {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-top: 4px;
  color: var(--ink-faint);
  font: 10px/1.6 var(--font-body);
  overflow-wrap: anywhere;
}
.related-copy svg {
  width: 12px;
  height: 12px;
}
.related-meta {
  display: grid;
  gap: 5px;
  color: var(--ink-faint);
  font: 10px/1.5 var(--font-body);
  text-align: right;
}
.related-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  color: var(--ink-faint);
  font: 10px var(--font-body);
}
.related-pages {
  display: flex;
  align-items: center;
  gap: 7px;
}
.related-pages > button {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
}
.related-pages svg {
  width: 13px;
  height: 13px;
}
.related-pages :deep(.archive-select) {
  width: 84px;
  flex-shrink: 0;
}
.related-pages :deep(.archive-select-trigger) {
  height: 34px;
  padding: 0 10px;
  font-size: 11px;
}
.related-pages :deep(.archive-select-trigger > span) {
  white-space: nowrap;
}
@media (max-width: 480px) {
  .related-anime {
    padding: 12px;
  }
  .related-rows li {
    flex-wrap: wrap;
  }
  .related-copy {
    flex-basis: calc(100% - 50px);
  }
  .related-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding-left: 44px;
    text-align: left;
  }
}
</style>

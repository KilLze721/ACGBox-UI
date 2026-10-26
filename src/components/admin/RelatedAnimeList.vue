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

<style scoped src="@/assets/relatedWorkList.css"></style>

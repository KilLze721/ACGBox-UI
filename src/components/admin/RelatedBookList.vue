<script setup lang="ts">
/** 公司、人物、系列详情共用关联书籍列表；分页与排序均由服务器完成，页面持有查询状态。 */
import { computed, useId } from 'vue'
import AdminIcon from './AdminIcon.vue'
import ArchiveSelect from './ArchiveSelect.vue'
import RelatedAnimeNameLink from './RelatedAnimeNameLink.vue'
import { pageSizeValues } from '@/utils/preferences'
import type { RelatedBookModel } from '@/utils/relatedBook'
import type { BookPageItem } from '@/types/book'

const props = defineProps<{
  model: RelatedBookModel
  title?: string
  description?: string
  roleLabel?: (book: BookPageItem) => string
}>()
defineEmits<{ select: [book: BookPageItem] }>()
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
  <section class="related-anime" :aria-label="title || '关联书籍'" :aria-busy="model.state.loading">
    <header>
      <div>
        <h3>{{ title || '关联书籍' }}</h3>
        <p>{{ description || '点击书籍名称查看对应详情' }}</p>
      </div>
      <span class="related-count">{{
        model.state.loading
          ? '读取中'
          : model.state.error
            ? '读取失败'
            : `共 ${model.state.page.total} 条`
      }}</span>
    </header>
    <div class="related-sort" aria-label="关联书籍排序">
      <button
        type="button"
        :class="{ selected: model.state.sortBy === 'PUBLISH_DATE' }"
        :aria-pressed="model.state.sortBy === 'PUBLISH_DATE'"
        @click="model.changeSort('PUBLISH_DATE')"
      >
        首次发表日期
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
    <p v-if="model.state.loading" class="related-state" role="status">正在读取关联书籍…</p>
    <p v-else-if="model.state.error" class="related-state related-error" role="alert">
      {{ model.state.error }}<button type="button" @click="model.retry">重新读取</button>
    </p>
    <p v-else-if="!model.state.page.rows.length" class="related-state">暂无关联书籍。</p>
    <ul v-else class="related-rows">
      <li v-for="book in model.state.page.rows" :key="book.id">
        <img
          v-if="book.coverImageUrl"
          :src="book.coverImageUrl"
          :alt="`${book.name}封面`"
          loading="lazy"
        />
        <span v-else class="related-cover">{{ book.name.slice(0, 1) }}</span>
        <div class="related-copy">
          <RelatedAnimeNameLink
            :name="book.name"
            :label="'查看书籍详情：' + book.name"
            @select="$emit('select', book)"
          />
          <small v-if="roleLabel">{{ roleLabel(book) }}</small>
          <small v-else>查看书籍详情 <AdminIcon name="right" /></small>
        </div>
        <div class="related-meta">
          <span>{{ book.publishDate || '发表日期未知' }}</span
          ><span>评分 {{ book.personalRating ?? '暂无' }}</span>
        </div>
      </li>
    </ul>
    <footer v-if="!model.state.loading && !model.state.error" class="related-pagination">
      <span>{{ summary }}</span>
      <div class="related-pages">
        <ArchiveSelect
          :id="`${id}-page-size`"
          label="关联书籍每页条数"
          :model-value="String(model.state.pageSize)"
          placeholder="每页条数"
          :options="pageSizeOptions"
          :show-placeholder-option="false"
          placement="top"
          @update:model-value="model.changePageSize"
        />
        <button
          type="button"
          aria-label="上一页关联书籍"
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
          aria-label="下一页关联书籍"
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

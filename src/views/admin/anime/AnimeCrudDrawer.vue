<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { getAnimeDetail } from '@/api/anime'
import AdminIcon from '@/components/admin/AdminIcon.vue'
import AnimeEditorForm from './AnimeEditorForm.vue'
import type { AnimeDetail, AnimePageItem } from '@/types/api'

const props = defineProps<{
  mode: 'detail' | 'edit'
  animeId: number
  anime: AnimePageItem
}>()

const emit = defineEmits<{
  close: []
  saved: [anime: AnimeDetail]
  edit: []
  delete: [anime: AnimePageItem]
}>()

const detail = ref<AnimeDetail | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const editorForm = ref<InstanceType<typeof AnimeEditorForm> | null>(null)
let controller: AbortController | undefined
let scrollLockState:
  | {
      htmlOverflow: string
      bodyOverflow: string
      htmlPaddingRight: string
      scrollX: number
      scrollY: number
    }
  | undefined

const statusNames: Record<number, string> = {
  1: '未放送',
  2: '放送中',
  3: '已完结',
  4: '其他',
}

onMounted(async () => {
  const html = document.documentElement
  const body = document.body
  const scrollbarWidth = window.innerWidth - html.clientWidth
  scrollLockState = {
    htmlOverflow: html.style.overflow,
    bodyOverflow: body.style.overflow,
    htmlPaddingRight: html.style.paddingRight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  }
  html.style.overflow = 'hidden'
  body.style.overflow = 'hidden'
  if (scrollbarWidth > 0) {
    const currentPadding = Number.parseFloat(getComputedStyle(html).paddingRight) || 0
    html.style.paddingRight = `${currentPadding + scrollbarWidth}px`
  }

  if (props.mode !== 'detail') return
  controller = new AbortController()
  try {
    detail.value = await getAnimeDetail(props.animeId, controller.signal)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    errorMessage.value = error instanceof Error ? error.message : '动画详情加载失败，请稍后重试。'
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  controller?.abort()
  if (!scrollLockState) return
  const html = document.documentElement
  const body = document.body
  html.style.overflow = scrollLockState.htmlOverflow
  body.style.overflow = scrollLockState.bodyOverflow
  html.style.paddingRight = scrollLockState.htmlPaddingRight
  if (window.scrollX !== scrollLockState.scrollX || window.scrollY !== scrollLockState.scrollY)
    window.scrollTo(scrollLockState.scrollX, scrollLockState.scrollY)
  scrollLockState = undefined
})

function openEdit() {
  emit('edit')
}

function requestClose() {
  if (props.mode === 'edit') editorForm.value?.requestCancel()
  else emit('close')
}

function getSafeExternalUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : undefined
  } catch {
    return undefined
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="anime-crud-backdrop" @click.self="requestClose">
      <aside
        class="anime-crud-drawer"
        role="dialog"
        aria-modal="true"
        :aria-label="mode === 'edit' ? '编辑动画' : '动画详情'"
      >
        <button
          class="anime-crud-drawer-close"
          type="button"
          aria-label="关闭侧栏"
          @click="requestClose"
        >
          <AdminIcon name="close" />
        </button>
        <AnimeEditorForm
          v-if="mode === 'edit'"
          ref="editorForm"
          mode="edit"
          :anime-id="animeId"
          @saved="emit('saved', $event)"
          @cancelled="emit('close')"
        />
        <div v-else class="anime-detail-panel">
          <header class="anime-detail-hero">
            <div>
              <p class="eyebrow">ANIME ARCHIVE / WORK PROFILE</p>
              <h1>动画详情 <span>· 作品档案卡</span></h1>
              <p>从动画管理列表当前记录打开的只读资料侧栏。</p>
            </div>
            <div class="anime-detail-actions">
              <button class="secondary-button" type="button" @click="emit('delete', anime)">
                <AdminIcon name="delete" />删除
              </button>
              <button class="primary-button" type="button" :disabled="!detail" @click="openEdit">
                <AdminIcon name="edit" />编辑资料
              </button>
            </div>
          </header>

          <div v-if="loading" class="anime-detail-state">正在读取动画详情…</div>
          <div v-else-if="errorMessage" class="anime-detail-state error" role="alert">
            <p>{{ errorMessage }}</p>
            <button class="secondary-button" type="button" @click="emit('close')">关闭</button>
          </div>
          <template v-else-if="detail">
            <section class="anime-detail-card anime-detail-title-card">
              <div class="anime-detail-cover">
                <img
                  v-if="detail.coverImageUrl"
                  :src="detail.coverImageUrl"
                  :alt="`${detail.name}封面`"
                />
                <span v-else aria-hidden="true">{{ detail.name.slice(0, 1) }}</span>
              </div>
              <div class="anime-detail-title-copy">
                <p class="eyebrow">ANIME ARCHIVE / WORK PROFILE</p>
                <h2>{{ detail.name }}</h2>
                <p class="anime-detail-alias">
                  {{ detail.aliasNames?.join('　·　') || '暂无别名' }}
                </p>
                <div class="anime-detail-badges">
                  <span class="status-badge" :class="`status-${detail.status}`">{{
                    statusNames[detail.status] || '未知状态'
                  }}</span>
                  <span class="anime-detail-badge">{{
                    anime.broadcastType?.name || `#${detail.broadcastTypeId}`
                  }}</span>
                  <span class="anime-detail-badge">{{
                    anime.adaptationType?.name || `#${detail.adaptationTypeId}`
                  }}</span>
                  <span class="anime-detail-badge">{{
                    anime.region?.name || `#${detail.regionId}`
                  }}</span>
                  <strong class="anime-detail-rating">{{
                    detail.personalRatingScore === null
                      ? '未评分'
                      : `★ ${detail.personalRatingScore} / 10`
                  }}</strong>
                </div>
              </div>
            </section>

            <section class="anime-detail-card">
              <div class="anime-detail-section-head">
                <div>
                  <h2>档案信息</h2>
                  <p>基础放送和分类字段</p>
                </div>
                <span>01</span>
              </div>
              <div class="anime-detail-grid">
                <div>
                  <span>总集数</span
                  ><strong>{{
                    detail.episodeCount === null ? '—' : `${detail.episodeCount} 集`
                  }}</strong>
                </div>
                <div>
                  <span>开始放送</span><strong>{{ detail.airDate || '—' }}</strong>
                </div>
                <div>
                  <span>放送类型</span
                  ><strong>{{ anime.broadcastType?.name || `#${detail.broadcastTypeId}` }}</strong>
                </div>
                <div>
                  <span>改编类型</span
                  ><strong>{{
                    anime.adaptationType?.name || `#${detail.adaptationTypeId}`
                  }}</strong>
                </div>
                <div>
                  <span>地区</span
                  ><strong>{{ anime.region?.name || `#${detail.regionId}` }}</strong>
                </div>
                <div>
                  <span>动画状态</span
                  ><strong>{{ statusNames[detail.status] || '未知状态' }}</strong>
                </div>
                <div>
                  <span>个人评分</span
                  ><strong>{{
                    detail.personalRatingScore === null
                      ? '未评分'
                      : `${detail.personalRatingScore} / 10`
                  }}</strong>
                </div>
              </div>
            </section>

            <section class="anime-detail-card">
              <div class="anime-detail-section-head">
                <div>
                  <h2>简介</h2>
                  <p>动画内容说明</p>
                </div>
                <span>02</span>
              </div>
              <p class="anime-detail-description">{{ detail.description?.trim() || '暂无简介' }}</p>
            </section>

            <section class="anime-detail-card">
              <div class="anime-detail-section-head">
                <div>
                  <h2>分类与关联</h2>
                  <p>别名、标签、制作公司和所属系列</p>
                </div>
                <span>03</span>
              </div>
              <div class="anime-detail-relations">
                <div>
                  <span>别名</span>
                  <div class="anime-detail-chips">
                    <span v-for="alias in detail.aliasNames" :key="alias">{{ alias }}</span
                    ><i v-if="!detail.aliasNames?.length">—</i>
                  </div>
                </div>
                <div>
                  <span>标签</span>
                  <div class="anime-detail-chips">
                    <span v-for="tag in anime.tags" :key="tag.id" class="tag">{{ tag.name }}</span
                    ><i v-if="!anime.tags.length">—</i>
                  </div>
                </div>
                <div>
                  <span>制作公司</span>
                  <div class="anime-detail-company-list">
                    <span v-for="company in detail.companies" :key="company.companyId"
                      >{{
                        anime.companies.find((item) => item.companyId === company.companyId)
                          ?.companyName || `#${company.companyId}`
                      }}<i>{{ company.role || '未注明职责' }}</i></span
                    ><i v-if="!detail.companies.length">—</i>
                  </div>
                </div>
                <div>
                  <span>所属系列</span>
                  <div class="anime-detail-chips">
                    <span v-if="detail.seriesId !== null"
                      >{{ anime.series?.name || `#${detail.seriesId}` }}</span
                    ><i v-else>未关联系列</i>
                  </div>
                </div>
              </div>
            </section>

            <section class="anime-detail-card">
              <div class="anime-detail-section-head">
                <div>
                  <h2>外部资料</h2>
                  <p>来源名称和链接地址</p>
                </div>
                <span>04</span>
              </div>
              <div v-if="detail.externalLinks.length" class="anime-detail-links">
                <a
                  v-for="link in detail.externalLinks"
                  :key="link.url"
                  :href="getSafeExternalUrl(link.url)"
                  target="_blank"
                  rel="noopener noreferrer"
                  ><strong>{{ link.title || '外部链接' }}</strong
                  ><span>{{ link.url }}</span></a
                >
              </div>
              <p v-else class="anime-detail-description">暂无外部链接</p>
            </section>
            <footer class="anime-detail-footer">
              <span>动画档案</span>
              <button class="secondary-button" type="button" @click="emit('close')">
                关闭详情
              </button>
              <button class="primary-button" type="button" @click="openEdit">
                <AdminIcon name="edit" />编辑资料
              </button>
            </footer>
          </template>
        </div>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.anime-crud-backdrop {
  position: fixed;
  inset: 0;
  z-index: 125;
  display: flex;
  justify-content: flex-end;
  background: rgba(18, 17, 30, 0.43);
  backdrop-filter: blur(3px);
  animation: anime-crud-fade 0.16s ease both;
  overscroll-behavior: contain;
}
.anime-crud-drawer {
  position: relative;
  width: min(920px, 92vw);
  height: 100dvh;
  padding: 22px 25px 28px;
  max-height: 100dvh;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--canvas);
  box-shadow: -22px 0 60px rgba(20, 17, 40, 0.18);
  animation: anime-crud-slide 0.2s ease both;
}
.anime-crud-drawer :deep(.anime-editor-footer) {
  position: sticky;
  bottom: 0;
  z-index: 3;
  padding: 10px 0 5px;
  background: var(--canvas);
  box-shadow: 0 -8px 16px rgba(20, 17, 40, 0.06);
}
.anime-crud-drawer-close {
  position: fixed;
  top: 13px;
  right: min(938px, calc(92vw + 12px));
  z-index: 4;
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  color: var(--ink-soft);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: var(--shadow-soft);
}
.anime-crud-drawer-close:hover {
  color: var(--accent-strong);
}
.anime-crud-drawer-close svg {
  width: 16px;
  height: 16px;
}
.anime-detail-panel {
  display: grid;
  gap: 13px;
}
.anime-detail-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 20px 22px;
  color: #f5f2ff;
  background:
    radial-gradient(circle at 85% 20%, rgba(217, 95, 134, 0.26), transparent 18rem),
    linear-gradient(125deg, #25233b, #302844);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 19px;
}
.anime-detail-hero .eyebrow {
  margin: 0 0 6px;
  color: #c2badc;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.14em;
}
.anime-detail-hero h1 {
  margin: 0;
  font: 700 23px/1.3 var(--font-display);
}
.anime-detail-hero h1 span {
  color: #c5bfd8;
  font: 600 10px var(--font-body);
}
.anime-detail-hero p:last-child {
  margin: 6px 0 0;
  color: #c7c3d3;
  font-size: 9px;
}
.anime-detail-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 7px;
}
.anime-detail-actions button {
  min-height: 35px;
  padding: 0 10px;
  font-size: 10px;
}
.anime-detail-card {
  padding: 16px;
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 15px;
  box-shadow: var(--shadow-soft);
}
.anime-detail-title-card {
  display: flex;
  align-items: center;
  gap: 16px;
}
.anime-detail-cover {
  display: grid;
  width: 78px;
  height: 104px;
  flex: 0 0 auto;
  overflow: hidden;
  place-items: center;
  color: white;
  background: linear-gradient(135deg, var(--accent), var(--violet));
  border-radius: 10px 5px 10px 5px;
  font: 700 26px var(--font-display);
}
.anime-detail-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.anime-detail-title-copy {
  min-width: 0;
}
.anime-detail-title-copy .eyebrow {
  margin: 0 0 4px;
  color: var(--ink-faint);
  font-size: 8px;
  letter-spacing: 0.12em;
}
.anime-detail-title-copy h2 {
  margin: 0;
  overflow-wrap: anywhere;
  font: 700 20px/1.45 var(--font-display);
}
.anime-detail-alias {
  margin: 3px 0 8px;
  color: var(--ink-faint);
  font-size: 10px;
}
.anime-detail-badges {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.anime-detail-badges .status-badge {
  padding: 5px 8px;
  font-size: 9px;
}
.anime-detail-badge {
  padding: 4px 8px;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 999px;
  font-size: 9px;
}
.anime-detail-rating {
  color: var(--yellow);
  font-size: 10px;
}
.anime-detail-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: 10px;
  margin-bottom: 11px;
  border-bottom: 1px solid var(--line);
}
.anime-detail-section-head h2 {
  margin: 0;
  font: 700 12px var(--font-display);
}
.anime-detail-section-head p {
  margin: 3px 0 0;
  color: var(--ink-faint);
  font-size: 9px;
}
.anime-detail-section-head > span {
  color: var(--accent);
  font: 700 16px var(--font-display);
}
.anime-detail-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.anime-detail-grid > div,
.anime-detail-relations > div {
  min-width: 0;
  padding: 9px 10px;
  background: var(--surface-muted);
  border-radius: 9px;
}
.anime-detail-grid > div.wide {
  grid-column: 1/-1;
}
.anime-detail-grid span,
.anime-detail-relations > div > span {
  display: block;
  margin-bottom: 4px;
  color: var(--ink-faint);
  font-size: 8px;
}
.anime-detail-grid strong {
  display: block;
  overflow-wrap: anywhere;
  color: var(--ink-soft);
  font-size: 10px;
  font-weight: 650;
}
.anime-detail-grid strong.detail-url {
  font: 9px/1.5 var(--font-body);
}
.anime-detail-description {
  margin: 0;
  color: var(--ink-soft);
  font-size: 10px;
  line-height: 1.8;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.anime-detail-relations {
  display: grid;
  gap: 8px;
}
.anime-detail-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.anime-detail-chips > span,
.anime-detail-company-list > span {
  padding: 5px 8px;
  color: var(--ink-soft);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 9px;
}
.anime-detail-chips > span.tag {
  color: var(--accent-strong);
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
}
.anime-detail-chips i,
.anime-detail-company-list > i {
  color: var(--ink-faint);
  font-size: 9px;
  font-style: normal;
}
.anime-detail-company-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.anime-detail-company-list > span i {
  margin-left: 6px;
  color: var(--ink-faint);
  font-size: 8px;
  font-style: normal;
}
.anime-detail-links {
  display: grid;
  gap: 6px;
}
.anime-detail-links a {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 8px 10px;
  color: var(--ink-soft);
  background: var(--surface-muted);
  border-radius: 8px;
  text-decoration: none;
}
.anime-detail-links a:hover {
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.anime-detail-links strong {
  font-size: 9px;
}
.anime-detail-links span {
  overflow-wrap: anywhere;
  color: var(--ink-faint);
  font-size: 8px;
}
.anime-detail-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 2px 1px 8px;
}
.anime-detail-footer > span {
  margin-right: auto;
  color: var(--ink-faint);
  font-size: 9px;
}
.anime-detail-footer button {
  min-height: 36px;
}
.anime-detail-state {
  display: grid;
  min-height: 180px;
  place-items: center;
  padding: 24px;
  color: var(--ink-soft);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 14px;
  font-size: 11px;
  text-align: center;
}
.anime-detail-state.error {
  color: var(--danger);
}
@keyframes anime-crud-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes anime-crud-slide {
  from {
    opacity: 0.7;
    transform: translateX(18px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (max-width: 760px) {
  .anime-crud-drawer {
    width: min(760px, 96vw);
    padding: 18px 15px 24px;
  }
  .anime-crud-drawer-close {
    right: 10px;
  }
  .anime-detail-hero {
    align-items: flex-start;
    flex-direction: column;
    padding: 18px;
  }
  .anime-detail-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 520px) {
  .anime-crud-drawer {
    width: 100vw;
    padding: 14px 12px 22px;
  }
  .anime-detail-title-card {
    align-items: flex-start;
    gap: 11px;
  }
  .anime-detail-cover {
    width: 62px;
    height: 82px;
  }
  .anime-detail-title-copy h2 {
    font-size: 16px;
  }
  .anime-detail-grid {
    grid-template-columns: 1fr 1fr;
  }
  .anime-detail-hero h1 span {
    display: block;
    margin-top: 2px;
  }
  .anime-detail-footer {
    flex-wrap: wrap;
  }
  .anime-detail-footer > span {
    flex-basis: 100%;
  }
}
</style>

<script setup lang="ts">
/**
 * 动画详情与修改抽屉容器：详情模式读取并展示动画资料，修改模式复用动画编辑表单。
 * 处理公司、系列关联跳转、抽屉滚动锁及事件转发；删除确认由动画列表负责。
 */
import {
  computed,
  inject,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getAnimeDetail } from '@/api/anime'
import { getCompanyById } from '@/api/catalog'
import { getSeriesById } from '@/api/series'
import AdminIcon from '@/components/admin/AdminIcon.vue'
import AnimeEditorForm from './AnimeEditorForm.vue'
import type { AnimeDetail, AnimePageItem } from '@/types/api'

const props = defineProps<{
  mode: 'detail' | 'edit'
  animeId: number
  anime: AnimePageItem
}>()

const route = useRoute()
const router = useRouter()
const navigateLinkedContent =
  inject<
    (
      path: '/admin/anime' | '/admin/series' | '/admin/companies' | '/admin/persons',
      keyword: string
    ) => Promise<void>
  >('navigateLinkedContent')
const ownerFullPath = route.fullPath
const visible = computed(() => route.fullPath === ownerFullPath)

const emit = defineEmits<{
  close: []
  saved: [anime: AnimeDetail]
  edit: []
  delete: [anime: AnimePageItem]
}>()

const detail = ref<AnimeDetail | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const seriesLinkError = ref('')
const seriesLinkLoading = ref(false)
const companyLinkError = ref('')
const companyLinkLoading = ref<number | null>(null)
const editorForm = ref<InstanceType<typeof AnimeEditorForm> | null>(null)
const linkedSeriesName = computed(() => {
  const seriesId = detail.value?.seriesId
  const series = props.anime.series
  return series && series.id === seriesId && series.name !== `#${seriesId}`
    ? series.name.trim()
    : ''
})
function linkedCompanyName(companyId: number) {
  const name = props.anime.companies
    .find((item) => item.companyId === companyId)
    ?.companyName.trim()
  return name && name !== `#${companyId}` ? name : '查看制作公司'
}
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

function lockPageScroll() {
  if (scrollLockState) return
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
}

function restorePageScroll() {
  if (!scrollLockState) return
  const html = document.documentElement
  const body = document.body
  html.style.overflow = scrollLockState.htmlOverflow
  body.style.overflow = scrollLockState.bodyOverflow
  html.style.paddingRight = scrollLockState.htmlPaddingRight
  if (window.scrollX !== scrollLockState.scrollX || window.scrollY !== scrollLockState.scrollY)
    window.scrollTo(scrollLockState.scrollX, scrollLockState.scrollY)
  scrollLockState = undefined
}

onMounted(async () => {
  lockPageScroll()

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

onActivated(lockPageScroll)
onDeactivated(restorePageScroll)
watch(visible, (active) => {
  if (active) lockPageScroll()
  else restorePageScroll()
})

onBeforeUnmount(() => {
  controller?.abort()
  restorePageScroll()
})

function getCloseState() {
  return props.mode === 'edit'
    ? editorForm.value?.getCloseState() ?? { dirty: false, submitting: false }
    : { dirty: false, submitting: false }
}

defineExpose({ getCloseState })

function openEdit() {
  emit('edit')
}

async function openSeriesDetail() {
  if (detail.value?.seriesId == null) return
  const seriesId = detail.value.seriesId
  if (seriesLinkLoading.value) return
  seriesLinkError.value = ''
  let seriesName = linkedSeriesName.value
  if (!seriesName) {
    seriesLinkLoading.value = true
    try {
      seriesName = (await getSeriesById(seriesId)).name.trim()
    } catch (error) {
      seriesLinkError.value =
        error instanceof Error ? error.message : '系列名称读取失败，请稍后重试。'
      return
    } finally {
      seriesLinkLoading.value = false
    }
  }
  emit('close')
  if (navigateLinkedContent) await navigateLinkedContent('/admin/series', seriesName)
  else await router.push({ path: '/admin/series', query: { name: seriesName } })
}

async function openCompanyDetail(companyId: number) {
  if (companyLinkLoading.value !== null) return
  companyLinkError.value = ''
  let companyName = props.anime.companies
    .find((item) => item.companyId === companyId)
    ?.companyName.trim()
  if (!companyName || companyName === `#${companyId}`) {
    companyLinkLoading.value = companyId
    try {
      companyName = (await getCompanyById(companyId)).name.trim()
    } catch (error) {
      companyLinkError.value =
        error instanceof Error ? error.message : '公司名称读取失败，请稍后重试。'
      return
    } finally {
      companyLinkLoading.value = null
    }
  }
  emit('close')
  if (navigateLinkedContent) await navigateLinkedContent('/admin/companies', companyName)
  else await router.push({ path: '/admin/companies', query: { name: companyName } })
}

async function openPersonDetail(personName: string) {
  emit('close')
  if (navigateLinkedContent) await navigateLinkedContent('/admin/persons', personName)
  else await router.push({ path: '/admin/persons', query: { name: personName } })
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
    <div v-show="visible" class="anime-crud-backdrop" @click.self="requestClose">
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
                  <p>别名、标签、创作人员、制作公司和所属系列</p>
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
                  <span>创作人员</span>
                  <div class="anime-detail-chips anime-detail-person-list">
                    <button
                      v-for="(person, index) in detail.persons"
                      :key="`${person.personId}-${person.role}-${index}`"
                      class="anime-detail-series-link"
                      type="button"
                      :aria-label="`搜索创作人员：${person.personName}`"
                      @click="openPersonDetail(person.personName)"
                    >
                      {{ person.personName }}<i>{{ person.role }}</i>
                    </button>
                    <i v-if="detail.persons && !detail.persons.length">暂无创作人员</i>
                  </div>
                  <small v-if="!detail.persons" class="anime-detail-series-error" role="alert"
                    >接口未返回创作人员关联，暂无法确认人员信息，请重新读取资料。</small
                  >
                </div>
                <div>
                  <span>制公司</span>
                  <div class="anime-detail-chips anime-detail-company-list">
                    <button
                      v-for="company in detail.companies"
                      :key="company.companyId"
                      type="button"
                      class="anime-detail-series-link anime-detail-company-link"
                      :disabled="companyLinkLoading !== null"
                      :aria-label="`搜索制作公司：${linkedCompanyName(company.companyId)}`"
                      @click="openCompanyDetail(company.companyId)"
                    >
                      {{ linkedCompanyName(company.companyId)
                      }}<i>{{ company.role || '未注明职责' }}</i></button
                    ><i v-if="!detail.companies.length">—</i>
                  </div>
                  <small v-if="companyLinkError" class="anime-detail-series-error" role="alert">{{
                    companyLinkError
                  }}</small>
                </div>
                <div>
                  <span>所属系列</span>
                  <div class="anime-detail-chips">
                    <button
                      v-if="detail.seriesId !== null"
                      class="anime-detail-series-link"
                      type="button"
                      :aria-label="`搜索所属系列：${linkedSeriesName || '所属系列'}`"
                      :disabled="seriesLinkLoading"
                      @click="openSeriesDetail"
                    >
                      {{ linkedSeriesName || '查看所属系列' }}</button
                    ><i v-else>未关联系列</i>
                  </div>
                  <small v-if="seriesLinkError" class="anime-detail-series-error" role="alert">{{
                    seriesLinkError
                  }}</small>
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

<style scoped src="@/assets/animeCrudDrawer.css"></style>

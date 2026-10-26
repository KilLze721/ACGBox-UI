<script setup lang="ts">
/** 书籍详情及编辑抽屉：复用动画抽屉样式，关联资料加载失败不会清空基础详情。 */
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getBookDetail, getBookTypes } from '@/api/book'
import { getAdaptationTypes, getCompanyById, getRegions } from '@/api/catalog'
import { getSeriesById } from '@/api/series'
import { getTagById } from '@/api/tags'
import AdminIcon from '@/components/admin/AdminIcon.vue'
import BookEditorForm from './BookEditorForm.vue'
import { bookStatusNames } from '@/config/bookFormOptions'
import { useModalLayer } from '@/utils/useModalLayer'
import type { NamedOption } from '@/types/api'
import type { BookDetail } from '@/types/book'

const props = defineProps<{ mode: 'detail' | 'edit'; bookId: number }>()
const emit = defineEmits<{
  close: []
  saved: [book: BookDetail]
  edit: []
  delete: [book: BookDetail]
}>()
const route = useRoute(),
  router = useRouter(),
  ownerFullPath = route.fullPath
const active = ref(true)
const visible = computed(() => active.value && route.fullPath === ownerFullPath)
const detail = ref<BookDetail | null>(null)
const loading = ref(false),
  errorMessage = ref(''),
  relationError = ref('')
const bookTypes = ref<NamedOption[]>([]),
  adaptations = ref<NamedOption[]>([]),
  regions = ref<NamedOption[]>([])
const companyNames = ref<Record<number, string>>({}),
  seriesName = ref('')
const tagNames = ref<Record<number, string>>({})
const editorForm = ref<InstanceType<typeof BookEditorForm>>()
const drawer = useModalLayer(visible, requestClose)
let controller: AbortController | undefined
function getCloseState() {
  return editorForm.value?.getCloseState() ?? { dirty: false, submitting: false }
}
defineExpose({ getCloseState })
onActivated(() => {
  active.value = true
})
onDeactivated(() => {
  active.value = false
})
onBeforeUnmount(() => controller?.abort())
onMounted(() => {
  if (props.mode === 'detail') void loadDetail()
})

async function loadDetail() {
  controller?.abort()
  const request = new AbortController()
  controller = request
  loading.value = true
  errorMessage.value = ''
  relationError.value = ''
  try {
    const value = await getBookDetail(props.bookId, request.signal)
    if (request.signal.aborted) return
    detail.value = value
    void loadRelations(value, request.signal)
  } catch (error) {
    if (!request.signal.aborted)
      errorMessage.value = error instanceof Error ? error.message : '书籍详情读取失败，请重试。'
  } finally {
    if (controller === request) loading.value = false
  }
}
async function loadRelations(book: BookDetail, signal: AbortSignal) {
  relationError.value = ''
  companyNames.value = {}
  seriesName.value = ''
  tagNames.value = {}
  const results = await Promise.allSettled([
    getBookTypes(signal).then((value) => {
      if (!signal.aborted) bookTypes.value = value
    }),
    getAdaptationTypes(signal).then((value) => {
      if (!signal.aborted) adaptations.value = value
    }),
    getRegions(signal).then((value) => {
      if (!signal.aborted) regions.value = value
    }),
    ...book.companies.map((company) =>
      getCompanyById(company.companyId, signal).then((value) => {
        if (!signal.aborted) companyNames.value[value.id] = value.name
      }),
    ),
    ...book.tagIds.map((id) =>
      getTagById(id, signal).then((value) => {
        if (!signal.aborted) tagNames.value[value.id] = value.name
      }),
    ),
    ...(book.seriesId === null
      ? []
      : [
          getSeriesById(book.seriesId, signal).then((value) => {
            if (!signal.aborted) seriesName.value = value.name
          }),
        ]),
  ])
  if (!signal.aborted && results.some((result) => result.status === 'rejected'))
    relationError.value = '部分关联资料名称读取失败，基础档案仍可查看，请重试。'
}
function nameOf(values: NamedOption[], id: number) {
  return values.find((value) => value.id === id)?.name || '资料名称暂不可用'
}
function requestClose() {
  if (getCloseState().submitting) return
  if (props.mode === 'edit') editorForm.value?.requestCancel()
  else emit('close')
}
async function openReference(path: string, name: string, id: number) {
  // 先关闭当前模态层，再打开关联资料，保留书籍列表的筛选和分页。
  emit('close')
  await nextTick()
  await router.push({ path, query: { name, detail: String(id) } })
}
function safeUrl(value: string) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? value : undefined
  } catch {
    return undefined
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-show="visible" class="anime-crud-backdrop" @click.self="requestClose">
      <aside
        ref="drawer"
        class="anime-crud-drawer"
        role="dialog"
        aria-modal="true"
        :aria-label="mode === 'edit' ? '编辑书籍' : '书籍详情'"
        tabindex="-1"
      >
        <button
          class="anime-crud-drawer-close"
          type="button"
          aria-label="关闭书籍抽屉"
          :disabled="getCloseState().submitting"
          @click="requestClose"
        >
          <AdminIcon name="close" />
        </button>
        <BookEditorForm
          v-if="mode === 'edit'"
          ref="editorForm"
          mode="edit"
          :book-id="bookId"
          @saved="emit('saved', $event)"
          @cancelled="emit('close')"
        />
        <div v-else class="anime-detail-panel">
          <header class="anime-detail-hero">
            <div>
              <p class="eyebrow">BOOK ARCHIVE / WORK PROFILE</p>
              <h1>书籍详情 <span>· 作品档案卡</span></h1>
              <p>书籍原作及其关联资料</p>
            </div>
            <div class="anime-detail-actions">
              <button
                class="secondary-button"
                :disabled="!detail || loading"
                type="button"
                @click="detail && emit('delete', detail)"
              >
                <AdminIcon name="delete" />删除</button
              ><button
                class="primary-button"
                type="button"
                :disabled="!detail || loading"
                @click="emit('edit')"
              >
                <AdminIcon name="edit" />编辑资料
              </button>
            </div>
          </header>
          <div v-if="loading" class="anime-detail-state">正在读取书籍详情…</div>
          <div v-else-if="errorMessage" class="anime-detail-state error" role="alert">
            {{ errorMessage
            }}<button class="secondary-button" type="button" @click="loadDetail">重新读取</button>
          </div>
          <template v-else-if="detail">
            <section class="anime-detail-card anime-detail-title-card">
              <div class="anime-detail-cover">
                <img
                  v-if="safeUrl(detail.coverImageUrl || '')"
                  :src="detail.coverImageUrl || undefined"
                  :alt="`${detail.name}封面`"
                /><span v-else>BOOK FILE</span>
              </div>
              <div class="anime-detail-title-copy">
                <p class="eyebrow">BOOK ARCHIVE</p>
                <h2>{{ detail.name }}</h2>
                <p class="anime-detail-alias">
                  {{ detail.aliasNames.join('　·　') || '暂无别名' }}
                </p>
                <div class="anime-detail-badges">
                  <span class="anime-detail-badge">{{ bookStatusNames[detail.status] }}</span
                  ><span class="anime-detail-badge">{{ nameOf(bookTypes, detail.bookTypeId) }}</span
                  ><strong class="anime-detail-rating">{{
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
                  <h2>档案信息</h2>
                  <p>发表信息与分类</p>
                </div>
                <span>01</span>
              </div>
              <div class="anime-detail-grid">
                <div>
                  <span>首次发表日期</span
                  ><strong>{{ detail.publishDate || '发表日期未知' }}</strong>
                </div>
                <div>
                  <span>卷数</span><strong>{{ detail.volumeCount ?? '未知或不适用' }}</strong>
                </div>
                <div>
                  <span>章节数</span><strong>{{ detail.chapterCount ?? '未知或不适用' }}</strong>
                </div>
                <div>
                  <span>改编类型</span
                  ><strong>{{ nameOf(adaptations, detail.adaptationTypeId) }}</strong>
                </div>
                <div>
                  <span>原作地区</span><strong>{{ nameOf(regions, detail.regionId) }}</strong>
                </div>
                <div>
                  <span>创建时间</span><strong>{{ detail.createdAt }}</strong>
                </div>
                <div>
                  <span>更新时间</span><strong>{{ detail.updatedAt }}</strong>
                </div>
              </div>
            </section>
            <section class="anime-detail-card">
              <div class="anime-detail-section-head">
                <div><h2>作品简介</h2></div>
                <span>02</span>
              </div>
              <p class="anime-detail-description">{{ detail.description || '暂无简介' }}</p>
            </section>
            <section class="anime-detail-card">
              <div class="anime-detail-section-head">
                <div>
                  <h2>分类与关联</h2>
                  <p>标签、公司、创作人员与所属系列</p>
                </div>
                <span>03</span>
              </div>
              <p v-if="relationError" class="anime-detail-series-error" role="alert">
                {{ relationError
                }}<button class="secondary-button" type="button" @click="loadDetail">
                  重新读取
                </button>
              </p>
              <div class="anime-detail-relations">
                <div>
                  <span>标签</span>
                  <div class="anime-detail-chips">
                    <span v-for="id in detail.tagIds" :key="id" class="tag">{{
                      tagNames[id] || '标签名称读取中'
                    }}</span
                    ><i v-if="!detail.tagIds.length">暂无标签</i>
                  </div>
                </div>
                <div>
                  <span>创作人员</span>
                  <div class="anime-detail-chips anime-detail-person-list">
                    <button
                      v-for="(person, index) in detail.persons"
                      :key="`${person.personId}-${index}`"
                      class="anime-detail-series-link"
                      type="button"
                      @click="openReference('/admin/persons', person.personName, person.personId)"
                    >
                      {{ person.personName }}<i>{{ person.role }}</i></button
                    ><i v-if="!detail.persons?.length">暂无创作人员</i>
                  </div>
                </div>
                <div>
                  <span>关联公司</span>
                  <div class="anime-detail-chips anime-detail-company-list">
                    <button
                      v-for="company in detail.companies"
                      :key="company.companyId"
                      class="anime-detail-series-link anime-detail-company-link"
                      type="button"
                      :disabled="!companyNames[company.companyId]"
                      @click="
                        openReference(
                          '/admin/companies',
                          companyNames[company.companyId]!,
                          company.companyId,
                        )
                      "
                    >
                      {{ companyNames[company.companyId] || '公司名称读取中'
                      }}<i>{{ company.role || '未注明职责' }}</i></button
                    ><i v-if="!detail.companies.length">暂无关联公司</i>
                  </div>
                </div>
                <div>
                  <span>所属系列</span>
                  <div class="anime-detail-chips">
                    <button
                      v-if="detail.seriesId !== null"
                      class="anime-detail-series-link"
                      type="button"
                      :disabled="!seriesName"
                      @click="openReference('/admin/series', seriesName, detail.seriesId)"
                    >
                      {{ seriesName || '系列名称读取中' }}</button
                    ><i v-else>未关联系列</i>
                  </div>
                </div>
              </div>
            </section>
            <section class="anime-detail-card">
              <div class="anime-detail-section-head">
                <div><h2>外部资料</h2></div>
                <span>04</span>
              </div>
              <div class="anime-detail-links">
                <template v-for="link in detail.externalLinks" :key="link.url"
                  ><a
                    v-if="safeUrl(link.url)"
                    :href="safeUrl(link.url)"
                    target="_blank"
                    rel="noopener noreferrer"
                    ><strong>{{ link.title || '外部链接' }}</strong
                    ><span>{{ link.url }}</span></a
                  ><span v-else>链接地址无效，已禁止打开</span></template
                >
                <p v-if="!detail.externalLinks.length">暂无外部链接</p>
              </div>
            </section>
          </template>
        </div>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped src="@/assets/animeCrudDrawer.css"></style>

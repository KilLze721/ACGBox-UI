<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { createAnime, getAnimeDetail, updateAnime } from '@/api/anime'
import {
  getCompanies,
  getRegions,
  getTags,
  getBroadcastTypes,
  getAdaptationTypes,
} from '@/api/catalog'
import { getSeriesPage } from '@/api/series'
import AdminIcon from '@/components/admin/AdminIcon.vue'
import ArchiveSelect from '@/components/admin/ArchiveSelect.vue'
import type {
  AnimeDetail,
  AnimePayload,
  CompanyOption,
  NamedOption,
  PageResult,
  SeriesSummary,
} from '@/types/api'

const props = defineProps<{
  mode: 'create' | 'edit'
  animeId?: number
}>()

const emit = defineEmits<{
  saved: [anime: AnimeDetail]
  cancelled: []
}>()

interface AnimeForm {
  name: string
  broadcastTypeId: string
  adaptationTypeId: string
  regionId: string
  status: string
  airDate: string
  episodeCount: string
  personalRatingScore: string
  coverImageUrl: string
  description: string
  aliasNames: string[]
  tagIds: number[]
  companies: Array<{ companyId: string; role: string }>
  externalLinks: Array<{ title: string; url: string; sortOrder: string }>
  seriesId: string
  seriesSortOrder: string
  autoCreateSeries: boolean
}

const form = reactive<AnimeForm>(createDefaultForm())
const broadcastTypes = ref<NamedOption[]>([])
const adaptationTypes = ref<NamedOption[]>([])
const regions = ref<NamedOption[]>([])
const tags = ref<NamedOption[]>([])
const companies = ref<CompanyOption[]>([])
const series = ref<SeriesSummary[]>([])
const loading = ref(true)
const submitting = ref(false)
const errorMessage = ref('')
const errors = reactive<Record<string, string>>({})
let loadController: AbortController | undefined

const statusOptions: NamedOption[] = [
  { id: 1, name: '未放送' },
  { id: 2, name: '放送中' },
  { id: 3, name: '已完结' },
  { id: 4, name: '其他' },
]
const companyRoles = ['制作', '动画制作', '出品', '协力']

function createDefaultForm(): AnimeForm {
  return {
    name: '',
    broadcastTypeId: '',
    adaptationTypeId: '',
    regionId: '',
    status: '1',
    airDate: '',
    episodeCount: '',
    personalRatingScore: '',
    coverImageUrl: '',
    description: '',
    aliasNames: [],
    tagIds: [],
    companies: [],
    externalLinks: [],
    seriesId: '',
    seriesSortOrder: '',
    autoCreateSeries: false,
  }
}

async function getAllPages<T>(loadPage: (pageNum: number) => Promise<PageResult<T>>) {
  const firstPage = await loadPage(1)
  if (firstPage.pages <= 1) return firstPage.rows
  const remaining = await Promise.all(
    Array.from({ length: firstPage.pages - 1 }, (_, index) => loadPage(index + 2)),
  )
  return firstPage.rows.concat(remaining.flatMap((page) => page.rows))
}

function applyAnime(anime: AnimeDetail) {
  Object.assign(form, {
    name: anime.name,
    broadcastTypeId: String(anime.broadcastTypeId),
    adaptationTypeId: String(anime.adaptationTypeId),
    regionId: String(anime.regionId),
    status: String(anime.status),
    airDate: anime.airDate,
    episodeCount: anime.episodeCount === null ? '' : String(anime.episodeCount),
    personalRatingScore:
      anime.personalRatingScore === null ? '' : String(anime.personalRatingScore),
    coverImageUrl: anime.coverImageUrl ?? '',
    description: anime.description ?? '',
    aliasNames: [...(anime.aliasNames ?? [])],
    tagIds: [...(anime.tagIds ?? [])],
    companies: (anime.companies ?? []).map((company) => ({
      companyId: String(company.companyId),
      role: company.role ?? '制作',
    })),
    externalLinks: (anime.externalLinks ?? []).map((link) => ({
      title: link.title ?? '',
      url: link.url,
      sortOrder: String(link.sortOrder ?? 0),
    })),
    seriesId: anime.seriesId === null ? '' : String(anime.seriesId),
    seriesSortOrder: anime.seriesSortOrder === null ? '' : String(anime.seriesSortOrder),
  })
}

onMounted(async () => {
  const controller = new AbortController()
  loadController = controller
  try {
    const [broadcast, adaptation, region, allTags, allCompanies, allSeries, anime] =
      await Promise.all([
        getBroadcastTypes(controller.signal),
        getAdaptationTypes(controller.signal),
        getRegions(controller.signal),
        getAllPages((pageNum) => getTags(pageNum, 100, controller.signal)),
        getAllPages((pageNum) => getCompanies('', 100, controller.signal, pageNum)),
        getAllPages((pageNum) => getSeriesPage(pageNum, 100, controller.signal)),
        props.mode === 'edit' && props.animeId
          ? getAnimeDetail(props.animeId, controller.signal)
          : Promise.resolve(null),
      ])
    broadcastTypes.value = broadcast
    adaptationTypes.value = adaptation
    regions.value = region
    tags.value = allTags
    companies.value = allCompanies
    series.value = allSeries
    if (anime) applyAnime(anime)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '动画资料加载失败，请稍后重试。'
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => loadController?.abort())

function addAlias() {
  form.aliasNames.push('')
}

function removeAlias(index: number) {
  form.aliasNames.splice(index, 1)
}

function addCompany() {
  form.companies.push({ companyId: '', role: '制作' })
}

function removeCompany(index: number) {
  form.companies.splice(index, 1)
}

function addExternalLink() {
  form.externalLinks.push({ title: '', url: '', sortOrder: '0' })
}

function removeExternalLink(index: number) {
  form.externalLinks.splice(index, 1)
}

function toggleTag(id: number) {
  const index = form.tagIds.indexOf(id)
  if (index === -1) form.tagIds.push(id)
  else form.tagIds.splice(index, 1)
}

function setError(key: string, message: string) {
  errors[key] = message
}

function validateForm() {
  Object.keys(errors).forEach((key) => delete errors[key])
  if (!form.name.trim()) setError('name', '请填写动画名称。')
  if (!form.broadcastTypeId) setError('broadcastTypeId', '请选择放送类型。')
  if (!form.adaptationTypeId) setError('adaptationTypeId', '请选择改编类型。')
  if (!form.regionId) setError('regionId', '请选择地区。')
  if (!form.status) setError('status', '请选择动画状态。')
  const selectedDate = new Date(`${form.airDate}T00:00:00Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(form.airDate) ||
    Number.isNaN(selectedDate.getTime()) ||
    selectedDate.toISOString().slice(0, 10) !== form.airDate
  ) {
    setError('airDate', '请选择有效的开始放送日期。')
  }
  if (form.episodeCount && (!/^\d+$/.test(form.episodeCount) || Number(form.episodeCount) < 0)) {
    setError('episodeCount', '总集数请输入非负整数。')
  }
  if (form.personalRatingScore) {
    const score = Number(form.personalRatingScore)
    if (
      !Number.isFinite(score) ||
      score < 0 ||
      score > 10 ||
      !/^\d{1,2}(\.\d)?$/.test(form.personalRatingScore)
    ) {
      setError('personalRatingScore', '评分请输入 0 至 10 之间、最多一位小数的数字。')
    }
  }
  if (form.coverImageUrl && !isHttpUrl(form.coverImageUrl)) {
    setError('coverImageUrl', '请输入有效的 HTTP 或 HTTPS 图片地址。')
  }
  form.companies.forEach((company, index) => {
    if (!company.companyId) setError(`company-${index}`, '请选择制作公司。')
  })
  form.externalLinks.forEach((link, index) => {
    if (link.url && !isHttpUrl(link.url))
      setError(`external-${index}`, '请输入有效的 HTTP 或 HTTPS 链接。')
  })
  return Object.keys(errors).length === 0
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function buildPayload(): AnimePayload {
  return {
    ...(props.mode === 'edit' && props.animeId ? { id: props.animeId } : {}),
    name: form.name.trim(),
    episodeCount: form.episodeCount ? Number(form.episodeCount) : null,
    broadcastTypeId: Number(form.broadcastTypeId),
    adaptationTypeId: Number(form.adaptationTypeId),
    regionId: Number(form.regionId),
    airDate: form.airDate,
    coverImageUrl: form.coverImageUrl.trim() || null,
    status: Number(form.status),
    description: form.description.trim() || null,
    aliasNames: form.aliasNames.map((alias) => alias.trim()).filter(Boolean),
    companies: form.companies.map((company) => ({
      companyId: Number(company.companyId),
      role: company.role.trim() || null,
    })),
    externalLinks: form.externalLinks
      .filter((link) => link.url.trim())
      .map((link) => ({
        title: link.title.trim() || null,
        url: link.url.trim(),
        sortOrder: Number(link.sortOrder || 0),
      })),
    tagIds: [...form.tagIds],
    seriesId: form.seriesId ? Number(form.seriesId) : null,
    seriesSortOrder: form.seriesId && form.seriesSortOrder ? Number(form.seriesSortOrder) : null,
    ...(props.mode === 'create' ? { autoCreateSeries: form.autoCreateSeries } : {}),
    personalRatingScore: form.personalRatingScore ? Number(form.personalRatingScore) : null,
  }
}

async function submitForm() {
  if (submitting.value || !validateForm()) return
  submitting.value = true
  errorMessage.value = ''
  try {
    const payload = buildPayload()
    const saved =
      props.mode === 'create'
        ? await createAnime(payload)
        : await updateAnime(payload as AnimePayload & { id: number })
    emit('saved', saved)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存动画资料失败，请稍后重试。'
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  Object.assign(form, createDefaultForm())
  Object.keys(errors).forEach((key) => delete errors[key])
}
</script>

<template>
  <div class="anime-editor-form">
    <div v-if="loading" class="anime-form-state">正在加载动画表单…</div>
    <div v-else-if="errorMessage && !broadcastTypes.length" class="anime-form-state error">
      {{ errorMessage }}
    </div>
    <form v-else class="anime-editor-content" @submit.prevent="submitForm">
      <header class="anime-editor-hero">
        <div>
          <p class="eyebrow">
            ANIME ARCHIVE / {{ mode === 'create' ? 'NEW ENTRY' : 'UPDATE ENTRY' }}
          </p>
          <h1>{{ mode === 'create' ? '新增动画' : '编辑动画' }} <span>· 建立完整作品档案</span></h1>
          <p>录入基础信息、分类关系及外部资料。标有 <b class="required-mark">*</b> 的为必填项。</p>
        </div>
        <div class="anime-editor-actions">
          <button
            v-if="mode === 'create'"
            class="secondary-button"
            type="button"
            @click="resetForm"
          >
            重置表单
          </button>
          <button class="primary-button" type="submit" :disabled="submitting">
            <AdminIcon name="check" />{{
              submitting ? '正在保存…' : mode === 'create' ? '保存动画' : '保存修改'
            }}
          </button>
        </div>
      </header>

      <section class="anime-editor-card">
        <div class="anime-editor-section-head">
          <div>
            <h2>基础资料</h2>
            <p>动画名称、放送信息和作品封面</p>
          </div>
          <span>01</span>
        </div>
        <div class="anime-editor-grid">
          <label class="field full" :class="{ 'has-error': errors.name }">
            <span>动画名称 <b class="required-mark">*</b></span>
            <input
              v-model="form.name"
              type="text"
              maxlength="200"
              placeholder="输入正式名称"
              @input="errors.name = ''"
            />
            <small v-if="errors.name" class="field-error">{{ errors.name }}</small>
          </label>
          <div class="field" :class="{ 'has-error': errors.broadcastTypeId }">
            <span class="anime-field-label">放送类型 <b class="required-mark">*</b></span>
            <ArchiveSelect
              id="animeBroadcastType"
              v-model="form.broadcastTypeId"
              label="放送类型"
              placeholder="请选择放送类型"
              :options="broadcastTypes"
            />
            <small v-if="errors.broadcastTypeId" class="field-error">{{
              errors.broadcastTypeId
            }}</small>
          </div>
          <div class="field" :class="{ 'has-error': errors.adaptationTypeId }">
            <span class="anime-field-label">改编类型 <b class="required-mark">*</b></span>
            <ArchiveSelect
              id="animeAdaptationType"
              v-model="form.adaptationTypeId"
              label="改编类型"
              placeholder="请选择改编类型"
              :options="adaptationTypes"
            />
            <small v-if="errors.adaptationTypeId" class="field-error">{{
              errors.adaptationTypeId
            }}</small>
          </div>
          <div class="field" :class="{ 'has-error': errors.regionId }">
            <span class="anime-field-label">地区 <b class="required-mark">*</b></span>
            <ArchiveSelect
              id="animeRegion"
              v-model="form.regionId"
              label="地区"
              placeholder="请选择地区"
              :options="regions"
            />
            <small v-if="errors.regionId" class="field-error">{{ errors.regionId }}</small>
          </div>
          <div class="field" :class="{ 'has-error': errors.status }">
            <span class="anime-field-label">动画状态 <b class="required-mark">*</b></span>
            <ArchiveSelect
              id="animeStatus"
              v-model="form.status"
              label="动画状态"
              placeholder="请选择状态"
              :options="statusOptions"
            />
            <small v-if="errors.status" class="field-error">{{ errors.status }}</small>
          </div>
          <label class="field" :class="{ 'has-error': errors.airDate }">
            <span>开始放送日期 <b class="required-mark">*</b></span>
            <input v-model="form.airDate" type="date" @input="errors.airDate = ''" />
            <small v-if="errors.airDate" class="field-error">{{ errors.airDate }}</small>
          </label>
          <label class="field" :class="{ 'has-error': errors.episodeCount }">
            <span>总集数</span>
            <div class="anime-input-suffix">
              <input
                v-model="form.episodeCount"
                type="number"
                min="0"
                step="1"
                placeholder="未确定可留空"
                @input="errors.episodeCount = ''"
              /><i>集</i>
            </div>
            <small v-if="errors.episodeCount" class="field-error">{{ errors.episodeCount }}</small>
          </label>
          <label class="field" :class="{ 'has-error': errors.personalRatingScore }">
            <span>个人评分</span>
            <div class="anime-input-suffix">
              <input
                v-model="form.personalRatingScore"
                type="number"
                min="0"
                max="10"
                step="0.1"
                placeholder="未评分"
                @input="errors.personalRatingScore = ''"
              /><i>/ 10</i>
            </div>
            <small v-if="errors.personalRatingScore" class="field-error">{{
              errors.personalRatingScore
            }}</small>
          </label>
          <label class="field full" :class="{ 'has-error': errors.coverImageUrl }">
            <span>封面图片 URL</span>
            <div class="anime-cover-field">
              <div class="anime-cover-preview">
                <img
                  v-if="form.coverImageUrl"
                  :src="form.coverImageUrl"
                  alt="动画封面预览"
                  @error="errors.coverImageUrl = '封面地址无法加载。'"
                />
                <span v-else>ANIME FILE</span>
              </div>
              <input
                v-model="form.coverImageUrl"
                type="url"
                placeholder="https://..."
                @input="errors.coverImageUrl = ''"
              />
            </div>
            <small v-if="errors.coverImageUrl" class="field-error">{{
              errors.coverImageUrl
            }}</small>
          </label>
          <label class="field full">
            <span>动画简介</span>
            <textarea
              v-model="form.description"
              rows="4"
              placeholder="记录剧情简介或编辑备注"
            ></textarea>
          </label>
        </div>
      </section>

      <section class="anime-editor-card">
        <div class="anime-editor-section-head">
          <div>
            <h2>别名与标签</h2>
            <p>一个作品可关联多个别名和标签</p>
          </div>
          <span>02</span>
        </div>
        <div class="anime-editor-grid">
          <div class="field full">
            <span class="anime-field-label">别名列表</span>
            <div class="anime-repeat-list">
              <div
                v-for="(alias, index) in form.aliasNames"
                :key="`alias-${index}`"
                class="anime-repeat-row"
              >
                <input v-model="form.aliasNames[index]" type="text" placeholder="输入别名" />
                <button
                  class="anime-remove-button"
                  type="button"
                  :aria-label="`移除别名 ${index + 1}`"
                  @click="removeAlias(index)"
                >
                  <AdminIcon name="close" />
                </button>
              </div>
            </div>
            <button class="anime-inline-button" type="button" @click="addAlias">
              <AdminIcon name="plus" />添加别名
            </button>
          </div>
          <div class="field full">
            <span class="anime-field-label">标签</span>
            <div class="anime-tag-picker">
              <button
                v-for="tag in tags"
                :key="tag.id"
                type="button"
                class="tag-option"
                :class="{ selected: form.tagIds.includes(tag.id) }"
                :aria-pressed="form.tagIds.includes(tag.id)"
                @click="toggleTag(tag.id)"
              >
                {{ tag.name }}
              </button>
              <span v-if="!tags.length" class="anime-muted-note">暂无可选标签</span>
            </div>
          </div>
        </div>
      </section>

      <section class="anime-editor-card">
        <div class="anime-editor-section-head">
          <div>
            <h2>关联资料</h2>
            <p>制作公司、系列和外部来源</p>
          </div>
          <span>03</span>
        </div>
        <div class="anime-editor-grid">
          <div class="field full">
            <span class="anime-field-label">制作公司</span>
            <div class="anime-repeat-list">
              <div
                v-for="(company, index) in form.companies"
                :key="`company-${index}`"
                class="anime-repeat-row"
                :class="{ invalid: errors[`company-${index}`] }"
              >
                <ArchiveSelect
                  :id="`animeCompany-${index}`"
                  v-model="company.companyId"
                  label="制作公司"
                  placeholder="选择公司"
                  :options="companies"
                />
                <select v-model="company.role" aria-label="公司职责">
                  <option v-for="role in companyRoles" :key="role" :value="role">{{ role }}</option>
                </select>
                <button
                  class="anime-remove-button"
                  type="button"
                  :aria-label="`移除公司 ${index + 1}`"
                  @click="removeCompany(index)"
                >
                  <AdminIcon name="close" />
                </button>
                <small v-if="errors[`company-${index}`]" class="field-error">{{
                  errors[`company-${index}`]
                }}</small>
              </div>
            </div>
            <button class="anime-inline-button" type="button" @click="addCompany">
              <AdminIcon name="plus" />添加公司
            </button>
          </div>
          <div class="field full">
            <span class="anime-field-label">所属系列</span>
            <div class="anime-series-fields">
              <ArchiveSelect
                id="animeSeries"
                v-model="form.seriesId"
                label="所属系列"
                placeholder="暂不关联系列"
                :options="series"
              />
              <div class="anime-input-suffix">
                <input
                  v-model="form.seriesSortOrder"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="系列排序"
                /><i>序号</i>
              </div>
            </div>
            <label v-if="mode === 'create'" class="anime-switch-row">
              <span><strong>无系列时自动创建</strong><small>使用动画名称创建同名系列</small></span>
              <input v-model="form.autoCreateSeries" type="checkbox" role="switch" />
            </label>
          </div>
          <div class="field full">
            <span class="anime-field-label">外部链接</span>
            <div class="anime-repeat-list">
              <div
                v-for="(link, index) in form.externalLinks"
                :key="`link-${index}`"
                class="anime-repeat-row anime-link-row"
                :class="{ invalid: errors[`external-${index}`] }"
              >
                <input v-model="link.title" type="text" placeholder="来源标题" />
                <input
                  v-model="link.url"
                  type="url"
                  placeholder="https://..."
                  @input="errors[`external-${index}`] = ''"
                />
                <input
                  v-model="link.sortOrder"
                  class="sort-order-input"
                  type="number"
                  min="0"
                  step="1"
                  aria-label="排序值"
                />
                <button
                  class="anime-remove-button"
                  type="button"
                  :aria-label="`移除外链 ${index + 1}`"
                  @click="removeExternalLink(index)"
                >
                  <AdminIcon name="close" />
                </button>
                <small v-if="errors[`external-${index}`]" class="field-error">{{
                  errors[`external-${index}`]
                }}</small>
              </div>
            </div>
            <button class="anime-inline-button" type="button" @click="addExternalLink">
              <AdminIcon name="plus" />添加外链
            </button>
          </div>
        </div>
      </section>

      <p v-if="errorMessage" class="anime-save-error" role="alert">{{ errorMessage }}</p>
      <footer class="anime-editor-footer">
        <button class="secondary-button" type="button" @click="emit('cancelled')">取消</button>
        <button class="primary-button" type="submit" :disabled="submitting">
          <AdminIcon name="check" />{{
            submitting ? '正在保存…' : mode === 'create' ? '保存动画' : '保存修改'
          }}
        </button>
      </footer>
    </form>
  </div>
</template>

<style scoped>
.anime-editor-form {
  display: grid;
  gap: 14px;
}
.anime-form-state {
  padding: 32px;
  color: var(--ink-soft);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 16px;
  text-align: center;
  font-size: 12px;
}
.anime-form-state.error,
.anime-save-error {
  color: var(--danger);
}
.anime-editor-content {
  display: grid;
  gap: 14px;
}
.anime-editor-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 22px 24px;
  color: #f5f2ff;
  background:
    radial-gradient(circle at 85% 20%, rgba(217, 95, 134, 0.26), transparent 18rem),
    linear-gradient(125deg, #25233b, #302844);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
}
.anime-editor-hero .eyebrow {
  margin: 0 0 7px;
  color: #c2badc;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.anime-editor-hero h1 {
  margin: 0;
  font: 700 24px/1.3 var(--font-display);
}
.anime-editor-hero h1 span {
  color: #c5bfd8;
  font: 600 11px var(--font-body);
}
.anime-editor-hero p:last-child {
  margin: 7px 0 0;
  color: #c7c3d3;
  font-size: 10px;
}
.required-mark {
  color: var(--accent);
}
.anime-editor-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}
.anime-editor-actions .secondary-button {
  min-height: 36px;
  font-size: 10px;
}
.anime-editor-actions .primary-button {
  min-height: 36px;
  font-size: 10px;
}
.anime-editor-card {
  padding: 19px;
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 17px;
  box-shadow: var(--shadow-soft);
}
.anime-editor-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 14px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--line);
}
.anime-editor-section-head h2 {
  margin: 0;
  font: 700 14px var(--font-display);
}
.anime-editor-section-head p {
  margin: 3px 0 0;
  color: var(--ink-faint);
  font-size: 9px;
}
.anime-editor-section-head > span {
  color: var(--accent);
  font: 700 18px var(--font-display);
}
.anime-editor-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 15px 13px;
}
.anime-editor-grid .field.full {
  grid-column: 1 / -1;
}
.anime-editor-grid .field > span,
.anime-field-label {
  display: block;
  margin-bottom: 6px;
  color: var(--ink-soft);
  font-size: 10px;
  font-weight: 700;
}
.anime-editor-grid .field input:not([type='checkbox']),
.anime-editor-grid .field textarea,
.anime-repeat-row > input,
.anime-repeat-row > select {
  width: 100%;
  min-width: 0;
  min-height: 38px;
  padding: 0 10px;
  color: var(--ink);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 9px;
  outline: none;
  font: 10px var(--font-body);
}
.anime-editor-grid .field textarea {
  min-height: 90px;
  padding: 10px;
  resize: vertical;
}
.anime-editor-grid .field input:focus,
.anime-editor-grid .field textarea:focus,
.anime-repeat-row > input:focus,
.anime-repeat-row > select:focus {
  border-color: var(--accent);
  box-shadow: var(--focus);
}
.anime-editor-grid .field.has-error > input,
.anime-editor-grid .field.has-error .anime-input-suffix {
  border-color: var(--danger);
}
.anime-input-suffix {
  display: flex;
  height: 38px;
  align-items: center;
  overflow: hidden;
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 9px;
}
.anime-input-suffix input {
  height: 100%;
  flex: 1;
  border: 0 !important;
  box-shadow: none !important;
}
.anime-input-suffix i {
  padding: 0 10px;
  color: var(--ink-faint);
  font-size: 10px;
  font-style: normal;
  white-space: nowrap;
}
.anime-cover-field {
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr);
  align-items: center;
  gap: 11px;
}
.anime-cover-preview {
  display: grid;
  width: 68px;
  height: 86px;
  overflow: hidden;
  place-items: center;
  color: var(--ink-faint);
  background: var(--surface-muted);
  border: 1px dashed var(--line-strong);
  border-radius: 9px;
  font-size: 8px;
}
.anime-cover-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.anime-repeat-list {
  display: grid;
  gap: 7px;
}
.anime-repeat-row {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
}
.anime-repeat-row:has(.archive-select) {
  grid-template-columns: minmax(0, 1.4fr) minmax(120px, 0.8fr) 32px;
}
.anime-repeat-row > select {
  height: 38px;
}
.anime-repeat-row.invalid > * {
  border-color: var(--danger);
}
.anime-repeat-row .field-error {
  grid-column: 1 / -1;
}
.anime-remove-button {
  display: grid;
  width: 31px;
  height: 31px;
  place-items: center;
  color: var(--ink-faint);
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.anime-remove-button:hover {
  color: var(--danger);
  background: var(--danger-soft);
}
.anime-remove-button svg {
  width: 13px;
  height: 13px;
}
.anime-inline-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 0 0;
  color: var(--accent-strong);
  background: transparent;
  border: 0;
  font-size: 9px;
  font-weight: 700;
}
.anime-inline-button svg {
  width: 13px;
  height: 13px;
}
.anime-tag-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.anime-tag-picker .tag-option {
  min-height: 29px;
}
.anime-muted-note {
  color: var(--ink-faint);
  font-size: 10px;
}
.anime-series-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(150px, 0.7fr);
  gap: 10px;
}
.anime-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0 0;
  margin-top: 7px;
  border-top: 1px solid var(--line);
}
.anime-switch-row strong,
.anime-switch-row small {
  display: block;
}
.anime-switch-row strong {
  color: var(--ink-soft);
  font-size: 10px;
}
.anime-switch-row small {
  margin-top: 2px;
  color: var(--ink-faint);
  font-size: 9px;
}
.anime-switch-row input {
  width: 34px;
  height: 19px;
  accent-color: var(--accent);
}
.anime-link-row {
  grid-template-columns: minmax(110px, 0.8fr) minmax(180px, 1.5fr) 74px 32px;
}
.anime-link-row .sort-order-input {
  text-align: center;
}
.anime-editor-grid .field .field-error,
.anime-repeat-row .field-error {
  margin: 4px 2px 0;
  color: var(--danger);
  font-size: 9px;
}
.anime-save-error {
  padding: 10px 12px;
  margin: 0;
  background: var(--danger-soft);
  border-radius: 9px;
  font-size: 10px;
}
.anime-editor-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 2px 1px 8px;
}
.anime-editor-footer button {
  min-height: 37px;
}
.anime-editor-content button:disabled {
  cursor: wait;
  opacity: 0.6;
}
@media (max-width: 620px) {
  .anime-editor-hero {
    align-items: flex-start;
    flex-direction: column;
    padding: 18px;
  }
  .anime-editor-hero h1 {
    font-size: 21px;
  }
  .anime-editor-hero h1 span {
    display: block;
    margin-top: 3px;
  }
  .anime-editor-card {
    padding: 15px;
  }
  .anime-editor-grid {
    grid-template-columns: 1fr;
  }
  .anime-editor-grid .field.full {
    grid-column: auto;
  }
  .anime-link-row {
    grid-template-columns: 1fr 1fr 50px 32px;
  }
  .anime-series-fields {
    grid-template-columns: 1fr;
  }
}
</style>

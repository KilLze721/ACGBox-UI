<script setup lang="ts">
import '@/assets/adminManagementCards.css'
import { computed, onActivated, onDeactivated, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { getDataQualityPage } from '@/api/dataQuality'
import AdminIcon from '@/components/admin/AdminIcon.vue'
import ArchiveDescription from '@/components/admin/ArchiveDescription.vue'
import ArchiveSelect from '@/components/admin/ArchiveSelect.vue'
import type {
  DataQualityPage,
  DataQualityQuery,
  DataQualityRule,
  DataQualityTarget,
} from '@/types/api'
import { pageSizeValues, resolvePageSize } from '@/utils/preferences'

const sameNameRule = { code: 'SAME_NAME_REVIEW', label: '同名待核对' } as const
const rules: Array<{ code: DataQualityRule; label: string }> = [
  { code: 'MISSING_COVER', label: '缺封面' },
  { code: 'MISSING_DESCRIPTION', label: '缺简介' },
  { code: 'MISSING_PERSON', label: '缺创作人员' },
  { code: 'MISSING_COMPANY', label: '缺公司' },
  { code: 'MISSING_TAG', label: '缺标签' },
  { code: 'MISSING_DATE', label: '缺日期' },
  sameNameRule,
]
const targets = {
  ANIME: { label: '动画', icon: 'anime', path: '/admin/anime', unit: '部' },
  BOOK: { label: '书籍', icon: 'book', path: '/admin/book', unit: '部' },
  PERSON: { label: '人物', icon: 'user', path: '/admin/persons', unit: '位' },
}
const pageSizes = pageSizeValues.map((id) => ({ id, name: `${id} 条` }))
function defaults(targetType: DataQualityTarget): DataQualityQuery {
  return {
    targetType,
    keyword: '',
    ruleCodes:
      targetType === 'PERSON'
        ? [sameNameRule.code]
        : rules.map(({ code }) => code).filter((code) => code !== sameNameRule.code),
    matchMode: 'ANY',
    pageNum: 1,
    pageSize: resolvePageSize(pageSizeValues, 20),
  }
}

const workDraft = ref(defaults('ANIME'))
const personDraft = ref(defaults('PERSON'))
const applied = ref(defaults('ANIME'))
const isPerson = computed(() => applied.value.targetType === 'PERSON')
const draft = computed(() => (isPerson.value ? personDraft.value : workDraft.value))
const visibleRules = computed(() => (isPerson.value ? [sameNameRule] : rules))
const resultTarget = computed(() => targets[applied.value.targetType])
const result = ref<DataQualityPage>()
const loading = ref(true)
const error = ref('')
const validation = ref('')
const brokenCovers = ref(new Set<string>())
let request: AbortController | undefined
const dirty = computed(
  () =>
    draft.value.keyword?.trim() !== applied.value.keyword ||
    draft.value.matchMode !== applied.value.matchMode ||
    visibleRules.value.some(
      ({ code }) => draft.value.ruleCodes.includes(code) !== applied.value.ruleCodes.includes(code),
    ),
)
const pageSize = computed({
  get: () => String(applied.value.pageSize),
  set: (value) => {
    applied.value = { ...applied.value, pageSize: Number(value), pageNum: 1 }
    void checkPage()
  },
})
const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' })
function formatDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date)
}
async function checkPage(pageNum = applied.value.pageNum) {
  request?.abort()
  const controller = new AbortController()
  request = controller
  const query = { ...applied.value, pageNum }
  applied.value = query
  loading.value = true
  error.value = ''
  try {
    let response = await getDataQualityPage(query, controller.signal)
    if (controller.signal.aborted) return
    const lastPage = Math.max(1, response.pages)
    if (pageNum > lastPage) {
      if (response.total) {
        response = await getDataQualityPage({ ...query, pageNum: lastPage }, controller.signal)
      } else {
        response = { ...response, pageNum: 1 }
      }
    }
    if (controller.signal.aborted) return
    applied.value = { ...query, pageNum: response.pageNum }
    result.value = response
  } catch (reason) {
    if (!controller.signal.aborted) {
      error.value = reason instanceof Error ? reason.message : '检查失败，请重试。'
    }
  } finally {
    if (!controller.signal.aborted) loading.value = false
  }
}
function apply(targetType = draft.value.targetType) {
  const next = targetType === 'PERSON' ? personDraft.value : workDraft.value
  if (!next.ruleCodes.length && isPerson.value) next.ruleCodes = defaults(targetType).ruleCodes
  if (!next.ruleCodes.length) {
    validation.value = '请至少选择一项规则。'
    return
  }
  validation.value = ''
  next.targetType = targetType
  applied.value = {
    ...next,
    keyword: next.keyword?.trim() ?? '',
    ruleCodes: [...next.ruleCodes],
    pageSize: applied.value.pageSize,
    pageNum: 1,
  }
  void checkPage()
}
function reset() {
  if (isPerson.value) {
    personDraft.value = defaults('PERSON')
    applied.value = defaults('PERSON')
  } else {
    workDraft.value = defaults('ANIME')
    applied.value = defaults('ANIME')
  }
  validation.value = ''
  void checkPage()
}

// 返回缓存页面时沿用已确认条件，保留尚未应用的输入。
onActivated(() => void checkPage())
onDeactivated(() => request?.abort())
</script>

<template>
  <div class="management-cards quality-page">
    <header class="management-hero">
      <div class="management-hero-copy">
        <p class="management-eyebrow">CONTENT ARCHIVE / QUALITY REVIEW</p>
        <h1>数据质量检查</h1>
        <p>查找作品资料缺漏，核对同名作品和人物。</p>
      </div>
      <span class="quality-hero-mark" aria-hidden="true"><AdminIcon name="check" /></span>
    </header>

    <form class="card quality-panel" @submit.prevent="apply()">
      <div class="quality-section-title">
        <AdminIcon name="filter" />
        <div>
          <h2>检查条件</h2>
        </div>
      </div>
      <div class="quality-filters" :class="{ 'quality-person-filters': isPerson }">
        <fieldset>
          <legend>内容类型</legend>
          <div class="segmented-control">
            <button
              v-for="(target, kind) in targets"
              :key="kind"
              type="button"
              :class="{ active: draft.targetType === kind }"
              :aria-pressed="draft.targetType === kind"
              @click="draft.targetType !== kind && apply(kind)"
            >
              <AdminIcon :name="target.icon" />
              {{ target.label }}
            </button>
          </div>
        </fieldset>
        <div class="field quality-keyword">
          <label for="qualityKeyword">{{ isPerson ? '人物姓名' : '作品名称' }}</label>
          <div class="input-shell">
            <AdminIcon class="input-icon" name="search-full" />
            <input
              id="qualityKeyword"
              v-model="draft.keyword"
              class="has-icon"
              type="search"
              :placeholder="isPerson ? '按人物姓名搜索' : '按作品名称搜索'"
            />
          </div>
        </div>
        <fieldset v-if="!isPerson">
          <legend>命中方式</legend>
          <div class="quality-options quality-match">
            <label><input v-model="draft.matchMode" type="radio" value="ANY" /> 满足任一项</label>
            <label
              ><input v-model="draft.matchMode" type="radio" value="ALL" />
              同时满足全部所选项</label
            >
          </div>
        </fieldset>
      </div>
      <fieldset class="quality-rules">
        <legend>检查规则</legend>
        <div class="quality-options quality-rule-grid">
          <label v-for="rule in visibleRules" :key="rule.code">
            <input
              v-model="draft.ruleCodes"
              type="checkbox"
              :value="rule.code"
              :disabled="isPerson"
              @change="validation = ''"
            />
            <span>{{ rule.label }}</span>
          </label>
        </div>
      </fieldset>
      <div class="quality-actions">
        <p v-if="validation" class="quality-error" role="alert">{{ validation }}</p>
        <p v-else-if="dirty" class="quality-muted">条件有改动，点击「检查」后应用。</p>
        <div>
          <button class="secondary-button" type="button" @click="reset">重置</button>
          <button class="primary-button" type="submit">
            <AdminIcon name="search-full" /> 检查
          </button>
        </div>
      </div>
    </form>

    <section v-if="result && !loading && !error" class="quality-stats" aria-label="检查统计">
      <dl class="quality-stat">
        <dt>当前范围{{ isPerson ? '人数' : '作品数' }}</dt>
        <dd>{{ result.summary.scopeTotal }}</dd>
      </dl>
      <dl class="quality-stat quality-total">
        <dt>本次命中{{ isPerson ? '人数' : '作品数' }}</dt>
        <dd>{{ result.total }}</dd>
      </dl>
      <div class="quality-counts">
        <h2>分项命中 <small v-if="!isPerson">同一作品可命中多项</small></h2>
        <dl v-for="rule in visibleRules" :key="rule.code">
          <dt>{{ rule.label }}</dt>
          <dd>{{ result.summary.ruleCounts[rule.code] ?? '—' }}</dd>
        </dl>
      </div>
    </section>

    <section
      class="card quality-results"
      :aria-busy="loading"
      aria-labelledby="quality-results-title"
    >
      <header class="quality-result-heading">
        <div class="quality-section-title">
          <AdminIcon name="check" />
          <div>
            <h2 id="quality-results-title">检查结果</h2>
            <p v-if="result && !loading && !error">
              共 {{ result.total }} {{ resultTarget.unit }}{{ resultTarget.label }}
            </p>
          </div>
        </div>
        <small v-if="result && !loading && !error" class="quality-muted"
          >读取于 {{ formatDate(result.checkedAt) }}</small
        >
      </header>
      <p v-if="loading" class="quality-state" role="status">
        正在检查{{ resultTarget.label }}资料…
      </p>
      <div v-else-if="error" class="quality-state" role="alert">
        <p class="quality-error">{{ error }}</p>
        <button type="button" class="secondary-button" @click="checkPage()">重试</button>
      </div>
      <div v-else-if="!result?.rows.length" class="quality-state">
        <span class="quality-state-mark" aria-hidden="true"><AdminIcon name="check" /></span>
        <strong>{{
          isPerson ? '当前条件下未发现同名人物' : '当前条件下未发现待补充或待核对的作品'
        }}</strong>
        <p v-if="!isPerson">可以调整检查规则或作品名称后再检查。</p>
      </div>
      <template v-else>
        <div class="quality-table-wrap">
          <table class="anime-table quality-table">
            <thead>
              <tr>
                <th scope="col">{{ isPerson ? '人物' : '作品' }}</th>
                <th scope="col">命中项</th>
                <th scope="col">更新时间</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in result.rows" :key="row.targetId">
                <td>
                  <div v-if="row.targetType === 'PERSON'" class="quality-person">
                    <strong>{{ row.name }}</strong>
                    <small class="quality-id">ID {{ row.targetId }}</small>
                    <ArchiveDescription :text="row.description" />
                  </div>
                  <div v-else class="quality-work">
                    <div class="cover">
                      <img
                        v-if="row.coverImageUrl && !brokenCovers.has(row.coverImageUrl)"
                        :src="row.coverImageUrl"
                        alt=""
                        loading="lazy"
                        @error="brokenCovers.add(row.coverImageUrl)"
                      />
                      <span v-else class="cover-code">{{ row.name.slice(0, 2) }}</span>
                    </div>
                    <div>
                      <strong>{{ row.name }}</strong>
                      <small class="quality-id"
                        >{{ row.contentType?.name ?? '类型未录入' }} ·
                        {{ row.region?.name ?? '地区未录入' }}</small
                      >
                    </div>
                  </div>
                </td>
                <td>
                  <div class="quality-issues">
                    <span
                      v-for="issue in row.issues"
                      :key="issue.code"
                      :class="{ 'quality-review': issue.code === 'SAME_NAME_REVIEW' }"
                    >
                      {{ issue.message
                      }}<template v-if="issue.code === 'SAME_NAME_REVIEW' && row.duplicateCount">
                        · {{ row.duplicateCount }} {{ targets[row.targetType].unit }}</template
                      >
                    </span>
                  </div>
                </td>
                <td>{{ formatDate(row.updatedAt) }}</td>
                <td>
                  <RouterLink
                    class="secondary-button quality-link"
                    :to="{
                      path: targets[row.targetType].path,
                      query: { detail: row.targetId, from: 'data-quality' },
                    }"
                  >
                    {{ row.targetType === 'PERSON' ? '查看详情' : '查看并补充' }}
                    <AdminIcon name="right" />
                  </RouterLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pagination">
          <span class="page-summary"
            >共 {{ result.total }} {{ resultTarget.unit }} · {{ result.pageNum }}/{{
              result.pages
            }}
            页</span
          >
          <div class="page-controls">
            <ArchiveSelect
              id="qualityPageSize"
              v-model="pageSize"
              class="page-size-select"
              label="每页数量"
              placeholder="选择数量"
              placement="top"
              :show-placeholder-option="false"
              :options="pageSizes"
            />
            <button
              type="button"
              class="page-button"
              aria-label="上一页"
              :disabled="result.pageNum <= 1"
              @click="checkPage(result.pageNum - 1)"
            >
              <AdminIcon name="left" />
            </button>
            <button
              type="button"
              class="page-button"
              aria-label="下一页"
              :disabled="result.pageNum >= result.pages"
              @click="checkPage(result.pageNum + 1)"
            >
              <AdminIcon name="right" />
            </button>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.quality-page {
  display: grid;
  gap: 18px;
  font: 12px/1.5 var(--font-body);
}
.quality-page .card {
  background: var(--surface-solid);
  backdrop-filter: none;
  min-width: 0;
}
.quality-hero-mark,
.quality-section-title > svg,
.quality-state-mark {
  flex: none;
  padding: 9px;
  width: 36px;
  height: 36px;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 10px;
}
.quality-hero-mark {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--surface-solid);
}
.quality-hero-mark svg {
  width: 22px;
  height: 22px;
}
.quality-section-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.quality-section-title p {
  margin: 2px 0 0;
  color: var(--ink-faint);
  font-size: 11px;
}
.quality-panel {
  padding: 20px;
}
.quality-page h2 {
  font: 700 16px/1.4 var(--font-display);
  margin: 0;
}
.quality-filters {
  display: grid;
  grid-template-columns: auto minmax(180px, 1fr) auto;
  align-items: end;
  gap: 16px;
  margin-top: 16px;
}
.quality-person-filters {
  grid-template-columns: auto minmax(180px, 1fr);
}
.quality-panel fieldset {
  padding: 0;
  border: 0;
  min-width: 0;
}
.quality-panel legend,
.quality-keyword > label {
  color: var(--ink-soft);
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 6px;
}
.quality-keyword {
  gap: 0;
}
.quality-keyword input {
  width: 100%;
  min-width: 0;
  font: inherit;
}
.quality-filters .segmented-control button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 58px;
  padding: 4px 10px;
  border: 0;
  border-radius: 8px;
  color: var(--ink-soft);
  background: transparent;
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}
.quality-filters .segmented-control button.active {
  background: var(--surface-solid);
  color: var(--accent-strong);
  box-shadow: var(--shadow-soft);
}
.quality-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.quality-options label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
  color: var(--ink-soft);
  cursor: pointer;
}
.quality-options label:has(:checked) {
  border-color: color-mix(in srgb, var(--accent) 28%, var(--line));
  background: var(--accent-soft);
  color: var(--accent-strong);
}
.quality-options input {
  accent-color: var(--accent);
}
.quality-rules {
  margin-top: 15px;
}
.quality-rule-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.quality-rule-grid label {
  min-height: 42px;
}
.quality-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 15px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  flex-wrap: wrap;
}
.quality-actions > div {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.quality-actions p,
.quality-state p {
  margin: 0;
}
.quality-muted,
.quality-id {
  color: var(--ink-faint);
  font-size: 11px;
}
.quality-error {
  color: var(--danger);
}
.quality-stats {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) minmax(120px, 1fr) minmax(0, 3fr);
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  background: var(--surface-solid);
}
.quality-stat,
.quality-counts {
  margin: 0;
  padding: 16px;
}
.quality-stats dt {
  color: var(--ink-faint);
  font-size: 11px;
}
.quality-stats dd {
  margin: 0;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.quality-stat dd {
  margin-top: 4px;
  font: 700 22px/1.25 var(--font-display);
}
.quality-total dd {
  color: var(--accent-strong);
}
.quality-total {
  background: color-mix(in srgb, var(--accent-soft) 36%, var(--surface-solid));
  border-inline: 1px solid var(--line);
}
.quality-counts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 76px), 1fr));
  gap: 8px 10px;
}
.quality-counts h2 {
  grid-column: 1 / -1;
  font-size: 14px;
}
.quality-counts h2 small {
  color: var(--ink-faint);
  font: 400 11px var(--font-body);
  margin-left: 6px;
}
.quality-counts dl {
  margin: 0;
}
.quality-result-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--line);
}
.quality-table-wrap {
  overflow-x: auto;
}
.quality-table {
  min-width: 570px;
}
.quality-table td {
  padding: 10px 14px;
  font: inherit;
}
.quality-table th {
  padding-inline: 14px;
  font: 650 11px/1.5 var(--font-body);
  letter-spacing: 0;
}
.quality-table th:first-child {
  width: 42%;
}
.quality-table th:nth-child(2) {
  width: 28%;
}
.quality-table th:last-child {
  width: 144px;
}
.quality-work {
  display: flex;
  align-items: center;
  gap: 10px;
}
.quality-work strong,
.quality-person strong {
  font-weight: 700;
  overflow-wrap: anywhere;
}
.quality-person .archive-description {
  margin-top: 4px;
  color: var(--ink-soft);
}
.quality-table .cover {
  flex: none;
  width: 38px;
  height: 50px;
  --cover-gradient: var(--violet-soft);
}
.quality-id {
  display: block;
  margin-top: 3px;
}
.quality-issues {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.quality-issues span {
  padding: 3px 7px;
  border-radius: 6px;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-size: 11px;
}
.quality-issues .quality-review {
  background: var(--violet-soft);
  color: var(--violet);
}
.quality-link {
  white-space: nowrap;
  text-decoration: none;
}
.quality-actions button,
.quality-link,
.quality-state button {
  font: 650 12px/1.5 var(--font-body);
}
.quality-state {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 36px 20px;
  text-align: center;
  color: var(--ink-soft);
}
.quality-state-mark {
  display: grid;
  place-items: center;
  color: var(--success);
  background: var(--success-soft);
}
.quality-state button {
  margin-top: 12px;
}
@media (max-width: 780px) {
  .quality-filters {
    grid-template-columns: 1fr;
  }
  .quality-stats {
    grid-template-columns: 1fr 1fr;
  }
  .quality-counts {
    grid-column: 1 / -1;
    border-top: 1px solid var(--line);
  }
}
@media (max-width: 520px) {
  .quality-hero-mark {
    display: none;
  }
  .quality-rule-grid,
  .quality-counts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>

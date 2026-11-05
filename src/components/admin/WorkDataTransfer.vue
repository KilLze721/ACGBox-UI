<script setup lang="ts">
/** 动画、书籍共用数据传输流程；预览不保存作品，提交结果不确定时保留原批次供查询。 */
import { computed, onBeforeUnmount, onDeactivated, ref } from 'vue'
import AdminIcon from './AdminIcon.vue'
import { useModalLayer } from '@/utils/useModalLayer'
import { getCurrentUser } from '@/utils/auth'
import { ApiError } from '@/api/http'
import {
  cancelImport,
  commitImport,
  downloadTemplate,
  exportWorks,
  getImportBatch,
  previewImport,
  type TransferBatch,
  type TransferPreview,
  type TransferType,
} from '@/api/dataTransfer'

const props = defineProps<{
  targetType: TransferType
  filters: object
  selectedIds: number[]
  summary: string
  instanceKey?: string
}>()
const emit = defineEmits<{ completed: []; detail: [id: number] }>()
const opened = ref(false),
  mode = ref<'export' | 'import'>('export'),
  busy = ref(false),
  error = ref(''),
  discard = ref(false)
const closeAfterDiscard = ref(false)
const retained = ref(false)
const panel = useModalLayer(opened, requestClose)
const discardPanel = useModalLayer(() => opened.value && discard.value, keepPreview)
const acknowledgmentInput = ref<HTMLInputElement>()
const acknowledgmentError = ref(false)
function keepPreview() {
  if (!busy.value) discard.value = false
}
onDeactivated(() => {
  opened.value = false
})
const scope = ref<'SELECTED' | 'FILTERED'>('FILTERED'),
  snapshotIds = ref<number[]>([]),
  snapshotFilters = ref<object>({}),
  snapshotSummary = ref('')
const file = ref<File>(),
  preview = ref<TransferPreview>(),
  batch = ref<TransferBatch>(),
  uncertain = ref(false),
  acknowledged = ref(false),
  createMissingCatalogs = ref(false),
  previewPage = ref(1)
const pendingCatalogs = computed(() => preview.value?.pendingCatalogs ?? [])
const catalogLabels = { tag: '标签', company: '公司', person: '人物', series: '系列' }
const clock = ref(Date.now())
const attempted = ref(false)
const canRetry = computed(
  () =>
    attempted.value && uncertain.value && !expired.value && batch.value?.status !== 'PROCESSING',
)
const label = computed(() => (props.targetType === 'ANIME' ? '动画' : '书籍'))
const token = computed(() => batch.value?.importToken || preview.value?.importToken)
const expiresAt = computed(() => batch.value?.expiresAt || preview.value?.expiresAt)
const expired = computed(() => !!expiresAt.value && Date.parse(expiresAt.value) <= clock.value)
const successful = computed(() => batch.value?.status === 'SUCCEEDED')
const terminal = computed(
  () => !!batch.value && ['INVALID', 'EXPIRED', 'CANCELLED'].includes(batch.value.status),
)
const canCommit = computed(
  () =>
    !!preview.value &&
    !!token.value &&
    !preview.value.errorCount &&
    !expired.value &&
    !terminal.value &&
    !successful.value &&
    !uncertain.value,
)
const visibleRows = computed(
  () => preview.value?.rows.slice((previewPage.value - 1) * 10, previewPage.value * 10) ?? [],
)
const storagePrefix = `acgbox-import-${getCurrentUser()?.id}-${props.targetType}`
const storageKey = `${storagePrefix}${props.instanceKey ? ':' + props.instanceKey : ''}`
let selectedStorageKey = storageKey
const recoverable = ref<Array<{ key: string; count: number }>>([])
const statusNames: Record<string, string> = {
  READY: '待确认',
  PROCESSING: '处理中',
  INVALID: '已失效',
  EXPIRED: '已过期',
  CANCELLED: '已取消',
}
let controller: AbortController | undefined,
  notified = ''
const timer = window.setInterval(() => {
  if (opened.value) clock.value = Date.now()
}, 1000)
try {
  const saved = sessionStorage.getItem(storageKey)
  if (saved) {
    const stored = JSON.parse(saved)
    batch.value = stored
    retained.value = stored.retained === true
    attempted.value = !!stored.attempted
    createMissingCatalogs.value = stored.createMissingCatalogs === true
    uncertain.value = true
  }
} catch {
  error.value = '无法恢复本次会话的批次，请核对已有导入结果。'
}
onBeforeUnmount(() => {
  controller?.abort()
  window.clearInterval(timer)
  // 工作区确认放弃后销毁组件时释放未提交预览；结果待确认的批次保留供恢复查询。
  if (token.value && !retained.value && !uncertain.value && !successful.value && !terminal.value) {
    void cancelImport(props.targetType, token.value)
      .then((result) => {
        if (result.status === 'CANCELLED') sessionStorage.removeItem(selectedStorageKey)
      })
      .catch(() => {
        /* 取消失败时保留会话批次，重新打开后查询。 */
      })
  }
})
defineExpose({
  getCloseState: () => ({
    dirty: !!token.value && !retained.value && !successful.value && !terminal.value,
    submitting: busy.value,
  }),
})

function remember() {
  if (token.value)
    sessionStorage.setItem(
      selectedStorageKey,
      JSON.stringify({
        importToken: token.value,
        targetType: props.targetType,
        expiresAt: expiresAt.value,
        status: batch.value?.status ?? 'READY',
        workCount: preview.value?.workCount ?? batch.value?.workCount,
        retained: retained.value,
        attempted: attempted.value,
        createMissingCatalogs: attempted.value && createMissingCatalogs.value,
      }),
    )
}
function show(next: 'export' | 'import') {
  mode.value = next
  opened.value = true
  discard.value = false
  error.value = ''
  clock.value = Date.now()
  if (next === 'export') {
    snapshotIds.value = [...props.selectedIds]
    snapshotFilters.value = JSON.parse(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(props.filters).filter(([key]) => key !== 'pageNum' && key !== 'pageSize'),
        ),
      ),
    )
    snapshotSummary.value = props.summary
    scope.value = snapshotIds.value.length ? 'SELECTED' : 'FILTERED'
  } else if (token.value && !preview.value) void queryBatch()
  else if (!token.value) {
    recoverable.value = []
    for (let index = 0; index < sessionStorage.length; index++) {
      const key = sessionStorage.key(index)
      if (!key || (key !== storagePrefix && !key.startsWith(storagePrefix + ':'))) continue
      try {
        const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null')
        if (saved?.importToken) recoverable.value.push({ key, count: saved.workCount })
      } catch {
        /* 只读取本功能的当前账号批次，不处理其他会话数据。 */
      }
    }
  }
}
async function restoreBatch(key: string) {
  selectedStorageKey = key
  const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null')
  if (!saved) return
  batch.value = saved
  retained.value = saved.retained === true
  attempted.value = !!saved.attempted
  createMissingCatalogs.value = saved.createMissingCatalogs === true
  uncertain.value = true
  await queryBatch()
}
function requestClose() {
  if (busy.value) return
  if (
    mode.value === 'import' &&
    (token.value || preview.value) &&
    !successful.value &&
    !terminal.value
  ) {
    closeAfterDiscard.value = true
    discard.value = true
  } else opened.value = false
}
async function run(action: (signal: AbortSignal) => Promise<void>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  controller = new AbortController()
  const request = controller,
    timeout = window.setTimeout(() => request.abort(), 60000)
  try {
    await action(request.signal)
  } catch (reason) {
    if (
      reason instanceof ApiError &&
      reason.data &&
      typeof reason.data === 'object' &&
      'status' in reason.data
    )
      acceptBatch(reason.data as TransferBatch)
    error.value = request.signal.aborted
      ? '请求超时或已取消。若已提交，请查询原批次结果，不要重新上传创建另一批。'
      : reason instanceof Error
        ? reason.message
        : '操作失败，请重试。'
  } finally {
    window.clearTimeout(timeout)
    busy.value = false
  }
}
function acceptBatch(value: TransferBatch) {
  batch.value = value
  if (value.status === 'READY' && value.preview && !preview.value) {
    preview.value = value.preview
    previewPage.value = 1
    acknowledged.value = false
    acknowledgmentError.value = false
  }
  uncertain.value = value.status === 'PROCESSING' || (value.status === 'READY' && attempted.value)
  remember()
  if (value.status === 'SUCCEEDED' || ['INVALID', 'EXPIRED', 'CANCELLED'].includes(value.status))
    sessionStorage.removeItem(selectedStorageKey)
  if (value.status === 'SUCCEEDED' && notified !== value.importToken) {
    notified = value.importToken
    emit('completed')
  }
}
async function download(template = false) {
  await run(async (signal) => {
    const result = template
      ? await downloadTemplate(props.targetType, signal)
      : await exportWorks(
          props.targetType,
          scope.value,
          scope.value === 'SELECTED' ? snapshotIds.value : snapshotFilters.value,
          signal,
        )
    const url = URL.createObjectURL(result.blob),
      link = document.createElement('a')
    link.href = url
    link.download = result.filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  })
}
function selectFile(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0]
  preview.value = undefined
  acknowledged.value = false
  createMissingCatalogs.value = false
  previewPage.value = 1
  error.value = ''
  if (
    file.value &&
    (!/\.xlsx$/i.test(file.value.name) || !file.value.size || file.value.size > 5 * 1024 * 1024)
  ) {
    error.value = '请选择非空的 .xlsx 文件，大小不能超过 5 MiB。'
    file.value = undefined
  }
}
async function upload() {
  if (!file.value || token.value) return
  const selected = file.value
  await run(async (signal) => {
    const result = await previewImport(props.targetType, selected, signal)
    if (signal.aborted) return
    preview.value = result
    retained.value = false
    attempted.value = false
    batch.value = undefined
    acknowledged.value = false
    acknowledgmentError.value = false
    createMissingCatalogs.value = false
    previewPage.value = 1
    remember()
  })
}
async function commit(retry = false) {
  if (!token.value || (retry ? !canRetry.value : !canCommit.value)) return
  if (!retry && !acknowledged.value) {
    acknowledgmentError.value = true
    acknowledgmentInput.value?.focus()
    acknowledgmentInput.value?.scrollIntoView({ block: 'center' })
    return
  }
  if (!retry && pendingCatalogs.value.length && !createMissingCatalogs.value) return
  attempted.value = true
  remember()
  uncertain.value = true
  await run(async (signal) =>
    acceptBatch(
      await commitImport(props.targetType, token.value!, signal, createMissingCatalogs.value),
    ),
  )
}
async function queryBatch() {
  if (!token.value) return
  await run(async (signal) =>
    acceptBatch(await getImportBatch(props.targetType, token.value!, signal)),
  )
}
function retainAndClose() {
  retained.value = true
  remember()
  discard.value = false
  opened.value = false
}
async function abandon() {
  if (uncertain.value) return
  await run(async (signal) => {
    if (token.value) {
      const result = await cancelImport(props.targetType, token.value, signal)
      acceptBatch(result)
      if (result.status !== 'CANCELLED' && !['INVALID', 'EXPIRED'].includes(result.status)) return
    }
    preview.value = undefined
    batch.value = undefined
    file.value = undefined
    retained.value = false
    uncertain.value = false
    attempted.value = false
    discard.value = false
    selectedStorageKey = storageKey
    if (closeAfterDiscard.value) opened.value = false
  })
}
function changeFile() {
  closeAfterDiscard.value = false
  discard.value = true
}
function prepareNext() {
  selectedStorageKey = storageKey
  recoverable.value = []
  batch.value = undefined
  preview.value = undefined
  file.value = undefined
  retained.value = false
  acknowledged.value = false
  createMissingCatalogs.value = false
  attempted.value = false
  uncertain.value = false
  error.value = ''
}
function openResult(id: number) {
  opened.value = false
  emit('detail', id)
}
const fieldLabels: Record<string, string> = {
  name: '名称',
  description: '简介',
  status: '状态',
  airDate: '开始放送',
  publishDate: '首次发表',
  episodeCount: '集数',
  volumeCount: '卷数',
  chapterCount: '章节数',
  personalRatingScore: '个人评分',
  coverImageUrl: '封面地址',
  aliasNames: '别名',
  companies: '公司与职责',
  persons: '人物与职责',
  tagIds: '标签',
  seriesId: '系列',
  broadcastTypeId: '放送类型',
  bookTypeId: '书籍类型',
  adaptationTypeId: '改编类型',
  regionId: '地区',
  externalLinks: '外链',
}
const referenceTables: Record<string, string> = {
  companyId: 'company',
  personId: 'person',
  tagIds: 'tag',
  seriesId: 'series',
  broadcastTypeId: 'broadcast_type',
  bookTypeId: 'book_type',
  adaptationTypeId: 'adaptation_type',
  regionId: 'region',
}
function text(value: unknown, key: string): string {
  if (value === null || value === undefined || value === '') return '未填写'
  if (Array.isArray(value)) return value.map((item) => text(item, key)).join('；') || '无'
  if (typeof value === 'object')
    return Object.entries(value)
      .map(
        ([field, item]) =>
          `${
            (
              {
                role: '职责',
                sortOrder: '排序',
                title: '标题',
                url: '链接',
                companyId: '公司',
                personId: '人物',
              } as Record<string, string>
            )[field] ?? field
          }：${text(item, field)}`,
      )
      .join(' · ')
  const names = preview.value?.referenceNames[referenceTables[key] ?? '']
  return names?.[String(value)] ?? String(value)
}
</script>

<template>
  <div class="transfer-tools">
    <button class="ghost-button" type="button" @click="show('export')">
      <AdminIcon name="download" />导出<span v-if="selectedIds.length">
        {{ selectedIds.length }}</span
      >
    </button>
    <button class="ghost-button" type="button" @click="show('import')">
      <AdminIcon name="plus" />批量导入<span
        v-if="token && !successful && !terminal"
        class="pending-dot"
        >待处理</span
      >
    </button>
  </div>
  <Teleport to="body">
    <div v-if="opened" class="transfer-layer" @click.self="requestClose">
      <section
        ref="panel"
        class="transfer-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transferTitle"
        tabindex="-1"
        :aria-busy="busy"
      >
        <header>
          <div>
            <p class="eyebrow">ARCHIVE / DATA TRANSFER</p>
            <h2 id="transferTitle">{{ mode === 'export' ? '导出' : '批量导入' }}{{ label }}</h2>
            <p>Excel · 仅新增，不覆盖现有作品</p>
          </div>
          <button
            class="ghost-button"
            :disabled="busy"
            aria-label="关闭数据传输"
            @click="requestClose"
          >
            <AdminIcon name="close" />
          </button>
        </header>
        <div class="transfer-body">
          <p class="transfer-notice">
            最多 500 部作品、10000 条关联，文件不超过 5
            MiB。作品文件不是数据库备份；图片仅保存地址。
          </p>
          <template v-if="mode === 'export'">
            <label class="scope-choice"
              ><input
                v-model="scope"
                value="SELECTED"
                type="radio"
                :disabled="busy || !snapshotIds.length"
              /><span
                ><strong>已勾选作品 · {{ snapshotIds.length }} 部</strong
                ><small>仅导出打开窗口时勾选的作品</small></span
              ></label
            >
            <label class="scope-choice"
              ><input v-model="scope" value="FILTERED" type="radio" :disabled="busy" /><span
                ><strong>{{ snapshotSummary ? '当前筛选结果' : `导出全部${label}` }}</strong
                ><small
                  >{{ snapshotSummary || '当前没有筛选条件，将导出全部作品。' }} · 不限当前页</small
                ></span
              ></label
            >
            <p class="transfer-muted">
              导出完整基础资料与关联，按已应用的排序输出；未点击查询的输入不影响本次导出。
            </p>
          </template>
          <template v-else>
            <ol class="transfer-steps">
              <li :class="{ active: !preview && !batch }">01 准备文件</li>
              <li :class="{ active: preview && !successful }">02 核对预览</li>
              <li :class="{ active: successful }">03 导入结果</li>
            </ol>
            <div v-if="!token && recoverable.length" class="transfer-notice">
              <p>本次会话还有未完成批次，请先查询已有结果，避免重复导入。</p>
              <button
                v-for="(item, index) in recoverable"
                :key="item.key"
                class="secondary-button"
                :disabled="busy"
                @click="restoreBatch(item.key)"
              >
                恢复批次 {{ index + 1 }} · {{ item.count }} 部作品
              </button>
            </div>
            <div class="transfer-template">
              <div>
                <strong>从标准模板开始</strong>
                <p>保留全部工作表和表头；日期使用 YYYY-MM-DD 文本，资料按当前数据库 ID 引用。</p>
              </div>
              <button class="secondary-button" :disabled="busy" @click="download(true)">
                下载{{ label }}模板
              </button>
            </div>
            <p class="transfer-notice">
              导出文件再次导入也只会新增，sourceId 不用于更新。跨数据库文件必须人工核对资料
              ID；同名与清洗提醒请逐项检查。
            </p>
            <label v-if="!token" class="transfer-file"
              >选择 Excel 文件<input
                type="file"
                accept=".xlsx"
                :disabled="busy"
                @change="selectFile"
              /><small>{{ file?.name || '仅支持 .xlsx，不支持 .xls、宏或 CSV' }}</small></label
            >
            <div class="transfer-upload-actions">
              <button
                v-if="file && !token"
                class="secondary-button"
                :disabled="busy"
                @click="upload"
              >
                {{ busy ? '正在处理…' : '上传并预览' }}
              </button>
              <button v-if="busy && !uncertain" class="ghost-button" @click="controller?.abort()">
                取消当前请求
              </button>
            </div>
            <template v-if="preview">
              <div class="transfer-counts">
                <span
                  >作品 <strong>{{ preview.workCount }}</strong></span
                ><span
                  >关联 <strong>{{ preview.relationCount }}</strong></span
                ><span
                  >错误 <strong>{{ preview.errorCount }}</strong></span
                ><span
                  >提醒 <strong>{{ preview.warningCount }}</strong></span
                >
              </div>
              <p v-if="preview.truncated" class="transfer-error">
                错误／提醒明细最多展示前 100 条，请修正文件后重新预览。
              </p>
              <section
                v-for="group in [
                  { title: '错误', items: preview.errors },
                  { title: '提醒', items: preview.warnings },
                ]"
                :key="group.title"
              >
                <h3 v-if="group.items.length">{{ group.title }}</h3>
                <ul class="transfer-issues">
                  <li v-for="(issue, index) in group.items" :key="index">
                    <strong
                      >{{ issue.sheet }} · 第 {{ issue.row }} 行 · {{ issue.field }}
                      <span v-if="issue.rowKey">({{ issue.rowKey }})</span></strong
                    ><span>{{ issue.message }}</span>
                  </li>
                </ul>
              </section>
              <details v-for="row in visibleRows" :key="row.rowKey" class="transfer-row">
                <summary>
                  <strong>{{ row.data.name || '未填写名称' }}</strong
                  ><span>{{ row.rowKey }} · 第 {{ row.row }} 行</span>
                </summary>
                <dl>
                  <template v-for="(value, key) in row.data" :key="key"
                    ><dt>{{ fieldLabels[key] || key }}</dt>
                    <dd>{{ text(value, key) }}</dd></template
                  >
                </dl>
              </details>
              <div v-if="preview.rows.length" class="transfer-pages">
                <button class="ghost-button" :disabled="previewPage === 1" @click="previewPage--">
                  上一页</button
                ><span>{{ previewPage }} / {{ Math.ceil(preview.rows.length / 10) }}</span
                ><button
                  class="ghost-button"
                  :disabled="previewPage * 10 >= preview.rows.length"
                  @click="previewPage++"
                >
                  下一页
                </button>
              </div>
            </template>
            <p v-if="expiresAt && !successful" class="transfer-muted">
              {{
                expired
                  ? '预览有效期已过，请先查询批次结果。'
                  : `预览截止：${new Date(expiresAt).toLocaleString()}（剩余 ${Math.max(
                      0,
                      Math.ceil((Date.parse(expiresAt) - clock) / 60000),
                    )} 分钟）`
              }}
            </p>
            <p v-if="uncertain" class="transfer-notice" role="status">
              结果待确认：请查询批次或使用同一批次重试。不要重新上传并创建另一批。
            </p>
            <p v-if="batch && !successful" class="transfer-muted">
              批次状态：{{ statusNames[batch.status] }} {{ batch.message }}
            </p>
            <p v-if="batch?.rowKey" class="transfer-error">问题作品：{{ batch.rowKey }}</p>
            <p v-if="batch?.status === 'READY' && !preview && !attempted" class="transfer-notice">
              服务端未返回预览明细。可重新查询批次，或更换文件后重新核对。
            </p>
            <section v-if="successful" class="transfer-success">
              <h3>已新增 {{ batch?.createdCount }} 部{{ label }}</h3>
              <p>这是服务端返回的实际导入结果。再次提交不会重复创建。</p>
              <div v-for="(id, rowKey) in batch?.mappings" :key="rowKey">
                <span>{{
                  preview?.rows.find((row) => row.rowKey === rowKey)?.data.name || rowKey
                }}</span
                ><button class="ghost-button" @click="openResult(id)">查看作品</button>
              </div>
            </section>
            <details
              v-if="pendingCatalogs.length && !successful && !terminal"
              class="transfer-notice"
            >
              <summary>待创建资料（{{ pendingCatalogs.length }} 项）</summary>
              <ul>
                <li v-for="item in pendingCatalogs" :key="item.temporaryId">
                  {{ catalogLabels[item.type] }}：{{ item.name }}（{{ item.rowKeys.join('、') }}）
                </li>
              </ul>
            </details>
            <label
              v-if="pendingCatalogs.length && token && !successful && !terminal"
              class="transfer-ack"
            >
              <input
                v-model="createMissingCatalogs"
                type="checkbox"
                :disabled="busy || uncertain"
              />
              同意创建本批 {{ pendingCatalogs.length }} 项缺失资料
            </label>
            <label
              v-if="preview && !preview.errorCount && token && !successful && !terminal"
              class="transfer-ack"
              ><input
                ref="acknowledgmentInput"
                v-model="acknowledged"
                :aria-invalid="acknowledgmentError"
                :aria-describedby="acknowledgmentError ? 'transfer-ack-error' : undefined"
                @change="acknowledgmentError = false"
                type="checkbox"
                :disabled="busy || uncertain"
              />我已核对预览及所有提醒，将新增
              {{ preview.workCount }} 部作品，不修改已有作品。</label
            >
            <p
              v-if="acknowledgmentError && preview && !successful && !terminal"
              id="transfer-ack-error"
              class="transfer-error"
              role="alert"
            >
              请先勾选确认框，再确认整批新增。
            </p>
          </template>
          <p v-if="error" class="transfer-error" role="alert">{{ error }}</p>
        </div>
        <footer>
          <button class="secondary-button" :disabled="busy" @click="requestClose">关闭</button
          ><template v-if="mode === 'export'"
            ><button
              class="primary-button"
              :disabled="busy || (scope === 'SELECTED' && !snapshotIds.length)"
              @click="download()"
            >
              {{ busy ? '正在生成…' : '下载 Excel' }}
            </button></template
          ><template v-else
            ><button
              v-if="token && !successful && !uncertain"
              class="ghost-button"
              :disabled="busy"
              @click="changeFile"
            >
              更换文件</button
            ><button v-if="token" class="secondary-button" :disabled="busy" @click="queryBatch">
              查询批次结果</button
            ><button
              v-if="token && !successful && !terminal"
              class="primary-button"
              :disabled="
                busy ||
                (!uncertain &&
                  (!canCommit ||
                    (acknowledged && pendingCatalogs.length > 0 && !createMissingCatalogs))) ||
                (uncertain && !canRetry)
              "
              @click="commit(uncertain)"
            >
              {{ busy ? '正在处理…' : uncertain ? '同批次重试确认' : '确认整批新增' }}</button
            ><button
              v-if="successful || terminal"
              class="ghost-button"
              :disabled="busy"
              @click="prepareNext"
            >
              准备下一批
            </button></template
          >
        </footer>
      </section>
    </div>
    <div
      v-if="opened && discard"
      class="transfer-layer transfer-confirm-layer"
      @click.self="keepPreview"
    >
      <section
        ref="discardPanel"
        class="transfer-dialog transfer-discard"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="transfer-discard-title"
        tabindex="-1"
      >
        <h3 id="transfer-discard-title">
          {{ closeAfterDiscard ? '确认关闭导入？' : '确认更换文件？' }}
        </h3>
        <p>
          {{
            uncertain
              ? '关闭窗口会保留当前批次，重新打开后可查询状态。'
              : !token
                ? '本次预览没有生成可恢复的批次，取消后需要重新上传文件。'
                : closeAfterDiscard
                  ? '可以保留预览以便在有效期内继续核对，也可以取消本次预览。'
                  : '更换文件会取消当前预览，需要重新上传并核对。'
          }}
        </p>
        <p v-if="error" class="transfer-error" role="alert">{{ error }}</p>
        <div class="transfer-upload-actions">
          <button class="secondary-button" :disabled="busy" @click="keepPreview">继续核对</button>
          <button
            v-if="closeAfterDiscard && token"
            class="secondary-button"
            :disabled="busy"
            @click="retainAndClose"
          >
            {{ uncertain ? '保留批次并关闭' : '保留预览并关闭' }}
          </button>
          <button v-if="!uncertain" class="danger-button" :disabled="busy" @click="abandon">
            {{ closeAfterDiscard ? '取消预览并关闭' : '取消预览并更换文件' }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.transfer-tools {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.transfer-tools button {
  white-space: nowrap;
}
.pending-dot {
  color: var(--accent-strong);
  font-size: 10px;
}
.transfer-layer {
  position: fixed;
  inset: 0;
  z-index: 2200;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(17, 17, 30, 0.52);
}
.transfer-dialog {
  width: min(100%, 1000px);
  max-height: calc(100dvh - 48px);
  display: flex;
  flex-direction: column;
  color: var(--ink);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 22px;
  box-shadow: var(--shadow);
  outline: none;
  font: 13px/1.65 var(--font-body);
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 24px 28px;
  border-bottom: 1px solid var(--line);
}
h2 {
  margin: 4px 0;
  font: 700 25px/1.4 var(--font-display);
}
h3 {
  font: 650 15px/1.5 var(--font-display);
  margin: 18px 0 8px;
}
p {
  margin: 5px 0;
}
.eyebrow {
  color: var(--accent-strong);
  font-size: 10px;
  letter-spacing: 0.15em;
}
header p:last-child,
.transfer-muted {
  color: var(--ink-faint);
  font-size: 12px;
}
.transfer-body {
  padding: 20px 28px;
  overflow-y: auto;
  overscroll-behavior: contain;
  min-height: 0;
}
.transfer-notice {
  padding: 12px 15px;
  background: var(--violet-soft);
  color: var(--violet);
  border-radius: 10px;
  margin-bottom: 18px;
}
.scope-choice {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  margin: 12px 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-muted);
  cursor: pointer;
}
.scope-choice:has(input:checked) {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.scope-choice small {
  display: block;
  color: var(--ink-soft);
  margin-top: 5px;
}
input[type='checkbox'],
input[type='radio'] {
  accent-color: var(--accent);
  flex-shrink: 0;
}
.transfer-steps {
  display: flex;
  gap: 8px;
  padding: 0;
  list-style: none;
  margin: 0 0 20px;
}
.transfer-steps li {
  flex: 1;
  padding: 10px;
  border-bottom: 2px solid var(--line);
  color: var(--ink-faint);
}
.transfer-steps li.active {
  color: var(--accent-strong);
  border-color: var(--accent);
}
.transfer-template {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 15px 0;
}
.transfer-template p {
  color: var(--ink-soft);
  font-size: 12px;
}
.transfer-template button {
  white-space: nowrap;
}
.transfer-file {
  display: grid;
  gap: 10px;
  padding: 20px;
  border: 1px dashed var(--line-strong);
  border-radius: 12px;
  margin: 15px 0;
  background: var(--surface-muted);
}
.transfer-file input {
  max-width: 100%;
  font: inherit;
}
.transfer-file input::file-selector-button {
  margin-right: 12px;
  padding: 9px 14px;
  color: var(--accent-strong);
  background: var(--accent-soft);
  border: 1px solid var(--line);
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
}
.transfer-file input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}
.transfer-file small {
  color: var(--ink-faint);
}
.transfer-counts {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin: 20px 0;
}
.transfer-counts > span {
  display: grid;
  gap: 5px;
  padding: 14px;
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--ink-soft);
}
.transfer-counts strong {
  font: 700 24px var(--font-display);
  color: var(--ink);
}
.transfer-issues {
  padding-left: 20px;
  max-height: 240px;
  overflow: auto;
}
.transfer-issues li {
  margin: 10px 0;
}
.transfer-issues span {
  display: block;
  color: var(--ink-soft);
}
.transfer-row {
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  margin: 10px 0;
  background: var(--surface-muted);
}
summary {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
}
summary span {
  color: var(--ink-faint);
  font-size: 11px;
}
dl {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 8px;
}
dt {
  color: var(--ink-faint);
}
dd {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.transfer-pages {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  margin: 16px 0;
}
.transfer-error {
  color: var(--danger);
  padding: 10px 0;
  white-space: pre-wrap;
}
.transfer-ack {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 18px 0;
}
.transfer-ack input {
  margin-top: 5px;
}
.transfer-success {
  padding: 20px;
  background: var(--success-soft);
  color: var(--success);
  border-radius: 12px;
}
.transfer-success > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.transfer-discard {
  width: min(100%, 440px);
  padding: 24px;
  overflow: auto;
}
.transfer-discard h3 {
  margin-top: 0;
}
.transfer-discard .transfer-upload-actions {
  justify-content: flex-end;
  margin-top: 16px;
}
.transfer-confirm-layer {
  z-index: 2201;
}
.transfer-upload-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  padding: 18px 28px;
  border-top: 1px solid var(--line);
}
button {
  font-family: var(--font-body);
}
button:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
@media (max-width: 620px) {
  .transfer-layer {
    padding: 10px;
  }
  .transfer-dialog {
    max-height: calc(100dvh - 20px);
    border-radius: 16px;
  }
  header,
  .transfer-body,
  footer {
    padding: 16px;
  }
  .transfer-template {
    align-items: flex-start;
    flex-direction: column;
  }
  .transfer-counts {
    grid-template-columns: repeat(2, 1fr);
  }
  .transfer-steps {
    font-size: 11px;
  }
  summary {
    flex-direction: column;
  }
  dl {
    grid-template-columns: 80px minmax(0, 1fr);
  }
  footer button {
    flex: 1;
  }
}
</style>

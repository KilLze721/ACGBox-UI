<script setup lang="ts">
/** 动画与书籍共用的封面上传：保留原地址，独立管理请求、重试和预览状态。 */
import { computed, onBeforeUnmount, onDeactivated, ref, shallowRef, useId, watch } from 'vue'
import { uploadImage } from '@/api/uploads'
import type { ImageUploadTarget } from '@/types/api'
import AdminIcon from './AdminIcon.vue'

const props = defineProps<{
  modelValue: string
  targetType: ImageUploadTarget
  disabled?: boolean
  error?: string
}>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
  uploadingChange: [value: boolean]
}>()
const id = useId()
const fileInput = ref<HTMLInputElement>()
const selectedFile = shallowRef<File | null>(null)
const uploading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const dragging = ref(false)
const previewFailed = ref(false)
const previewVersion = ref(0)
let controller: AbortController | undefined
let requestSequence = 0
const previewUrl = computed(() => {
  try {
    const url = new URL(props.modelValue.trim())
    return ['https:', 'http:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
})

function setUploading(value: boolean) {
  uploading.value = value
  emit('uploadingChange', value)
}

function invalidateRequest() {
  requestSequence++
  controller?.abort()
  controller = undefined
  setUploading(false)
}

function reset() {
  invalidateRequest()
  selectedFile.value = null
  errorMessage.value = successMessage.value = ''
  dragging.value = previewFailed.value = false
  if (fileInput.value) fileInput.value.value = ''
}

async function startUpload() {
  if (props.disabled || !selectedFile.value) return
  invalidateRequest()
  const sequence = requestSequence
  const request = new AbortController()
  controller = request
  errorMessage.value = successMessage.value = ''
  setUploading(true)
  try {
    const result = await uploadImage(selectedFile.value, props.targetType, request.signal)
    // 即使取消后仍收到成功响应，也只能由当前有效请求更新封面。
    if (sequence !== requestSequence) return
    emit('update:modelValue', result.url)
    previewFailed.value = false
    successMessage.value = '上传成功，保存作品后生效'
    selectedFile.value = null
  } catch (error) {
    if (sequence !== requestSequence || (error instanceof Error && error.name === 'AbortError'))
      return
    errorMessage.value =
      error instanceof SyntaxError
        ? '上传服务返回了无法读取的响应，请稍后重试。'
        : error instanceof TypeError
          ? '图片上传失败，请检查网络连接后重试。'
          : error instanceof Error
            ? error.message
            : '图片上传失败，请稍后重试。'
  } finally {
    if (sequence === requestSequence) {
      controller = undefined
      setUploading(false)
    }
  }
}

function selectFiles(files: FileList | File[]) {
  if (props.disabled || !files.length) return
  reset()
  if (files.length !== 1) {
    errorMessage.value = '一次只能上传一张封面图片。'
    return
  }
  const file = files[0]!
  if (!file.size) errorMessage.value = '请选择非空图片文件。'
  else if (!/\.(jpe?g|png)$/i.test(file.name)) errorMessage.value = '仅支持 JPG、JPEG、PNG 图片。'
  else if (file.size > 5242880) errorMessage.value = '单张图片不能超过 5 MiB。'
  if (errorMessage.value) return
  selectedFile.value = file
  void startUpload()
}

function fileChanged(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  selectFiles(files)
}

function dropFiles(event: DragEvent) {
  dragging.value = false
  if (event.dataTransfer) selectFiles(event.dataTransfer.files)
}

function updateAddress(event: Event) {
  if (props.disabled || uploading.value) return
  reset()
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}

function removeCover() {
  if (props.disabled || uploading.value) return
  reset()
  emit('update:modelValue', '')
}

function reloadPreview() {
  previewVersion.value++
  previewFailed.value = false
}

watch(
  () => props.modelValue,
  () => {
    previewFailed.value = false
  },
)
watch(() => props.targetType, reset)
watch(
  () => props.disabled,
  (value) => {
    if (value && uploading.value) reset()
  },
)
onDeactivated(() => {
  if (uploading.value) reset()
})
onBeforeUnmount(reset)
defineExpose({ reset })
</script>

<template>
  <div class="cover-upload" :aria-busy="uploading">
    <div class="cover-upload-preview">
      <img
        v-if="previewUrl && !previewFailed"
        :key="previewVersion"
        :src="previewUrl"
        :alt="targetType === 'ANIME' ? '动画封面预览' : '书籍封面预览'"
        @error="previewFailed = true"
      />
      <span v-else class="cover-upload-empty">
        <AdminIcon :name="targetType === 'ANIME' ? 'anime' : 'book'" />
        <strong>{{ previewFailed ? '预览不可用' : '封面预览' }}</strong>
        <small>{{ previewFailed ? '可重新加载' : '等待添加图片' }}</small>
      </span>
      <span v-if="previewUrl && !previewFailed" class="cover-upload-preview-label">封面预览</span>
    </div>
    <div class="cover-upload-controls">
      <div
        class="cover-upload-dropzone"
        :class="{ dragging, disabled }"
        @dragover.prevent="dragging = !disabled"
        @dragleave.prevent="dragging = false"
        @drop.prevent="dropFiles"
      >
        <input
          :id="id + '-file'"
          ref="fileInput"
          hidden
          type="file"
          accept=".jpg,.jpeg,.png,image/jpeg,image/png"
          :disabled="disabled"
          :aria-describedby="id + '-hint ' + id + '-error'"
          aria-label="选择封面图片"
          @change="fileChanged"
        />
        <div class="cover-upload-copy">
          <span class="cover-upload-symbol" aria-hidden="true"><AdminIcon name="plus" /></span>
          <div>
            <strong>{{ uploading ? '正在上传新封面' : '添加作品封面' }}</strong>
            <span>{{
              uploading ? '原封面将保留至上传完成' : '将图片拖拽至此，或点击选择图片'
            }}</span>
          </div>
        </div>
        <button
          class="secondary-button"
          type="button"
          :disabled="disabled"
          :aria-describedby="id + '-hint ' + id + '-error'"
          @click="fileInput?.click()"
        >
          <AdminIcon name="plus" />{{ modelValue ? '替换图片' : '选择图片' }}
        </button>
        <small :id="id + '-hint'">支持 JPG、JPEG、PNG，单张不超过 5 MiB</small>
      </div>
      <div v-if="uploading || selectedFile" class="cover-upload-file">
        <span :title="selectedFile?.name"
          >{{ uploading ? '正在上传… ' : '待重试：' }}{{ selectedFile?.name }}</span
        >
        <button v-if="uploading" class="ghost-button" type="button" @click="reset">取消上传</button>
        <template v-else>
          <button class="ghost-button" type="button" :disabled="disabled" @click="startUpload">
            重试上传
          </button>
          <button class="ghost-button" type="button" :disabled="disabled" @click="reset">
            取消待上传文件
          </button>
        </template>
      </div>
      <div class="cover-upload-address" :class="{ 'has-cover': modelValue }">
        <label :for="id + '-url'">封面地址</label>
        <span class="cover-upload-address-note">也可直接粘贴图片链接</span>
        <input
          :id="id + '-url'"
          type="url"
          :value="modelValue"
          placeholder="https://..."
          :disabled="disabled || uploading"
          :aria-invalid="!!(error || errorMessage)"
          :aria-describedby="id + '-hint ' + id + '-error'"
          @input="updateAddress"
        />
        <button
          v-if="modelValue"
          class="ghost-button cover-upload-remove"
          type="button"
          :disabled="disabled || uploading || !modelValue"
          @click="removeCover"
        >
          <AdminIcon name="delete" />移除封面
        </button>
      </div>
      <p v-if="uploading" class="cover-upload-hint" role="status">
        上传期间保留原封面，请完成或取消上传后保存作品。
      </p>
      <p v-if="successMessage" class="cover-upload-success" role="status">
        <AdminIcon name="check" />{{ successMessage }}
      </p>
      <p v-if="previewFailed" class="cover-upload-hint" role="status">
        图片暂时无法加载，封面地址已保留。
        <button class="ghost-button" type="button" :disabled="disabled" @click="reloadPreview">
          重新加载预览
        </button>
      </p>
      <p :id="id + '-error'" class="cover-upload-error" role="alert">{{ errorMessage || error }}</p>
    </div>
  </div>
</template>

<style scoped>
.cover-upload {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.cover-upload-preview {
  position: relative;
  display: grid;
  width: 112px;
  height: 168px;
  overflow: hidden;
  place-items: center;
  color: var(--ink-faint);
  background:
    radial-gradient(ellipse at 15% 0%, var(--accent-soft), transparent 75%), var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 12px;
}
.cover-upload-preview img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cover-upload-empty {
  display: grid;
  justify-items: center;
  gap: 7px;
  padding: 10px;
  text-align: center;
}
.cover-upload-empty > svg {
  width: 28px;
  height: 28px;
  margin-bottom: 4px;
  color: var(--violet);
  opacity: 0.65;
}
.cover-upload-empty strong {
  color: var(--ink-soft);
  font-size: var(--anime-form-hint-size, 11px);
  font-weight: 600;
}
.cover-upload-empty small {
  font-size: 10px;
}
.cover-upload-preview-label {
  position: absolute;
  right: 6px;
  bottom: 6px;
  left: 6px;
  padding: 4px;
  color: var(--ink-soft);
  background: color-mix(in srgb, var(--surface-solid) 90%, transparent);
  border-radius: 6px;
  font-size: 9px;
  text-align: center;
}
.cover-upload-controls {
  display: grid;
  min-width: 0;
  gap: 12px;
}
.cover-upload-dropzone {
  display: grid;
  min-width: 0;
  min-height: 94px;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px 16px;
  padding: 15px 16px;
  background: var(--surface-muted);
  border: 1px dashed var(--line-strong);
  border-radius: 12px;
  transition:
    border-color 150ms ease,
    background-color 150ms ease;
}
.cover-upload-dropzone.dragging,
.cover-upload-dropzone:focus-within {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent-soft) 30%, var(--surface-solid));
}
.cover-upload-dropzone.disabled {
  opacity: 0.6;
}
.cover-upload-copy {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}
.cover-upload-symbol {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--accent-strong);
  background: var(--accent-soft);
  border-radius: 10px;
}
.cover-upload-symbol svg {
  width: 17px;
  height: 17px;
}
.cover-upload-copy strong,
.cover-upload-copy div > span {
  display: block;
}
.cover-upload-copy strong {
  color: var(--ink);
  font-size: var(--anime-form-text-size, 12px);
  font-weight: 650;
}
.cover-upload-copy div > span {
  margin-top: 4px;
  color: var(--ink-soft);
  font-size: var(--anime-form-hint-size, 11px);
  line-height: 1.5;
}
.cover-upload-dropzone small {
  grid-column: 1 / -1;
  padding-left: 46px;
  color: var(--ink-faint);
  font-size: 10px;
  line-height: 1.5;
}
.cover-upload button {
  min-height: 32px;
  padding: 0 10px;
  font: 600 var(--anime-form-hint-size, 11px)/1.4 var(--font-body);
}
.cover-upload-dropzone .secondary-button {
  color: var(--accent-strong);
  background: var(--surface-solid);
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line));
  box-shadow: none;
}
.cover-upload-dropzone .secondary-button:hover:not(:disabled) {
  background: var(--accent-soft);
  border-color: var(--accent);
}
.cover-upload button:disabled {
  cursor: not-allowed;
}
.cover-upload button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.cover-upload-file {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  color: var(--ink-soft);
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 9px;
  font-size: var(--anime-form-hint-size, 11px);
}
.cover-upload-file > span {
  min-width: 0;
  flex: 1 1 160px;
  overflow-wrap: anywhere;
}
.cover-upload-address {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px 10px;
}
.cover-upload-address label {
  margin: 0;
  color: var(--ink-soft);
  font-size: var(--anime-form-hint-size, 11px);
  font-weight: 600;
}
.cover-upload-address-note {
  margin: 0;
  color: var(--ink-faint);
  font-size: 10px;
  text-align: right;
}
.cover-upload-address input {
  width: 100%;
  min-width: 0;
  grid-column: 1 / -1;
}
.cover-upload-address.has-cover input {
  grid-column: 1;
}
.cover-upload-remove {
  color: var(--ink-soft);
  background: transparent;
  border-color: var(--line);
}
.cover-upload-remove:hover:not(:disabled) {
  color: var(--danger);
  background: var(--danger-soft);
  border-color: transparent;
}
.cover-upload-hint,
.cover-upload-error,
.cover-upload-success {
  margin: 0;
  font-size: var(--anime-form-hint-size, 11px);
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.cover-upload-hint {
  color: var(--ink-faint);
}
.cover-upload-error {
  color: var(--danger);
}
.cover-upload-error:empty {
  display: none;
}
.cover-upload-success {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--success);
}
.cover-upload-success svg {
  width: 13px;
  height: 13px;
  flex: 0 0 auto;
}
@media (max-width: 600px) {
  .cover-upload {
    grid-template-columns: 76px minmax(0, 1fr);
    gap: 12px;
  }
  .cover-upload-preview {
    width: 76px;
    height: 100%;
    min-height: 126px;
  }
  .cover-upload-empty {
    gap: 5px;
    padding: 6px;
  }
  .cover-upload-empty small {
    display: none;
  }
  .cover-upload-controls {
    display: contents;
  }
  .cover-upload-dropzone {
    grid-column: 2;
    grid-row: 1;
    grid-template-columns: minmax(0, 1fr);
    gap: 9px;
    padding: 12px;
  }
  .cover-upload-symbol {
    display: none;
  }
  .cover-upload-dropzone .secondary-button {
    justify-self: start;
  }
  .cover-upload-dropzone small {
    grid-column: 1;
    padding-left: 0;
  }
  .cover-upload-file,
  .cover-upload-address,
  .cover-upload-hint,
  .cover-upload-error,
  .cover-upload-success {
    grid-column: 1 / -1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .cover-upload-dropzone {
    transition: none;
  }
}
</style>

<script setup lang="ts">
/**
 * 远程业务实体搜索选择框：用于公司、系列等实际资料，搜索方法由父组件传入。
 * 区分显示名称与选中标识，输入变化时清除旧标识，并管理防抖、分页及搜索错误。
 */
import { computed, onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import type { NamedOption, PageResult } from '@/types/api'

interface EntityOption extends NamedOption {
  description?: string | null
  value?: string
  group?: string
}

const props = defineProps<{
  id: string
  label: string
  modelValue: string
  selectedName: string
  placeholder: string
  search: (
    name: string,
    pageNum: number,
    signal: AbortSignal,
  ) => Promise<Pick<PageResult<EntityOption>, 'rows' | 'pages'>>
  emptyOption?: string
  noResultsMessage?: string
  noResultsError?: string
  errorMessage?: string
  showOptionId?: boolean
  requireExplicitSelection?: boolean
  showOptionDescription?: boolean
  searchOnInputOnly?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:selectedName': [value: string]
}>()

const root = ref<HTMLElement>()
const input = ref<HTMLInputElement>()
const open = ref(false)
const loading = ref(false)
const error = ref(false)
const options = ref<EntityOption[]>([])
const activeOptionId = ref<string | null>(null)
const hasMore = ref(false)
const searchedName = ref('')
const inlineError = computed(() =>
  props.noResultsError &&
  props.selectedName.trim() &&
  !props.modelValue &&
  !loading.value &&
  !error.value &&
  searchedName.value === props.selectedName.trim() &&
  !options.value.length
    ? props.noResultsError
    : props.errorMessage,
)
let pageNum = 0
let keyword = ''
let timer: number | undefined
let controller: AbortController | undefined

onBeforeUnmount(() => {
  cancelSearch()
  document.removeEventListener('pointerdown', handleOutsidePointerDown)
})
onDeactivated(() => closeMenu(false))
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) closeMenu(false)
  },
)

function cancelSearch() {
  if (timer) window.clearTimeout(timer)
  controller?.abort()
  controller = undefined
  loading.value = false
}

function closeMenu(clearUnselected = true) {
  open.value = false
  if (!clearUnselected || !props.noResultsError || !props.selectedName.trim() || !loading.value) {
    cancelSearch()
  }
  document.removeEventListener('pointerdown', handleOutsidePointerDown)
  if (clearUnselected && props.emptyOption && !props.modelValue) {
    emit('update:selectedName', '')
  }
}

function handleOutsidePointerDown(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) closeMenu()
}

function openMenu() {
  if (open.value || props.disabled || props.searchOnInputOnly) return
  open.value = true
  document.addEventListener('pointerdown', handleOutsidePointerDown)
  startSearch(props.selectedName, 0)
}

function focusAndOpen() {
  input.value?.focus()
  openMenu()
}

function startSearch(value: string, delay = 250) {
  cancelSearch()
  keyword = value.trim()
  options.value = []
  activeOptionId.value = null
  searchedName.value = ''
  hasMore.value = false
  error.value = false
  loading.value = true
  timer = window.setTimeout(() => void loadPage(1), delay)
}

async function loadPage(nextPage: number) {
  if (nextPage > 1 && loading.value) return
  const request = new AbortController()
  controller = request
  loading.value = true
  error.value = false
  try {
    const result = await props.search(keyword, nextPage, request.signal)
    if (controller !== request || (!open.value && !props.noResultsError)) return
    options.value = nextPage === 1 ? result.rows : [...options.value, ...result.rows]
    if (nextPage === 1) searchedName.value = keyword
    pageNum = nextPage
    hasMore.value = pageNum < result.pages
  } catch {
    if (request.signal.aborted) return
    error.value = true
  } finally {
    if (controller === request) loading.value = false
  }
}

// 文字被修改后原选择不再有效，先清空标识再搜索，避免提交与显示名称不符的数据。
function handleInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  emit('update:modelValue', '')
  emit('update:selectedName', value)
  if (props.searchOnInputOnly) {
    if (!value.trim()) {
      options.value = []
      closeMenu(false)
      return
    }
    if (!open.value) {
      open.value = true
      document.addEventListener('pointerdown', handleOutsidePointerDown)
    }
  } else if (!open.value) openMenu()
  startSearch(value)
}

function optionValue(option: EntityOption) {
  return option.value ?? String(option.id)
}

function selectOption(option: EntityOption) {
  if (props.disabled) return
  emit('update:modelValue', optionValue(option))
  emit('update:selectedName', option.name)
  closeMenu(false)
}

function clearSelection() {
  emit('update:modelValue', '')
  emit('update:selectedName', '')
  closeMenu(false)
}

function handleKeydown(event: KeyboardEvent) {
  if (props.disabled) return
  if (event.key === 'Escape') closeMenu()
  if (event.target !== input.value) return
  if (open.value && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault()
    const index = options.value.findIndex((option) => optionValue(option) === activeOptionId.value)
    const next =
      index < 0
        ? event.key === 'ArrowDown'
          ? 0
          : options.value.length - 1
        : Math.max(
            0,
            Math.min(options.value.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)),
          )
    activeOptionId.value = options.value[next] ? optionValue(options.value[next]!) : null
  }
  if (event.key === 'Enter' && open.value && options.value.length) {
    event.preventDefault()
    const option = options.value.find((item) => optionValue(item) === activeOptionId.value)
    if (option) selectOption(option)
    else if (!props.showOptionId && !props.requireExplicitSelection) selectOption(options.value[0]!)
  }
}
</script>

<template>
  <div ref="root" class="anime-entity-select" :class="{ open }" @keydown="handleKeydown">
    <input
      :id="id"
      ref="input"
      :value="selectedName"
      :disabled="disabled"
      type="text"
      autocomplete="off"
      :placeholder="placeholder"
      role="combobox"
      aria-autocomplete="list"
      :aria-label="label"
      :aria-expanded="open"
      :aria-controls="`${id}-options`"
      :aria-activedescendant="
        open && activeOptionId !== null ? `${id}-option-${activeOptionId}` : undefined
      "
      :aria-invalid="!!inlineError || undefined"
      :aria-describedby="inlineError ? `${id}-error` : undefined"
      @focus="openMenu"
      @input="handleInput"
    />
    <button
      class="anime-entity-toggle"
      type="button"
      :aria-label="searchOnInputOnly ? `输入${label}名称搜索` : `展开${label}选项`"
      :disabled="disabled"
      @click="focusAndOpen"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <template v-if="searchOnInputOnly">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 4 4" />
        </template>
        <path v-else d="m7 10 5 5 5-5" />
      </svg>
    </button>
    <small v-if="inlineError" :id="`${id}-error`" class="anime-entity-error" role="alert">{{
      inlineError
    }}</small>
    <div
      v-if="open"
      :id="`${id}-options`"
      class="anime-entity-menu"
      role="listbox"
      :aria-label="`${label}搜索结果`"
    >
      <button
        v-if="emptyOption"
        type="button"
        role="option"
        :aria-selected="!modelValue && !selectedName"
        class="anime-entity-option"
        @mousedown.prevent="clearSelection"
        @click="clearSelection"
      >
        {{ emptyOption }}
      </button>
      <button
        v-for="option in options"
        :key="optionValue(option)"
        :id="`${id}-option-${optionValue(option)}`"
        type="button"
        role="option"
        :aria-selected="modelValue === optionValue(option)"
        class="anime-entity-option"
        :class="{ 'active-option': activeOptionId === optionValue(option) }"
        @mousedown.prevent="selectOption(option)"
        @click="selectOption(option)"
      >
        <span
          ><small v-if="option.group" class="anime-option-group">{{ option.group }}</small
          >{{ option.name
          }}<small v-if="showOptionId" class="anime-option-id">ID · {{ option.id }}</small></span
        >
        <span v-if="showOptionDescription && option.description" class="anime-option-description">{{
          option.description
        }}</span>
      </button>
      <span v-if="loading" class="anime-entity-state" role="status">正在搜索…</span>
      <div v-else-if="error" class="anime-entity-state error" role="alert">
        搜索失败，请重试。
        <button
          type="button"
          @mousedown.prevent="startSearch(selectedName, 0)"
          @click="startSearch(selectedName, 0)"
        >
          重试
        </button>
      </div>
      <span v-else-if="!options.length" class="anime-entity-state">{{
        selectedName.trim() || showOptionId || requireExplicitSelection
          ? noResultsMessage || '没有匹配结果'
          : '没有匹配结果'
      }}</span>
      <button
        v-if="hasMore && !loading"
        class="anime-entity-more"
        type="button"
        @mousedown.prevent="loadPage(pageNum + 1)"
        @click="loadPage(pageNum + 1)"
      >
        加载更多
      </button>
    </div>
  </div>
</template>

<style scoped>
.anime-entity-select {
  position: relative;
  min-width: 0;
  width: 100%;
}
.anime-entity-select > input {
  width: 100%;
  min-width: 0;
  height: 38px;
  padding: 0 34px 0 10px;
  color: var(--ink);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 9px;
  outline: 0;
  font: 10px var(--font-body);
}
.anime-entity-select > input::placeholder {
  color: var(--ink-faint);
}
.anime-entity-select > input:hover,
.anime-entity-select.open > input {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--line));
}
.anime-entity-select > input:focus {
  border-color: var(--accent);
  box-shadow: var(--focus);
}
.anime-entity-select > input[aria-invalid='true'] {
  border-color: var(--danger);
}
.anime-entity-error {
  display: block;
  margin: 4px 2px 0;
  color: var(--danger);
  font-size: 9px;
}
.anime-entity-toggle {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 34px;
  height: 36px;
  display: grid;
  place-items: center;
  color: var(--ink-faint);
  background: transparent;
  border: 0;
  border-radius: 8px;
}
.anime-entity-toggle:hover {
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.anime-entity-toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -3px;
}
.anime-entity-toggle svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.anime-entity-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  left: 0;
  z-index: 160;
  display: grid;
  max-height: 240px;
  gap: 3px;
  padding: 5px;
  overflow-y: auto;
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 11px;
  box-shadow: 0 12px 28px rgba(37, 31, 67, 0.16);
}
.anime-entity-option,
.anime-entity-more {
  min-height: 30px;
  padding: 0 9px;
  color: var(--ink-soft);
  background: var(--surface-solid);
  border: 1px solid transparent;
  border-radius: 7px;
  font: 600 10px var(--font-body);
  text-align: left;
}
.anime-entity-option:hover,
.anime-entity-option.active-option,
.anime-entity-option[aria-selected='true'],
.anime-entity-more:hover {
  color: var(--accent-strong);
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
}
.anime-entity-more {
  color: var(--accent-strong);
  text-align: center;
}
.anime-option-id {
  margin-left: 8px;
  color: var(--ink-faint);
  font-size: 9px;
  font-weight: 400;
}
.anime-option-group {
  display: inline-flex;
  margin-right: 7px;
  padding: 2px 6px;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 5px;
  font-size: 9px;
  font-weight: 600;
}
.anime-option-description {
  display: -webkit-box;
  margin: 3px 0 5px;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  color: var(--ink-faint);
  font-size: 9px;
  font-weight: 400;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.anime-entity-select > input:disabled,
.anime-entity-toggle:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.anime-entity-state {
  padding: 8px 9px;
  color: var(--ink-faint);
  font-size: 9px;
}
.anime-entity-state.error {
  color: var(--danger);
}
.anime-entity-state button {
  margin-left: 5px;
  color: var(--accent-strong);
  background: transparent;
  border: 0;
  font: inherit;
  cursor: pointer;
}
</style>

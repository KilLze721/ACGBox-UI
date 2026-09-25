<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { NamedOption, PageResult } from '@/types/api'

const props = defineProps<{
  id: string
  label: string
  modelValue: string
  selectedName: string
  placeholder: string
  search: (name: string, pageNum: number, signal: AbortSignal) => Promise<PageResult<NamedOption>>
  emptyOption?: string
  noResultsMessage?: string
  noResultsError?: string
  errorMessage?: string
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
const options = ref<NamedOption[]>([])
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
  if (open.value) return
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
  searchedName.value = ''
  hasMore.value = false
  error.value = false
  loading.value = true
  timer = window.setTimeout(() => void loadPage(1), delay)
}

async function loadPage(nextPage: number) {
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

function handleInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  emit('update:modelValue', '')
  emit('update:selectedName', value)
  if (!open.value) openMenu()
  startSearch(value)
}

function selectOption(option: NamedOption) {
  emit('update:modelValue', String(option.id))
  emit('update:selectedName', option.name)
  closeMenu(false)
}

function clearSelection() {
  emit('update:modelValue', '')
  emit('update:selectedName', '')
  closeMenu(false)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeMenu()
  if (event.key === 'Enter' && open.value && options.value.length) {
    event.preventDefault()
    selectOption(options.value[0]!)
  }
}
</script>

<template>
  <div ref="root" class="anime-entity-select" :class="{ open }" @keydown="handleKeydown">
    <input
      :id="id"
      ref="input"
      :value="selectedName"
      type="text"
      autocomplete="off"
      :placeholder="placeholder"
      role="combobox"
      aria-autocomplete="list"
      :aria-label="label"
      :aria-expanded="open"
      :aria-controls="`${id}-options`"
      :aria-invalid="!!inlineError || undefined"
      :aria-describedby="inlineError ? `${id}-error` : undefined"
      @focus="openMenu"
      @input="handleInput"
    />
    <button
      class="anime-entity-toggle"
      type="button"
      :aria-label="`展开${label}选项`"
      @click="focusAndOpen"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
    </button>
    <small v-if="inlineError" :id="`${id}-error`" class="anime-entity-error" role="alert">{{ inlineError }}</small>
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
        :key="option.id"
        type="button"
        role="option"
        :aria-selected="modelValue === String(option.id)"
        class="anime-entity-option"
        @mousedown.prevent="selectOption(option)"
        @click="selectOption(option)"
      >
        {{ option.name }}
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
      <span v-else-if="!options.length" class="anime-entity-state">{{ selectedName.trim() ? noResultsMessage || '没有匹配结果' : '没有匹配结果' }}</span>
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

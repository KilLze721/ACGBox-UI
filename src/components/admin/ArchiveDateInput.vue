<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AdminIcon from '@/components/admin/AdminIcon.vue'
import { ARCHIVE_YEAR_MAX, ARCHIVE_YEAR_MIN, validateArchiveDate } from '@/utils/archiveDate'

const props = withDefaults(
  defineProps<{
    id: string
    modelValue: string
    label: string
    placeholder: string
    disabled?: boolean
    alignEnd?: boolean
    invalid?: boolean
    describedBy?: string
  }>(),
  {
    disabled: false,
    alignEnd: false,
    invalid: false,
    describedBy: undefined,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  typing: []
  blur: []
  commit: []
}>()

const root = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const open = ref(false)
const view = ref<'year' | 'month'>('year')
const currentYear = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1
const selectedYear = ref(currentYear)
const selectedMonth = ref<number | null>(null)
const pageStart = ref(getYearPageStart(currentYear))
const years = computed(() => Array.from({ length: 12 }, (_, index) => pageStart.value + index))
const months = Array.from({ length: 12 }, (_, index) => index + 1)

function getYearPageStart(year: number) {
  const firstPageYear = ARCHIVE_YEAR_MIN + Math.floor((year - ARCHIVE_YEAR_MIN) / 12) * 12
  return Math.min(firstPageYear, ARCHIVE_YEAR_MAX - 11)
}

function syncDraftWithValue() {
  const parsed = validateArchiveDate(props.modelValue).value
  selectedYear.value = parsed?.year ?? currentYear
  selectedMonth.value = parsed?.month ?? null
  pageStart.value = getYearPageStart(selectedYear.value)
  view.value = parsed?.month ? 'month' : 'year'
}

function openPicker() {
  if (props.disabled || open.value) return
  syncDraftWithValue()
  open.value = true
}

function closePicker(restoreFocus = false) {
  open.value = false
  if (restoreFocus) void nextTick(() => trigger.value?.focus())
}

function togglePicker() {
  if (open.value) closePicker()
  else openPicker()
}

function selectYear(year: number) {
  if (year !== selectedYear.value) selectedMonth.value = null
  selectedYear.value = year
  view.value = 'month'
}

function changeYearPage(offset: number) {
  const nextStart = pageStart.value + offset * 12
  pageStart.value = Math.min(Math.max(nextStart, ARCHIVE_YEAR_MIN), ARCHIVE_YEAR_MAX - 11)
}

function changeSelectedYear(offset: number) {
  const nextYear = selectedYear.value + offset
  if (nextYear < ARCHIVE_YEAR_MIN || nextYear > ARCHIVE_YEAR_MAX) return
  selectedYear.value = nextYear
  selectedMonth.value = null
}

function commit(value: string) {
  emit('update:modelValue', value)
  emit('commit')
  closePicker(true)
}

function commitMonth(month: number) {
  selectedMonth.value = month
  commit(`${selectedYear.value}-${String(month).padStart(2, '0')}`)
}

function handleInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
  emit('typing')
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (open.value && root.value && !root.value.contains(event.target as Node)) closePicker()
}

function handleEscape() {
  if (open.value) closePicker(true)
}

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) closePicker()
  },
)

watch(
  () => props.modelValue,
  (value) => {
    if (!open.value) return
    if (!value.trim()) {
      selectedMonth.value = null
      view.value = 'year'
      return
    }
    const parsed = validateArchiveDate(value).value
    if (!parsed) return
    selectedYear.value = parsed.year
    selectedMonth.value = parsed.month
    pageStart.value = getYearPageStart(parsed.year)
    view.value = parsed.month === null ? 'year' : 'month'
  },
)

onMounted(() => document.addEventListener('pointerdown', handleDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', handleDocumentPointerDown))
</script>

<template>
  <div
    ref="root"
    class="input-shell date-input-shell"
    :class="{ 'date-picker--end': alignEnd }"
    @keydown.esc.stop="handleEscape"
  >
    <input
      :id="id"
      ref="input"
      :value="modelValue"
      type="text"
      inputmode="numeric"
      :placeholder="placeholder"
      autocomplete="off"
      :disabled="disabled"
      :aria-invalid="invalid"
      :aria-describedby="describedBy"
      @input="handleInput"
      @focus="openPicker"
      @click="openPicker"
      @blur="emit('blur')"
    />
    <button
      ref="trigger"
      class="date-picker-trigger"
      type="button"
      :disabled="disabled"
      :aria-label="`打开${label}选择器`"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :aria-controls="`${id}Picker`"
      @click="togglePicker"
    >
      <AdminIcon name="calendar" />
    </button>

    <div
      :id="`${id}Picker`"
      class="date-picker-panel"
      :class="{ open }"
      role="dialog"
      :aria-label="`选择${label}年份和月份`"
      @pointerdown.prevent
    >
      <template v-if="view === 'year'">
        <div class="date-picker-head">
          <button
            class="date-picker-nav"
            type="button"
            aria-label="查看前十二年"
            :disabled="pageStart <= ARCHIVE_YEAR_MIN"
            @click="changeYearPage(-1)"
          >
            <AdminIcon name="left" />
          </button>
          <div class="date-picker-title" aria-live="polite">
            {{ pageStart }}–{{ pageStart + 11 }}
          </div>
          <button
            class="date-picker-nav"
            type="button"
            aria-label="查看后十二年"
            :disabled="pageStart >= ARCHIVE_YEAR_MAX - 11"
            @click="changeYearPage(1)"
          >
            <AdminIcon name="right" />
          </button>
        </div>
        <div class="date-picker-hint">
          <span class="date-picker-step">第 1 步 · 选择年份</span>
          <span>选择后可继续选择月份</span>
        </div>
        <div class="date-picker-grid" role="grid" aria-label="年份">
          <button
            v-for="year in years"
            :key="year"
            class="date-picker-option"
            :class="{ selected: selectedYear === year, current: currentYear === year }"
            type="button"
            :aria-pressed="selectedYear === year"
            @click="selectYear(year)"
          >
            {{ year }}
          </button>
        </div>
        <div class="date-picker-footer">
          <button class="date-picker-link" type="button" @click="commit('')">清空</button>
          <button
            class="date-picker-link date-picker-year-only"
            type="button"
            @click="selectYear(currentYear)"
          >
            回到今年 {{ currentYear }}
          </button>
        </div>
      </template>

      <template v-else>
        <div class="date-picker-head">
          <button
            class="date-picker-nav"
            type="button"
            aria-label="上一年"
            :disabled="selectedYear <= ARCHIVE_YEAR_MIN"
            @click="changeSelectedYear(-1)"
          >
            <AdminIcon name="left" />
          </button>
          <div class="date-picker-title" aria-live="polite">{{ selectedYear }} 年</div>
          <button
            class="date-picker-nav"
            type="button"
            aria-label="下一年"
            :disabled="selectedYear >= ARCHIVE_YEAR_MAX"
            @click="changeSelectedYear(1)"
          >
            <AdminIcon name="right" />
          </button>
        </div>
        <div class="date-picker-hint">
          <span class="date-picker-step">第 2 步 · 选择月份</span>
          <span>月份可选</span>
        </div>
        <div
          class="date-picker-grid date-picker-month-grid"
          role="grid"
          :aria-label="`${selectedYear} 年月份`"
        >
          <button
            v-for="month in months"
            :key="month"
            class="date-picker-option"
            :class="{
              selected: selectedMonth === month,
              current: currentYear === selectedYear && currentMonth === month,
            }"
            type="button"
            :aria-pressed="selectedMonth === month"
            @click="commitMonth(month)"
          >
            {{ month }}月
          </button>
        </div>
        <div class="date-picker-footer">
          <button class="date-picker-link" type="button" @click="view = 'year'">返回年份</button>
          <button
            class="date-picker-link date-picker-year-only"
            type="button"
            @click="commit(String(selectedYear))"
          >
            确认年份
          </button>
          <button class="date-picker-link" type="button" @click="commit('')">清空</button>
        </div>
      </template>
    </div>
  </div>
</template>

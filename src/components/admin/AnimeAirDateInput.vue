<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AdminIcon from './AdminIcon.vue'

const props = defineProps<{
  id: string
  modelValue: string
  invalid?: boolean
  describedBy?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

type PickerStep = 'year' | 'month' | 'day'

const root = ref<HTMLElement | null>(null)
const open = ref(false)
const pickerStep = ref<PickerStep>('year')
const visibleYear = ref(new Date().getFullYear())
const visibleMonth = ref(new Date().getMonth())
const weekdays = ['一', '二', '三', '四', '五', '六', '日']
const months = Array.from({ length: 12 }, (_, index) => `${index + 1}月`)
const yearStart = computed(() => Math.floor((visibleYear.value - 1) / 20) * 20 + 1)
const yearRangeLabel = computed(() => `${yearStart.value}–${Math.min(yearStart.value + 19, 9999)}`)
const yearOptions = computed(() =>
  Array.from({ length: Math.min(20, 10000 - yearStart.value) }, (_, index) => yearStart.value + index),
)
const headerLabel = computed(() => {
  if (pickerStep.value === 'year') return yearRangeLabel.value
  if (pickerStep.value === 'month') return `${visibleYear.value}年`
  return `${visibleYear.value}年${visibleMonth.value + 1}月`
})
const calendarDays = computed(() => {
  const firstDay = createCalendarDate(visibleYear.value, visibleMonth.value, 1)
  const offset = (firstDay.getDay() + 6) % 7
  const dayCount = daysInMonth(visibleYear.value, visibleMonth.value + 1)
  return Array.from({ length: 42 }, (_, index) => {
    const day = index - offset + 1
    return day < 1 || day > dayCount ? null : day
  })
})

watch(
  () => props.modelValue,
  (value) => {
    if (!open.value) return
    if (!value.trim()) pickerStep.value = 'year'
    else syncPickerWithValue(value)
  },
)

onMounted(() => document.addEventListener('pointerdown', handleOutsidePointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', handleOutsidePointerDown))

function parseAirDate(value: string) {
  const match = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = match[2] === undefined ? null : Number(match[2])
  const day = match[3] === undefined ? null : Number(match[3])
  if (year < 1 || (month !== null && (month < 1 || month > 12))) return null
  if (day !== null && month !== null && (day < 1 || day > daysInMonth(year, month))) return null
  return { year, month, day }
}

function formatDate(year: number, month: number, day: number) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number) {
  if (month === 2) {
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    return leapYear ? 29 : 28
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

function createCalendarDate(year: number, monthIndex: number, day: number) {
  const date = new Date(0)
  date.setHours(0, 0, 0, 0)
  date.setFullYear(year, monthIndex, day)
  return date
}

function syncPickerWithValue(value: string) {
  const parts = parseAirDate(value)
  if (!parts) return
  visibleYear.value = parts.year
  if (parts.month !== null) visibleMonth.value = parts.month - 1
  pickerStep.value = parts.day !== null ? 'day' : parts.month !== null ? 'month' : 'year'
}

function ensureOpen() {
  if (props.disabled || open.value) return
  const now = new Date()
  visibleYear.value = now.getFullYear()
  visibleMonth.value = now.getMonth()
  pickerStep.value = 'year'
  syncPickerWithValue(props.modelValue)
  open.value = true
}

function changePeriod(offset: number) {
  if (pickerStep.value === 'year') visibleYear.value = Math.min(9999, Math.max(1, visibleYear.value + offset * 20))
  else if (pickerStep.value === 'month') visibleYear.value = Math.min(9999, Math.max(1, visibleYear.value + offset))
  else {
    const nextMonth = createCalendarDate(visibleYear.value, visibleMonth.value + offset, 1)
    if (nextMonth.getFullYear() < 1 || nextMonth.getFullYear() > 9999) return
    visibleYear.value = nextMonth.getFullYear()
    visibleMonth.value = nextMonth.getMonth()
  }
}

function chooseYear(year: number) {
  visibleYear.value = year
  pickerStep.value = 'month'
}

function chooseMonth(monthIndex: number) {
  visibleMonth.value = monthIndex
  pickerStep.value = 'day'
}

function chooseDay(day: number) {
  emit('update:modelValue', formatDate(visibleYear.value, visibleMonth.value + 1, day))
  open.value = false
}

function clearDate() {
  emit('update:modelValue', '')
  open.value = false
}

function isSelectedDay(day: number) {
  const parts = parseAirDate(props.modelValue)
  return parts?.year === visibleYear.value && parts.month === visibleMonth.value + 1 && parts.day === day
}

function normalizeInput() {
  const parts = parseAirDate(props.modelValue)
  if (!parts || parts.month === null || parts.day === null) return
  const normalized = formatDate(parts.year, parts.month, parts.day)
  if (normalized !== props.modelValue) emit('update:modelValue', normalized)
}

function handleOutsidePointerDown(event: PointerEvent) {
  if (open.value && root.value && !root.value.contains(event.target as Node)) open.value = false
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}
</script>

<template>
  <div ref="root" class="anime-date-input" :class="{ open, invalid, disabled }" @keydown.esc.stop="handleKeydown">
    <input
      :id="id"
      :value="modelValue"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      placeholder="YYYY-MM-DD"
      :disabled="disabled"
      :aria-invalid="invalid || undefined"
      :aria-describedby="describedBy"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @focus="ensureOpen"
      @click="ensureOpen"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @blur="normalizeInput"
    />
    <button
      class="anime-date-trigger"
      type="button"
      aria-label="打开开始放送日期选择器"
      :aria-expanded="open"
      :disabled="disabled"
      @mousedown.prevent
      @click="ensureOpen"
    >
      <AdminIcon name="calendar" />
    </button>
    <div v-if="open" class="anime-date-panel" role="dialog" aria-label="选择开始放送日期" @pointerdown.prevent>
      <header class="anime-date-panel-head">
        <button
          type="button"
          :aria-label="pickerStep === 'year' ? '上一组年份' : pickerStep === 'month' ? '上一年' : '上个月'"
          @click="changePeriod(-1)"
        ><AdminIcon name="left" /></button>
        <div class="anime-date-panel-title">
          <template v-if="pickerStep === 'year'">{{ headerLabel }}</template>
          <template v-else-if="pickerStep === 'month'">
            <button type="button" @click="pickerStep = 'year'">{{ visibleYear }}年</button>
          </template>
          <template v-else>
            <button type="button" @click="pickerStep = 'year'">{{ visibleYear }}年</button>
            <button type="button" @click="pickerStep = 'month'">{{ visibleMonth + 1 }}月</button>
          </template>
        </div>
        <button
          type="button"
          :aria-label="pickerStep === 'year' ? '下一组年份' : pickerStep === 'month' ? '下一年' : '下个月'"
          @click="changePeriod(1)"
        ><AdminIcon name="right" /></button>
      </header>

      <div v-if="pickerStep === 'year'" class="anime-date-year-grid" role="grid" aria-label="选择年份">
        <button
          v-for="year in yearOptions"
          :key="year"
          type="button"
          :class="{ selected: visibleYear === year }"
          @click="chooseYear(year)"
        >{{ year }}</button>
      </div>

      <template v-else-if="pickerStep === 'month'">
        <div class="anime-date-month-grid" role="grid" aria-label="选择月份">
          <button
            v-for="(month, index) in months"
            :key="month"
            type="button"
            :class="{ selected: parseAirDate(modelValue)?.year === visibleYear && parseAirDate(modelValue)?.month === index + 1 }"
            @click="chooseMonth(index)"
          >{{ month }}</button>
        </div>
        <footer class="anime-date-panel-foot"><span>选择月份后继续选日期</span></footer>
      </template>

      <template v-else>
        <div class="anime-date-weekdays" aria-hidden="true">
          <span v-for="weekday in weekdays" :key="weekday">{{ weekday }}</span>
        </div>
        <div class="anime-date-grid" role="grid" :aria-label="headerLabel">
          <span v-for="(day, index) in calendarDays" :key="index" class="anime-date-cell">
            <button
              v-if="day"
              type="button"
              role="gridcell"
              :aria-pressed="isSelectedDay(day)"
              :class="{
                selected: isSelectedDay(day),
                today: new Date().getFullYear() === visibleYear && new Date().getMonth() === visibleMonth && new Date().getDate() === day,
              }"
              @click="chooseDay(day)"
            >{{ day }}</button>
          </span>
        </div>
        <footer class="anime-date-panel-foot">
          <button type="button" @click="clearDate">清空日期</button>
          <span>仅支持完整有效日期</span>
        </footer>
      </template>
      <footer v-if="pickerStep === 'year'" class="anime-date-panel-foot">
        <button type="button" @click="clearDate">清空日期</button>
        <span>选择年份以继续</span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.anime-date-input { position: relative; display: flex; width: 100%; height: 40px; min-width: 0; align-items: center; overflow: visible; background: var(--surface-solid); border: 1px solid var(--line); border-radius: 10px; transition: border-color 140ms ease, box-shadow 140ms ease; }
.anime-date-input:hover, .anime-date-input.open { border-color: color-mix(in srgb,var(--accent) 44%,var(--line)); }
.anime-date-input:focus-within { border-color: var(--accent); box-shadow: var(--focus); }
.anime-date-input.invalid { border-color: var(--danger); }
.anime-date-input.disabled { color: var(--ink-faint); background: var(--surface-muted); border-color: var(--line); }
.anime-date-input.disabled:hover { border-color: var(--line); }
.anime-date-input > input:not([type='checkbox']) { width: 100%; height: 100%; min-width: 0; min-height: 0; padding: 0 8px 0 10px; color: var(--ink); background: transparent; border: 0; border-radius: 0; outline: 0; box-shadow: none; font: 10px var(--font-body); }
.anime-date-input > input::placeholder { color: var(--ink-faint); }
.anime-date-input > input:not([type='checkbox']):hover,
.anime-date-input > input:not([type='checkbox']):focus { border-color: transparent; box-shadow: none; }
.anime-date-trigger { display: grid; width: 36px; height: 34px; flex: 0 0 auto; margin-right: 2px; place-items: center; color: var(--accent-strong); background: transparent; border: 0; border-radius: 8px; transition: background 140ms ease; }
.anime-date-trigger:hover { background: var(--accent-soft); }
.anime-date-input.disabled .anime-date-trigger { color: var(--ink-faint); background: transparent; cursor: not-allowed; }
.anime-date-trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; box-shadow: none; }
.anime-date-trigger:disabled { color: var(--ink-faint); background: transparent; cursor: not-allowed; }
.anime-date-trigger svg { width: 15px; height: 15px; }
.anime-date-panel { position: absolute; top: calc(100% + 5px); left: 0; z-index: 150; width: min(300px, calc(100vw - 40px)); padding: 11px; color: var(--ink); background: var(--surface-solid); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 14px 34px rgba(37,31,67,.17); animation: anime-date-in 130ms ease both; }
.anime-date-panel-head { display: grid; grid-template-columns: 30px 1fr 30px; align-items: center; gap: 6px; margin-bottom: 9px; }
.anime-date-panel-title { display: flex; justify-content: center; gap: 3px; color: var(--ink); font-size: 11px; font-weight: 700; }
.anime-date-panel-title button { padding: 3px 5px; color: inherit; background: transparent; border: 0; border-radius: 6px; font: inherit; }
.anime-date-panel-title button:hover { color: var(--accent-strong); background: var(--accent-soft); }
.anime-date-panel-head > button { display: grid; width: 28px; height: 28px; place-items: center; color: var(--ink-faint); background: var(--surface-muted); border: 1px solid var(--line); border-radius: 8px; }
.anime-date-panel-head > button:hover { color: var(--accent-strong); background: var(--accent-soft); border-color: color-mix(in srgb,var(--accent) 35%,var(--line)); }
.anime-date-panel-head svg { width: 13px; height: 13px; }
.anime-date-year-grid, .anime-date-month-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 5px; }
.anime-date-year-grid button, .anime-date-month-grid button { display: grid; min-height: 34px; place-items: center; color: var(--ink-soft); background: transparent; border: 1px solid transparent; border-radius: 8px; font: 10px var(--font-body); }
.anime-date-year-grid button:hover, .anime-date-month-grid button:hover { color: var(--accent-strong); background: var(--accent-soft); }
.anime-date-year-grid button.selected, .anime-date-month-grid button.selected { color: var(--accent-strong); background: var(--accent-soft); border-color: color-mix(in srgb,var(--accent) 45%,var(--line)); font-weight: 700; }
.anime-date-weekdays, .anime-date-grid { display: grid; grid-template-columns: repeat(7,minmax(0,1fr)); }
.anime-date-weekdays { margin-bottom: 3px; color: var(--ink-faint); font-size: 9px; font-weight: 700; text-align: center; }
.anime-date-weekdays span { display: grid; height: 24px; place-items: center; }
.anime-date-cell { display: grid; height: 32px; place-items: center; }
.anime-date-cell button { display: grid; width: 29px; height: 29px; place-items: center; color: var(--ink-soft); background: transparent; border: 1px solid transparent; border-radius: 8px; font: 10px var(--font-body); }
.anime-date-cell button:hover { color: var(--accent-strong); background: var(--accent-soft); }
.anime-date-cell button.today { color: var(--accent-strong); border-color: color-mix(in srgb,var(--accent) 40%,var(--line)); font-weight: 700; }
.anime-date-cell button.selected { color: #fff; background: linear-gradient(135deg,var(--accent),var(--accent-strong)); box-shadow: 0 4px 10px color-mix(in srgb,var(--accent) 25%,transparent); }
.anime-date-panel-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 8px; margin-top: 7px; border-top: 1px solid var(--line); }
.anime-date-panel-foot button { padding: 4px 0; color: var(--accent-strong); background: transparent; border: 0; font-size: 9px; font-weight: 700; }
.anime-date-panel-foot span { color: var(--ink-faint); font-size: 8px; }
@keyframes anime-date-in { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: translateY(0); } }
</style>

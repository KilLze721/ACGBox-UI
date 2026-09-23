<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AdminIcon from './AdminIcon.vue'

const props = defineProps<{
  id: string
  modelValue: string
  invalid?: boolean
  describedBy?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const root = ref<HTMLElement | null>(null)
const open = ref(false)
const visibleMonth = ref(getMonthStart(props.modelValue) ?? getMonthStart(toIsoDate(new Date()))!)
const weekdays = ['一', '二', '三', '四', '五', '六', '日']
const monthLabel = computed(() => `${visibleMonth.value.getFullYear()}年${visibleMonth.value.getMonth() + 1}月`)
const calendarDays = computed(() => {
  const firstDay = new Date(visibleMonth.value.getFullYear(), visibleMonth.value.getMonth(), 1)
  const offset = (firstDay.getDay() + 6) % 7
  const dayCount = new Date(visibleMonth.value.getFullYear(), visibleMonth.value.getMonth() + 1, 0).getDate()
  return Array.from({ length: 42 }, (_, index) => {
    const day = index - offset + 1
    return day < 1 || day > dayCount ? null : day
  })
})

watch(
  () => props.modelValue,
  (value) => {
    if (open.value) visibleMonth.value = getMonthStart(value) ?? visibleMonth.value
  },
)

onMounted(() => document.addEventListener('pointerdown', handleOutsidePointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', handleOutsidePointerDown))

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getMonthStart(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime()) || toIsoDate(date) !== value) return null
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function openPicker() {
  visibleMonth.value = getMonthStart(props.modelValue) ?? getMonthStart(toIsoDate(new Date()))!
  open.value = true
}

function changeMonth(offset: number) {
  visibleMonth.value = new Date(
    visibleMonth.value.getFullYear(),
    visibleMonth.value.getMonth() + offset,
    1,
  )
}

function selectDay(day: number) {
  const date = new Date(visibleMonth.value.getFullYear(), visibleMonth.value.getMonth(), day)
  emit('update:modelValue', toIsoDate(date))
  open.value = false
}

function handleOutsidePointerDown(event: PointerEvent) {
  if (open.value && root.value && !root.value.contains(event.target as Node)) open.value = false
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}
</script>

<template>
  <div ref="root" class="anime-date-input" :class="{ open, invalid }" @keydown.esc.stop="handleKeydown">
    <input
      :id="id"
      :value="modelValue"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      placeholder="YYYY-MM-DD"
      :aria-invalid="invalid || undefined"
      :aria-describedby="describedBy"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @focus="openPicker"
      @click="openPicker"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <button
      class="anime-date-trigger"
      type="button"
      aria-label="打开开始放送日期选择器"
      :aria-expanded="open"
      @click="open ? (open = false) : openPicker()"
    >
      <AdminIcon name="calendar" />
    </button>
    <div v-if="open" class="anime-date-panel" role="dialog" aria-label="选择开始放送日期" @pointerdown.prevent>
      <header class="anime-date-panel-head">
        <button type="button" aria-label="上个月" @click="changeMonth(-1)"><AdminIcon name="left" /></button>
        <strong aria-live="polite">{{ monthLabel }}</strong>
        <button type="button" aria-label="下个月" @click="changeMonth(1)"><AdminIcon name="right" /></button>
      </header>
      <div class="anime-date-weekdays" aria-hidden="true">
        <span v-for="weekday in weekdays" :key="weekday">{{ weekday }}</span>
      </div>
      <div class="anime-date-grid" role="grid" :aria-label="monthLabel">
        <span v-for="(day, index) in calendarDays" :key="index" class="anime-date-cell">
          <button
            v-if="day"
            type="button"
            role="gridcell"
            :aria-pressed="modelValue === toIsoDate(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day))"
            :class="{
              selected: modelValue === toIsoDate(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day)),
              today: toIsoDate(new Date()) === toIsoDate(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day)),
            }"
            @click="selectDay(day)"
          >
            {{ day }}
          </button>
        </span>
      </div>
      <footer class="anime-date-panel-foot">
        <button type="button" @click="emit('update:modelValue', ''); open = false">清空日期</button>
        <span>可直接输入 YYYY-MM-DD</span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.anime-date-input { position: relative; display: flex; width: 100%; height: 38px; align-items: center; background: var(--surface-solid); border: 1px solid var(--line); border-radius: 9px; transition: border-color 140ms ease, box-shadow 140ms ease; }
.anime-date-input:hover, .anime-date-input.open { border-color: color-mix(in srgb,var(--accent) 44%,var(--line)); }
.anime-date-input:focus-within { border-color: var(--accent); box-shadow: var(--focus); }
.anime-date-input.invalid { border-color: var(--danger); }
.anime-date-input > input { width: 100%; height: 100%; min-width: 0; padding: 0 8px 0 10px; color: var(--ink); background: transparent; border: 0; outline: 0; font: 10px var(--font-body); }
.anime-date-input > input::placeholder { color: var(--ink-faint); }
.anime-date-trigger { display: grid; width: 34px; height: 32px; flex: 0 0 auto; place-items: center; color: var(--ink-faint); background: transparent; border: 0; border-radius: 7px; }
.anime-date-trigger:hover { color: var(--accent-strong); background: var(--accent-soft); }
.anime-date-trigger svg { width: 15px; height: 15px; }
.anime-date-panel { position: absolute; top: calc(100% + 5px); left: 0; z-index: 150; width: 280px; padding: 11px; color: var(--ink); background: var(--surface-solid); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 14px 34px rgba(37,31,67,.17); animation: anime-date-in 130ms ease both; }
.anime-date-panel-head { display: grid; grid-template-columns: 30px 1fr 30px; align-items: center; gap: 6px; margin-bottom: 9px; }
.anime-date-panel-head strong { color: var(--ink); font-size: 11px; text-align: center; }
.anime-date-panel-head button { display: grid; width: 28px; height: 28px; place-items: center; color: var(--ink-faint); background: var(--surface-muted); border: 1px solid var(--line); border-radius: 8px; }
.anime-date-panel-head button:hover { color: var(--accent-strong); background: var(--accent-soft); border-color: color-mix(in srgb,var(--accent) 35%,var(--line)); }
.anime-date-panel-head svg { width: 13px; height: 13px; }
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

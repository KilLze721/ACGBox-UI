<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  id: string
  label: string
  modelValue: string
  suggestions: string[]
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const root = ref<HTMLElement | null>(null)
const open = ref(false)
const filteredSuggestions = computed(() => {
  const keyword = props.modelValue.trim().toLocaleLowerCase()
  return props.suggestions.filter((suggestion) => !keyword || suggestion.toLocaleLowerCase().includes(keyword))
})

onMounted(() => document.addEventListener('pointerdown', handleOutsidePointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', handleOutsidePointerDown))

function selectSuggestion(value: string) {
  emit('update:modelValue', value)
  open.value = false
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
  if (event.key === 'Enter' && open.value && filteredSuggestions.value.length) {
    event.preventDefault()
    selectSuggestion(filteredSuggestions.value[0]!)
  }
}

function handleOutsidePointerDown(event: PointerEvent) {
  if (open.value && root.value && !root.value.contains(event.target as Node)) open.value = false
}
</script>

<template>
  <div ref="root" class="anime-suggestion-input" :class="{ open }" @keydown="handleKeydown">
    <input
      :id="id"
      :value="modelValue"
      type="text"
      autocomplete="off"
      :placeholder="placeholder || `输入${label}`"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="open"
      :aria-controls="`${id}-suggestions`"
      @focus="open = true"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value); open = true"
    />
    <div v-if="open" :id="`${id}-suggestions`" class="anime-suggestion-menu" role="listbox" :aria-label="`${label}常用选项`">
      <button
        v-for="suggestion in filteredSuggestions"
        :key="suggestion"
        type="button"
        role="option"
        :aria-selected="modelValue === suggestion"
        @mousedown.prevent="selectSuggestion(suggestion)"
      >
        {{ suggestion }}
      </button>
      <span v-if="!filteredSuggestions.length" class="anime-suggestion-empty">可使用自定义内容</span>
    </div>
  </div>
</template>

<style scoped>
.anime-suggestion-input { position: relative; min-width: 0; width: 100%; }
.anime-suggestion-input > input { width: 100%; min-width: 0; height: 38px; padding: 0 10px; color: var(--ink); background: var(--surface-solid); border: 1px solid var(--line); border-radius: 9px; outline: 0; font: 10px var(--font-body); transition: border-color 140ms ease, box-shadow 140ms ease; }
.anime-suggestion-input > input::placeholder { color: var(--ink-faint); }
.anime-suggestion-input > input:hover, .anime-suggestion-input.open > input { border-color: color-mix(in srgb,var(--accent) 40%,var(--line)); }
.anime-suggestion-input > input:focus { border-color: var(--accent); box-shadow: var(--focus); }
.anime-suggestion-menu { position: absolute; top: calc(100% + 4px); right: 0; left: 0; z-index: 160; display: grid; max-height: 200px; gap: 3px; padding: 5px; overflow-y: auto; background: var(--surface-solid); border: 1px solid var(--line); border-radius: 11px; box-shadow: 0 12px 28px rgba(37,31,67,.16); }
.anime-suggestion-menu button { min-height: 30px; padding: 0 9px; color: var(--ink-soft); background: var(--surface-solid); border: 1px solid transparent; border-radius: 7px; font: 600 10px var(--font-body); text-align: left; }
.anime-suggestion-menu button:hover, .anime-suggestion-menu button[aria-selected=true] { color: var(--accent-strong); background: var(--accent-soft); border-color: color-mix(in srgb,var(--accent) 30%,transparent); }
.anime-suggestion-empty { padding: 8px 9px; color: var(--ink-faint); font-size: 9px; }
</style>

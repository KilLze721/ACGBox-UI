<script setup lang="ts">
/**
 * 管理端共用单选下拉框：展示选项名称，通过双向绑定返回对应的选项标识字符串。
 * 支持占位选项、向上或向下展开，以及点击外部或按 Escape 关闭菜单。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { NamedOption } from '@/types/api'

const props = withDefaults(
  defineProps<{
    id: string
    modelValue: string
    options: NamedOption[]
    placeholder: string
    label: string
    placement?: 'top' | 'bottom'
    showPlaceholderOption?: boolean
  }>(),
  {
    placement: 'bottom',
    showPlaceholderOption: true,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const root = ref<HTMLElement>()
const open = ref(false)

const selectedLabel = computed(
  () => props.options.find((option) => String(option.id) === props.modelValue)?.name,
)

onMounted(() => document.addEventListener('pointerdown', handleOutsidePointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', handleOutsidePointerDown))

function handleOutsidePointerDown(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) open.value = false
}

function selectOption(value: string) {
  emit('update:modelValue', value)
  open.value = false
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}
</script>

<template>
  <div
    ref="root"
    class="archive-select"
    :class="{ open, 'placement-top': placement === 'top' }"
    @keydown="handleKeydown"
  >
    <button
      :id="id"
      class="archive-select-trigger"
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      :aria-label="label"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span :class="{ placeholder: !selectedLabel }">{{ selectedLabel || placeholder }}</span>
      <svg class="archive-select-chevron" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m7 10 5 5 5-5" />
      </svg>
    </button>

    <div v-if="open" class="archive-select-menu" role="listbox" :aria-label="`${label}选项`">
      <button
        v-if="showPlaceholderOption"
        class="archive-select-option"
        :class="{ selected: modelValue === '' }"
        type="button"
        role="option"
        :aria-selected="modelValue === ''"
        @click="selectOption('')"
      >
        {{ placeholder }}
      </button>
      <button
        v-for="option in options"
        :key="option.id"
        class="archive-select-option"
        :class="{ selected: modelValue === String(option.id) }"
        type="button"
        role="option"
        :aria-selected="modelValue === String(option.id)"
        @click="selectOption(String(option.id))"
      >
        {{ option.name }}
      </button>
    </div>
  </div>
</template>

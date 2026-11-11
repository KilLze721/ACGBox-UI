<script setup lang="ts">
import { computed } from 'vue'
import bangumiIcon from '@/assets/bangumi.ico'
import bilibiliIcon from '@/assets/bilibili.ico'

const props = defineProps<{ url: string; label?: string | null }>()
const sites = [
  { icon: bangumiIcon, domains: ['bgm.tv', 'bangumi.tv', 'chii.in'] },
  { icon: bilibiliIcon, domains: ['bilibili.com', 'b23.tv'] },
]

const icon = computed(() => {
  try {
    const { hostname, protocol } = new URL(props.url)
    if (protocol !== 'http:' && protocol !== 'https:') return
    return sites.find(({ domains }) =>
      domains.some((domain) => hostname === domain || hostname.endsWith('.' + domain)),
    )?.icon
  } catch {
    return undefined
  }
})

function getExternalLinkLabel(title: string | null) {
  return Array.from(title?.trim().toUpperCase() ?? '')[0] ?? '外'
}
</script>

<template>
  <img v-if="icon" :src="icon" alt="" width="18" height="18" class="external-link-icon" />
  <span v-else-if="label !== undefined">{{ getExternalLinkLabel(label) }}</span>
</template>

<style scoped>
.external-link-icon {
  flex-shrink: 0;
  object-fit: contain;
}
</style>

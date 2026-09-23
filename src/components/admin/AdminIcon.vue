<script setup lang="ts">
defineProps<{
  name: string
}>()
</script>

<template>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <g v-if="name === 'dashboard'">
      <path d="M4 13h6V4H4v9Zm0 7h6v-3H4v3Zm10 0h6v-9h-6v9Zm0-16v3h6V4h-6Z" />
    </g>
    <g v-else-if="name === 'anime'">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="m10 9 5 3-5 3V9ZM7 4l2-2m8 2-2-2" />
    </g>
    <g v-else-if="name === 'series'">
      <path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h3" />
    </g>
    <g v-else-if="name === 'tags'">
      <path d="m20 13-7 7L4 11V4h7l9 9Z" />
      <path d="M8 8h.01" />
    </g>
    <g v-else-if="name === 'companies'">
      <path d="M4 21V8l8-4v17M12 11l8-3v13M8 11v1m0 3v1m8-3v1m0 3v1M2 21h20" />
    </g>
    <g v-else-if="name === 'types'">
      <rect x="3" y="4" width="7" height="7" rx="2" />
      <rect x="14" y="4" width="7" height="7" rx="2" />
      <rect x="3" y="15" width="7" height="6" rx="2" />
      <rect x="14" y="15" width="7" height="6" rx="2" />
    </g>
    <g v-else-if="name === 'broadcast-types'">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m10 9 5 3-5 3V9Z" />
    </g>
    <g v-else-if="name === 'adaptation-types'">
      <path d="M5 4h6a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 1V4Z" />
      <path d="M19 4h-2a3 3 0 0 0-3 3v13h2a3 3 0 0 1 3 1V4Z" />
    </g>
    <g v-else-if="name === 'regions'">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </g>
    <g v-else-if="name === 'settings'">
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"
      />
    </g>
    <path v-else-if="name === 'menu'" d="M4 7h16M4 12h11M4 17h16" />
    <g v-else-if="name === 'sun'">
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
      />
    </g>
    <path v-else-if="name === 'moon'" d="M20 15.2A8 8 0 1 1 8.8 4 6.7 6.7 0 0 0 20 15.2Z" />
    <path v-else-if="name === 'left'" d="m15 18-6-6 6-6" />
    <path v-else-if="name === 'right'" d="m9 18 6-6-6-6" />
    <path v-else-if="name === 'close'" d="m7 7 10 10M17 7 7 17" />
    <g v-else-if="name === 'close-tabs'">
      <path d="M8 7h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
      <path d="M8 7V6a2 2 0 0 1 2-2h7" />
      <path d="m11 11 4 4m0-4-4 4" />
    </g>
    <path v-else-if="name === 'back'" d="m15 18-6-6 6-6" />
    <circle v-else-if="name === 'search'" cx="11" cy="11" r="7" />
    <g v-else-if="name === 'search-full'">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </g>
    <path v-else-if="name === 'filter'" d="M4 7h16M7 12h10M10 17h4" />
    <g v-else-if="name === 'sort-desc'">
      <path d="M4 6h9M4 12h6M4 18h3M18 5v14m-3-3 3 3 3-3" />
    </g>
    <g v-else-if="name === 'sort-asc'">
      <path d="M4 6h3M4 12h6M4 18h9M18 19V5m-3 3 3-3 3 3" />
    </g>
    <g v-else-if="name === 'refresh'">
      <path d="M20 6v5h-5M4 18v-5h5" />
      <path d="M18.5 11A7 7 0 0 0 6 7L4 9m2 4a7 7 0 0 0 12 4l2-2" />
    </g>
    <g v-else-if="name === 'reset'">
      <path d="M4 4v6h6M20 20v-6h-6" />
      <path d="M5.5 15a7 7 0 0 0 11.8 2L20 14M4 10l2.7-3a7 7 0 0 1 11.8 2" />
    </g>
    <g v-else-if="name === 'calendar'">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4m8-4v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </g>
    <path
      v-else-if="name === 'star'"
      d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6-4.4-4.3 6.1-.9L12 3Z"
    />
    <g v-else-if="name === 'view'">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </g>
    <g v-else-if="name === 'edit'">
      <path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" />
      <path d="m14 7 3 3" />
    </g>
    <g v-else-if="name === 'delete'">
      <path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6" />
    </g>
    <g v-else-if="name === 'archive'">
      <rect x="4" y="3" width="16" height="18" rx="3" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </g>
    <g v-else-if="name === 'play'">
      <path d="m9 7 8 5-8 5V7Z" />
      <circle cx="12" cy="12" r="9" />
    </g>
    <g v-else-if="name === 'clock'">
      <path d="M12 7v5l3 2" />
      <circle cx="12" cy="12" r="9" />
    </g>
    <g v-else-if="name === 'check'">
      <path d="m7 12 3 3 7-7" />
      <circle cx="12" cy="12" r="9" />
    </g>
    <path v-else d="M5 12h14M12 5v14" />
  </svg>
</template>

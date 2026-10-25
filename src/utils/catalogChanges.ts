import { onActivated, onBeforeUnmount, onDeactivated, reactive, watch } from 'vue'

type CatalogKind = 'broadcast' | 'adaptation'
const revisions = reactive({ broadcast: 0, adaptation: 0 })

export function notifyCatalogChanged(kind: CatalogKind) {
  revisions[kind] += 1
}

// 活动页面更新选项，缓存页面待激活后再更新；只刷新字典，不回填或重置表单。
export function useCatalogRefresh(kinds: CatalogKind[], refresh: () => Promise<void>) {
  let active = true
  let disposed = false
  let seen = kinds.map((kind) => revisions[kind])
  let request: Promise<void> | undefined
  const changed = () => kinds.some((kind, index) => revisions[kind] !== seen[index])

  function reload(): Promise<void> {
    if (request) return request
    request = (async () => {
      do {
        seen = kinds.map((kind) => revisions[kind])
        await refresh()
      } while (active && !disposed && changed())
    })().finally(() => {
      request = undefined
    })
    return request
  }

  watch(
    () => kinds.map((kind) => revisions[kind]),
    () => {
      if (active && !disposed && changed()) void reload()
    },
  )
  onActivated(() => {
    active = true
    if (changed()) void reload()
  })
  onDeactivated(() => {
    active = false
  })
  onBeforeUnmount(() => {
    disposed = true
  })
  return reload
}

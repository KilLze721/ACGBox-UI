import { nextTick, ref } from 'vue'
import type { PageResult } from '@/types/api'

// 在名称搜索结果中按 ID 找到目标页，避免定位到同名的其他档案。
export async function findLinkedPage<T extends { id: number }>(
  pageNum: number,
  read: (pageNum: number) => Promise<PageResult<T>>,
  signal: AbortSignal,
  targetId?: number,
) {
  const first = await read(pageNum)
  if (targetId === undefined || first.rows.some(({ id }) => id === targetId)) return first
  for (let next = pageNum + 1; next <= first.pages && !signal.aborted; next += 1) {
    const page = await read(next)
    if (page.rows.some(({ id }) => id === targetId)) return page
  }
  return first
}

// 使用当前列表实例查找元素，避免切换工作区标签后滚动到其他页面。
export function useLinkedListPosition(isActive: () => boolean) {
  const listRoot = ref<HTMLElement>()
  const linkedRowId = ref<number>()
  async function revealLinkedRow(id: number) {
    await nextTick()
    if (!isActive()) return
    const row = listRoot.value?.querySelector<HTMLElement>(`[data-work-row="${id}"]`)
    if (!row) return
    linkedRowId.value = id
    row.scrollIntoView?.({ behavior: 'instant', block: 'center', inline: 'nearest' })
  }
  return { listRoot, linkedRowId, revealLinkedRow }
}

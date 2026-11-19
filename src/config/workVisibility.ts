import type { NamedOption } from '@/types/api'

// 下拉框沿用字符串标识，查询时再转换为布尔值，空值表示全部作品。
export const workVisibilityOptions: NamedOption[] = [
  { id: 1, name: '公开' },
  { id: 0, name: '隐藏' },
]

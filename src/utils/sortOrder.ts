// 与 PostgreSQL integer 的范围一致，排序允许负数，但不接受小数或空值。
export function parseSortOrder(value: string): number | null {
  const text = value.trim()
  const number = Number(text)
  return /^-?\d+$/.test(text) && number >= -2147483648 && number <= 2147483647 ? number : null
}

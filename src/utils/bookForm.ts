// 书籍表单只在格式校验通过后转换数值，明确区分零与未知值。
export function parseBookInteger(value: string, min = 0, max = 2147483647): number | null {
  const text = value.trim()
  const number = Number(text)
  return /^-?\d+$/.test(text) && Number.isInteger(number) && number >= min && number <= max
    ? number
    : null
}
export function isBookReference(value: string | number) {
  const number = typeof value === 'string' ? parseBookInteger(value, 1) : value
  return number !== null && Number.isInteger(number) && number > 0 && number <= 2147483647
}

// 筛选允许年、年月或完整日期；只用于查询边界，不用于补齐书籍录入日期。
export function parseBookDateFilter(value: string) {
  const match = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1]),
    month = match[2] === undefined ? null : Number(match[2]),
    day = match[3] === undefined ? null : Number(match[3])
  if (year < 1 || (month !== null && (month < 1 || month > 12))) return null
  const days = (m: number) =>
    m === 2
      ? year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
        ? 29
        : 28
      : [4, 6, 9, 11].includes(m)
        ? 30
        : 31
  if (day !== null && (day < 1 || day > days(month!))) return null
  const format = (m: number, d: number) =>
    `${String(year).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return {
    normalized: `${match[1]}${month === null ? '' : `-${String(month).padStart(2, '0')}`}${day === null ? '' : `-${String(day).padStart(2, '0')}`}`,
    lower: format(month ?? 1, day ?? 1),
    upper: format(month ?? 12, day ?? days(month ?? 12)),
  }
}

export const ARCHIVE_YEAR_MIN = 1000
export const ARCHIVE_YEAR_MAX = 9999

export interface ArchiveDateValue {
  year: number
  month: number | null
  normalized: string
}

export interface ArchiveDateValidation {
  value: ArchiveDateValue | null
  error: string
}

export function validateArchiveDate(value: string): ArchiveDateValidation {
  const trimmedValue = value.trim()
  if (!trimmedValue) return { value: null, error: '' }

  const yearOnlyMatch = trimmedValue.match(/^(\d{4})$/)
  const yearMonthMatch = trimmedValue.match(/^(\d{4})-(\d{1,2})$/)

  if (!yearOnlyMatch && !yearMonthMatch) {
    return { value: null, error: '日期格式不正确，请输入 YYYY 或 YYYY-MM。' }
  }

  const year = Number((yearOnlyMatch ?? yearMonthMatch)?.[1])
  if (year < ARCHIVE_YEAR_MIN || year > ARCHIVE_YEAR_MAX) {
    return {
      value: null,
      error: `年份必须是 ${ARCHIVE_YEAR_MIN} 至 ${ARCHIVE_YEAR_MAX} 之间的四位正整数。`,
    }
  }

  if (yearOnlyMatch) {
    return {
      value: { year, month: null, normalized: String(year) },
      error: '',
    }
  }

  const month = Number(yearMonthMatch?.[2])
  if (month === 0) {
    return { value: null, error: '月份必须在 1 至 12 之间。' }
  }
  if (month > 12) {
    return { value: null, error: '月份不能超过 12。' }
  }

  return {
    value: {
      year,
      month,
      normalized: `${year}-${String(month).padStart(2, '0')}`,
    },
    error: '',
  }
}

export function getArchiveDateBound(value: ArchiveDateValue, isEnd: boolean) {
  const month = value.month ?? (isEnd ? 12 : 1)
  return value.year * 12 + month
}

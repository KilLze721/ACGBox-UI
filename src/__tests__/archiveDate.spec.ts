import { describe, expect, it } from 'vitest'
import { getArchiveDateBound, validateArchiveDate } from '@/utils/archiveDate'

describe('动画放送日期校验', () => {
  it('保留年份精度并规范化未补零月份', () => {
    expect(validateArchiveDate('2026').value?.normalized).toBe('2026')
    expect(validateArchiveDate('2026-9').value?.normalized).toBe('2026-09')
    expect(validateArchiveDate('2026-09').value?.normalized).toBe('2026-09')
  })

  it('为不同无效输入返回明确提示', () => {
    expect(validateArchiveDate('2026-13').error).toBe('月份不能超过 12。')
    expect(validateArchiveDate('2026-00').error).toBe('月份必须在 1 至 12 之间。')
    expect(validateArchiveDate('2026-abc').error).toBe('日期格式不正确，请输入 YYYY 或 YYYY-MM。')
    expect(validateArchiveDate('0000').error).toContain('四位正整数')
  })

  it('按开始一月和结束十二月比较仅年份范围', () => {
    const start = validateArchiveDate('2020').value
    const end = validateArchiveDate('2020').value
    expect(start).not.toBeNull()
    expect(end).not.toBeNull()
    expect(getArchiveDateBound(start!, false)).toBeLessThan(getArchiveDateBound(end!, true))
  })
})

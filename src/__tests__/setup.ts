import { afterEach, beforeEach } from 'vitest'
import { clearLogin } from '@/utils/auth'

beforeEach(() => {
  // 现有业务页面测试默认处于已登录状态；认证测试会显式清理或替换此令牌。
  clearLogin()
  sessionStorage.setItem('acgbox-token', 'test-admin-token')
})

afterEach(() => clearLogin())

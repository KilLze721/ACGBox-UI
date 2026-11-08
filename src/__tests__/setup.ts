import { afterEach, beforeEach } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'
import { clearLogin } from '@/utils/auth'

// 断言失败时也卸载组件，避免路由监听、弹窗和滚动锁影响后续用例。
enableAutoUnmount(afterEach)

beforeEach(() => {
  // 现有业务页面测试默认处于已登录状态；认证测试会显式清理或替换此令牌。
  clearLogin()
  sessionStorage.setItem('acgbox-token', 'test-admin-token')
})

afterEach(() => clearLogin())

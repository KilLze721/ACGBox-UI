# ACGBox-UI

ACGBox 管理端采用 Vue 3、TypeScript、Vue Router 和 Vite，提供动画、书籍、资料目录、账号和个人偏好的管理界面。

## 本地开发

使用 Node.js 20.x（至少 20.19.0）或 22.12.0 及以上版本。在前端仓库根目录安装依赖并启动开发服务。

```sh
npm ci
npm run dev
```

打开终端显示的地址，从 `/login` 登录。Vite 默认将 `/api` 请求转发到 `http://localhost:8080` 并移除前缀。需要自定义 API 基地址时，使用 `VITE_API_BASE_URL`。后端配置和启动步骤见 [后端 README](../ACGBox/README.md)。

| 命令 | 用途 |
| --- | --- |
| `npm run build` | 执行 TypeScript 检查并生成生产构建 |
| `npm run test:unit -- --run` | 运行一次 Vitest 测试 |
| `npm run lint` | 执行 Oxlint 和 ESLint 并自动修复 |

## 源码入口

- `src/router/index.ts` 定义登录、后台路由和权限检查，`src/layouts/AdminLayout.vue` 管理菜单和工作区标签。
- `src/views/admin/` 按业务组织页面，`src/components/admin/` 存放共用控件。
- `src/api/http.ts` 提供 API 请求封装，`src/utils/auth.ts` 管理登录状态，`src/utils/preferences.ts` 管理本地偏好。

## 资料名称排序

公司、人物、系列和标签管理默认按名称首字母 A–Z 排列。列表可切换到 Z–A，切换时保留已应用的搜索条件并返回第一页。
新增和修改动画、书籍时，人员、公司、系列及标签选择器按 A–Z 读取选项。两种方向都由后端先排序再分页，`#` 分组排在末尾。
动画和书籍列表按接口返回的 A–Z 顺序展示标签，`#` 分组排在末尾。已保存的人员、公司与职责顺序沿用原有规则。

## 服务连接检测

设置页“系统信息”调用 `GET /admin/system/health`，仅 ADMIN 查询，EDITOR 显示权限提示。
数据库、Redis、SMTP 分别展示 UP、DOWN、DISABLED、UNCONFIGURED、NOT_CHECKED 对应的状态，检测时间来自后端；请求失败只显示无法获取结果，不将各依赖标记为故障。
首次进入时获取，可用刷新按钮再次请求；后端检测期限为 10 秒，结果缓存 30 秒，前端十五秒超时，离开页面会取消请求，检测不会保存或修改个人偏好。
SMTP 检测只验证连接、不发送邮件。后端 JWT 认证依赖数据库，数据库不可用时可能无法获得检测结果，也不会绕过认证。
实际连通性应在部署环境验证，自动化测试使用模拟依赖或响应。详见 [服务连接检测接口](../ACGBox/docs/服务连接检测接口.md)。

## 相关文档

- [管理端接口文档](../docs/ACGBox管理端接口文档.md)
- [前端部署说明](docs/CI-CD部署.md)

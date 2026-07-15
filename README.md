# Future Deploy

`future-deploy` 是从自用版 `future.v2` 独立复制出的 Cloudflare 部署版。它保留原有 React/Vite 与 Supabase 同步功能，并把原本依赖本机服务的电台改造成可部署的 Melo AI 电台：

- Cloudflare Workers 同时托管前端静态文件和 `/api/radio/*` API
- Supabase Auth 验证每个请求，数据库 RLS 隔离不同账号
- 每位用户使用自己的 DeepSeek API Key（BYOK）
- Key 只保存在当前标签页的 `sessionStorage`，不写入 Supabase 或 Worker 配置
- 私有曲库使用 Supabase Storage；浏览器负责朗读串词

原目录 `future.v2` 不参与本项目的构建或部署。

## 架构

```text
Browser
  ├─ Supabase Auth / database / private audio storage
  └─ Cloudflare Worker /api/radio/*
       ├─ verifies the Supabase access token
       ├─ reads radio context through the user's JWT + RLS
       └─ forwards the request to DeepSeek with the user's temporary Key
```

Worker 不保存、打印或回传 DeepSeek Key，也不拥有 Supabase `service_role` 密钥。曲目由模型通过受限的 `trackId` 选择，真实私有存储路径只在服务端校验后返回给登录用户。

## 1. 准备 Supabase

复用现有 Supabase 项目与原应用的数据表、登录配置。然后在 Supabase Dashboard → SQL Editor 完整执行：

1. [`supabase/radio.sql`](./supabase/radio.sql)：电台资料、曲目、消息、播放历史、RLS 和私有音频桶
2. [`supabase/delete_user.sql`](./supabase/delete_user.sql)：账号自助删除函数
3. 如需 Web Push，再按 [`supabase/WEB_PUSH_SETUP.md`](./supabase/WEB_PUSH_SETUP.md) 配置

在 Authentication → URL Configuration 中加入生产域名，例如：

```text
https://future-deploy.<your-subdomain>.workers.dev
https://your-domain.example
```

不要把 `service_role` Key 放进浏览器或 Worker。本项目只需要 Supabase Publishable Key（旧项目可继续使用 anon key）。

## 2. 本地开发配置

生产环境会从同源的 `/api/runtime-config.js` 自动取得 Supabase 公开配置，不需要在 Cloudflare 重复设置 `VITE_SUPABASE_*`。仅在脱离 Worker 单独运行 Vite 时，才需要复制 `.env.example` 为 `.env.local`：

```dotenv
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR-SUPABASE-PUBLISHABLE-OR-ANON-KEY
VITE_VAPID_PUBLIC_KEY=
VITE_SENTRY_DSN=
```

所有 `VITE_*` 值都会进入浏览器产物，因此这里只能放公开配置。DeepSeek Key、Supabase `service_role` Key 或 Cloudflare Token 绝不能放在这里。

## 3. Worker 本地配置

复制 `.dev.vars.example` 为 `.dev.vars`：

```dotenv
SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR-SUPABASE-PUBLISHABLE-OR-ANON-KEY
```

安装与验证：

```powershell
npm install
npm run check
```

本地联调需要两个终端：

```powershell
# 终端 1：Cloudflare Worker（端口 8787）
npm run dev:worker

# 终端 2：Vite（把 /api 转发到 Worker）
npm run dev
```

打开 `http://localhost:5173`。登录后进入 Melo 设置，输入自己的 DeepSeek Key、保存偏好并上传音频。Key 在关闭标签页或退出登录后会清除。

## 4. 部署到现有 Cloudflare Worker

线上 Worker 名称固定为 `future-planner`，现有地址为：

```text
https://future-planner.claowennie.workers.dev
```

推荐把仓库连接到现有 Worker：Cloudflare Dashboard → Workers & Pages → future-planner → Settings → Builds → Connect。构建设置：

```text
Production branch: main
Build command: npm run build
Deploy command: npm run deploy:cloudflare
Root directory: /（仓库根目录就是本项目时也可留空）
```

Node 版本由仓库根目录的 `.nvmrc` 固定为 22，不必再添加 `NODE_VERSION`。不使用 Web Push 或 Sentry 时，也不需要任何 Build variables。

现有 future-planner 是纯静态资源 Worker 时，Cloudflare 会禁止在 Worker 设置中添加运行变量。请改在 GitHub Builds 配置页的 Build variables and secrets 中添加以下两项，并把类型选为 Secret：

```text
SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR-SUPABASE-PUBLISHABLE-OR-ANON-KEY
```

`deploy:cloudflare` 会在构建环境的临时目录中生成仅供 Wrangler 使用的 Secrets 文件，把两项配置随 Worker 代码一起部署，并立即删除临时文件。值不会进入仓库、网页 bundle 或构建日志。前端和 Worker 会共享这两个公开配置，但不会保存 DeepSeek Key。

如需使用命令行而非 GitHub Builds，可执行：

```powershell
npm run build
npx wrangler deploy --secrets-file .env.worker
```

`wrangler.jsonc` 已配置：

- Worker Static Assets 与 SPA fallback
- `/api/*` 优先进入 Worker
- 每账号/路由每分钟 20 次电台请求
- 10% Worker 可观测性采样

不要设置全站缓存规则覆盖 `/api/*`；API 和运行配置响应都带有 `Cache-Control: no-store`。

## 电台 API

```text
GET  /api/radio/health
POST /api/radio/key/test
POST /api/radio/chat
```

两个 POST 接口都要求：

- `Authorization: Bearer <Supabase access token>`
- `X-DeepSeek-Key: <the current user's key>`
- 与站点同源的浏览器请求

生产默认模型是 `deepseek-v4-flash`，可选择 `deepseek-v4-pro`。旧的 `deepseek-chat` / `deepseek-reasoner` 不在允许列表中。

## 安全与运维检查

- 不提交 `.env.local`、`.dev.vars`、音频、Cookie 或任何 API Key
- Supabase `radio.sql` 运行后，用两个普通账号确认曲目与记录互相不可见
- 在 Cloudflare 日志中不要新增请求头或请求正文日志
- 自定义域名启用 HTTPS；保留 `public/_headers` 的 CSP 与安全头
- Sentry 是可选的；未设置 `VITE_SENTRY_DSN` 时完全禁用
- DeepSeek 费用和限额归 Key 所有者，Cloudflare 侧限流只用于防止误刷与滥用

## 与自用版的差异

部署版不包含 Claude CLI、Express 中枢、Python TTS、本机音乐目录、网易云 Cookie、QQ 音乐登录态或本地配置文件。语音使用浏览器 `speechSynthesis`；音乐只来自当前登录账号的 Supabase 私有曲库。

## License

见 [`LICENSE`](./LICENSE)。

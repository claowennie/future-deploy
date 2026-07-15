# Web Push 部署指南（future-deploy）

Web Push 是可选功能，用于 App 关闭后发送习惯提醒和周回顾。本地通知与 Melo 电台都不依赖它。

## 1. 生成 VAPID 密钥

```bash
npx web-push generate-vapid-keys --json
```

- 公钥放进 Cloudflare 构建变量 `VITE_VAPID_PUBLIC_KEY`，可以公开。
- 私钥只放进 Supabase Secret `VAPID_PRIVATE_KEY`，绝不能进入前端、Git 或日志。

更换密钥后必须重新构建前端，用户也需要重新开启远程推送。

## 2. 建表与 RLS

在 Supabase Dashboard → SQL Editor 执行 [`push_subscriptions.sql`](./push_subscriptions.sql)。

## 3. 配置 Supabase Edge Function

在 Edge Functions → Secrets 添加：

| Name | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | 上一步生成的公钥 |
| `VAPID_PRIVATE_KEY` | 上一步生成的私钥 |
| `VAPID_SUBJECT` | `mailto:<你的联系邮箱>` |
| `CRON_SECRET` | 独立生成的长随机字符串 |

`SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 由 Supabase 平台自动注入，不需要手工填写。

CLI 配置示例：

```bash
supabase secrets set VAPID_PUBLIC_KEY="<VAPID_PUBLIC_KEY>" \
  VAPID_PRIVATE_KEY="<VAPID_PRIVATE_KEY>" \
  VAPID_SUBJECT="mailto:<你的联系邮箱>" \
  CRON_SECRET="<CRON_SECRET>"
```

函数代码位于 [`functions/send-push/index.ts`](./functions/send-push/index.ts)：

```bash
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>
supabase functions deploy send-push --no-verify-jwt
```

函数使用 `x-cron-secret` 自行鉴权，因此这里使用 `--no-verify-jwt`。

## 4. 设置定时调用

在 SQL Editor 执行以下模板，先替换三个占位符：

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-push-every-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '<YOUR_SUPABASE_PUBLISHABLE_KEY>',
      'Authorization', 'Bearer <YOUR_SUPABASE_PUBLISHABLE_KEY>',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

如需重建任务：

```sql
select cron.unschedule('send-push-every-15min');
```

## 5. 验证

1. 设置 `VITE_VAPID_PUBLIC_KEY` 后重新执行 `npm run build` 并部署。
2. 通过 HTTPS 打开站点，登录后在设置中开启远程推送并允许通知。
3. 手工触发函数：

```bash
curl -X POST 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/send-push' \
  -H 'x-cron-secret: <CRON_SECRET>'
```

成功时返回 `{ "ok": true, "total": ..., "sent": ..., "gone": ... }`。

## 注意事项

- iOS 需要 Safari 16.4+，并把站点添加到主屏幕后以 PWA 方式运行。
- 没有 Google 服务的部分 Android 设备可能无法稳定接收 Web Push。
- Web Push 只在 HTTPS 或 localhost 安全上下文中可用。
- `VAPID_PRIVATE_KEY`、`CRON_SECRET` 与 `service_role` Key 只能存在 Supabase Secrets 中。
- 失效订阅返回 404/410 时，函数会删除对应记录。

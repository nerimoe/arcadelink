# 最佳实践检查记录

本检查基于两份本地 skill：

- `react-best-practices`
- `workers-best-practices`

并参考 Cloudflare Workers 官方最佳实践文档。Cloudflare 文档要求新项目维护当前兼容日期、启用需要的兼容标志、使用 `wrangler types` 生成绑定类型、用 secrets 保存敏感配置，并建议启用 observability。

## React 检查

已处理：

- 将 `/cards`、`/merchant`、`/admin`、`/m/:publicId` 改为 `React.lazy` route，降低首屏 bundle 压力。
- 将 Leaflet 地图依赖限制在店家后台 chunk 内，普通玩家路径不会加载地图代码。
- 店家后台独立加载店铺、成员、设备和登录记录，并对独立请求使用 `Promise.all` 并行。
- 用户/店家可见文案不展示实现细节。

仍可后续优化：

- 引入 SWR 或 TanStack Query，统一缓存、去重和错误重试。
- 将店家后台继续拆成更小的文件，以便后续维护和 chunk 命名更清晰。
- 增加 Playwright 覆盖移动端扫码流程和后台管理流程。

## Cloudflare Workers 检查

已处理：

- 使用 `wrangler types` 生成 `apps/worker/worker-configuration.d.ts`。
- 移除手写基础 binding 形状，`Env` 改为扩展 `Cloudflare.Env` 并只补充 secrets。
- 移除 `@cloudflare/workers-types`，改用 Wrangler 生成的运行时类型。
- 保留 `nodejs_compat`，并增加 `@types/node`。
- 配置迁移到 `wrangler.jsonc`。
- `wrangler.jsonc` 启用 observability。
- 继续使用 D1/KV 绑定，不在 Worker 内调用 Cloudflare REST API。
- token 和加密使用 WebCrypto，不使用 `Math.random()`。
- 外部机台请求显式 `await`，没有 floating promise。

仍可后续优化：

- 生产环境将 `head_sampling_rate` 调整到合适比例。
- 对机台发送结果增加结构化日志字段，便于 Workers Logs 查询。
- 使用 Cloudflare Queues 把非关键日志/通知移出用户登录关键路径。
- 对 D1 访问增加更完整的集成测试。

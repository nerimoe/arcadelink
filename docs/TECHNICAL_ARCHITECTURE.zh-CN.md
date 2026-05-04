# ArcadeLink 技术架构与实现说明

本文档记录当前 ArcadeLink MVP 的技术细节，供后续开发、部署、交接和架构调整使用。

## 1. 项目目标

ArcadeLink 是一个面向游戏厅/音游店的纯 Web 机台登录平台。

核心流程：

1. 店家在每台机台张贴一个二维码，二维码指向 ArcadeLink 的机台登录页。
2. 玩家扫码后进入对应机台页面。
3. 玩家注册/登录平台账号，并选择自己已绑定的卡片。
4. 浏览器请求用户位置，服务端验证用户是否在店铺范围内。
5. 服务端向该机台配置的 HINATA IO 地址发送卡片信息。

重要原则：

- 机台连接地址不暴露给前端。
- 玩家页面不展示店铺管理入口。
- 店家后台只允许 `merchant` / `admin` 角色访问。
- 前端页面文案面向玩家和店家，不暴露实现细节。

## 2. 技术栈

项目是 `pnpm` monorepo：

- 根目录：workspace、TypeScript 基础配置、统一脚本。
- `apps/web`：玩家端与店家后台前端。
- `apps/worker`：Cloudflare Worker API。

前端：

- React
- Vite
- TypeScript
- Tailwind CSS
- lucide-react
- qrcode.react
- Leaflet + react-leaflet

后端：

- Cloudflare Workers
- Hono
- Cloudflare D1
- Cloudflare KV
- Cloudflare Turnstile
- WebCrypto
- Zod

目标部署方式：

- 前端静态资源部署到 Cloudflare Pages 或等价静态托管。
- `/api/*` 请求转发到 Worker。
- Worker 使用 D1 存储关系数据，KV 存短期限速计数。

## 3. 目录结构

```text
.
├── apps
│   ├── web
│   │   ├── src
│   │   │   ├── api.ts
│   │   │   ├── styles.css
│   │   │   └── ui
│   │   ├── package.json
│   │   └── vite.config.ts
│   └── worker
│       ├── migrations
│       │   └── 0001_initial.sql
│       ├── src
│       │   ├── auth.ts
│       │   ├── crypto.ts
│       │   ├── db.ts
│       │   ├── geo.ts
│       │   ├── hinata.ts
│       │   ├── http.ts
│       │   ├── index.ts
│       │   ├── risk.ts
│       │   ├── types.ts
│       │   └── validators.ts
│       ├── test
│       ├── package.json
│       └── wrangler.jsonc
├── docs
│   └── TECHNICAL_ARCHITECTURE.zh-CN.md
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## 4. 前端实现

### 4.1 路由

当前路由定义在 `apps/web/src/ui/App.tsx`：

- `/`：首页。
- `/login`：登录。
- `/register`：注册。
- `/cards`：玩家卡片管理。
- `/merchant`：店家后台。
- `/merchant/shops/:id`：店家后台兼容路由。
- `/admin`：平台管理员后台。
- `/m/:publicId`：玩家扫码后的机台登录页。

### 4.2 玩家页面

玩家相关页面：

- `MachineLoginPage.tsx`
- `CardsPage.tsx`
- `AuthPage.tsx`

机台登录页行为：

1. 根据 URL 中的 `publicId` 请求 `GET /api/machines/:publicId`。
2. 未登录时显示登录/注册入口，并通过 `next` 参数保留扫码后的目标页。
3. 已登录时加载用户卡片。
4. 用户点击“登录机台”后调用浏览器 Geolocation。
5. 前端提交 `cardId`、`lat`、`lng`、`accuracy` 给后端。

注意：

- 前端不会拿到机台真实连接地址。
- 前端只展示店铺名和机台名。
- 玩家页面不会显示店家后台入口。

### 4.3 店家后台

店家后台页面：

- `MerchantPage.tsx`
- `MerchantOnly.tsx`
- `MapPicker.tsx`

访问控制：

- `MerchantOnly` 包装店家后台。
- 未登录用户跳转登录。
- 非 `merchant` / `admin` 用户跳转 `/cards`。

功能：

- 创建店铺。
- 通过地图点选店铺位置。
- 手动调整地图坐标输入。
- 设置允许距离。
- 创建机台。
- 编辑机台名称。
- 更新机台连接地址。
- 启用/停用机台。
- 删除机台。
- 管理店铺成员。
- 查看最近机台登录记录。
- 为机台生成玩家登录地址和二维码。

地图实现：

- 使用 Leaflet + OpenStreetMap 瓦片。
- 默认中心点为东京站附近。
- 点击地图后写入经纬度。
- 仅用于店家配置店铺位置，不参与玩家端地图展示。

### 4.4 前端 API 客户端

`apps/web/src/api.ts` 封装所有请求：

- 所有请求默认带 `credentials: "include"`。
- Cookie session 由浏览器自动携带。
- 错误响应会转成 `Error` 抛出。

## 5. Worker API

Worker 入口在 `apps/worker/src/index.ts`。

### 5.1 公共 API

```text
GET  /api/health
GET  /api/me
```

`GET /api/me` 返回：

- 当前登录用户。
- Turnstile site key。

### 5.2 认证 API

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
```

注册：

- 校验邮箱、密码、Turnstile。
- 第一个注册用户自动成为 `admin`。
- 后续用户默认 `user`。
- 创建 HttpOnly session cookie。

登录：

- 校验邮箱、密码、Turnstile。
- 校验账号是否被封禁。
- 创建新的 session。

退出：

- 删除当前 session。
- 清理 cookie。

### 5.3 管理员 API

```text
GET  /api/admin/users
POST /api/admin/users/role
GET  /api/admin/bans
POST /api/admin/bans
DELETE /api/admin/bans/:id
```

用途：

- 查询平台用户。
- `admin` 将用户设置为 `user` / `merchant` / `admin`。
- 创建和移除封禁记录。

请求体：

```json
{
  "email": "owner@example.com",
  "role": "merchant"
}
```

### 5.4 卡片 API

```text
GET    /api/cards
POST   /api/cards
PATCH  /api/cards/:id
DELETE /api/cards/:id
```

当前只支持手动添加 Aime 风格卡片号码：

- `card_type = "aime"`
- `source = "manual"`
- `access_code` 必须是 20 位数字。

前端文案中不强调 “20 位” 和 “Aime”，但后端仍按该约束校验。

### 5.5 机台公开 API

```text
GET  /api/machines/:publicId
POST /api/machines/:publicId/login
```

`GET /api/machines/:publicId`：

- 返回店铺名、机台名、店铺允许距离。
- 不返回机台连接地址。

`POST /api/machines/:publicId/login`：

请求体：

```json
{
  "cardId": "card_uuid",
  "lat": 35.0,
  "lng": 139.0,
  "accuracy": 40,
  "clientTimestamp": "optional"
}
```

服务端处理：

1. 校验用户登录状态。
2. 校验账号、IP、卡片、机台是否被封禁。
3. 校验机台是否存在并启用。
4. 校验卡片归属当前用户。
5. 执行 KV 限速。
6. 校验用户位置是否在店铺范围内。
7. 解密机台连接地址。
8. 向机台目标地址发送卡片数据。
9. 写入 `machine_login_events`。

### 5.6 店家 API

```text
GET   /api/merchant/shops
POST  /api/merchant/shops
PATCH /api/merchant/shops
PATCH /api/merchant/shops/:id
GET    /api/merchant/shop-members?shopId=...
POST   /api/merchant/shop-members
DELETE /api/merchant/shop-members/:id

GET   /api/merchant/machines?shopId=...
POST  /api/merchant/machines
PATCH /api/merchant/machines
PATCH /api/merchant/machines/:id
DELETE /api/merchant/machines/:id

GET /api/merchant/login-events?shopId=...
```

访问控制：

- `merchant` 和 `admin` 可访问。
- `admin` 可访问所有店铺。
- `merchant` 只能访问自己在 `shop_members` 中拥有权限的店铺。

## 6. 数据库设计

数据库为 Cloudflare D1。

Migration 文件：

```text
apps/worker/migrations/0001_initial.sql
```

### 6.1 users

用户表。

关键字段：

- `email`
- `password_hash`
- `role`
- `banned_at`

角色：

- `user`
- `merchant`
- `admin`

### 6.2 sessions

登录会话表。

关键字段：

- `user_id`
- `token_hash`
- `expires_at`

设计：

- 浏览器保存原始 session token。
- 数据库只保存 token 的 SHA-256 摘要。
- 默认 session 有效期 30 天。

### 6.3 oauth_accounts

预留给第三方 OAuth 登录。

当前未接入实际 provider。

### 6.4 card_sources

预留给外部平台卡片同步。

当前未接入实际外部 API。

### 6.5 cards

用户卡片表。

关键字段：

- `user_id`
- `label`
- `card_type`
- `access_code`
- `source`
- `disabled_at`

约束：

- 同一用户不能重复添加同一卡片号码。

### 6.6 shops

店铺表。

关键字段：

- `name`
- `latitude`
- `longitude`
- `radius_meters`
- `created_by`

`radius_meters` 默认 80。

### 6.7 shop_members

店铺成员表。

用于控制店家账号可以管理哪些店铺。

### 6.8 machines

机台表。

关键字段：

- `public_id`
- `shop_id`
- `name`
- `hinata_url_encrypted`
- `enabled`

说明：

- `public_id` 用于玩家扫码 URL。
- `hinata_url_encrypted` 是加密后的机台连接地址。
- 真实连接地址不会返回给前端。

### 6.9 machine_login_events

机台登录事件日志。

记录：

- 用户
- 卡片
- 机台
- IP
- 位置信息
- 风控结果
- 发送结果
- 机台响应状态
- 错误信息

用于排查问题、风控和封禁依据。

### 6.10 bans

封禁表。

支持封禁维度：

- `user`
- `ip`
- `card`
- `machine`

## 7. 认证与安全

### 7.1 密码

实现位置：

```text
apps/worker/src/crypto.ts
```

密码哈希：

- PBKDF2-SHA256
- 100000 iterations。Cloudflare Workers WebCrypto 当前不支持高于 100000 的 PBKDF2 iteration。
- 每个密码独立随机 salt

存储格式：

```text
pbkdf2_sha256$100000$salt$hash
```

### 7.2 Session

实现位置：

```text
apps/worker/src/auth.ts
```

设计：

- Cookie 名称：`arcadelink_session`
- HttpOnly
- SameSite=Lax
- HTTPS 下 Secure
- 默认 30 天有效期
- 数据库只保存 token hash

### 7.3 机台连接地址加密

实现位置：

```text
apps/worker/src/crypto.ts
```

算法：

- AES-GCM
- key 来源：`URL_ENCRYPTION_KEY` 经 SHA-256 派生
- 每次加密生成随机 IV

存储格式：

```text
iv:ciphertext
```

### 7.4 Turnstile

实现位置：

- 前端：`apps/web/src/ui/Turnstile.tsx`
- 后端：`apps/worker/src/risk.ts`

使用场景：

- 注册
- 登录

本地开发：

- 使用 Cloudflare dummy key 时，后端会跳过验证。

## 8. 到店校验

实现位置：

```text
apps/worker/src/geo.ts
```

策略：

- 店铺半径限制在 30m 到 200m。
- 默认半径为 80m。
- 用户位置精度必须小于等于 250m。
- 通过条件：

```text
distance <= radius + min(accuracy, 200m) + 30m
```

说明：

- 这是宽松校验，目的是减少室内定位漂移造成的误伤。
- 它不是强身份验证机制。
- 恶意伪造位置主要依赖日志、限速和封禁处理。

## 9. 风控与限速

实现位置：

```text
apps/worker/src/risk.ts
```

KV 限速规则：

- 每用户每分钟最多 5 次机台登录。
- 每机台每分钟最多 20 次机台登录。
- 每 IP 每分钟最多 30 次机台登录。

限速 key：

```text
login:user:{userId}:{minute}
login:machine:{machineId}:{minute}
login:ip:{ip}:{minute}
```

封禁检查：

- 登录机台前检查 `user`、`ip`、`card`、`machine`。
- 命中封禁后拒绝操作。

## 10. HINATA IO 发送

实现位置：

```text
apps/worker/src/hinata.ts
```

当前发送格式：

```json
{
  "type": "aime",
  "value": "12345678901234567890"
}
```

发送方式：

- Worker 使用 `fetch` 向机台配置的目标地址 POST JSON。
- 请求超时为 10 秒。
- 前端不直接请求该地址。

当前限制：

- 首版只支持手动绑定的 Aime 风格卡片号码。
- Amusement IC、FeliCa、Banapass 等完整类型化数据留给后续外部卡源或读卡器接入。

## 11. Cloudflare 配置

Worker 配置文件：

```text
apps/worker/wrangler.jsonc
```

Bindings：

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "arcadelink",
    "database_id": "replace-with-cloudflare-d1-id"
  }
],
"kv_namespaces": [
  {
    "binding": "RATE_LIMIT",
    "id": "replace-with-cloudflare-kv-id"
  }
]
```

环境变量：

```jsonc
"vars": {
  "APP_ORIGIN": "http://localhost:5173",
  "TURNSTILE_SITE_KEY": "1x00000000000000000000AA"
}
```

Secrets：

```text
SESSION_SECRET
URL_ENCRYPTION_KEY
TURNSTILE_SECRET_KEY
```

本地示例：

```text
apps/worker/.dev.vars.example
```

## 12. 本地开发

当前机器没有全局 `pnpm` / `corepack` 时，可以使用：

```sh
npx pnpm@9.15.4 install
```

应用本地 D1 migration：

```sh
npx pnpm@9.15.4 --filter @arcadelink/worker db:migrate:local
```

启动 Worker：

```sh
SESSION_SECRET=dev-session-secret-change-me \
URL_ENCRYPTION_KEY=dev-url-encryption-key-change-me \
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA \
npx pnpm@9.15.4 --filter @arcadelink/worker dev
```

启动前端：

```sh
npx pnpm@9.15.4 --filter @arcadelink/web dev
```

默认地址：

- Web：`http://localhost:5173`
- Worker：`http://localhost:8787`

Vite 开发服务器会把 `/api` 代理到 `http://localhost:8787`。

## 13. 测试与构建

类型检查：

```sh
npx pnpm@9.15.4 typecheck
```

测试：

```sh
npx pnpm@9.15.4 test
```

构建：

```sh
npx pnpm@9.15.4 build
```

当前测试覆盖：

- 地理位置距离与范围策略。
- 密码哈希与机台地址加密。
- HINATA payload 发送格式。
- Web 测试脚手架。

## 14. 已知设计取舍

### 14.1 不做浏览器历史隐藏跳转

曾讨论过二维码先进入短跳转地址，再跳到玩家页面，以减少浏览器历史里留下机台 URL。

当前决定不实现：

- 机台二维码本来是公开张贴内容。
- 真正敏感的机台连接地址已经只保存在后端。
- 引入一次性 intent token 会增加复杂度，但首版收益有限。

### 14.2 不做 Web Bluetooth 到店验证

iOS Safari 不支持 Web Bluetooth，因此首版不做 BLE 到店验证。

当前使用：

- 浏览器位置确认。
- 服务端限速。
- 登录事件日志。
- 封禁机制。

### 14.3 玩家端不展示店铺管理

普通用户：

- 只看到卡片管理和扫码登录页面。
- 直接访问 `/merchant` 会被重定向。

店家/管理员：

- 登录后导航中显示店家入口。

## 15. 后续扩展建议

已完成的高优先级项目：

1. 管理员 UI，用于授权店家账号。
2. 店铺成员管理。
3. 机台编辑/停用/删除 UI。
4. 登录事件查询 UI。
5. 封禁管理 UI。

工程最佳实践已同步：

1. 前端页面使用 lazy route，避免把店家后台、管理员后台和地图依赖打进首屏主路径。
2. Worker 使用 `wrangler types` 生成运行时类型，并在 `tsconfig` 中纳入 `worker-configuration.d.ts`。
3. Worker 配置启用 observability。

中期扩展：

1. 接入 OAuth 登录。
2. 接入外部平台 API 同步卡片。
3. 支持更多卡片类型和发送 payload。
4. 增加店铺多门店/品牌组织模型。
5. 增加生产部署说明和 Cloudflare Pages/Workers 路由配置模板。

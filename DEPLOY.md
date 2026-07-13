# 答岸 · 部署与上线指南

> 目标：把 `答岸` 这个 Node + Express + SQLite 全栈试卷分享站部署到公网，并绑定一个免费域名。

---

## 一、技术栈与运行方式（已在本机验证通过）

- **运行时**：Node 22（用到内置 `node:sqlite`，启动必须带 `--experimental-sqlite`）
- **架构**：单体应用。Express 同时托管 `public/` 前端 和 `/api/*` 后端
- **本地运行**：
  ```bash
  npm install
  npm run seed     # 可选：灌入 14 张示例试卷
  npm start        # 监听 process.env.PORT || 3000
  ```
- **数据库**：`server/data/daan.db`（SQLite 文件，首次启动自动建表；已被 .gitignore 忽略）
- **已验证**：`GET /api/health` 返回 `{"ok":true}`，`GET /api/papers` 正常返回试卷数据 ✅

---

## 二、两个绕不开的前提

1. **后端要常驻运行 → 不能用纯静态托管**（GitHub Pages / Netlify 静态都不行）。
   必须跑在能运行 Node 的平台上（容器 / PaaS / VPS）。
2. **域名（DNS）必须指向"一个对外可访问的地址"**，这个地址可以是：
   - 平台给你的 URL（如 `xxx.onrender.com`）→ 用 **CNAME** 记录
   - 你服务器的固定公网 IP → 用 **A** 记录

   **域名本身不能独立存在**，所以"先部署拿到地址、再绑域名"是正确顺序。

---

## 三、部署方案对比

| 方案 | 花费 | 数据库持久化 | 自定义域名 | 适合阶段 |
|------|------|--------------|------------|----------|
| **Render 免费** | 免费 | ❌ 重启/休眠清空 | ✅ | 演示、验证想法 |
| **Railway** | 免费额度 $5 | 有限 | ✅ | 短期试水 |
| **Fly.io** | 免费含持久卷 | ✅ 卷持久 | ✅ | 想免费又保数据 |
| **VPS 轻量云** | ¥50+/月 | ✅ | ✅ | 正式上线、以后收费 |

> ⚠️ **SQLite 持久化警告**：Render / Railway 免费层文件系统是临时的，服务休眠或重新部署后
> `server/data/daan.db` 会被清空，用户和试卷数据会丢失。要正经存数据，请用 Fly.io 持久卷、
> VPS，或把数据库换成托管 SQLite（Turso / libSQL）。

本目录已为你生成：`render.yaml`、`Dockerfile`、`.dockerignore`、`railway.json`。

---

## 四、方式一：Render（最简单、免费）✅ 推荐先跑通

1. 把本目录推到 GitHub 仓库（`.env`、`node_modules`、`server/data` 已被忽略，不会泄露）。
2. Render 控制台 → **New** → **Blueprint** → 连接仓库 → 选择本目录的 `render.yaml` → 部署。
   （或手动建 Web Service：Build `npm install`、Start `npm start`、Node 22、`JWT_SECRET` 随机长串）
3. 部署完成得到 `https://daan.onrender.com`（示例地址）。
4. 想绑自己的域名：Render 服务 Settings → Custom Domains 里按提示加 CNAME。

---

## 五、方式二：Fly.io（免费且数据库持久）

1. 安装 `flyctl`，`fly launch`（会自动读 `Dockerfile`）。
2. 建持久卷：`fly volumes create daan_data 1`
3. 在生成的 `fly.toml` 里把卷挂到 `/app/server/data`。
4. `fly deploy` → 得到 `https://daan.fly.dev`。

---

## 六、方式三：VPS 轻量云（正式上线、以后收费最稳）

- 买轻量云（腾讯云 / 阿里云 / 雨云等），装 Node 22。
- `git clone` 代码 → `npm install && npm run seed` → 用 `pm2` 守护 `npm start`。
- Nginx 反代 `:3000`，`certbot` 配 HTTPS。
- 拿到固定公网 IP → 用 **A 记录** 指向它。

---

## 七、拿到地址后：申领免费域名 + 解析（DigitalPlat FreeDomain）

1. 打开 **dash.domain.digitalplat.org**，注册账号，选后缀（推荐 `.us.kg`，如 `daan.us.kg`）。
2. 按提示把域名的 Nameserver 改成 **Cloudflare** 提供的（注册后 FreeDomain 会给接入方式）。
3. 进 Cloudflare 添加解析记录：
   - 用平台 URL（如 `daan.onrender.com`）：加 **CNAME**，`名称` 填 `@` 或 `www`，`目标` 填平台 URL，开启橙色云代理。
   - 有公网 IP：加 **A 记录**，`名称` `@`，`内容` 填你的 IP。
4. 等 DNS 传播（几分钟到几小时），访问 `daan.us.kg` 即可，Cloudflare 自动签发 HTTPS。

---

## 八、下一步

- 想让我**直接把代码推到 GitHub 并触发 Render 部署** → 请在左侧连接器里连接你的 GitHub 账号（Render 同理）。
- 或你本地按上面步骤操作，哪一步卡住告诉我，我接着帮你。

---

## 九、邮件验证码（Resend）环境变量配置

注册验证码通过 **Resend** 真实发送，不再走演示模式。需在运行环境设置以下变量：

| 变量 | 说明 | 取值示例 |
|------|------|---------|
| `RESEND_API_KEY` | Resend API Key（https://resend.com/api-keys 生成） | `re_xxxxxxxxxxxx` |
| `MAIL_FROM` | 发件人（需在 Resend 验证过的域名，或测试用 `onboarding@resend.dev`） | `答岸 <onboarding@resend.dev>` |
| `DEMO_MODE` | 必须为 `false`（默认即 false）；`true` 仅本地调试、不真发邮件且回显验证码 | `false` |

**Render 配置位置**：服务 → **Settings → Environment** → 添加 Above 三个变量 → **Save Changes** → 触发重新部署。

**验证是否生效**：部署后调用 `POST /api/auth/send-code` 传一个真实邮箱，去邮箱查收 6 位验证码；服务端日志出现 `[mailer] 验证码已发送至 xxx`。

**未配置 `RESEND_API_KEY` 时**：自动降级为控制台打印验证码（不阻断注册流程），便于本地无 Key 调试；生产务必配置真实 Key。

**发送失败的容错**：若 Resend 返回错误（如 Key 无效、额度用尽），`/send-code` 返回 `mail_send_failed`（502），提示"邮件发送失败，请稍后重试"，不会导致服务崩溃。

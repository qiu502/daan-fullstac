# 答岸 · 全栈化增量 PRD（简单 PRD · 聚焦变更）

> 文档角色：产品经理「许清楚（Xu）」
> 版本：v1.0（增量）
> 关联已有交付：`答岸.html`（矢量风格自包含单文件前端，4/4 + 9/9 验收通过）
> 本次范围：**只描述从「纯前端单文件」到「Node + Express + SQLite 全栈应用」的变更**，不重写已有前端 UI/交互。

---

## 1. 产品目标

> **让「答岸」从「单设备、数据写在浏览器里」升级为「真账户、数据落库、前端纯渲染」的全栈应用**：用户在任意设备上登录同一账户即可看到自己的上传与收藏，14 张真实试卷与用户上传统一由后端持久化与鉴权，前端只负责渲染与调用 API。

---

## 2. 用户故事

| # | 角色 | 故事 | 验收要点 |
|---|------|------|----------|
| US-1 | 游客 | 我打开网站，无需登录即可浏览 9 科试卷列表、按科目/关键词筛选、点开卡片预览真实题目与答案 | 列表/详情接口无需 token；UI 与现有矢量风格一致 |
| US-2 | 游客 | 我想看某张试卷的题面，点「预览/卡片」直接看，不用注册 | 详情接口对游客开放；打印仍走 `window.print` |
| US-3 | 新用户 | 我填邮箱+密码+昵称注册，密码被安全哈希后入库 | 注册成功返回账户；密码不以明文/可还原编码存储 |
| US-4 | 注册用户 | 我用邮箱+密码登录，拿到凭证后可上传、收藏 | 登录成功签发 JWT；前端持久化凭证（httpOnly Cookie 或内存+localStorage 二选一，见待确认） |
| US-5 | 登录用户 | 我上传一份试卷（科目/年份/类型/卷别/标题/题目+答案），它写入数据库并关联我的账户 | 上传接口需鉴权；`uploader` 取自我登录身份 |
| US-6 | 登录用户 | 我把某张试卷加入收藏，刷新/换设备后仍显示已收藏 | 收藏落库（favorites 表），与用户绑定 |
| US-7 | 登录用户 | 我点「退出」，本地凭证清除，回到游客态 | 前端清除凭证；后续上传/收藏被后端拒绝（401） |
| US-8 | 游客/用户 | 我看到的统计条（科目数/试卷数/…）来自后端实时计数 | 统计接口返回后端聚合值，而非前端 `allPapers().length` |

---

## 3. 需求池

### P0（必须，构成 MVP）

| ID | 需求 | 说明 / 验收 |
|----|------|-------------|
| P0-1 | 数据库 Schema | `users`、`papers`、`favorites` 三表（详见 §3.1） |
| P0-2 | 注册 API `POST /api/auth/register` | body: `{nick, email, password}`；密码经 **bcrypt 哈希**入库；邮箱唯一；返回用户（不含密码） |
| P0-3 | 登录 API `POST /api/auth/login` | 校验 bcrypt；成功签发 **JWT**；失败返回统一错误 |
| P0-4 | JWT 鉴权中间件 | 解析 `Authorization: Bearer <token>`；注入 `req.user`；未带/失效 → 401 |
| P0-5 | 试卷列表 API `GET /api/papers` | 从 DB 读取（内置 14 张 + 用户上传合并）；支持 `?subject=` 与 `?keyword=` 过滤；游客可访问 |
| P0-6 | 试卷详情 API `GET /api/papers/:id` | 返回 `questions`（JSON 解析后）；**游客可访问** |
| P0-7 | 上传 API `POST /api/papers` | **需登录**；写入 `papers`，`uploader_id` 关联当前用户；字段同现有上传表单 |
| P0-8 | 种子脚本 `seed.js` | 将现有 14 张真实试卷（`BUILTIN_PAPERS`）迁入库，`questions` 以 **JSON 字符串**存储 |
| P0-9 | 前端改造为纯渲染 + 调 API | 删除内嵌 `BUILTIN_PAPERS` 数组与 `daan_user_papers` 等 localStorage 逻辑；列表/详情/上传/统计改为 `fetch` 后端；**保留矢量风格、全部 UI 与交互**（导航、抽屉、Hero、科目网格、modal、打印、收藏按钮等） |
| P0-10 | 统计条后端化 | 新增计数接口或并入列表接口元数据：科目数、试卷总数、各科目数量；前端读取渲染 |

### P1（重要，建议同期）

| ID | 需求 | 说明 |
|----|------|------|
| P1-1 | 收藏后端化 | `favorites` 表 + `POST/DELETE /api/favorites/:paperId` + `GET /api/favorites`；替代 `daan_favorites` localStorage |
| P1-2 | JWT 过期与刷新 | 设定过期时间；可选 refresh token 或前端静默续期（策略见待确认） |
| P1-3 | 统一错误响应 | 后端固定错误体 `{code, message}`；前端 toast/错误态统一处理（含 401 引导登录） |
| P1-4 | CORS 配置 | 开发期允许前端源；生产期收紧（配合部署形态） |

### P2（可选 / 后续）

| ID | 需求 | 说明 |
|----|------|------|
| P2-1 | 试卷分页 / 搜索后端化 | 目前前端检索可保留；若迁移，列表接口加 `?page=&limit=` 与后端模糊搜索 |
| P2-2 | Dockerfile / 部署说明 | 含 `server/data/daan.db` 挂载说明、环境变量（JWT 密钥、端口） |
| P2-3 | 上传内容审核占位 | 接口层预留 `status`（如 pending/approved）字段与审核钩子，本期不实现真审核 |

---

### 3.1 数据库 Schema（草案）

```sql
-- 用户表
CREATE TABLE users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nick        TEXT    NOT NULL,
  email       TEXT    NOT NULL UNIQUE,
  pwd_hash    TEXT    NOT NULL,            -- bcrypt 哈希
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 试卷表（questions 以 JSON 字符串存储）
CREATE TABLE papers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  subject     TEXT    NOT NULL,            -- 语文/数学/.../政治
  title       TEXT    NOT NULL,
  year        INTEGER,
  type        TEXT,                        -- 高考等
  volume      TEXT,                        -- 卷别
  rate        REAL    DEFAULT 0,           -- 评分（种子值沿用现有）
  downloads   INTEGER DEFAULT 0,
  questions   TEXT    NOT NULL,            -- JSON: [{"q":"...","a":"..."}]
  uploader_id INTEGER,                     -- NULL=官方内置试卷
  source      TEXT    DEFAULT 'official',  -- official | user
  status      TEXT    DEFAULT 'approved',  -- 预留审核位（P2-3）
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (uploader_id) REFERENCES users(id)
);

-- 收藏表
CREATE TABLE favorites (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  paper_id   INTEGER NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, paper_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (paper_id) REFERENCES papers(id)
);
```

> 试卷 ID：前端现用 `'b1'`/`'u'+Date.now()` 字符串；后端改为**自增整数主键**，前端调用与渲染以整数 id 为准（种子脚本需把内置试卷与此映射，收藏/上传关联均用整数 id）。

---

## 4. 待确认问题（需用户 / 架构师拍板）

| # | 问题 | 产品经理建议 |
|---|------|--------------|
| Q1 | 鉴权用 **JWT** 还是 **session**？ | 建议 **JWT**：无状态、前后端分离友好、移动端/多端复用简单 |
| Q2 | 前端形态：保持「单 HTML + fetch 本地后端」，还是拆为 `public/` 静态资源由 Express 托管？ | 建议后者（`public/index.html` + Express 静态托管），部署最干净、一次起服即可；开发期仍起 Node 服务 |
| Q3 | 收藏本期是否后端化（P1）还是暂保留前端 localStorage？ | 建议本期后端化（P1），否则多设备账户价值打折；若排期紧可暂留 localStorage |
| Q4 | SQLite 文件存放位置？是否要迁移脚本？ | 建议 `server/data/daan.db`；需提供 `seed.js`（首次建表 + 导入 14 张）；重置用 `npm run seed` |
| Q5 | JWT 存储方式：httpOnly Cookie 还是前端 localStorage/内存？ | 若用 JWT：建议 **httpOnly Cookie**（防 XSS 窃取）；若坚持前端可控则用内存+刷新，需权衡 XSS 风险 |
| Q6 | JWT 过期时长与刷新策略？ | 建议 access token 短时效（如 2h）+ 可选 refresh；或由架构师定 |
| Q7 | 现有「游客也能上传」（代码里 `uploader` 取 `cur?.nick`）是否改为「上传必须登录」？ | 需求已明确「上传需登录」，建议改；游客上传入口在未登录时引导注册/登录 |
| Q8 | 试卷 ID 由字符串改整数主键，前端收藏/上传关联逻辑需同步改造，是否接受？ | 建议接受；种子脚本负责内置试卷的整数 id 映射 |

---

## 5. 范围边界（本次不做）

为避免范围蔓延，以下**本期明确不做**：

- ❌ 评论 / 评分互动（现有 `rate` 仅作展示与种子值，不建评分写入流程）
- ❌ 社交分享 / 外链分享 / 二维码
- ❌ 第三方登录（微信 / GitHub 等 OAuth）
- ❌ 支付 / 会员 / 商业化
- ❌ 试卷编辑与删除（用户上传仅支持新增；删除/编辑留待后续）
- ❌ 管理员后台与真内容审核（仅预留 `status` 字段与钩子，P2-3 占位）
- ❌ 题目级（单题）收藏、错题库、组卷
- ❌ 国际化 / 多语言
- ❌ 真实邮件验证 / 找回密码（注册仅需邮箱格式校验，不发送验证邮件）
- ❌ 不改变既有矢量视觉规范（10 色变量、Noto Serif/Sans SC、圆角 14px、内联 SVG、无 emoji、无外部位图、无高饱和渐变）

---

## 附：现有前端关键数据契约（供架构师对齐）

- **Paper 对象**：`{id, subject, title, year, type, volume, rate, downloads, questions:[{q,a}], uploader?}`
- **上传表单字段**：`subject / year / type / volume / title / questions(多行) / answers(多行)`，题目与答案按行配对，缺答案补「（暂无参考答案）」
- **现有 localStorage 键（将被后端替代）**：`daan_users`、`daan_current_user`、`daan_user_papers`、`daan_favorites`
- **统计条来源**：当前由 `allPapers().length` 与按 `subject` 计数在前端实时算，本期改由后端计数接口提供

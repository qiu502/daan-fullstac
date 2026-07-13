'use strict';
/**
 * 答岸 · Express 入口
 * 托管 public/ 静态资源，挂载 /api 路由，统一错误处理。
 */
const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

require('dotenv').config();

const { DB_PATH } = require('./db');
const { err } = require('./db');
const { seedIfEmpty } = require('./seed');

const authRoutes = require('./routes/auth');
const papersRoutes = require('./routes/papers');
const favoritesRoutes = require('./routes/favorites');
const statsRoutes = require('./routes/stats');

const app = express();
const PORT = process.env.PORT || 3000;

/* ---------- 中间件 ---------- */
// 同源托管时 credentials 同源即可；保留 CORS 以备前端独立端口调试
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || true,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

/* ---------- 静态资源 ---------- */
app.use(express.static(path.join(__dirname, '..', 'public')));

// 兼容老式浏览器/爬虫对 /favicon.ico 的请求，避免 404
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'favicon.svg'));
});

/* ---------- API 路由 ---------- */
app.get('/api/health', (req, res) => res.json({ ok: true, db: DB_PATH }));
app.use('/api/auth', authRoutes);
app.use('/api/papers', papersRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/stats', statsRoutes);

/* ---------- 404 ---------- */
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next(err('not_found', '接口不存在', 404));
  }
  next();
});

/* ---------- 统一错误处理 ---------- */
// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  const status = error.status || 500;
  const code = error.code || 'internal_error';
  const message = status === 500 ? '服务器内部错误' : (error.message || '请求失败');
  if (status === 500) console.error('[ERROR]', error);
  res.status(status).json({ error: { code, message } });
});

// 启动时自动补示例数据：仅当试卷表为空才灌（不清空用户上传）。
// 这样即便托管平台没应用 render.yaml 里的启动命令、或免费层重启清空了数据，
// 服务一起来也会自动恢复 14 张示例卷，首页不会空白。
try {
  seedIfEmpty();
} catch (e) {
  console.error('[SEED] 启动自动灌示例数据失败（不影响服务启动）：', e.message);
}

app.listen(PORT, () => {
  console.log(`答岸服务已启动：http://localhost:${PORT}`);
  console.log(`数据库：${DB_PATH}`);
});

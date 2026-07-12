'use strict';
/**
 * 答岸 · 共享配置
 * 集中管理 JWT 密钥、Cookie 名称、令牌时效，避免多处散落。
 */
require('dotenv').config();

const SECRET = process.env.JWT_SECRET || 'dev_only_insecure_secret_change_me';
const ACCESS_EXPIRES = process.env.ACCESS_EXPIRES || '2h';
const REFRESH_EXPIRES = process.env.REFRESH_EXPIRES || '7d';

const COOKIE = {
  access: 'access_token',
  refresh: 'refresh_token'
};

// 浏览器同源部署：Cookie 不强制 Secure；跨端口/dev 时 SameSite=Lax 已足够共享。
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/'
};

/* ---------- 注册验证码（T2） ---------- */
const CODE_TTL_SECONDS = Number(process.env.CODE_TTL_SECONDS || 300);  // 码有效期 5 分钟
const CODE_LENGTH      = Number(process.env.CODE_LENGTH || 6);          // 验证码位数
const RESEND_INTERVAL  = Number(process.env.RESEND_INTERVAL || 60);     // 重发节流 60 秒
const DEMO_MODE        = process.env.DEMO_MODE !== 'false';             // 默认 true（演示）

module.exports = { SECRET, ACCESS_EXPIRES, REFRESH_EXPIRES, COOKIE, COOKIE_OPTS, CODE_TTL_SECONDS, CODE_LENGTH, RESEND_INTERVAL, DEMO_MODE };

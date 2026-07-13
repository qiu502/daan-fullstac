'use strict';
/**
 * 答岸 · 鉴权路由
 * POST /api/auth/register  注册（自动登录）
 * POST /api/auth/login     登录
 * POST /api/auth/logout    退出（清 Cookie）
 * POST /api/auth/refresh   用 refresh Cookie 换发新 access
 * GET  /api/auth/me        读取当前登录用户（恢复登录态）
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const { db, err } = require('../db');
const { SECRET, ACCESS_EXPIRES, REFRESH_EXPIRES, COOKIE, COOKIE_OPTS, CODE_TTL_SECONDS, CODE_LENGTH, RESEND_INTERVAL, DEMO_MODE } = require('../config');
const { verifyToken } = require('../middleware/auth');
const { sendVerificationEmail } = require('../mailer');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 生成 CODE_LENGTH 位随机数字串（用 crypto.randomInt，避免 Math.random 可预测）
function genCode(len) {
  const n = crypto.randomInt(0, 10 ** len);
  return String(n).padStart(len, '0');
}

// 脱敏：邮箱 a***@example.com / 手机 138****1234（完整 contact 不入响应体）
function mask(contact) {
  if (contact && contact.includes('@')) {
    const [local, domain] = contact.split('@');
    return (local[0] || '') + '***@' + (domain || '');
  }
  if (contact && contact.length >= 7) return contact.slice(0, 3) + '****' + contact.slice(-4);
  return contact || '';
}

function signAccess(user) {
  return jwt.sign({ sub: user.id, email: user.email, nick: user.nick }, SECRET, { expiresIn: ACCESS_EXPIRES });
}
function signRefresh(user) {
  return jwt.sign({ sub: user.id, email: user.email, nick: user.nick }, SECRET, { expiresIn: REFRESH_EXPIRES });
}

function setAuthCookies(res, user) {
  res.cookie(COOKIE.access, signAccess(user), { ...COOKIE_OPTS, maxAge: 2 * 60 * 60 * 1000 });
  res.cookie(COOKIE.refresh, signRefresh(user), { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 });
}

function publicUser(row) {
  return { id: row.id, nick: row.nick, email: row.email, created_at: row.created_at };
}

/* ---------- 发送注册验证码（游客可访问，仅邮箱渠道） ---------- */
router.post('/send-code', async (req, res, next) => {
  try {
    const { contact, channel } = req.body || {};
    // 仅支持邮箱渠道（手机号相关功能已移除）
    if (channel && channel !== 'email') {
      return next(err('validation_error', '仅支持邮箱验证码', 422));
    }
    const raw = (contact || '').toString().trim();
    if (!raw) return next(err('validation_error', '请填写邮箱', 422));
    if (!EMAIL_RE.test(raw)) return next(err('validation_error', '邮箱格式不正确', 422));
    const c = raw.toLowerCase();                 // email 归一小写

    const now = Math.floor(Date.now() / 1000);

    // 重发节流：距上次未用码不足 RESEND_INTERVAL 则拦截
    const recent = db.prepare(`SELECT * FROM verification_codes
      WHERE contact=? AND channel='email' AND purpose='register' AND used=0
        AND created_at > ?`).get(c, now - RESEND_INTERVAL);
    if (recent) {
      const wait = recent.created_at + RESEND_INTERVAL - now;
      return next(err('code_rate_limit', `请 ${wait} 秒后再发送`, 429));
    }

    // 生成验证码
    const code = genCode(CODE_LENGTH);

    // 令旧未用码失效（保持"一个 contact 仅一条活跃码"）
    db.prepare(`UPDATE verification_codes SET used=1
      WHERE contact=? AND channel='email' AND purpose='register' AND used=0`)
      .run(c);

    // 写新码
    db.prepare(`INSERT INTO verification_codes(contact,channel,code,purpose,expires_at,used,created_at)
      VALUES(?, 'email', ?, 'register', ?, 0, ?)`).run(c, code, now + CODE_TTL_SECONDS, now);

    // 真实发送（Resend；未配置 Key 时降级为控制台打印，不阻断流程）
    const sent = await sendVerificationEmail(c, code, CODE_TTL_SECONDS);
    if (!sent.ok && !sent.degraded) {
      // 真实发送失败（如 Resend 报错）：仍返回验证码已生成，但提示稍后重试
      return next(err('mail_send_failed', '验证码生成成功，但邮件发送失败，请稍后重试', 502));
    }

    return res.json({ ok: true, channel: 'email', contact: mask(c), expiresIn: CODE_TTL_SECONDS });
  } catch (e) { next(e); }
});

/* ---------- 注册 ---------- */
router.post('/register', (req, res, next) => {
  try {
    const { nick, email, password, code } = req.body || {};
    if (!nick || !nick.trim()) return next(err('validation_error', '请填写昵称', 422));
    if (!email || !EMAIL_RE.test(email)) return next(err('validation_error', '邮箱格式不正确', 422));
    if (!password || password.length < 6) return next(err('validation_error', '密码至少 6 位', 422));
    if (!code) return next(err('code_required', '请先获取并填写验证码', 422));

    // 邮箱归一（与 send-code 同源）
    const contact = String(email).trim().toLowerCase();

    // 查最新有效码（邮箱渠道）
    const vc = db.prepare(`SELECT * FROM verification_codes
      WHERE contact=? AND channel='email' AND purpose='register' AND used=0
      ORDER BY created_at DESC LIMIT 1`).get(contact);

    if (!vc) return next(err('code_invalid', '验证码不存在或已使用，请重新获取', 422));
    if (vc.expires_at < Math.floor(Date.now() / 1000)) return next(err('code_expired', '验证码已过期，请重新获取', 401));
    if (vc.code !== String(code).trim()) return next(err('code_invalid', '验证码错误', 422));

    // 校验通过 → 标记已用（一次性）
    db.prepare('UPDATE verification_codes SET used=1 WHERE id=?').run(vc.id);

    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(contact);
    if (exists) return next(err('conflict', '该邮箱已被注册', 409));

    const pwd_hash = bcrypt.hashSync(password, 10);
    const info = db.prepare('INSERT INTO users(nick, email, pwd_hash) VALUES(?,?,?)')
      .run(nick.trim(), contact, pwd_hash);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    setAuthCookies(res, user);
    res.status(201).json({ user: publicUser(user) });
  } catch (e) { next(e); }
});

/* ---------- 登录 ---------- */
router.post('/login', (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !EMAIL_RE.test(email)) return next(err('validation_error', '邮箱格式不正确', 422));
    if (!password) return next(err('validation_error', '请填写密码', 422));

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return next(err('unauthorized', '该邮箱尚未注册', 401));
    if (!bcrypt.compareSync(password, user.pwd_hash)) return next(err('unauthorized', '密码错误，请重试', 401));

    setAuthCookies(res, user);
    res.json({ user: publicUser(user) });
  } catch (e) { next(e); }
});

/* ---------- 退出 ---------- */
router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE.access, COOKIE_OPTS);
  res.clearCookie(COOKIE.refresh, COOKIE_OPTS);
  res.json({ ok: true });
});

/* ---------- 刷新 access ---------- */
router.post('/refresh', (req, res, next) => {
  try {
    const token = req.cookies ? req.cookies[COOKIE.refresh] : null;
    if (!token) return next(err('unauthorized', '未登录或凭证失效', 401));
    let payload;
    try { payload = verifyToken(token); } catch (e) {
      return next(err('unauthorized', '登录已过期，请重新登录', 401));
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
    if (!user) return next(err('unauthorized', '账户不存在', 401));
    // 滚动续期 refresh（每次刷新都换发新的 refresh + access）
    setAuthCookies(res, user);
    res.json({ user: publicUser(user) });
  } catch (e) { next(e); }
});

/* ---------- 当前用户（恢复登录态） ---------- */
router.get('/me', (req, res, next) => {
  try {
    const token = req.cookies ? req.cookies[COOKIE.access] : null;
    if (!token) return res.json({ user: null });
    let payload;
    try { payload = verifyToken(token); } catch (e) { return res.json({ user: null }); }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
    if (!user) return res.json({ user: null });
    res.json({ user: publicUser(user) });
  } catch (e) { next(e); }
});

module.exports = router;

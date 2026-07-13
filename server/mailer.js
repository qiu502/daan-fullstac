'use strict';
/**
 * 答岸 · 邮件发送模块（生产用 Resend）
 *
 * 设计要点：
 * 1. 真实发送走 Resend Node SDK；API Key 与发件人来自 .env（RESEND_API_KEY / MAIL_FROM）。
 * 2. 未配置 RESEND_API_KEY 时降级为控制台打印验证码，避免服务崩溃，便于本地无 Key 调试；
 *    同时打印告警，提示这是未配置邮件服务，验证码不会真正发出去。
 * 3. 仅在 sendVerificationEmail 内部复用单例 Resend 客户端，未配置时 client 为 null。
 */

const { RESEND_API_KEY, MAIL_FROM } = require('./config');

let client = null;
if (RESEND_API_KEY) {
  try {
    const { Resend } = require('resend');
    client = new Resend(RESEND_API_KEY);
  } catch (e) {
    console.error('[mailer] 加载 resend SDK 失败：', e.message);
  }
}

const FROM = MAIL_FROM || '答岸 <onboarding@resend.dev>';

/**
 * 发送注册验证码邮件
 * @param {string} to   收件邮箱
 * @param {string} code 验证码（数字串）
 * @param {number} ttl  有效期（秒），用于邮件正文提示
 * @returns {Promise<{ok:boolean, degraded?:boolean, error?:string}>}
 */
async function sendVerificationEmail(to, code, ttl) {
  const minutes = Math.max(1, Math.round((ttl || 300) / 60));
  const subject = '【答岸】你的注册验证码';
  const text = `你的答岸注册验证码是：${code}\n该验证码 ${minutes} 分钟内有效，请勿泄露给他人。\n如非本人操作，请忽略本邮件。`;
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#243044">
    <h2 style="margin:0 0 16px;color:#AE7E36">答岸 · 验证码</h2>
    <p style="font-size:14px;line-height:1.6">你好，你正在注册答岸账号。以下是你的验证码：</p>
    <div style="font-size:28px;font-weight:700;letter-spacing:6px;background:#f5f1e8;color:#243044;border-radius:10px;padding:16px 20px;margin:16px 0;text-align:center;font-family:monospace">${code}</div>
    <p style="font-size:13px;color:#6b7280;line-height:1.6">该验证码在 <b>${minutes} 分钟</b> 内有效，请尽快完成注册。如非本人操作，请忽略本邮件。</p>
  </div>`;

  // 未配置 API Key → 降级模式（本地调试用）
  if (!client) {
    console.warn('[mailer] ⚠️ 未配置 RESEND_API_KEY，验证码未真实发送（降级模式）。');
    console.log(`[mailer][degraded] to=${to} code=${code}`);
    return { ok: true, degraded: true };
  }

  try {
    const { data, error } = await client.emails.send({ from: FROM, to: [to], subject, text, html });
    if (error) {
      console.error('[mailer] Resend 发送失败：', error.message || JSON.stringify(error));
      return { ok: false, error: error.message || '邮件发送失败' };
    }
    console.log(`[mailer] 验证码已发送至 ${to}（id=${data && data.id}）`);
    return { ok: true };
  } catch (e) {
    console.error('[mailer] 发送异常：', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = { sendVerificationEmail };

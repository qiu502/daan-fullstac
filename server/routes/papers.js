'use strict';
/**
 * 答岸 · 试卷路由
 * GET  /api/papers        游客可访问，支持 subject/keyword/page/pageSize 过滤，已登录附 favoritedIds
 * GET  /api/papers/:id    游客可访问，返回解析后的 questions + uploader 昵称
 * POST /api/papers        需登录，写入 papers（uploader_id=当前用户）
 */
const express = require('express');
const router = express.Router();

const { db, err } = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');

/** 把 DB 行转成 API 的 Paper 形态（questions 解析为数组） */
function withParsed(row) {
  let questions = [];
  try { questions = JSON.parse(row.questions || '[]'); } catch (e) { questions = []; }
  let uploader = null;
  if (row.uploader_id) {
    const u = db.prepare('SELECT nick FROM users WHERE id = ?').get(row.uploader_id);
    uploader = u ? u.nick : null;
  }
  return {
    id: row.id,
    subject: row.subject,
    title: row.title,
    year: row.year,
    type: row.type,
    volume: row.volume,
    rate: row.rate,
    downloads: row.downloads,
    questions,
    uploader_id: row.uploader_id,
    uploader,
    source: row.source,
    created_at: row.created_at
  };
}

/* ---------- 列表 ---------- */
router.get('/', optionalAuth, (req, res, next) => {
  try {
    const { subject, keyword, page = 1, pageSize = 30 } = req.query;
    const filters = [];
    const params = [];

    if (subject && subject !== '全部') { filters.push('subject = ?'); params.push(subject); }
    if (keyword && keyword.trim()) {
      const kw = `%${keyword.trim()}%`;
      filters.push('(title LIKE ? OR subject LIKE ? OR volume LIKE ?)');
      params.push(kw, kw, kw);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const total = db.prepare(`SELECT COUNT(*) AS c FROM papers ${where}`).get(...params).c;
    const p = Math.max(1, parseInt(page) || 1);
    const ps = Math.min(100, Math.max(1, parseInt(pageSize) || 30));
    const rows = db.prepare(`SELECT * FROM papers ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...params, ps, (p - 1) * ps);

    const favoritedIds = [];
    if (req.user) {
      const favs = db.prepare('SELECT paper_id FROM favorites WHERE user_id = ?').all(req.user.sub);
      favs.forEach(f => favoritedIds.push(f.paper_id));
    }

    res.json({
      papers: rows.map(withParsed),
      total,
      page: p,
      pageSize: ps,
      favoritedIds
    });
  } catch (e) { next(e); }
});

/* ---------- 详情 ---------- */
router.get('/:id', optionalAuth, (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return next(err('bad_request', '试卷 id 无效', 400));
    const row = db.prepare('SELECT * FROM papers WHERE id = ?').get(id);
    if (!row) return next(err('not_found', '试卷不存在', 404));

    const paper = withParsed(row);
    if (req.user) {
      const f = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND paper_id = ?').get(req.user.sub, id);
      paper.favorited = !!f;
    } else {
      paper.favorited = false;
    }
    res.json({ paper });
  } catch (e) { next(e); }
});

/* ---------- 上传（需登录） ---------- */
router.post('/', requireAuth, (req, res, next) => {
  try {
    const { subject, title, year, type, volume, questions } = req.body || {};
    if (!subject || !subject.trim()) return next(err('validation_error', '请选择科目', 422));
    if (!title || !title.trim()) return next(err('validation_error', '请填写试卷标题', 422));
    if (!Array.isArray(questions) || questions.length === 0)
      return next(err('validation_error', '请至少填写一道题目', 422));
    // 规整 questions：每项至少含 q/a
    const cleanQ = questions
      .filter(q => q && (q.q || q.a))
      .map(q => ({ q: String(q.q || ''), a: String(q.a || '（暂无参考答案）') }));
    if (cleanQ.length === 0) return next(err('validation_error', '题目内容为空', 422));

    const info = db.prepare(
      `INSERT INTO papers(subject,title,year,type,volume,questions,uploader_id,source,status)
       VALUES(?,?,?,?,?,?,?,'user','approved')`
    ).run(
      subject.trim(), title.trim(),
      year ? parseInt(year) : null,
      type || null, volume || null,
      JSON.stringify(cleanQ), req.user.sub
    );
    const row = db.prepare('SELECT * FROM papers WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ paper: withParsed(row) });
  } catch (e) { next(e); }
});

module.exports = router;

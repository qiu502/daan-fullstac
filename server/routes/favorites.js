'use strict';
/**
 * 答岸 · 收藏路由
 * GET    /api/favorites        需登录，返回当前用户收藏列表
 * POST   /api/favorites        需登录，{paper_id}，重复 409
 * DELETE /api/favorites/:paper_id  需登录，未命中 404
 */
const express = require('express');
const router = express.Router();

const { db, err } = require('../db');
const { requireAuth } = require('../middleware/auth');

/** 把 favorites 行转为 Paper 形态 */
function withParsed(row) {
  let questions = [];
  try { questions = JSON.parse(row.questions || '[]'); } catch (e) { questions = []; }
  let uploader = null;
  if (row.uploader_id) {
    const u = db.prepare('SELECT nick FROM users WHERE id = ?').get(row.uploader_id);
    uploader = u ? u.nick : null;
  }
  return {
    id: row.id, subject: row.subject, title: row.title, year: row.year,
    type: row.type, volume: row.volume, rate: row.rate, downloads: row.downloads,
    questions, uploader_id: row.uploader_id, uploader, source: row.source, created_at: row.created_at
  };
}

/* ---------- 收藏列表 ---------- */
router.get('/', requireAuth, (req, res, next) => {
  try {
    const rows = db.prepare(`
      SELECT p.* FROM papers p
      JOIN favorites f ON f.paper_id = p.id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
    `).all(req.user.sub);
    res.json({ papers: rows.map(withParsed) });
  } catch (e) { next(e); }
});

/* ---------- 新增收藏 ---------- */
router.post('/', requireAuth, (req, res, next) => {
  try {
    const paper_id = parseInt(req.body && req.body.paper_id);
    if (!Number.isFinite(paper_id)) return next(err('validation_error', 'paper_id 无效', 422));
    const paper = db.prepare('SELECT id FROM papers WHERE id = ?').get(paper_id);
    if (!paper) return next(err('not_found', '试卷不存在', 404));

    const exists = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND paper_id = ?').get(req.user.sub, paper_id);
    if (exists) return next(err('conflict', '已收藏', 409));

    db.prepare('INSERT INTO favorites(user_id, paper_id) VALUES(?,?)').run(req.user.sub, paper_id);
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- 取消收藏 ---------- */
router.delete('/:paper_id', requireAuth, (req, res, next) => {
  try {
    const paper_id = parseInt(req.params.paper_id);
    if (!Number.isFinite(paper_id)) return next(err('bad_request', 'paper_id 无效', 400));
    const info = db.prepare('DELETE FROM favorites WHERE user_id = ? AND paper_id = ?').run(req.user.sub, paper_id);
    if (info.changes === 0) return next(err('not_found', '尚未收藏该试卷', 404));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;

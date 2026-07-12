'use strict';
/**
 * 答岸 · 统计路由
 * GET /api/stats  游客可访问，实时聚合：收录数/科目数/用户数/下载总量/bySubject
 */
const express = require('express');
const router = express.Router();

const { db } = require('../db');

router.get('/', (req, res, next) => {
  try {
    const totalPapers = db.prepare('SELECT COUNT(*) AS c FROM papers').get().c;
    const totalSubjects = db.prepare('SELECT COUNT(DISTINCT subject) AS c FROM papers').get().c;
    const totalUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    const totalDownloads = db.prepare('SELECT COALESCE(SUM(downloads),0) AS s FROM papers').get().s;
    const bySubject = db.prepare(
      'SELECT subject, COUNT(*) AS count FROM papers GROUP BY subject ORDER BY count DESC'
    ).all();

    res.json({
      totalPapers,
      totalSubjects,
      totalUsers,
      totalDownloads,
      bySubject
    });
  } catch (e) { next(e); }
});

module.exports = router;

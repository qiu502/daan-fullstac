'use strict';
/**
 * 答岸 · 种子脚本
 * 直接从源文件 答岸.html 解析出真实的 BUILTIN_PAPERS（14 张公开真题），
 * 按 b1..b14 → 整数 id 1..14 映射，清空 papers 后写入。
 * questions 以 JSON 字符串存储；uploader_id = NULL；source = 'official'。
 *
 * 用法：node --experimental-sqlite server/seed.js
 */
const fs = require('fs');
const path = require('path');
const { db } = require('./db');

const SRC = path.join(__dirname, '..', '..', '答岸.html');
const JSON_SRC = path.join(__dirname, 'data', 'builtin-papers.json');

/** 优先从仓库内 JSON 读取内置试卷（部署环境用）；返回 null 表示无 JSON。 */
function loadPapersFromJson() {
  if (!fs.existsSync(JSON_SRC)) return null;
  try {
    const arr = JSON.parse(fs.readFileSync(JSON_SRC, 'utf8'));
    if (Array.isArray(arr) && arr.length > 0) return arr;
  } catch (e) {
    console.warn('读取 builtin-papers.json 失败，回退到 HTML 源：', e.message);
  }
  return null;
}

/** 从源码中安全提取 BUILTIN_PAPERS 数组字面量（平衡括号 + 字符串感知） */
function extractBuiltinPapers(source) {
  const marker = 'const BUILTIN_PAPERS =';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('未找到 BUILTIN_PAPERS 定义');
  const arrStart = source.indexOf('[', start);
  if (arrStart < 0) throw new Error('未找到数组起始 [');
  let i = arrStart;
  let depth = 0;
  let inStr = null;
  let escaped = false;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (inStr) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === inStr) { inStr = null; }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        const literal = source.slice(arrStart, i + 1);
        // eslint-disable-next-line no-eval
        return eval('(' + literal + ')');
      }
    }
  }
  throw new Error('未能匹配到数组结束 ]');
}

function main() {
  // 「仅当空表才灌」模式：用于部署启动时自动补示例数据，且不清空用户已上传的试卷。
  // 触发方式：node seed.js --if-empty  或  SEED_MODE=if-empty
  const ifEmpty = process.argv.includes('--if-empty') || process.env.SEED_MODE === 'if-empty';
  if (ifEmpty) {
    const cnt = db.prepare('SELECT COUNT(*) AS n FROM papers').get().n;
    if (cnt > 0) {
      console.log(`papers 表已有 ${cnt} 条记录，跳过 seed（--if-empty）`);
      return;
    }
  }

  // 1) 优先用仓库内 JSON（部署环境没有 答岸.html）
  let papers = loadPapersFromJson();
  // 2) 回退：从本地 答岸.html 解析
  if (!papers) {
    if (!fs.existsSync(SRC)) {
      throw new Error('未找到内置试卷源：既无 ' + JSON_SRC + '，也无 ' + SRC);
    }
    const html = fs.readFileSync(SRC, 'utf8');
    papers = extractBuiltinPapers(html);
  }
  if (!Array.isArray(papers) || papers.length === 0) {
    throw new Error('解析出的内置试卷为空');
  }

  const deleteFav = db.prepare('DELETE FROM favorites');
  const deletePapers = db.prepare('DELETE FROM papers');
  const insert = db.prepare(
    `INSERT INTO papers(id, subject, title, year, type, volume, rate, downloads, questions, uploader_id, source, status)
     VALUES(?,?,?,?,?,?,?,?,?,?,'official','approved')`
  );

  // node:sqlite 无 .transaction() 辅助，使用显式事务
  db.exec('BEGIN');
  try {
    deleteFav.run();
    deletePapers.run();
    papers.forEach((p, idx) => {
      const id = idx + 1; // b1 -> 1, b2 -> 2, ... b14 -> 14
      const questions = Array.isArray(p.questions) ? p.questions : [];
      insert.run(
        id,
        p.subject,
        p.title,
        p.year || null,
        p.type || null,
        p.volume || null,
        p.rate != null ? p.rate : 0,
        p.downloads != null ? p.downloads : 0,
        JSON.stringify(questions),
        null
      );
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  console.log(`seeded ${papers.length} papers`);
}

try {
  main();
} catch (e) {
  console.error('种子脚本失败：', e.message);
  process.exit(1);
}

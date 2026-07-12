'use strict';
/**
 * 答岸 · 鉴权中间件
 * - requireAuth：受保护接口，必须带有效 access_token Cookie，注入 req.user
 * - optionalAuth：游客接口，有 token 则注入 req.user，无则放行
 */
const jwt = require('jsonwebtoken');
const { SECRET, COOKIE } = require('../config');
const { err } = require('../db');

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

function requireAuth(req, res, next) {
  const token = req.cookies ? req.cookies[COOKIE.access] : null;
  if (!token) return next(err('unauthorized', '未登录或凭证失效', 401));
  try {
    req.user = verifyToken(token);
    return next();
  } catch (e) {
    return next(err('unauthorized', '登录已过期，请重新登录', 401));
  }
}

function optionalAuth(req, res, next) {
  const token = req.cookies ? req.cookies[COOKIE.access] : null;
  if (token) {
    try { req.user = verifyToken(token); } catch (e) { /* 忽略，按游客处理 */ }
  }
  return next();
}

module.exports = { requireAuth, optionalAuth, verifyToken };

/* ============================================================
   答岸 · 矢量图风格试卷分享站（全栈前端 / 原生 JS + fetch API）
   数据全部来自后端 /api/*，浏览器仅渲染、调用与触发交互。
   凭证通过 httpOnly Cookie 自动携带（credentials:'include'）。
   ============================================================ */

/* ---------- 科目元数据（低饱和主题色 + 内联 SVG 图标） ---------- */
const SUBJECTS = [
  {key:'语文', color:'#B05C4A', icon:'<path d="M5 4h11l3 3v13H5z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/><path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'},
  {key:'数学', color:'#3A6B6B', icon:'<circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'},
  {key:'英语', color:'#6B5B95', icon:'<path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'},
  {key:'物理', color:'#4A6B8A', icon:'<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'},
  {key:'化学', color:'#6B8A4A', icon:'<path d="M9 3v6L5 19a1.5 1.5 0 0 0 1.4 2h11.2A1.5 1.5 0 0 0 19 19l-4-10V3" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/><path d="M8 3h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'},
  {key:'生物', color:'#5B8A6B', icon:'<path d="M12 3c-4 3-4 6 0 9s4 6 0 9M12 3c4 3 4 6 0 9s-4 6 0 9" stroke="currentColor" stroke-width="1.7" fill="none"/>'},
  {key:'历史', color:'#A07A4A', icon:'<path d="M12 4a8 8 0 1 0 8 8" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M12 4v8l5 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'},
  {key:'地理', color:'#4A8A8A', icon:'<path d="M12 3c4 4 6 7 6 11a6 6 0 0 1-12 0c0-4 2-7 6-11z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/><path d="M9 13a3 3 0 0 0 3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'},
  {key:'政治', color:'#8A5B5B', icon:'<path d="M5 21V9l7-5 7 5v12" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/><path d="M9 21v-6h6v6" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>'}
];
const SUBJ_MAP = Object.fromEntries(SUBJECTS.map(s=>[s.key,s]));

/* ---------- 全局状态 ---------- */
const state = {
  activeSubject: '全部',
  favMode: false,
  keyword: '',
  papers: [],            // 当前列表（来自 /api/papers 或 /api/favorites）
  favIds: new Set(),     // 当前用户收藏的试卷 id 集合
  bySubject: {},         // 科目 -> 数量（来自 /api/stats）
  totalPapers: 0,
  currentUser: null,
  currentDetailId: null,
  currentFav: false
};

/* ---------- fetch 封装（含被动刷新 + 统一错误） ---------- */
async function api(method, url, body, retry = true) {
  const opt = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
  if (body !== undefined) opt.body = JSON.stringify(body);
  let res = await fetch(url, opt);
  if (res.status === 401 && retry) {
    // access 过期 → 用 refresh Cookie 换发新 access → 重试原请求
    try {
      const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
      if (r.ok) res = await fetch(url, opt);
    } catch (e) { /* 忽略 */ }
  }
  return res;
}

async function parseError(res) {
  let msg = '请求失败，请稍后重试';
  try {
    const d = await res.json();
    if (d && d.error && d.error.message) msg = d.error.message;
  } catch (e) { /* 忽略 */ }
  return msg;
}

/* ---------- 渲染：科目网格 ---------- */
function renderSubjects() {
  const grid = document.getElementById('subjGrid');
  grid.innerHTML = SUBJECTS.map(s => {
    const cnt = state.bySubject[s.key] || 0;
    return `<button class="subj-card" data-subj="${s.key}">
      <span class="subj-ico" style="background:${s.color}1a;color:${s.color}">
        <svg viewBox="0 0 24 24" fill="none">${s.icon}</svg>
      </span>
      <span>
        <span class="name">${s.key}</span><br/>
        <span class="cnt">${cnt} 份试卷</span>
      </span>
    </button>`;
  }).join('');
  grid.querySelectorAll('[data-subj]').forEach(el => {
    el.addEventListener('click', () => {
      setActiveSubject(el.getAttribute('data-subj'));
      document.getElementById('bank').scrollIntoView({ behavior: 'smooth' });
      closeDrawer();
    });
  });
}

/* ---------- 渲染：筛选 chips ---------- */
function renderChips() {
  const box = document.getElementById('chips');
  const list = ['全部'].concat(SUBJECTS.map(s => s.key));
  box.innerHTML = list.map(k => {
    const active = (k === state.activeSubject && !state.favMode) ? ' active' : '';
    const cnt = k === '全部' ? state.totalPapers : (state.bySubject[k] || 0);
    return `<button class="chip${active}" data-chip="${k}">${k} <span style="opacity:.6">${cnt}</span></button>`;
  }).join('');
  box.innerHTML += `<button class="chip${state.favMode ? ' active' : ''}" id="favChip" style="margin-left:auto;">★ 我的收藏 (${state.favIds.size})</button>`;
  box.querySelectorAll('[data-chip]').forEach(el => {
    el.addEventListener('click', () => { state.favMode = false; setActiveSubject(el.getAttribute('data-chip')); });
  });
  document.getElementById('favChip').addEventListener('click', openFavMode);
}

/* ---------- 渲染：题库 ---------- */
function renderPapers() {
  const grid = document.getElementById('paperGrid');
  const list = state.papers || [];
  if (list.length === 0) {
    grid.innerHTML = `<div class="empty">
      <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.6"/><path d="M20 20l-3-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M8 11h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <div>没有找到匹配的试卷</div>
      <div style="font-size:13px;margin-top:6px;">试试更换关键词，或在「全部」科目下检索。</div>
    </div>`;
    return;
  }
  grid.innerHTML = list.map(p => {
    const c = SUBJ_MAP[p.subject] ? SUBJ_MAP[p.subject].color : '#888';
    const isFav = state.favIds.has(p.id);
    return `<div class="paper-card" data-id="${p.id}">
      <div class="pc-top">
        <span class="pc-subj" style="background:${c}1a;color:${c}">${escapeHTML(p.subject)}</span>
        <span class="pc-star ${isFav ? 'on' : ''}" title="收藏">${starSVG}</span>
      </div>
      <div class="pc-title">${escapeHTML(p.title)}</div>
      <div class="pc-meta">${p.year || ''} 年 · ${escapeHTML(p.type || '')} · ${escapeHTML(p.volume || '—')}</div>
      <div class="pc-foot">
        <button class="pc-preview" data-preview="${p.id}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/></svg>
          预览
        </button>
        <span style="display:inline-flex;align-items:center;gap:10px;">
          <span class="rate">★ ${(p.rate || 0).toFixed(1)}</span>
          <span style="display:inline-flex;align-items:center;gap:4px;color:var(--text-soft);"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="color:var(--text-soft)"><path d="M12 4v10m0 0l-4-4m4 4l4-4M5 19h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>${fmtNum(p.downloads || 0)} 次下载</span>
        </span>
      </div>
    </div>`;
  }).join('');
  grid.querySelectorAll('[data-id]').forEach(el => {
    el.addEventListener('click', () => openDetail(parseInt(el.getAttribute('data-id'))));
  });
  grid.querySelectorAll('[data-preview]').forEach(el => {
    el.addEventListener('click', e => { e.stopPropagation(); openDetail(parseInt(el.getAttribute('data-preview'))); });
  });
}

const starSVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.3l-5.4 3.2 1.4-6.1L3 10.3l6.2-.5L12 4l2.8 5.8 6.2.5-4.9 4.1 1.4 6.1z"/></svg>';

function setActiveSubject(s) {
  state.activeSubject = s; state.favMode = false; state.keyword = '';
  document.getElementById('bankSearch').value = '';
  renderChips(); loadPapers();
}
function openFavMode() {
  state.favMode = true; state.activeSubject = '全部'; state.keyword = '';
  document.getElementById('bankSearch').value = '';
  renderChips(); loadPapers();
  document.getElementById('bank').scrollIntoView({ behavior: 'smooth' });
}

/* ---------- 数据加载 ---------- */
async function loadStats() {
  try {
    const res = await fetch('/api/stats', { credentials: 'include' });
    if (!res.ok) return;
    const d = await res.json();
    state.totalPapers = d.totalPapers;
    state.bySubject = {};
    (d.bySubject || []).forEach(x => { state.bySubject[x.subject] = x.count; });
    document.getElementById('stPapers').textContent = d.totalPapers;
    document.getElementById('stSubjects').textContent = d.totalSubjects;
    document.getElementById('stUsers').textContent = d.totalUsers;
    document.getElementById('stDownloads').textContent = fmtNum(d.totalDownloads);
  } catch (e) { /* 忽略统计异常，不阻断主流程 */ }
}

async function loadPapers() {
  if (state.favMode) {
    const res = await api('GET', '/api/favorites');
    if (res.ok) {
      const d = await res.json();
      state.papers = d.papers || [];
      state.favIds = new Set(state.papers.map(p => p.id));
      renderPapers(); renderChips();
      return;
    }
    // 未登录或出错 → 退出收藏态，回退到全部
    toast('请先登录后查看收藏');
    state.favMode = false; renderChips();
  }
  const q = new URLSearchParams();
  if (state.activeSubject !== '全部') q.set('subject', state.activeSubject);
  if (state.keyword) q.set('keyword', state.keyword);
  const res = await api('GET', '/api/papers?' + q.toString());
  if (!res.ok) { toast(await parseError(res)); return; }
  const d = await res.json();
  state.papers = d.papers || [];
  if (Array.isArray(d.favoritedIds)) state.favIds = new Set(d.favoritedIds);
  renderPapers(); renderChips();
}

/* ---------- 详情 modal ---------- */
function openDetail(id) {
  api('GET', '/api/papers/' + id).then(async res => {
    if (!res.ok) { toast(await parseError(res)); return; }
    const d = await res.json();
    const p = d.paper;
    if (!p) return;
    state.currentDetailId = p.id;
    state.currentFav = !!p.favorited;
    document.getElementById('dTitle').innerHTML = '<span class="preview-tag">试卷预览</span>' + escapeHTML(p.title);
    let meta =
      `<span class="tag">${escapeHTML(p.subject)}</span>
       <span class="tag">${p.year || ''} 年</span>
       <span class="tag">${escapeHTML(p.type || '')}</span>
       <span class="tag">${escapeHTML(p.volume || '—')}</span>
       <span class="tag">★ ${(p.rate || 0).toFixed(1)}</span>
       <span class="tag" style="display:inline-flex;align-items:center;gap:4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 4v10m0 0l-4-4m4 4l4-4M5 19h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>${fmtNum(p.downloads || 0)}</span>`;
    if (p.uploader) meta += `<span class="tag">上传者 · ${escapeHTML(p.uploader)}</span>`;
    document.getElementById('dMeta').innerHTML = meta;
    document.getElementById('dBody').innerHTML = (p.questions || []).map((q, i) => `
      <div class="q-block">
        <div class="q-t"><span class="n">题 ${i + 1}</span></div>
        <div class="q-text">${escapeHTML(q.q || '')}</div>
        <div class="a-t">参考答案 / 解析</div>
        <div class="a-text">${escapeHTML(q.a || '（暂无参考答案）')}</div>
      </div>`).join('');
    updateFavBtn(state.currentFav);
    document.getElementById('detailModal').classList.add('open');
    document.body.style.overflow = 'hidden';
  }).catch(() => toast('网络异常，无法加载试卷'));
}
function closeDetail() {
  document.getElementById('detailModal').classList.remove('open');
  document.body.style.overflow = '';
  state.currentDetailId = null;
}
function updateFavBtn(isFav) {
  document.getElementById('dFavText').textContent = isFav ? '已收藏' : '收藏';
  document.getElementById('dFav').style.color = isFav ? 'var(--gold)' : '';
}
document.getElementById('dFav').addEventListener('click', async () => {
  if (!state.currentDetailId) return;
  if (!state.currentUser) { toast('请先登录'); openLogin(); return; }
  const id = state.currentDetailId;
  const isFav = state.currentFav;
  const res = isFav
    ? await api('DELETE', '/api/favorites/' + id)
    : await api('POST', '/api/favorites', { paper_id: id });
  if (res.status === 401) { toast('请先登录'); openLogin(); return; }
  if (!res.ok) { toast(await parseError(res)); return; }
  state.currentFav = !isFav;
  updateFavBtn(state.currentFav);
  if (state.currentFav) state.favIds.add(id); else state.favIds.delete(id);
  renderChips();
  toast(state.currentFav ? '已加入收藏' : '已取消收藏');
});
document.getElementById('dPrint').addEventListener('click', () => { window.print(); });
document.getElementById('dClose').addEventListener('click', closeDetail);

/* ---------- 上传 modal ---------- */
function openUpload() {
  document.getElementById('uSubject').innerHTML = SUBJECTS.map(s => `<option>${s.key}</option>`).join('');
  document.getElementById('uploadModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeUpload() {
  document.getElementById('uploadModal').classList.remove('open');
  document.body.style.overflow = '';
}
document.getElementById('uSubmit').addEventListener('click', async () => {
  const subject = document.getElementById('uSubject').value;
  const year = parseInt(document.getElementById('uYear').value) || new Date().getFullYear();
  const type = document.getElementById('uType').value;
  const volume = document.getElementById('uVolume').value.trim() || '—';
  const title = document.getElementById('uTitle').value.trim();
  const qs = document.getElementById('uQuestions').value.split('\n').map(s => s.trim()).filter(Boolean);
  const as = document.getElementById('uAnswers').value.split('\n').map(s => s.trim()).filter(Boolean);
  if (!title) { toast('请填写试卷标题'); return; }
  if (qs.length === 0) { toast('请至少填写一道题目'); return; }
  if (!state.currentUser) { toast('请先登录后再上传'); openLogin(); return; }
  const questions = qs.map((q, i) => ({ q, a: as[i] || '（暂无参考答案）' }));
  const res = await api('POST', '/api/papers', { subject, title, year, type, volume, questions });
  if (res.status === 401) { toast('请先登录后再上传'); openLogin(); return; }
  if (!res.ok) { toast(await parseError(res)); return; }
  closeUpload();
  ['uYear', 'uVolume', 'uTitle', 'uQuestions', 'uAnswers'].forEach(id => document.getElementById(id).value = '');
  setActiveSubject(subject);
  document.getElementById('bank').scrollIntoView({ behavior: 'smooth' });
  toast('试卷已上传并加入题库');
});
document.getElementById('uClose').addEventListener('click', closeUpload);
document.getElementById('uCancel').addEventListener('click', closeUpload);

/* ---------- 检索 ---------- */
document.getElementById('heroSearchBtn').addEventListener('click', doHeroSearch);
document.getElementById('heroSearch').addEventListener('keydown', e => { if (e.key === 'Enter') doHeroSearch(); });
function doHeroSearch() {
  state.keyword = document.getElementById('heroSearch').value.trim();
  state.favMode = false; state.activeSubject = '全部';
  renderChips(); loadPapers();
  document.getElementById('bank').scrollIntoView({ behavior: 'smooth' });
}
let bankSearchTimer = null;
document.getElementById('bankSearch').addEventListener('input', e => {
  state.keyword = e.target.value.trim();
  clearTimeout(bankSearchTimer);
  bankSearchTimer = setTimeout(loadPapers, 200);
});
document.querySelectorAll('[data-tag]').forEach(b => {
  b.addEventListener('click', () => {
    document.getElementById('heroSearch').value = b.getAttribute('data-tag');
    doHeroSearch();
  });
});

/* ---------- 抽屉 ---------- */
function openDrawer() { document.getElementById('drawer').classList.add('open'); document.getElementById('drawerMask').classList.add('open'); }
function closeDrawer() { document.getElementById('drawer').classList.remove('open'); document.getElementById('drawerMask').classList.remove('open'); }
document.getElementById('hamburger').addEventListener('click', openDrawer);
document.getElementById('drawerClose').addEventListener('click', closeDrawer);
document.getElementById('drawerMask').addEventListener('click', closeDrawer);
document.querySelectorAll('[data-drawer]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); closeDrawer(); }));

/* ---------- 上传 / 收藏入口 ---------- */
['navUpload', 'navUpload2', 'bankUpload', 'drawerUpload', 'footUpload'].forEach(id => {
  const el = document.getElementById(id); if (el) el.addEventListener('click', e => { e.preventDefault(); closeDrawer(); openUpload(); });
});
['navFav', 'drawerFav', 'footFav'].forEach(id => {
  const el = document.getElementById(id); if (el) el.addEventListener('click', e => { e.preventDefault(); closeDrawer(); openFavMode(); });
});
document.getElementById('brandHome').addEventListener('click', () => { state.favMode = false; state.activeSubject = '全部'; renderChips(); loadPapers(); });

/* ---------- 工具 ---------- */
function fmtNum(n) { return n >= 10000 ? (n / 10000).toFixed(1) + 'w' : n.toLocaleString(); }
function escapeHTML(s) { return String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
let toastTimer = null;
function toast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
// 点击遮罩 / Esc 关闭 modal
document.querySelectorAll('.modal-mask').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) { m.classList.remove('open'); document.body.style.overflow = ''; } });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeDetail(); closeUpload(); closeDrawer(); closeLogin(); closeRegister(); const m = document.getElementById('userMenu'); if (m) m.classList.remove('open'); }
});
document.addEventListener('click', e => {
  const m = document.getElementById('userMenu');
  if (m && m.classList.contains('open') && !e.target.closest('.user-wrap')) m.classList.remove('open');
});

/* ---------- 登录态 / 账户（后端鉴权） ---------- */
const ICO_USER = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.5" stroke="currentColor" stroke-width="1.8"/><path d="M5 19a7 7 0 0 1 14 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const ICO_CHEVRON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICO_STAR = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 17.3l-5.4 3.2 1.4-6.1L3 10.3l6.2-.5L12 4l2.8 5.8 6.2.5-4.9 4.1 1.4 6.1z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
const ICO_EXIT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 8l-4 4 4 4M6 12h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICO_PEN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 20l4-1 9.5-9.5a2 2 0 0 0-2.8-2.8L5 16z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M13.5 6.5l3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

function renderAuth() {
  const cur = state.currentUser;
  const area = document.getElementById('authArea');
  const dArea = document.getElementById('drawerAuth');
  if (!cur) {
    area.innerHTML =
      `<button class="btn btn-ghost" id="navLogin">登录</button>
       <button class="btn btn-gold" id="navRegister">注册</button>`;
    dArea.innerHTML =
      `<a href="#" data-auth="login">${ICO_USER}登录</a>
       <a href="#" data-auth="register">${ICO_PEN}注册</a>`;
  } else {
    area.innerHTML =
      `<div class="user-wrap" id="userWrap">
         <button class="btn btn-ghost" id="navUser">${ICO_USER}${escapeHTML(cur.nick)} ${ICO_CHEVRON}</button>
         <button class="btn btn-ghost" id="navLogout">退出</button>
         <div class="user-menu" id="userMenu">
           <button id="umFav">${ICO_STAR}我的收藏</button>
           <button id="umLogout">${ICO_EXIT}退出</button>
         </div>
       </div>`;
    dArea.innerHTML =
      `<div class="da-user">${escapeHTML(cur.nick)}</div>
       <a href="#" data-auth="fav">${ICO_STAR}我的收藏</a>
       <a href="#" data-auth="logout">${ICO_EXIT}退出</a>`;
  }
  bindAuthEvents();
}

function bindAuthEvents() {
  const login = document.getElementById('navLogin');
  if (login) login.addEventListener('click', openLogin);
  const reg = document.getElementById('navRegister');
  if (reg) reg.addEventListener('click', openRegister);
  const nu = document.getElementById('navUser');
  if (nu) nu.addEventListener('click', e => { e.stopPropagation(); const m = document.getElementById('userMenu'); if (m) m.classList.toggle('open'); });
  const lo = document.getElementById('navLogout');
  if (lo) lo.addEventListener('click', logout);
  const umFav = document.getElementById('umFav');
  if (umFav) umFav.addEventListener('click', () => { const m = document.getElementById('userMenu'); if (m) m.classList.remove('open'); openFavMode(); });
  const umLo = document.getElementById('umLogout');
  if (umLo) umLo.addEventListener('click', logout);
  document.querySelectorAll('#drawerAuth [data-auth]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault(); closeDrawer();
      const a = el.getAttribute('data-auth');
      if (a === 'login') openLogin();
      else if (a === 'register') openRegister();
      else if (a === 'fav') openFavMode();
      else if (a === 'logout') logout();
    });
  });
}

function openLogin() {
  document.getElementById('loginModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('loginEmail').focus(), 50);
}
function closeLogin() {
  document.getElementById('loginModal').classList.remove('open');
  document.body.style.overflow = '';
  ['loginEmail', 'loginPwd'].forEach(id => document.getElementById(id).value = '');
}
document.getElementById('loginClose').addEventListener('click', closeLogin);
document.getElementById('loginCancel').addEventListener('click', closeLogin);
document.getElementById('loginSubmit').addEventListener('click', async () => {
  const email = document.getElementById('loginEmail').value.trim();
  const pwd = document.getElementById('loginPwd').value;
  if (!email || !pwd) { toast('请输入邮箱与密码'); return; }
  const res = await api('POST', '/api/auth/login', { email, password: pwd });
  if (!res.ok) { toast(await parseError(res)); return; }
  const d = await res.json();
  state.currentUser = d.user;
  closeLogin(); renderAuth();
  toast('欢迎回来，' + d.user.nick);
  loadPapers();
});
document.getElementById('loginPwd').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('loginSubmit').click(); });

function openRegister() {
  document.getElementById('registerModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('regNick').focus(), 50);
}
function closeRegister() {
  document.getElementById('registerModal').classList.remove('open');
  document.body.style.overflow = '';
  ['regNick', 'regEmail', 'regPwd', 'regPwd2', 'regPhone', 'regCode'].forEach(id => document.getElementById(id).value = '');
  // 复位验证码发码倒计时
  if (sendTimer) { clearInterval(sendTimer); sendTimer = null; }
  const sb = document.getElementById('regSendCode');
  if (sb) { sb.disabled = false; sb.textContent = '发送验证码'; }
  const dh = document.getElementById('regDemoHint');
  if (dh) { dh.style.display = 'none'; dh.textContent = ''; }
}
document.getElementById('regClose').addEventListener('click', closeRegister);
document.getElementById('regCancel').addEventListener('click', closeRegister);
document.getElementById('regSubmit').addEventListener('click', async () => {
  const nick = document.getElementById('regNick').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pwd = document.getElementById('regPwd').value;
  const pwd2 = document.getElementById('regPwd2').value;
  const phone = document.getElementById('regPhone').value.trim();
  const code = document.getElementById('regCode').value.trim();
  const t = pickSendTarget();
  if (!nick) { toast('请填写昵称'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('邮箱格式不正确（注册需邮箱作登录标识）'); return; }
  if (pwd.length < 6) { toast('密码长度至少 6 位'); return; }
  if (pwd !== pwd2) { toast('两次输入的密码不一致'); return; }
  if (!code) { toast('请先获取并填写验证码'); return; }
  if (!t) { toast('请先填写邮箱或手机号以发送验证码'); return; }
  const res = await api('POST', '/api/auth/register', {
    nick, email, password: pwd, phone: phone || undefined, code, channel: t.channel
  });
  if (!res.ok) { toast(await parseError(res)); return; }
  const d = await res.json();
  state.currentUser = d.user;
  closeRegister(); renderAuth();
  toast('注册成功');
  loadPapers();
});

/* ---------- 注册验证码发码（T5） ---------- */
let sendTimer = null;
function pickSendTarget() {
  const email = document.getElementById('regEmail').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  if (email) return { contact: email.toLowerCase(), channel: 'email' };   // 邮箱优先
  if (phone) return { contact: phone, channel: 'phone' };
  return null;                                                             // 两者皆空 → 提示
}
function startSendCountdown(sec) {
  const btn = document.getElementById('regSendCode');
  let left = sec;
  btn.disabled = true;
  btn.textContent = `${left}s 后重发`;
  clearInterval(sendTimer);
  sendTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) { clearInterval(sendTimer); sendTimer = null; btn.disabled = false; btn.textContent = '发送验证码'; }
    else btn.textContent = `${left}s 后重发`;
  }, 1000);
}
document.getElementById('regSendCode').addEventListener('click', async () => {
  const t = pickSendTarget();
  if (!t) { toast('请先填写邮箱或手机号'); return; }
  if (t.channel === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.contact)) { toast('邮箱格式不正确'); return; }
  if (t.channel === 'phone' && !/^1[3-9]\d{9}$/.test(t.contact)) { toast('手机号需为 11 位'); return; }
  const res = await api('POST', '/api/auth/send-code', t);
  if (res.status === 429) { toast(await parseError(res)); return; }   // 节流，按钮维持禁用
  if (!res.ok) { toast(await parseError(res)); return; }
  const d = await res.json();
  if (d.demoCode) {                                            // 仅 DEMO_MODE 响应含 demoCode
    const hint = document.getElementById('regDemoHint');
    hint.style.display = '';
    hint.textContent = `演示验证码：${d.demoCode}（演示模式，真实环境将通过邮件/短信发送）`;
  }
  startSendCountdown(60);                                      // 启动倒计时禁用按钮
});
document.getElementById('regPwd2').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('regSubmit').click(); });

async function logout() {
  try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch (e) { /* 忽略 */ }
  state.currentUser = null;
  const m = document.getElementById('userMenu'); if (m) m.classList.remove('open');
  renderAuth();
  state.favIds = new Set();
  toast('已退出登录');
  loadPapers();
}

/* ---------- 初始化 ---------- */
async function init() {
  renderSubjects();
  renderChips();
  // 恢复登录态：先读 access，失效则用 refresh 续期
  try {
    let res = await fetch('/api/auth/me', { credentials: 'include' });
    let d = await res.json();
    if (!d.user) {
      const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
      if (r.ok) { res = await fetch('/api/auth/me', { credentials: 'include' }); d = await res.json(); }
    }
    state.currentUser = d.user || null;
  } catch (e) { state.currentUser = null; }
  renderAuth();
  await loadStats();
  await loadPapers();
}
init();

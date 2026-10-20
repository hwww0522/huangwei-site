/* ============================================================================
   黄微的个人站 · 共享交互 app.js
   ---------------------------------------------------------------------------
   【这个文件是什么】
   全站 5 个页面共用的交互脚本，按段编号（1~10），每段开头都有说明。

   【软切换（本站核心机制，第 2 段）】
   点站内链接不再是整页跳转，而是「软切换」：磨砂层盖住 → fetch 目标页
   → 原地替换 nav/main/footer → 磨砂层揭开。好处：
   · 音乐播放器（第 8 段的全局 <audio>）不在被替换的区域内，
     切页时歌曲真正不断线，播放状态天然一致；
   · 转场更顺滑，浏览器不用重新解析整页。
   兜底：file:// 打开、系统"减少动态效果"、网址带 ?static=1 时退回整页跳转。

   【最常用的改动在哪里】
   · 光标大小 / 拖尾    → 第 1 段顶部的 GC 对象（size 是灵光半径）
   · 页面转场快慢       → 第 2 段的 230 / 200（毫秒）+ style.css 的 veilIn/veilOut
   · 画廊滚动速度       → 第 9 段 buildMarquees 里的 w / 46
   · 奖状墙滚动速度     → 第 9 段 buildCertCol 里的 max * 34
   · 播放器默认音量     → 第 8 段 applyResume 里的 setVol(.85)

   【两个全局开关】
   · reduce：系统开了「减少动态效果」或网址带 ?static=1 时为 true，
     所有动画/光标/转场/软切换自动关闭（截图静态页也靠它）。
   · fine：只有鼠标（pointer:fine）设备才启用光标和 3D 倾斜，触屏不受影响。
   ============================================================================ */
(function () {
'use strict';

var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || /(^|[?&])static/.test(location.search);
var fine = matchMedia('(pointer:fine)').matches;

/* =========================================================
   1. Ghost Cursor 幽灵光标（reactbits ghost-cursor 的 vanilla 实现）
   原理：建一个全屏 canvas，一串「链节」首尾跟随鼠标，每个链节画一个
   红色径向渐变光团，叠加出飘乎乎的拖尾；头部再画一个小亮核。
   想调样式只改下面 GC 对象，别动下面的绘制代码。
   ========================================================= */
var GC = {
  color: '#e5484d',   // 灵光颜色（苹果红；官方默认薰衣草紫 #B497CF）
  size: 17,           // 灵光半径 px，越大光团越大 ← 光标大小改这里
  trailLength: 26,    // 拖尾链节数，越多尾巴越长（官方默认 50）
  inertia: .5,        // 惯性 0~1，越大越飘、跟得越慢
  turbulence: .5,     // 扰动：尾巴左右摆动的幅度
  drift: .3,          // 漂移：尾巴另一种更慢的摆动
  clickPuff: true,    // 点击时是否荡开一圈光环
  fadeDelayMs: 260,   // 停手多少毫秒后灵光开始收起
  zIndex: 500
};

if (fine && !reduce) {
  document.body.classList.add('has-pointer');   // 有鼠标才隐藏系统光标

  // —— 画布准备：按屏幕尺寸 × 像素密度铺，保证高清屏不糊 ——
  var cv = document.createElement('canvas');
  cv.id = 'ghostCursor';
  document.body.appendChild(cv);
  var ctx = cv.getContext('2d');
  var dpr = Math.min(devicePixelRatio || 1, 2);
  function sizeCanvas() {
    cv.width = Math.round(innerWidth * dpr);
    cv.height = Math.round(innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  sizeCanvas();
  addEventListener('resize', sizeCanvas);

  var rgb = [229, 72, 77]; // GC.color 的 RGB 分解（改色时同步改这里）
  var mx = innerWidth / 2, my = innerHeight / 2;   // 鼠标位置
  var lastMove = performance.now();
  var chain = [];                                   // 拖尾链节
  for (var i = 0; i < GC.trailLength; i++) chain.push({ x: mx, y: my });
  var puffs = [];                                   // 点击产生的扩散环

  document.addEventListener('pointermove', function (e) {
    mx = e.clientX; my = e.clientY; lastMove = performance.now();
  }, { passive: true });

  addEventListener('pointerdown', function (e) {
    if (GC.clickPuff) puffs.push({ x: e.clientX, y: e.clientY, r: 6, a: .55 });
  }, true);

  document.addEventListener('mouseleave', function () { cv.style.opacity = 0; });  // 移出窗口隐藏
  document.addEventListener('mouseenter', function () { cv.style.opacity = ''; });

  // 画一个径向渐变光团：(x,y) 中心，r 半径，a 透明度
  function aura(x, y, r, a) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + (a * .34).toFixed(3) + ')');
    g.addColorStop(.55, 'rgba(' + rgb + ',' + (a * .12).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }

  // 主循环：每帧重画
  (function frame(t) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    // 停手超过 fadeDelayMs 后，灵光逐渐变暗收起
    var idle = Math.min((t - lastMove - GC.fadeDelayMs) / 900, 1);
    var dim = 1 - Math.max(0, idle) * .72;

    // 链节跟随：头节追鼠标，后面的逐节追前一节（惯性来源）
    var follow = 1 - GC.inertia * .62;
    chain[0].x += (mx - chain[0].x) * follow;
    chain[0].y += (my - chain[0].y) * follow;
    for (var i = 1; i < chain.length; i++) {
      chain[i].x += (chain[i - 1].x - chain[i].x) * .34;
      chain[i].y += (chain[i - 1].y - chain[i].y) * .34;
    }

    // 从尾到头画渐弱光团：越靠后的链节越小越透明
    for (var i = chain.length - 1; i >= 0; i--) {
      var p = chain[i];
      var f = 1 - i / chain.length;
      var wob = Math.sin(t * .0022 + i * .65) * GC.turbulence * 3.2
              + Math.sin(t * .0013 + i * .31) * GC.drift * 2.6;
      var wobY = Math.cos(t * .0019 + i * .52) * GC.turbulence * 3.2;
      aura(p.x + wob, p.y + wobY, GC.size * (.35 + f * .75), f * dim);
    }
    // 头部亮核：一个实心红点 + 一点白色高光，像镜头反光
    var h = chain[0];
    aura(h.x, h.y, GC.size * .5, dim);
    ctx.fillStyle = 'rgba(' + rgb + ',' + (.85 * dim).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(h.x, h.y, 2.8, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,' + (.8 * dim).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(h.x - 1, h.y - 1, 1.1, 0, 7); ctx.fill();

    // 点击 puff：光环一边扩散一边淡出
    for (var i = puffs.length - 1; i >= 0; i--) {
      var pf = puffs[i];
      pf.r += 3.4; pf.a -= .022;
      if (pf.a <= 0) { puffs.splice(i, 1); continue; }
      ctx.strokeStyle = 'rgba(' + rgb + ',' + pf.a.toFixed(3) + ')';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(pf.x, pf.y, pf.r, 0, 7); ctx.stroke();
    }

    requestAnimationFrame(frame);
  })(performance.now());
}

/* =========================================================
   2. 页面转场 + 软切换
   ----------------------------------------------------------------
   点站内链接：奶白磨砂层淡入盖住（.leaving）→ fetch 目标页 HTML
   → 原地替换 nav / main / footer（音频等 body 级元素不受影响）
   → 磨砂层揭开（boot + .out，与整页加载的进场完全同款）。
   时长三处要一起改：下面的 230/200、style.css 的 veilIn、veilOut。
   ========================================================= */
var veil = document.getElementById('veil');
var canSoftNav = !reduce
  && location.protocol.indexOf('http') === 0          // file:// 下 fetch 会被拦，退回整页跳
  && typeof fetch === 'function'
  && typeof history !== 'undefined' && history.pushState
  && typeof DOMParser !== 'undefined';

/* 把抓回来的页面换进当前文档：标题 / body 类 / 三个区块 */
function swapInto(doc) {
  var b = document.body, nb = doc.body;
  document.title = doc.title || document.title;
  // 换 body 类时保留脚本加的全局类：has-pointer(光标)、boot/leaving(转场)
  var keep = ['has-pointer', 'boot', 'leaving'].filter(function (c) { return b.classList.contains(c); });
  b.className = nb.className || '';
  keep.forEach(function (c) { b.classList.add(c); });
  if (nb.getAttribute('data-page')) b.setAttribute('data-page', nb.getAttribute('data-page'));
  else b.removeAttribute('data-page');
  // 只换这三个区块；#veil、光标画布、迷你播放器、灯箱都是 body 级，原样保留
  ['nav', 'main', 'footer'].forEach(function (tag) {
    var cur = b.querySelector(tag), next = nb.querySelector(tag);
    if (cur && next) b.replaceChild(document.importNode(next, true), cur);
  });
  scrollTo(0, 0);
  initPage();   // 各页初始化（reveal/计数器/画廊/播放器换绑……）重跑一遍
  // 进场：与整页加载同款 —— veil 盖住 → .out 淡出；main 自带 pagein 上浮
  b.classList.add('boot');
  b.classList.remove('leaving');
  if (veil) {
    veil.classList.remove('out');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { veil.classList.add('out'); });
    });
  }
}

/* 软切换主体：fetch → 换内容 → pushState。失败返回 false（外层兜底整页跳） */
function softNav(href, push) {
  return fetch(href, { credentials: 'same-origin' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      swapInto(doc);
      if (push) history.pushState({}, '', href);
      return true;
    })
    .catch(function () { return false; });
}

document.addEventListener('click', function (e) {
  var a = e.target.closest && e.target.closest('a[href]');
  if (!a || reduce) return;
  var href = a.getAttribute('href');
  if (!href || /^(https?:|#|mailto:|tel:)/.test(href)) return;   // 站外/锚点/协议链接不拦
  if (a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;  // 新标签交给浏览器
  // 当前页自己：不重复加载
  if (a.pathname === location.pathname && a.search === location.search) { e.preventDefault(); return; }

  e.preventDefault();
  if (!canSoftNav) {                       // file:// 等：退回旧版整页跳转
    document.body.classList.remove('boot');
    document.body.classList.add('leaving');
    setTimeout(function () { location.href = href; }, 230);
    return;
  }
  document.body.classList.remove('boot');
  document.body.classList.add('leaving');            // veil 淡入盖住（.2s）
  setTimeout(function () {                           // 盖住后原地换内容
    softNav(href, true).then(function (ok) {
      if (!ok) location.href = href;                 // fetch 失败兜底整页跳
    });
  }, 200);
});

/* 浏览器前进/后退：同样走软切换，音频继续不断 */
addEventListener('popstate', function () {
  if (canSoftNav) softNav(location.href, false);
});

/* 进页衔接：body 默认带 .boot（veil 盖着页面），下一帧加 .out 淡出，
   上一页的 veilIn 就无缝接上了这一页的 veilOut */
document.body.classList.add('boot');
requestAnimationFrame(function () {
  requestAnimationFrame(function () {
    if (veil) veil.classList.add('out');
  });
});

/* =========================================================
   3. reveal 入场：.rv 元素滚进视口时加 .in（CSS 负责淡入上浮）
   软切换后 initPage() 会重跑，已标记过的元素不重复观察。
   ========================================================= */
function initReveal() {
  var els = [].slice.call(document.querySelectorAll('.rv'));
  if (reduce || !('IntersectionObserver' in window)) {
    els.forEach(function (el) { el.classList.add('in'); });
    return;
  }
  if (!initReveal.io) {
    initReveal.io = new IntersectionObserver(function (es) {
      es.forEach(function (e, i) {
        if (e.isIntersecting) {
          var el = e.target;
          setTimeout(function () { el.classList.add('in'); }, i * 70);  // 同屏多个依次错开
          initReveal.io.unobserve(el);
        }
      });
    }, { threshold: .12, rootMargin: '0px 0px -40px' });
  }
  els.forEach(function (el) {
    if (!el.dataset.rvOn) { el.dataset.rvOn = '1'; initReveal.io.observe(el); }
  });
}

/* =========================================================
   4. 数字滚动：带 [data-count] 的元素滚进视口后从 0 数到目标值
   可选属性：data-dec（小数位） data-suffix（后缀，如 % / +）
   ========================================================= */
function runNum(el) {
  var to = parseFloat(el.dataset.count);
  var dec = parseInt(el.dataset.dec || 0, 10);
  var suf = el.dataset.suffix || '';
  if (reduce) { el.textContent = to.toFixed(dec) + suf; return; }
  var t0 = null, dur = 1300;
  (function step(ts) {
    if (!t0) t0 = ts;
    var p = Math.min((ts - t0) / dur, 1);
    var e = 1 - Math.pow(1 - p, 3);               // easeOutCubic 缓动
    el.textContent = (to * e).toFixed(dec) + suf;
    if (p < 1) requestAnimationFrame(step);
  })(performance.now());
}
function initCounters() {
  var nums = [].slice.call(document.querySelectorAll('[data-count]'));
  if (!nums.length) return;
  if (reduce || !('IntersectionObserver' in window)) { nums.forEach(runNum); return; }
  if (!initCounters.io) {
    initCounters.io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { runNum(e.target); initCounters.io.unobserve(e.target); } });
    }, { threshold: .5 });
  }
  nums.forEach(function (el) {
    if (!el.dataset.numOn) { el.dataset.numOn = '1'; initCounters.io.observe(el); }
  });
}

/* =========================================================
   5. holo card：项目卡 3D 倾斜（鼠标位置 → 轻微 rotateX/Y + 流光角度）
   ========================================================= */
function initHolo() {
  if (!fine || reduce) return;
  document.querySelectorAll('.holo').forEach(function (card) {
    if (card.dataset.holoOn) return;
    card.dataset.holoOn = '1';
    card.style.transition = 'transform .5s cubic-bezier(.22,.61,.36,1), box-shadow .4s';
    card.addEventListener('pointermove', function (e) {
      var r = card.getBoundingClientRect();
      var dx = (e.clientX - r.left) / r.width - .5;   // -0.5 ~ 0.5
      var dy = (e.clientY - r.top) / r.height - .5;
      card.style.transform = 'perspective(1100px) rotateY(' + (dx * 5).toFixed(2) + 'deg) rotateX(' + (-dy * 5).toFixed(2) + 'deg) translateY(-3px)';
      card.style.setProperty('--ha', (dx * 140 + 40).toFixed(0) + 'deg');  // 锥形流光随鼠标转
    }, { passive: true });
    card.addEventListener('pointerleave', function () { card.style.transform = ''; });
  });
}

/* =========================================================
   6. 关于我：画画 / 旅行 / 志愿 三档切换（eslider 滑块）
   ========================================================= */
function initEslider() {
  var es = document.querySelector('.eslider');
  if (!es || es.dataset.esOn) return;
  es.dataset.esOn = '1';
  var btns = [].slice.call(es.querySelectorAll('button'));
  var thumb = es.querySelector('.es-thumb');
  var panels = [].slice.call(document.querySelectorAll('.es-panel'));
  function go(i) {
    btns.forEach(function (b, j) { b.classList.toggle('on', j === i); });
    thumb.style.transform = 'translateX(' + i * 100 + '%)';
    panels.forEach(function (p, j) { p.classList.toggle('on', j === i); });
  }
  btns.forEach(function (b, i) { b.addEventListener('click', function () { go(i); }); });
  go(0);
}

/* =========================================================
   7. toast 提示条 + [data-copy] 点击复制（联系页微信号用）
   事件委托到 document，软切换换掉 main 后依然有效。
   ========================================================= */
var toast = document.getElementById('toast');
var tt;
function say(msg) {
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('on');
  clearTimeout(tt);
  tt = setTimeout(function () { toast.classList.remove('on'); }, 1800);
}
document.addEventListener('click', function (e) {
  var el = e.target.closest && e.target.closest('[data-copy]');
  if (!el) return;
  var v = el.dataset.copy;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(v).then(function () { say('已复制：' + v); }, function () { say(v); });
  } else {
    // 老浏览器兜底：藏一个 textarea 用 execCommand 复制
    var t = document.createElement('textarea');
    t.value = v; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); say('已复制：' + v); } catch (err) { say(v); }
    document.body.removeChild(t);
  }
});

/* =========================================================
   8. 音乐播放器：《一颗苹果》五月天
   ----------------------------------------------------------------
   8a. 全站唯一音频源：gAudio 挂在 body 上（不在 nav/main/footer 里），
       软切换换页时它原地不动 —— 歌曲真正不断线，播放状态天然一致。
   8b. UI 换绑：首页绑大播放卡（.music-card），子页注入右下角迷你窗；
       每次换页 bindPlayerUI() 重建 UI 并与 gAudio 对齐当前状态。
   8c. 状态桥：进度/是否在播/音量 也同步进 localStorage（key: hw-music-state），
       整页刷新或直接打开子页时照样能接上；软切换场景用不到它，是保底。
   dragify 是通用「按住拖动取值(0~1)」工具，进度条和音量条共用。
   ========================================================= */

/* —— 8c. 状态桥：localStorage 读写 —— */
var MKEY = 'hw-music-state';

function saveMusicState(t, playing, v) {  // 写状态（隐私模式下 localStorage 可能禁用，静默失败即可）
  try { localStorage.setItem(MKEY, JSON.stringify({ t: t || 0, p: !!playing, v: v })); } catch (e) {}
}
function loadMusicState() {               // 读状态：没有记录或格式不对就返回 null
  try {
    var s = JSON.parse(localStorage.getItem(MKEY) || 'null');
    return s && typeof s.t === 'number' ? s : null;
  } catch (e) { return null; }
}
var mState = loadMusicState();

function fmt(s) {  // 秒 → "分:秒"
  s = Math.max(0, Math.round(s));
  return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2);
}

/* 通用拖动条：按下→记录拖动，移动→把位置换算成 0~1 传给 onMove */
function dragify(el, onMove) {
  var dragging = false;
  function pos(e) {
    var r = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
  }
  el.addEventListener('pointerdown', function (e) {
    dragging = true; el.classList.add('drag');
    if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (err) {} }
    onMove(pos(e));
    e.preventDefault();
  });
  el.addEventListener('pointermove', function (e) { if (dragging) onMove(pos(e)); });
  function up() { if (!dragging) return; dragging = false; el.classList.remove('drag'); }
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

/* —— 8a. 全局音频源 —— */
var gAudio = new Audio('assets/audio/yike-pingguo-mayday.mp3');
gAudio.preload = 'metadata';
gAudio.style.display = 'none';
document.body.appendChild(gAudio);

var ui = null;             // 当前绑定的 UI：{kind:'card'|'mini', root, ...元素}
var sessionPlayed = false; // 本会话是否真的放过歌（软切换时判断迷你窗显隐用）
var resumeDone = false;    // 硬加载时的自动续播只做一次
var lastVol = .85;
var pendingSeek = mState ? Math.max(0, mState.t) : 0;  // 硬加载要恢复的进度

function playerSync() { saveMusicState(gAudio.currentTime, !gAudio.paused, gAudio.volume); }

function setVol(p) {  // 音量 0~1，静音时记住上次的音量
  p = Math.max(0, Math.min(1, p));
  gAudio.volume = p;
  gAudio.muted = false;
  if (ui && ui.kind === 'card') {   // 只有首页大卡有音量条
    ui.vfill.style.width = (p * 100).toFixed(1) + '%';
    ui.vknob.style.left = (p * 100).toFixed(1) + '%';
    ui.vol.setAttribute('aria-valuenow', Math.round(p * 100));
  }
  if (p > 0) lastVol = p;
}

function togglePlay() {
  if (gAudio.paused) { var pr = gAudio.play(); if (pr && pr.catch) pr.catch(function () {}); }
  else gAudio.pause();
}

/* 统一刷新：不管绑的是大卡还是迷你窗，都按 gAudio 的真实状态渲染 */
function renderUI() {
  if (!ui) return;
  var d = gAudio.duration || 0, c = gAudio.currentTime || 0;
  var p = d ? c / d * 100 : 0;
  var on = !gAudio.paused;
  ui.fill.style.width = p.toFixed(2) + '%';
  ui.seek.setAttribute('aria-valuenow', Math.round(p));
  ui.icPlay.style.display = on ? 'none' : '';
  ui.icPause.style.display = on ? '' : 'none';
  ui.root.classList.toggle('playing', on);
  if (on) ui.root.classList.remove('need-tap');   // 有了真实状态就不再闪提示
  if (ui.kind === 'card') {
    ui.knob.style.left = p.toFixed(2) + '%';
    ui.cur.textContent = fmt(c);
    ui.dur.textContent = d ? '-' + fmt(d - c) : '-0:00';
  }
}

/* gAudio 的全局事件：状态变化 → 刷 UI + 写存档 */
gAudio.addEventListener('loadedmetadata', function () {
  // 恢复存档进度必须等元数据（拿到总时长），否则浏览器忽略赋值
  if (pendingSeek > 0 && pendingSeek < (gAudio.duration || Infinity)) gAudio.currentTime = pendingSeek;
  pendingSeek = 0;
  renderUI();
});
gAudio.addEventListener('play', function () { sessionPlayed = true; renderUI(); playerSync(); });
gAudio.addEventListener('pause', function () { renderUI(); playerSync(); });
gAudio.addEventListener('volumechange', playerSync);
gAudio.addEventListener('timeupdate', function () { renderUI(); playerSync(); });
gAudio.addEventListener('ended', function () {          // 不循环：回开头并清掉存档
  gAudio.currentTime = 0; renderUI();
  saveMusicState(0, false, gAudio.volume);
});
addEventListener('pagehide', playerSync);               // 整页跳走前最后存一次

/* 硬加载自动续播：上次是「播放中」关的页面就接着放；
   浏览器拦截自动出声时静默失败（迷你窗闪呼吸光提示点一下） */
function applyResume() {
  resumeDone = true;
  if (!(mState && mState.p)) return;
  setVol(typeof mState.v === 'number' && mState.v > 0 ? mState.v : .85);
  var pr = gAudio.play();
  if (pr && pr.catch) pr.catch(function () {
    if (ui && ui.kind === 'mini') ui.root.classList.add('need-tap');
  });
}

/* —— 8b. UI 换绑：每次页面初始化（含软切换后）调用 ——
   首页 → 绑大卡；子页 → 本会话放过歌或有存档时注入迷你窗 */
function bindPlayerUI() {
  if (ui && ui.kind === 'mini' && ui.root) ui.root.remove();   // 旧迷你窗卸下
  ui = null;

  var card = document.querySelector('.music-card');
  if (card) {
    /* 首页大播放卡 */
    var seek = document.getElementById('mSeek');
    var playBtn = document.getElementById('mPlay');
    var vol = document.getElementById('mVol');
    var muteBtn = document.getElementById('mMute');
    ui = {
      kind: 'card', root: card,
      seek: seek, fill: document.getElementById('mFill'), knob: document.getElementById('mKnob'),
      cur: document.getElementById('mCur'), dur: document.getElementById('mDur'),
      icPlay: playBtn.querySelector('.ic-play'), icPause: playBtn.querySelector('.ic-pause'),
      playBtn: playBtn, vol: vol,
      vfill: document.getElementById('mVolFill'), vknob: document.getElementById('mVolKnob'),
      muteBtn: muteBtn
    };
    playBtn.addEventListener('click', togglePlay);
    document.getElementById('mBack').addEventListener('click', function () { gAudio.currentTime = Math.max(0, gAudio.currentTime - 15); });
    document.getElementById('mFwd').addEventListener('click', function () {
      var d = gAudio.duration || 1e9;
      gAudio.currentTime = Math.min(d - .3, gAudio.currentTime + 15);
    });
    dragify(seek, function (p) { if (gAudio.duration) { gAudio.currentTime = p * gAudio.duration; renderUI(); } });
    dragify(vol, function (p) { setVol(p); });
    muteBtn.addEventListener('click', function () {  // 静音↔恢复
      if (gAudio.volume > 0) { lastVol = gAudio.volume; setVol(0); }
      else setVol(lastVol);
    });
    // 键盘可达：进度条 ←→ 5 秒，音量条 ←→ 5%
    seek.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { gAudio.currentTime += 5; e.preventDefault(); }
      if (e.key === 'ArrowLeft') { gAudio.currentTime -= 5; e.preventDefault(); }
    });
    vol.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { setVol(gAudio.volume + .05); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { setVol(gAudio.volume - .05); e.preventDefault(); }
    });
    // 默认音量：优先用上次的音量存档，没有才用 0.85 ← 想改默认值改这里
    setVol(typeof mState === 'object' && mState && typeof mState.v === 'number' && mState.v > 0 ? mState.v : .85);
    renderUI();
    if (!resumeDone) applyResume();
  } else {
    /* 子页迷你播放器：本会话放过歌，或存档里是播放中/进度超过 1 秒才出现 */
    var show = sessionPlayed || !!(mState && (mState.p || mState.t > 1));
    if (!show) return;
    var box = document.createElement('div');
    box.id = 'miniMusic';
    box.className = 'mini-music';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', '音乐播放器：一颗苹果 · 五月天');
    box.innerHTML =
      '<img class="mm-art" src="assets/img/apple-cirrus.jpg" alt="一颗苹果 · 五月天">' +
      '<div class="mm-body">' +
        '<div class="mm-top"><b class="mm-title">一颗苹果</b><span class="mm-artist">五月天</span></div>' +
        '<div class="mm-seek" id="mmSeek" tabindex="0" role="slider" aria-label="播放进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
          '<div class="mm-bar"><div class="mm-fill" id="mmFill"></div></div>' +
        '</div>' +
      '</div>' +
      '<button type="button" class="mm-play" id="mmPlay" aria-label="播放 / 暂停">' +
        '<svg class="ic-play" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>' +
        '<svg class="ic-pause" viewBox="0 0 24 24" fill="currentColor" style="display:none"><path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z"/></svg>' +
      '</button>';
    document.body.appendChild(box);
    var mSeek = box.querySelector('#mmSeek');
    var mPlay = box.querySelector('#mmPlay');
    ui = {
      kind: 'mini', root: box,
      seek: mSeek, fill: box.querySelector('#mmFill'),
      icPlay: mPlay.querySelector('.ic-play'), icPause: mPlay.querySelector('.ic-pause'),
      playBtn: mPlay
    };
    if (typeof mState === 'object' && mState && typeof mState.v === 'number' && mState.v >= 0) {
      gAudio.volume = Math.max(0, Math.min(1, mState.v));   // 沿用上次音量
    }
    mPlay.addEventListener('click', togglePlay);
    dragify(mSeek, function (p) {   // 可拖进度
      if (gAudio.duration) { gAudio.currentTime = p * gAudio.duration; renderUI(); playerSync(); }
    });
    mSeek.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { gAudio.currentTime += 5; e.preventDefault(); }
      if (e.key === 'ArrowLeft') { gAudio.currentTime -= 5; e.preventDefault(); }
    });
    requestAnimationFrame(function () { box.classList.add('on'); });   // 滑入
    renderUI();
    if (!resumeDone) applyResume();
  }
}

/* =========================================================
   9. 画廊与奖状墙（关于我 + 获奖页）
   9a. buildCertCol  奖状墙：不复制、不重复！内容滚到底后原路滚回
                      （Web Animations 的 direction: alternate 实现）。
   9b. buildMarquees 横向画廊：图片复制一份做无缝循环（这个必须复制，
                      否则循环处会跳变；奖状墙纵向高、滚回来不违和所以
                      用了来回模式，两者需求不同）。
   软切换后内容是全新节点，dataset.built 未打标，会自然重建。
   ========================================================= */

/* 等容器里的图片全部就绪（或 2.5s 兜底）再执行 cb，
   软切换进来时 readyState 已是 complete，不能再等 window load */
function whenImagesReady(container, cb) {
  var imgs = [].slice.call(container.querySelectorAll('img'));
  var left = imgs.length;
  if (!left) { cb(); return; }
  var fired = false;
  function fin() { left--; if (left <= 0 && !fired) { fired = true; cb(); } }
  imgs.forEach(function (im) {
    if (im.complete) fin();
    else { im.addEventListener('load', fin); im.addEventListener('error', fin); }
  });
  setTimeout(function () { if (!fired) { fired = true; cb(); } }, 2500);
}

/* 9a. 奖状墙：只滚一份 22 张奖状，从上到下再从下到上，永不重复播放 */
function buildCertCol() {
  var col = document.querySelector('.cert-col');
  if (!col || col.dataset.built) return;
  var track = document.getElementById('certTrack');
  if (!track) return;
  col.dataset.built = '1';
  if (reduce) return;              // 静态模式：铺开不滚

  function start() {
    // 最多能滚多少 = 内容高 - 展示框高；内容不够高就不滚
    var max = Math.max(0, track.scrollHeight - col.clientHeight);
    if (max < 40) return;
    // duration：每像素 34ms，想快就把 34 调小
    var anim = track.animate(
      [{ transform: 'translate3d(0,0,0)' },
       { transform: 'translate3d(0,' + (-max) + 'px,0)' }],
      { duration: Math.max(12000, max * 34), iterations: Infinity, direction: 'alternate', easing: 'linear' }
    );
    col.addEventListener('mouseenter', function () { anim.pause(); });   // 悬停暂停
    col.addEventListener('mouseleave', function () { anim.play(); });
  }
  whenImagesReady(track, start);   // 等奖状图加载完再量高度，避免算错
}

/* 9b. 横向画廊：>3 张才滚动。把图片包成 A、B 两组（B 是 A 的副本），
   动画把整体平移 -50%，A 完全离开视口时 B 正好接上，肉眼无缝。
   速度：宽度 / 46 = 动画秒数（46 是每秒像素）。 */
function buildMarquees() {
  document.querySelectorAll('.gal').forEach(function (g) {
    if (g.dataset.built) return;
    var items = [].slice.call(g.children);
    if (items.length < 4) return;                 // 3 张及以下：静态铺开
    g.dataset.built = '1';

    var track = document.createElement('div');
    track.className = 'gal-track';
    var A = document.createElement('div');
    A.className = 'gal-group';
    var B = document.createElement('div');
    B.className = 'gal-group';
    B.setAttribute('aria-hidden', 'true');        // 副本对读屏软件隐藏

    items.forEach(function (el) { A.appendChild(el); });
    items.forEach(function (el) {
      var c = el.cloneNode(true);
      c.classList.remove('cursor-target');
      B.appendChild(c);
    });
    track.appendChild(A);
    track.appendChild(B);
    g.appendChild(track);

    var w = A.offsetWidth || 2000;
    track.style.animationDuration = Math.max(22, w / 46).toFixed(1) + 's';
    track.style.animationDirection = g.dataset.dir === 'rev' ? 'reverse' : 'normal';  // data-dir="rev" 可倒着滚
  });
}

/* =========================================================
   10. 灯箱：点任意 .gal-item（画廊/奖状）弹出大图
   Esc / 点空白 / 点 × 关闭。结构是 JS 动态创建的 #lb，
   点击用事件委托，软切换换掉 main 后依然有效。
   ========================================================= */
var lb = document.createElement('div');
lb.id = 'lb';
lb.innerHTML = '<button class="lb-x" aria-label="关闭">×</button><img alt=""><div class="lb-cap">点击空白或按 Esc 关闭</div>';
document.body.appendChild(lb);
var lbImg = lb.querySelector('img');

function openLb(src) {
  lbImg.src = src;
  lb.classList.add('on');
}
function closeLb() { lb.classList.remove('on'); lbImg.removeAttribute('src'); }

lb.addEventListener('click', function (e) {
  if (e.target === lb || e.target.closest('.lb-x')) closeLb();
});
addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLb(); });

document.addEventListener('click', function (e) {
  var it = e.target.closest && e.target.closest('.gal-item');
  if (!it || it.closest('#lb')) return;
  var img = it.querySelector('img');
  if (img) openLb(img.currentSrc || img.src);
});

/* =========================================================
   启动：首次进页 + 之后每次软切换都跑一遍各页初始化
   ========================================================= */
function initPage() {
  initReveal();
  initCounters();
  initHolo();
  initEslider();
  buildMarquees();
  buildCertCol();
  bindPlayerUI();
}
initPage();

})();

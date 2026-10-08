(() => {
'use strict';
if (window.__smLoaded) return; window.__smLoaded = true;

/* ───────── helpers ───────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => (s || '').replace(/\s+/g, ' ').trim();
const fmt = s => { s = Math.max(0, Math.floor(s || 0)); const h = s / 3600 | 0, m = (s % 3600) / 60 | 0, x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const toSec = t => t.split(':').reduce((a, b) => a * 60 + +b, 0);
const qs = () => new URLSearchParams(location.search);
const vid = () => qs().get('v');
const video = () => $('video.html5-main-video') || $('video');
const player = () => $('#movie_player');
const vEl = () => { const p = player(); return (p && p.querySelector('video')) || video(); };
const now = () => { const p = player(), t = p && p.getCurrentTime && p.getCurrentTime(); return Number.isFinite(t) ? t : (vEl() ? vEl().currentTime : 0) || 0; };
const dur = () => { const p = player(), d = p && p.getDuration && p.getDuration(); return d > 0 ? d : (vEl() ? vEl().duration : 0) || 0; };
const st = () => { const p = player(); return p && p.getPlayerState ? p.getPlayerState() : -2; };
const isPlaying = () => { const p = player(); if (p && p.getPlayerState) return [1, 3].includes(p.getPlayerState()); const v = vEl(); return !!v && !v.paused; };
const togglePlay = () => { const p = player(), v = vEl();
  if (isPlaying()) p && p.pauseVideo ? p.pauseVideo() : v && v.pause(); else p && p.playVideo ? p.playVideo() : v && v.play(); };
const seek = t => { const p = player(); p && p.seekTo ? p.seekTo(t, true) : (vEl().currentTime = t); };
const svg = (d, s = 18) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="currentColor"><path d="${d}"/></svg>`;
const chev = s => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;
const ICON = {
  pause: svg('M7 5h3.5v14H7zM13.5 5H17v14h-3.5z'), play: svg('M8 5v14l11-7z'),
  cam: svg('M9 4 7.6 6H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2.6L15 4zm3 4.5a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'),
  send: svg('M4 4l17 8-17 8 3-8z', 17), down: chev(22), fold: chev(18)
};
const store = (typeof chrome !== 'undefined' && chrome.storage) ? chrome.storage.local : null;
const kv = {
  async get(k) { try { const v = (await store.get(k))[k]; return v === undefined ? null : v; } catch { return null; } },
  set(k, v) { try { store.set({ [k]: v }); } catch {} }
};
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

/* ───────── Gemini bridge (drives YouTube's own "Ask" panel) ─────────
   YouTube has no public API for Ask/Gemini, so this clicks through the real UI.
   If YouTube changes its markup, tweak the finders below. */
const Gemini = (() => {
  const SKIP = '#sm-root,#sm-launch,#masthead-container,ytd-searchbox';
  const findInput = () => $$('textarea,[contenteditable="true"],input[type="text"]').find(el =>
    !el.closest(SKIP) && el.getClientRects().length &&
    /ask|chat|question|prompt/i.test(el.getAttribute('placeholder') || el.getAttribute('aria-label') || el.getAttribute('data-placeholder') || ''));
  const findAsk = () => $$('ytd-watch-flexy button,ytd-watch-flexy [role="button"]').find(b =>
    !b.closest(SKIP) && /^ask\b/i.test(norm(b.getAttribute('aria-label') || b.textContent)));
  const panelOf = el => el.closest('ytd-engagement-panel-section-list-renderer,[role="dialog"],[role="complementary"]') ||
    el.parentElement.parentElement.parentElement.parentElement;
  const waitFor = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(80); } return null; };
  const setValue = (el, text) => {
    el.focus();
    if (el.isContentEditable) { document.execCommand('selectAll'); document.execCommand('insertText', false, text); }
    else { const p = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(p, 'value').set.call(el, text); el.dispatchEvent(new Event('input', { bubbles: true })); }
  };
  const submit = (input, panel) => {
    const b = $$('button', panel).find(b => /send|submit/i.test(b.getAttribute('aria-label') || '') && !b.disabled);
    if (b) b.click();
    else ['keydown', 'keypress', 'keyup'].forEach(t => input.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true })));
  };
  // messages area = biggest ancestor of our question bubble that doesn't also hold the input box
  const locate = (input, tail) => {
    let root = input.parentElement;
    for (let i = 0; root && i < 14 && !norm(root.textContent).includes(tail); i++) root = root.parentElement;
    if (!root || !norm(root.textContent).includes(tail)) return null;
    const bubble = $$('*', root).filter(e => !e.contains(input) && !input.contains(e) && norm(e.textContent).includes(tail))
      .sort((a, b) => a.textContent.length - b.textContent.length)[0];
    if (!bubble) return null;
    let area = bubble;
    while (area.parentElement && area.parentElement !== root && !area.parentElement.contains(input)) area = area.parentElement;
    return area;
  };
  // smallest element holding the whole answer, so its formatting survives
  const extract = (area, ans, tail) => {
    const a = ans.slice(0, 40), b = ans.slice(-40);
    const node = $$('*', area).filter(e => { const t = norm(e.textContent); return t.includes(a) && t.includes(b) && !t.includes(tail); })
      .sort((x, y) => x.textContent.length - y.textContent.length)[0];
    return { text: ans, node: node || null };
  };

  let epoch = 0;   // bumped on every lecture change: stale requests abort instead of blocking the queue
  const run = async (prompt, ep, settle = 2000) => {
    const stop = () => { if (ep !== epoch) throw new Error('cancelled'); };
    const open = async () => {
      let el = findInput();
      if (!el) { const b = findAsk(); if (!b) throw new Error('no-ask'); b.click(); el = await waitFor(findInput, 9000); stop(); if (!el) throw new Error('no-input'); }
      return el;
    };
    stop();
    const tail = norm(prompt).slice(-30);
    let input = await open(), area = null, prev = '', since = 0, tries = 0, sent = 0;
    const send = async () => { setValue(input, prompt); await sleep(120); stop(); submit(input, panelOf(input)); sent = Date.now(); };
    await send();
    const t0 = Date.now();
    while (Date.now() - t0 < 150000) {
      await sleep(300); stop();
      if (!input.isConnected) input = findInput() || input;
      if (!area || !area.isConnected) area = locate(input, tail);
      if (!area) {
        if (Date.now() - t0 > 40000) throw new Error('timeout');
        if (Date.now() - sent > 7000 && tries++ < 2) { input = await open(); await send(); }   // panel was reset/closed: send again
        continue;
      }
      const cur = norm(area.textContent), i = cur.lastIndexOf(tail);
      if (i < 0) continue;
      let ans = cur.slice(i + tail.length).trim();
      const k = ans.search(/AI can make mistakes/i), done = k >= 0;   // disclaimer appears once the answer is complete
      if (done) ans = ans.slice(0, k).trim();
      ans = ans.replace(/\s*Ask\s*Gemini\s*$/i, '');
      if (!ans) continue;
      const busy = !!$('button[aria-label*="Stop" i]', area);
      if (ans !== prev) { prev = ans; since = Date.now(); }
      else if (Date.now() - since >= (done ? 500 : settle) && (done || !busy)) return extract(area, ans, tail);
    }
    throw new Error('timeout');
  };
  let queue = Promise.resolve();
  const enqueue = fn => { const r = queue.then(fn, fn); queue = r.catch(() => {}); return r; };
  return {
    cancel() { epoch++; },
    ask(prompt, settle) {
      const ep = epoch, p = prompt + ' (ref ' + Math.random().toString(36).slice(2, 6) + ')';   // unique tail → never confuse with an older identical prompt
      return enqueue(() => run(p, ep, settle));
    },
    // open the Ask panel ahead of time so the first real request starts instantly
    warm() { return enqueue(async () => { try { if (!findInput()) { const b = findAsk(); if (b) { b.click(); await waitFor(findInput, 6000); } } } catch {} }); }
  };
})();

const human = e => ({
  'no-ask': 'Couldn’t find YouTube’s “Ask” button on this video. Ask is rolling out gradually, so it may not be available for this account or video.',
  'no-input': 'Opened Ask but couldn’t find its text box. YouTube’s layout may have changed — update the finders in content.js.',
  timeout: 'Gemini took too long to answer. Try again.',
  cancelled: 'Cancelled because you switched lectures. Ask again whenever you like.',
  short: 'Gemini’s reply looked incomplete. Please try again.'
}[e && e.message] || 'Something went wrong talking to YouTube’s Ask.');

/* ───────── safe rendering of Gemini's answer ───────── */
const KEEP = /^(H[1-6]|P|UL|OL|LI|STRONG|B|EM|I|CODE|PRE|BR|BLOCKQUOTE|TABLE|THEAD|TBODY|TR|TH|TD|HR|DIV)$/;
const DROP = /^(SCRIPT|STYLE|BUTTON|SVG|IMG|INPUT|TEXTAREA|YT-ICON|TP-YT-PAPER-TOOLTIP)$/;
function clean(src) {
  const f = document.createDocumentFragment();
  for (const n of src.childNodes) {
    if (n.nodeType === 3) { f.append(n.textContent); continue; }
    if (n.nodeType !== 1 || DROP.test(n.tagName)) continue;
    const k = clean(n);
    if (KEEP.test(n.tagName)) { const e = document.createElement(n.tagName); e.append(k); f.append(e); } else f.append(k);
  }
  return f;
}
function textFrag(text) {
  const f = document.createDocumentFragment(); let ul = null;
  for (const line of text.split(/\n+/)) {
    const m = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
    if (m) { if (!ul) f.append(ul = document.createElement('ul')); const li = document.createElement('li'); li.textContent = m[1]; ul.append(li); }
    else if (line.trim()) { ul = null; const p = document.createElement('p'); p.textContent = line.replace(/^#+\s*/, '').replace(/\*\*/g, ''); f.append(p); }
  }
  return f;
}
const cutDisclaimer = root => {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) {
    const i = n.data.search(/AI can make mistakes/i); if (i < 0) continue;
    n.data = n.data.slice(0, i);
    for (let c = n; c && c !== root; c = c.parentNode) while (c.nextSibling) c.nextSibling.remove();
    return;
  }
};
const toFrag = r => {
  if (r.node && r.node.querySelector('p,li,h1,h2,h3,h4,ul,ol,table,pre')) { const f = clean(r.node); cutDisclaimer(f); return f; }
  return textFrag(r.text);
};
function linkify(root) { // [mm:ss] → clickable seek chips
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest('code,pre,button') ? 2 : 1 }), ns = [];
  while (w.nextNode()) ns.push(w.currentNode);
  const re = /\b(\d{1,2}(?::\d{2}){1,2})\b/g;
  for (const n of ns) {
    const f = document.createDocumentFragment(); let last = 0, m; re.lastIndex = 0;
    while ((m = re.exec(n.data))) { f.append(n.data.slice(last, m.index)); const b = document.createElement('button');
      b.className = 'sm-ts'; b.dataset.t = toSec(m[1]); b.textContent = m[1]; f.append(b); last = re.lastIndex; }
    if (last) { f.append(n.data.slice(last)); n.replaceWith(f); }
  }
}

/* ───────── state ───────── */
const S = { active: false, root: null, origin: null, v: null, nv: null, drag: false, nav: 0, ch: [], chc: {}, hs: {} };
const E = {};   // cached element refs (hot paths never re-query)
let toastT;
const toast = msg => { const t = $('.sm-toast') || Object.assign(document.body.appendChild(document.createElement('div')), { className: 'sm-toast' });
  t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); };

/* ───────── dynamic theme (per lecture) ───────── */
const hsOf = ([r, g, b]) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; let h = 0, s = 0;
  if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; }
  return { h, s: s * 100, l: l * 100 };
};
const toTheme = ({ h, s }) => ({ h: Math.round(h), s: Math.round(Math.min(78, Math.max(28, s * .85))) });
const parseTheme = s => { const [h, sa] = String(s).split(',').map(Number); return Number.isFinite(h) && Number.isFinite(sa) ? { h, s: sa } : null; };
const applyTheme = t => { if (!t) return; const s = document.documentElement.style; s.setProperty('--sm-h', t.h); s.setProperty('--sm-s', t.s); };
let cx;
const parseCol = v => {
  if (!v || !CSS.supports('color', v)) return null;
  try { cx = cx || document.createElement('canvas').getContext('2d', { willReadFrequently: true }); cx.canvas.width = cx.canvas.height = 1;
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = v; cx.fillRect(0, 0, 1, 1); const [r, g, b, a] = cx.getImageData(0, 0, 1, 1).data; return a > 40 ? [r, g, b] : null; } catch { return null; }
};
// 1) the colour YouTube itself derives for the video (shown on the description box); 2) otherwise sample the video frame
function ytColor() {
  const wf = $('ytd-watch-flexy'), wid = wf && wf.getAttribute('video-id'); if (wid && wid !== vid()) return null;
  const names = ['--yt-lightsource-section2-color', '--yt-lightsource-section1-color', '--yt-lightsource-section3-color', '--yt-lightsource-primary-title-color'];
  for (const h of [wf, document.documentElement, $('ytd-watch-metadata'), $('#description-inner')]) {
    if (!h) continue; const cs = getComputedStyle(h);
    for (const n of names) { const c = parseCol(cs.getPropertyValue(n).trim()); if (c && hsOf(c).s > 8) return toTheme(hsOf(c)); }
  }
  for (const el of [$('#description-inner'), $('ytd-text-inline-expander'), $('#description')]) {
    if (!el) continue; const c = parseCol(getComputedStyle(el).backgroundColor); if (c && hsOf(c).s > 12) return toTheme(hsOf(c));
  }
  return null;
}
function frameColor() {
  const v = vEl(); if (!v || !v.videoWidth) return null;
  try {
    const c = document.createElement('canvas'); c.width = 32; c.height = 18; const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(v, 0, 0, 32, 18); const d = g.getImageData(0, 0, 32, 18).data; let X = 0, Y = 0, W = 0, SS = 0;
    for (let i = 0; i < d.length; i += 4) {
      const { h, s, l } = hsOf([d[i], d[i + 1], d[i + 2]]); if (l < 12 || l > 92 || s < 18) continue;
      const w = s / 100 * (1 - Math.abs(l - 50) / 50); X += Math.cos(h * Math.PI / 180) * w; Y += Math.sin(h * Math.PI / 180) * w; W += w; SS += s * w;
    }
    return W < 3 ? null : toTheme({ h: (Math.atan2(Y, X) * 180 / Math.PI + 360) % 360, s: SS / W });
  } catch { return null; }
}
function autoTheme() {
  const id = vid(); if (S.thFor === id || Date.now() - S.navAt < 1800) return;
  const t = ytColor() || (isPlaying() && now() > 1.2 ? frameColor() : null);
  if (!t) { if (Date.now() - S.navAt > 9000) S.thFor = id; return; }   // nothing usable → keep the current theme
  S.thFor = id; lsSet('sm-t-' + id, t.h + ',' + t.s); lsSet('sm-theme', t.h + ',' + t.s); applyTheme(t);
}

/* ───────── chapters ───────── */
const chapterAt = t => { let c = null; for (const x of S.ch) { if (x.t <= t) c = x; else break; } return c; };
function readChapters(d) {
  const wf = $('ytd-watch-flexy'), wid = wf && wf.getAttribute('video-id'); if (wid && wid !== vid()) return null;
  // YouTube's own chapter list when rendered, otherwise timestamps in the description
  let list = $$('ytd-macro-markers-list-item-renderer').map(el => ({ t: toSec(norm($('#time', el)?.textContent) || 'x'), title: norm($('h4', el)?.textContent) })).filter(c => Number.isFinite(c.t));
  if (list.length < 3) {
    const el = $('ytd-watch-metadata #description-inner') || $('#description-inner') || $('ytd-text-inline-expander') || $('#description');
    const scan = txt => { const out = [];   // "0:00 Intro", "(1:23) Topic", "02:10 - Topic"
      for (const line of (txt || '').split('\n')) {
        const m = line.trim().match(/^[\[(]?((?:\d{1,2}:)?\d{1,2}:\d{2})[\])]?\s*[-–—:|.)]*\s*(.*)$/);
        if (m) out.push({ t: toSec(m[1]), title: m[2].trim() });
      } return out; };
    list = [];
    if (el) {   // textContent also covers the collapsed ("…more") part that innerText skips
      list = scan(($('#expanded', el) || el).textContent);
      if (list.length < 3) list = scan(el.textContent);
      if (list.length < 3) list = scan(el.innerText);
      if (list.length < 3) { const c = el.cloneNode(true); $$('br', c).forEach(b => b.replaceWith('\n')); list = scan(($('#expanded', c) || c).textContent); }
    }
  }
  list = list.sort((a, b) => a.t - b.t).filter((c, i, a) => !i || c.t - a[i - 1].t >= 5);
  if (list.length < 3 || list[0].t > 1 || list[list.length - 1].t >= d) return null;
  list[0].t = 0; return list.map((c, i) => ({ t: c.t, title: c.title || 'Chapter ' + (i + 1) }));
}
function renderChapters() {
  const d = dur();
  E.gaps.innerHTML = d ? S.ch.filter(c => c.t > 0).map(c => `<u style="left:${(c.t / d * 100).toFixed(3)}%"></u>`).join('') : '';
}
function autoChapters() {
  const id = vid(); if (S.chFor === id) return;
  const d = dur(); if (!d) return;
  const list = S.chc[id] || readChapters(d);
  if (list) { S.ch = S.chc[id] = list; S.chFor = id; renderChapters(); }
  else if (Date.now() - S.navAt > 12000) { S.chFor = id; S.ch = []; renderChapters(); }
}

/* ───────── detection ───────── */
const listId = () => qs().get('list') || '';
const onWatchList = () => location.pathname === '/watch' && /^PL/.test(listId());
const KEYWORDS = /\b(course|courses|lecture|lectures|tutorial|lesson|lessons|class|curriculum|bootcamp|crash course|masterclass|syllabus|semester|learn|learning|study|university|opencourseware|cs\s?\d{2,3}|[a-z]{2,4}\s?\d{3}|full course|from scratch|for beginners)\b/i;
const plTitle = () => norm($('ytd-playlist-panel-renderer .header .title, ytd-playlist-panel-renderer #header-contents .title, ytd-playlist-panel-renderer h3')?.textContent);
function looksLikeCourse() {
  const items = $$('ytd-playlist-panel-video-renderer');
  const titles = items.slice(0, 12).map(i => norm($('#video-title', i)?.textContent)).join(' | ');
  let s = 0;
  if (KEYWORDS.test(plTitle() + ' ' + document.title)) s += 2;
  if (items.length >= 5) s++;
  if (items.length >= 12) s++;
  if (/lecture|lesson|\bep(isode)?\.?\s?\d|\bpart\s?\d|#\s?\d+|\bL\d+\b|\bday\s?\d|\bchapter\b|\bmodule\b/i.test(titles)) s++;
  return s >= 2;
}

/* ───────── playlist ───────── */
function readPlaylist() {
  return $$('ytd-playlist-panel-video-renderer').map(el => {
    const a = $('a#wc-endpoint', el) || $('a[href*="watch"]', el);
    const id = a ? new URL(a.href, location.href).searchParams.get('v') : null;
    const d = (norm($('ytd-thumbnail-overlay-time-status-renderer', el)?.textContent).match(/\d+(?::\d+)+/) || [''])[0];
    return { a, id, title: norm($('#video-title', el)?.textContent), dur: d };
  }).filter(i => i.id);
}
function go(id) {
  const a = (readPlaylist().find(x => x.id === id) || {}).a;
  if (a && a.isConnected) a.click(); else location.href = '/watch?v=' + id + '&list=' + listId();
}
function renderList() {
  if (!S.active) return;
  const box = E.list, items = readPlaylist(), cur = vid();
  if (!items.length) { if (S.plKey !== 'x') { S.plKey = 'x'; box.innerHTML = '<p class="sm-empty">Loading playlist…</p>'; } return; }
  const key = items.map(i => i.id + i.dur).join('|');
  if (key !== S.plKey) {   // rebuild only when the list really changed
    S.plKey = key; S.scrolledTo = null; box.textContent = '';
    const f = document.createDocumentFragment();
    for (const it of items) {
      const b = document.createElement('button'); b.className = 'sm-item'; b.dataset.id = it.id;
      b.innerHTML = '<img loading="lazy" alt="" src="https://i.ytimg.com/vi/' + it.id + '/mqdefault.jpg"><span><b></b><em></em></span>';
      $('b', b).textContent = it.title; $('em', b).textContent = it.dur;
      b.onclick = () => { $$('.on', box).forEach(x => x.classList.remove('on')); b.classList.add('on'); if (it.id !== vid()) startSwitch(); go(it.id); };
      f.append(b);
    }
    box.append(f);
  }
  for (const b of box.children) {
    const is = b.dataset.id === cur; b.classList.toggle('on', is);
    if (is) { const em = $('em', b); if (!em.textContent && dur()) em.textContent = fmt(dur());
      if (S.scrolledTo !== cur) { S.scrolledTo = cur; box.scrollTop = Math.max(0, b.offsetTop - 8); } }
  }
}

/* ───────── notes ───────── */
const NOTES_PROMPT = 'Write detailed, well-organized study notes for this entire video. Use Markdown: a one-paragraph overview, then sections with clear headings (put the [mm:ss] timestamp in each heading), bullet points, precise definitions, formulas, step-by-step reasoning and worked examples. End with "Key takeaways" and 5 self-test questions. Be thorough but skip filler.';
const STATUS = { idle: 'Notes start when the lecture plays', working: 'Writing your notes…', ready: 'Notes are ready!', error: 'Notes unavailable' };
function setNotes(state, msg) {
  E.foot.dataset.s = state; E.status.textContent = STATUS[state];
  const art = E.article;
  if (state === 'working') art.innerHTML = '<div class="sm-skel"><i></i><i></i><i></i><i></i><i></i><i></i></div>';
  if (state === 'idle') art.innerHTML = '<p class="sm-note">Press play — detailed notes appear here as soon as the lecture starts.</p>';
  if (state === 'error') { art.innerHTML = '<p class="sm-note err"></p>'; art.firstChild.textContent = msg; }
}
async function genNotes(force) {
  const id = vid(); if (!id) return; S.nv = id;
  if (!force) { const c = await kv.get('n2:' + id); if (c && vid() === id) { E.article.innerHTML = c; return setNotes('ready'); } }
  setNotes('working');
  try {
    const r = await Gemini.ask(NOTES_PROMPT);
    if (vid() !== id) return;
    if (r.text.length < 120) throw new Error('short');
    E.article.replaceChildren(toFrag(r)); linkify(E.article);
    kv.set('n2:' + id, E.article.innerHTML); E.foot.dataset.s = 'ready'; E.status.textContent = STATUS.ready;
  } catch (e) { if (e && e.message === 'cancelled') return; if (vid() === id) setNotes('error', human(e)); }
}
function autoNotes() {
  if (!S.active || S.nv === vid() || !isPlaying() || Date.now() - S.navAt < 1500) return;
  const p = player(); if (p && p.classList.contains('ad-showing')) return;
  genNotes();
}

/* ───────── quiz (generated at 25 % of the lecture) ───────── */
// NB: the word "quiz" is avoided on purpose, because YouTube's Ask then answers with its own interactive card (no answers in the text).
const NOWIDGET = 'Write it as ordinary text only — do not use any interactive card or widget — and include the answers and explanations in the text itself.';
const QPROMPT = t => `Based only on this video from the beginning up to ${fmt(t)}, write 5 multiple-choice practice questions on the key ideas taught so far, with plausible wrong options. ${NOWIDGET} No markdown, no intro, no closing remarks. Use exactly this layout for each question:\nQ1: <question>\nA) <option>\nB) <option>\nC) <option>\nD) <option>\nANSWER: <letter>\nWHY: <one or two sentence explanation>\n\nThen Q2 to Q5 in the same layout.`;
const QPROMPT_LIST = t => `Create a short "Check yourself" section for the part of this video up to ${fmt(t)}: 5 numbered multiple-choice questions, each with options A, B, C, D. After every question write "Answer: <letter>" and "Why: <one sentence>". ${NOWIDGET}`;
const QPROMPT_JSON = t => `Based only on this video from the beginning up to ${fmt(t)}, write 5 multiple-choice practice questions. ${NOWIDGET} Return ONLY a JSON array (no markdown fences) in exactly this shape: [{"question":"…","options":["…","…","…","…"],"answer":"B","explanation":"one or two sentences"}]. "answer" must be a single letter: A, B, C or D.`;
const QSTATUS = { locked: 'Quiz unlocks at 75%', working: 'Preparing your quiz…', ready: 'Quiz time!', error: 'Quiz unavailable' };
const cleanQ = s => s.replace(/AI can make mistakes[\s\S]*$/i, '').replace(/[*`#]/g, ' ').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
function parseBlock(b) {   // one question: stem, options A–D, answer letter, optional explanation
  const mk = (ch, from) => { const re = new RegExp('(?:^|\\s)\\(?' + ch + '\\s?[).:\\-]\\s+', 'g'); re.lastIndex = from; const m = re.exec(b); return m && { i: m.index, e: re.lastIndex }; };
  const a = mk('A', 0), bb = a && mk('B', a.e), c = bb && mk('C', bb.e), d = c && mk('D', c.e);
  if (!d) return null;
  const re = /(?:^|\s)(?:[Cc]orrect\s+)?(?:[Aa]nswer|ANSWER)\s*(?:is)?\s*[:\-]?\s*\(?([A-D])\b/g; re.lastIndex = d.e;
  const m = re.exec(b); if (!m) return null;
  const rest = b.slice(re.lastIndex), w = rest.match(/(?:[Ww]hy|WHY|[Ee]xplanation|EXPLANATION|[Rr]ationale)\s*[:\-]\s*/);
  const e = (w ? rest.slice(w.index + w[0].length) : rest.replace(/^[\s).:\-]+/, '')).trim();
  const o = [b.slice(a.e, bb.i), b.slice(bb.e, c.i), b.slice(c.e, d.i), b.slice(d.e, m.index)].map(s => s.trim());
  const q = b.slice(0, a.i).replace(/^[\s:.)\-]+/, '').trim();
  return q && o.every(Boolean) ? { q, o, a: 'ABCD'.indexOf(m[1]), e: e || 'No explanation was provided.' } : null;
}
function parseQuizText(text) {
  const t = cleanQ(text);
  let blocks = t.split(/(?:^|\s)(?:Question|Q)\s*\d{1,2}\s*[:.)\-]\s*/i).slice(1);
  if (blocks.length < 3) blocks = t.split(/(?:^|\s)\d{1,2}[.)]\s+(?=[A-Z])/).slice(1);
  return blocks.map(parseBlock).filter(Boolean);
}
function parseQuizJSON(text) {
  const t = text.replace(/AI can make mistakes[\s\S]*$/i, ''), i = t.indexOf('['), j = t.lastIndexOf(']');
  if (i < 0 || j <= i) return [];
  let arr; try { arr = JSON.parse(t.slice(i, j + 1)); } catch { return []; }
  return (Array.isArray(arr) ? arr : []).map(x => {
    const o = (x.options || x.choices || x.o || []).map(s => String(s).replace(/^\s*\(?[A-D]\s*[).:\-]\s*/, '').trim());
    let a = x.answer ?? x.correct ?? x.a; const raw = String(a ?? '').trim();
    a = typeof a === 'number' ? a : 'ABCD'.indexOf(raw.charAt(0).toUpperCase());
    if (a < 0 || raw.length > 2) { const k = o.findIndex(s => s.toLowerCase() === raw.toLowerCase()); if (k >= 0) a = k; }
    return { q: String(x.question || x.q || '').trim(), o, a, e: String(x.explanation || x.why || x.e || '').trim() || 'No explanation was provided.' };
  }).filter(x => x.q && x.o.length === 4 && x.o.every(Boolean) && x.a >= 0 && x.a < 4);
}
const prep = q => { const o = q.o.map((t, i) => ({ t, ok: i === q.a })); for (let i = o.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [o[i], o[j]] = [o[j], o[i]]; } return { q: q.q, e: q.e, o }; };
const newQuiz = id => { S.q = { id, state: 'locked', raw: [], qs: [], i: 0, score: 0, res: [], ans: false, req: false, msg: '' }; };
function renderQuiz() {
  const q = S.q, c = E.qcard; E.foot.dataset.q = q.state; if (q.state === 'locked') encourage(true); else setQh(QSTATUS[q.state]);
  if (q.state === 'locked') c.innerHTML = '<div class="sm-qz-lock"><div class="sm-big" id="sm-lockpct">0%</div><p>Your quiz unlocks when you’re <b>75%</b> through this lecture.</p><div class="sm-lockbar"><i id="sm-lockfill"></i></div></div>';
  else if (q.state === 'working') c.innerHTML = '<div class="sm-skel"><i></i><i></i><i></i><i></i><i></i><i></i></div>';
  else if (q.state === 'error') {
    c.innerHTML = '<div class="sm-qz-lock"><p class="err"></p><button class="sm-next" id="sm-qretry">Try again</button><details class="sm-dbg"><summary>Show Gemini’s reply</summary><pre></pre></details></div>';
    $('p', c).textContent = q.msg; $('#sm-qretry').onclick = () => genQuiz(true);
    if (q.dbg) $('pre', c).textContent = q.dbg; else $('details', c).remove();
  }
  else showQuestion();
}
function pop() { E.qcard.classList.remove('in'); void E.qcard.offsetWidth; E.qcard.classList.add('in'); }
function showQuestion() {
  const q = S.q, it = q.qs[q.i], c = E.qcard;
  c.innerHTML = `<div class="sm-qz-top"><span class="sm-qz-no">Quiz No. ${q.i + 1}</span><span>of ${q.qs.length}</span></div>
    <div class="sm-qz-pips">${q.qs.map((_, k) => `<i class="${k < q.i ? (q.res[k] ? 'ok' : 'bad') : k === q.i ? 'cur' : ''}"></i>`).join('')}</div>
    <h3 class="sm-qz-q"></h3><div class="sm-qz-opts"></div><div class="sm-qz-why" hidden></div>
    <div class="sm-qz-foot"><span class="sm-score">Score ${q.score}/${q.qs.length}</span><button class="sm-next" hidden></button></div>`;
  $('.sm-qz-q', c).textContent = it.q;
  const opts = $('.sm-qz-opts', c);
  it.o.forEach((o, k) => { const b = document.createElement('button'); b.className = 'sm-opt'; b.innerHTML = '<b></b><span></span><i></i>';
    $('b', b).textContent = 'ABCD'[k]; $('span', b).textContent = o.t; b.onclick = () => answer(k); opts.append(b); });
  pop();
}
function answer(k) {
  const q = S.q; if (q.ans) return; q.ans = true;
  const it = q.qs[q.i], ok = it.o[k].ok; q.res[q.i] = ok; if (ok) q.score++;
  $$('.sm-opt', E.qcard).forEach((b, j) => {
    b.disabled = true;
    if (it.o[j].ok) b.classList.add(j === k ? 'ok' : 'reveal'); else b.classList.add(j === k ? 'bad' : 'dim');
    $('i', b).textContent = it.o[j].ok ? '✓' : j === k ? '✕' : '';
  });
  const why = $('.sm-qz-why', E.qcard); why.hidden = false; why.className = 'sm-qz-why ' + (ok ? 'ok' : 'bad');
  why.innerHTML = '<b></b><p></p>'; $('b', why).textContent = ok ? '✓ Correct!' : '✕ Not quite'; $('p', why).textContent = it.e;
  $('.sm-score', E.qcard).textContent = `Score ${q.score}/${q.qs.length}`;
  $$('.sm-qz-pips i', E.qcard)[q.i].className = ok ? 'ok' : 'bad';
  const nx = $('.sm-next', E.qcard); nx.hidden = false; nx.textContent = q.i + 1 < q.qs.length ? 'Next question →' : 'See results'; nx.onclick = nextQ;
}
function nextQ() {
  const q = S.q; E.qcard.classList.add('out');
  setTimeout(() => { E.qcard.classList.remove('out'); q.i++; q.ans = false; q.i < q.qs.length ? showQuestion() : showResults(); }, 170);
}
function showResults() {
  const q = S.q, n = q.qs.length, p = q.score / n;
  E.qcard.innerHTML = `<div class="sm-qz-lock"><div class="sm-big">${q.score}/${n}</div><p>${p === 1 ? 'Perfect score — you’ve nailed this part!' : p >= .6 ? 'Nice work — a quick look at the notes will lock it in.' : 'Good start. Skim the notes, then try again.'}</p>
    <div class="sm-qz-pips">${q.res.map(r => `<i class="${r ? 'ok' : 'bad'}"></i>`).join('')}</div><button class="sm-next" id="sm-retry">Try again</button></div>`;
  $('#sm-retry').onclick = () => setQuiz(q.raw); pop();
}
function setQuiz(raw) { const q = S.q; q.raw = raw; q.qs = raw.map(prep); q.i = 0; q.score = 0; q.res = []; q.ans = false; q.state = 'ready'; renderQuiz(); }
async function genQuiz(force) {
  const q = S.q, id = q.id; q.req = true; q.state = 'working'; q.dbg = ''; renderQuiz();
  if (!force) { const c = await kv.get('q1:' + id); if (c && c.length >= 3 && vid() === id) return setQuiz(c); }
  try {
    // up to three phrasings, moving on whenever a reply can't be read
    for (const [make, parse] of [[QPROMPT, parseQuizText], [QPROMPT_LIST, parseQuizText], [QPROMPT_JSON, parseQuizJSON]]) {
      const r = await Gemini.ask(make(now()), 4500);   // long reply → wait longer before deciding it has finished
      if (vid() !== id) return;
      const raw = [r.text, r.node && r.node.innerText].filter(Boolean).map(parse).sort((a, b) => b.length - a.length)[0] || [];
      if (raw.length >= 3) { kv.set('q1:' + id, raw); return setQuiz(raw); }
      q.dbg = (r.text || '').slice(0, 1500); console.warn('[CourseTube] quiz reply not understood:', r.text);
    }
    throw new Error('short');
  } catch (e) {
    if (e && e.message === 'cancelled') return;
    if (vid() === id) { q.state = 'error'; q.msg = e && e.message === 'short' ? (/AI-generated quiz/i.test(q.dbg) ? 'YouTube answered with its own interactive quiz card, which can’t be read from the page. Try again.' : 'Gemini’s reply didn’t match the expected format. Try again — if it keeps happening, open “Show Gemini’s reply” below and send it to the developer.') : human(e); renderQuiz(); }
  }
}
function autoQuiz() {
  const q = S.q; if (!q || q.state !== 'locked' || q.req || q.id !== vid()) return;
  const d = dur(); if (!d || now() / d < .75 || Date.now() - S.navAt < 2500) return;
  const p = player(); if (p && p.classList.contains('ad-showing')) return;
  genQuiz();
}
const KIND = [   // kind words that take the place of the "Quiz time!" heading until the quiz unlocks
  ['Great start — you’re already ahead.', 'Every minute of focus counts.', 'Curiosity looks good on you.', 'Small steps, big progress.'],
  ['You’re building real momentum.', 'Your focus is paying off.', 'Keep going — it’s really clicking.', 'Proud of your consistency.'],
  ['You’re doing wonderfully.', 'Nearly there — your quiz is on its way.', 'Look how far you’ve come!', 'Your future self says thank you.']
];
function setQh(txt) {
  if (E.qstatus.textContent === txt) return;
  E.qstatus.textContent = txt; E.qstatus.classList.remove('flip'); void E.qstatus.offsetWidth; E.qstatus.classList.add('flip');
}
function encourage(force) {
  const q = S.q; if (!q || q.state !== 'locked') return;
  const d = dur(), p = d ? now() / d : 0, tier = p < .25 ? 0 : p < .5 ? 1 : 2, t = Date.now();
  if (!force && tier === S.kt && (t - S.kw < 20000 || !isPlaying())) return;   // new words every ~20 s of watching, or when you pass a milestone
  const pool = KIND[tier].filter(x => x !== S.km), msg = pool[Math.random() * pool.length | 0];
  S.kt = tier; S.kw = t; S.km = msg; setQh(msg);
}
function lockProgress() {
  if (!S.q || S.q.state !== 'locked') return;
  encourage();
  const d = dur(), p = d ? now() / d : 0, f = $('#sm-lockfill'); if (!f) return;
  f.style.transform = `scaleX(${Math.min(1, p / .75)})`; $('#sm-lockpct').textContent = Math.min(100, Math.round(p * 100)) + '%';
}

/* ───────── questions ───────── */
async function onAsk(e) {
  e.preventDefault();
  const inp = E.q, q = inp.value.trim(); if (!q) return; inp.value = '';
  const t = now(), hist = E.hist;
  $('.sm-empty', hist)?.remove();
  const qe = document.createElement('div'); qe.className = 'sm-q'; qe.textContent = q;
  const ts = document.createElement('small'); ts.textContent = 'at ' + fmt(t); qe.append(ts);
  const ae = document.createElement('div'); ae.className = 'sm-a'; ae.innerHTML = '<span class="sm-dots"><i></i><i></i><i></i></span>';
  hist.append(qe, ae); hist.scrollTo({ top: hist.scrollHeight, behavior: 'smooth' });
  try {
    const r = await Gemini.ask(`I'm watching this lecture and I'm at ${fmt(t)}. Answer my question in the context of what is being taught around this moment, clearly and concisely.\n\nQuestion: ${q}`);
    ae.replaceChildren(toFrag(r)); linkify(ae);
  } catch (err) { ae.textContent = human(err); ae.classList.add('err'); }
  hist.scrollTo({ top: hist.scrollHeight, behavior: 'smooth' });
}

/* ───────── player controls ───────── */
const setBar = f => { E.fill.style.transform = `scaleX(${f})`; E.knob.style.left = f * 100 + '%'; };
function chapLabel(t) {   // current chapter title, always visible above the progress bar
  let txt = '';
  if (S.ch.length) { const c = chapterAt(t); if (c) txt = `${S.ch.indexOf(c) + 1}/${S.ch.length} · ${c.title}`; }
  else { const el = $('.ytp-chapter-title-content'); txt = el ? norm(el.textContent) : ''; }   // fallback: YouTube's own chapter title
  if (txt === S.cl) return;
  S.cl = txt; E.chap.hidden = !txt;
  if (txt) { E.chap.textContent = txt; E.chap.classList.remove('flip'); void E.chap.offsetWidth; E.chap.classList.add('flip'); }
}
function tick() {
  if (!S.active || S.drag) return;
  const d = dur(), v = vEl();
  const t = now(); setBar(d ? Math.min(1, t / d) : 0); chapLabel(t);
  E.buf.style.transform = `scaleX(${d && v && v.buffered.length ? Math.min(1, v.buffered.end(v.buffered.length - 1) / d) : 0})`;
}
function icons() { const w = isPlaying() ? 'p' : 'q'; if (S.ic !== w) { S.ic = w; E.pp.innerHTML = w === 'p' ? ICON.pause : ICON.play; } }
function bindVideo() {
  const v = vEl(); if (!v || v === S.v) return; S.v = v;
  ['play', 'pause', 'playing', 'timeupdate', 'durationchange'].forEach(t => v.addEventListener(t, () => { tick(); icons(); }));
}
async function screenshot() {
  const v = vEl();
  if (!v || !v.videoWidth) return toast('Video isn’t ready yet');
  try {
    const t = now(), c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, 'image/png')); if (!blob) throw 0;
    const a = document.createElement('a'), name = E.title.textContent.replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'lecture';
    a.href = URL.createObjectURL(blob); a.download = `${name} @ ${fmt(t).replace(/:/g, '-')}.png`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); } catch {}
    const fl = $('.sm-flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
    toast('Screenshot saved at ' + fmt(t));
  } catch { toast('This frame can’t be captured (protected video)'); }
}

/* ───────── build / enter / exit ───────── */
const EMPTY = '<p class="sm-empty">History<small>Ask anything about what’s being taught. Answers are tied to the moment you’re watching.</small></p>';
function build() {
  if (S.root) return;
  const r = S.root = document.createElement('div'); r.id = 'sm-root';
  const t0 = parseTheme(lsGet('sm-theme')); applyTheme(t0);
  r.innerHTML = `
  <section class="sm-stage">
    <div class="sm-logo" title="CourseTube"></div>
    <button class="sm-exit" id="sm-exit" title="Exit study mode (Esc)">✕</button>
    <div class="sm-pl" id="sm-pl"></div>
    <h2 class="sm-h sm-h1">Next up…</h2><h1 class="sm-title" id="sm-title"></h1><h2 class="sm-h sm-h3">Questions?</h2>
    <div class="sm-list" id="sm-list"></div>
    <div class="sm-player" id="sm-player">
      <div class="sm-slot" id="sm-slot"></div><div class="sm-flash"></div>
      <div class="sm-ctl">
        <button class="sm-btn" id="sm-pp" title="Pause / Play"></button>
        <div class="sm-bar" id="sm-bar"><i class="sm-track"></i><i class="sm-buf" id="sm-buf"></i><i class="sm-fill" id="sm-fill"></i><div class="sm-gaps" id="sm-gaps"></div><b class="sm-knob" id="sm-knob"></b><span class="sm-tip" id="sm-tip"></span><span class="sm-chap" id="sm-chap" hidden></span></div>
        <button class="sm-btn" id="sm-shot" title="Screenshot"></button>
      </div>
    </div>
    <aside class="sm-qa">
      <div class="sm-hist" id="sm-hist">${EMPTY}</div>
      <form class="sm-ask" id="sm-ask"><input id="sm-q" placeholder="Ask" autocomplete="off" spellcheck="false"><button class="sm-btn sm-send" title="Ask">${ICON.send}</button></form>
    </aside>
    <footer class="sm-foot" id="sm-foot" data-s="idle" data-q="locked">
      <div class="sm-fl"><h2 id="sm-status"></h2><button class="sm-btn sm-down" id="sm-down" title="Jump to notes and quiz">${ICON.down}</button></div>
      <h2 class="sm-qh" id="sm-qstatus"></h2>
    </footer>
  </section>
  <section class="sm-notes" id="sm-notes">
    <div class="sm-card" id="sm-card">
      <div class="sm-card-head"><div><p>Study notes</p><h2 id="sm-ntitle"></h2></div>
        <div class="sm-acts"><button class="sm-fold" id="sm-fold" aria-expanded="true" title="Collapse notes">${ICON.fold}</button><button id="sm-copy">Copy</button><button id="sm-regen">Regenerate</button></div></div>
      <div class="sm-art-wrap"><article class="sm-article" id="sm-article"></article></div>
    </div>
    <aside class="sm-qz" id="sm-qz"><div id="sm-qcard"></div></aside>
  </section>`;
  document.body.append(r);
  for (const id of ['pl', 'title', 'list', 'player', 'slot', 'pp', 'shot', 'bar', 'buf', 'fill', 'gaps', 'knob', 'tip', 'chap', 'hist', 'ask', 'q', 'foot', 'status', 'qstatus', 'ntitle', 'card', 'fold', 'article', 'qcard']) E[id] = $('#sm-' + id, r);
  E.shot.innerHTML = ICON.cam;

  $('#sm-exit').onclick = () => exit(true);
  E.pp.onclick = () => { togglePlay(); setTimeout(icons, 150); };
  E.shot.onclick = screenshot;
  $('#sm-down').onclick = () => r.scrollTo({ top: E.foot.offsetTop - 12, behavior: 'smooth' });
  E.ask.onsubmit = onAsk;
  E.q.addEventListener('keydown', e => e.stopPropagation());
  $('#sm-copy').onclick = () => navigator.clipboard.writeText(E.article.innerText).then(() => toast('Notes copied'));
  $('#sm-regen').onclick = () => genNotes(true);
  const fold = c => { E.card.classList.toggle('collapsed', c); E.fold.setAttribute('aria-expanded', !c); E.fold.title = c ? 'Expand notes' : 'Collapse notes'; };
  fold(lsGet('sm-ncol') === '1');
  E.fold.onclick = () => { const c = !E.card.classList.contains('collapsed'); fold(c); lsSet('sm-ncol', c ? '1' : '0'); };
  r.addEventListener('click', e => { const b = e.target.closest('.sm-ts'); if (b) { seek(+b.dataset.t); E.player.scrollIntoView({ behavior: 'smooth', block: 'center' }); } });

  // seek bar (with chapter-aware tooltip)
  const bar = E.bar, frac = e => { const b = bar.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)); };
  const preview = e => {
    const f = frac(e), t = f * dur(), c = chapterAt(t);
    E.tip.style.left = Math.min(92, Math.max(8, f * 100)) + '%'; E.tip.replaceChildren();
    if (c && S.ch.length) { const s = document.createElement('small'); s.textContent = c.title; E.tip.append(s); }
    E.tip.append(fmt(t)); if (S.drag) setBar(f);
  };
  bar.onpointerdown = e => { S.drag = true; bar.classList.add('drag'); bar.setPointerCapture(e.pointerId); preview(e); };
  bar.onpointermove = preview;
  bar.onpointerup = e => { if (!S.drag) return; S.drag = false; bar.classList.remove('drag'); seek(frac(e) * dur()); setTimeout(tick, 200); };

  // hide controls when idle
  const pl = E.player; let it;
  pl.onmousemove = () => { pl.classList.remove('idle'); clearTimeout(it); it = setTimeout(() => isPlaying() && pl.classList.add('idle'), 2800); };
  pl.onmouseleave = () => pl.classList.remove('idle');

  // keep YouTube's player sized to our slot
  let raf; new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))); }).observe(E.slot);
  newQuiz(null); renderQuiz();
}

function startSwitch() {   // fade the player out the instant a new lecture is requested; keep() fades it back once frames play
  if (!E.player || S.sw) return;
  S.sw = true; S.swFrom = vid(); S.swAt = Date.now(); E.player.classList.add('sw');
}
function swapHistory(from, to) {   // each lecture keeps its own Q&A history
  const h = E.hist;
  if (from) { const f = document.createDocumentFragment(); f.append(...h.childNodes); S.hs[from] = f; }
  h.textContent = '';
  const f = S.hs[to];
  if (f && f.childNodes.length) { h.append(f); delete S.hs[to]; } else h.innerHTML = EMPTY;
  h.scrollTop = h.scrollHeight;
}
function keep() {
  const p = player();
  if (S.sw && (Date.now() - S.swAt > 3500 || (vid() !== S.swFrom && st() === 1 && now() > 0.2))) { S.sw = false; E.player.classList.remove('sw'); }
  if (p && E.slot && p.parentNode !== E.slot) { // YouTube re-homed its player: adopt it again
    const was = isPlaying(); S.origin = { parent: p.parentNode, next: p.nextSibling }; E.slot.append(p);
    if (was) setTimeout(() => { try { p.playVideo(); } catch {} }, 50);
  }
  const k = S.k = (S.k || 0) + 1;
  if (!document.hidden) { tick(); icons(); }
  if (k % 2 === 0) { bindVideo(); autoNotes(); autoChapters(); autoTheme(); autoQuiz(); lockProgress(); }
  if (k % 4 === 0) { const n = document.querySelectorAll('ytd-playlist-panel-video-renderer').length;
    if (n !== S.plN) { S.plN = n; renderList(); E.pl.textContent = plTitle(); } }
}
function enter() {
  if (S.active) return;
  const p = player(); if (!p) return;
  build(); S.active = true;
  const v = video(), was = v && !v.paused;
  S.origin = { parent: p.parentNode, next: p.nextSibling };
  document.body.classList.add('sm-on'); E.slot.append(p);
  if (was) v.play().catch(() => {});
  $('#sm-launch')?.classList.remove('show');
  S.nv = null; refresh();
  clearInterval(S.iv); S.iv = setInterval(keep, 250); keep();
  requestAnimationFrame(() => requestAnimationFrame(unveil));
  setTimeout(() => S.active && Gemini.warm(), 1200);
  const items = $('ytd-playlist-panel-renderer #items');
  if (items) { S.mo?.disconnect(); let t; S.mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(renderList, 400); }); S.mo.observe(items, { childList: true }); }
}
function exit(manual) {
  if (!S.active) return; S.active = false;
  const p = player(), v = video(), was = v && !v.paused;
  if (p && S.origin && S.origin.parent.isConnected) S.origin.parent.insertBefore(p, S.origin.next && S.origin.next.isConnected ? S.origin.next : null);
  document.body.classList.remove('sm-on'); S.mo?.disconnect(); clearInterval(S.iv);
  window.dispatchEvent(new Event('resize')); if (was) v.play().catch(() => {});
  if (manual) sessionStorage.setItem('sm-off-' + listId(), '1');
  launcher();
}
function refresh() {
  if (!S.active) return; S.navAt = Date.now(); bindVideo();
  const id = vid();
  if (S.lv !== id) {   // a different lecture: cancel stale work and reset everything per-lecture
    Gemini.cancel(); swapHistory(S.lv, id); S.lv = id;
    S.ch = []; S.chFor = null; S.cl = null; renderChapters();
    newQuiz(id); renderQuiz();
    const th = lsGet('sm-t-' + id); if (th) { applyTheme(parseTheme(th)); S.thFor = id; } else S.thFor = null;
    setTimeout(() => S.active && Gemini.warm(), 1800);
  }
  const set = () => { const it = readPlaylist().find(i => i.id === vid());
    const t = (it && it.title) || norm($('ytd-watch-metadata h1')?.textContent) || document.title.replace(/^\(\d+\)\s*/, '').replace(/ - YouTube$/, '');
    E.title.textContent = t; E.title.title = t; E.ntitle.textContent = t; E.pl.textContent = plTitle(); };
  set(); renderList(); icons(); tick();
  if (S.nv !== id) {
    setNotes('idle');
    kv.get('n2:' + id).then(c => { if (c && vid() === id && S.active) { E.article.innerHTML = c; S.nv = id; setNotes('ready'); } });
  }
  setTimeout(() => { if (!S.active) return; set(); renderList(); }, 1800);
}

/* ───────── lifecycle ───────── */
function launcher() {
  let b = $('#sm-launch');
  if (!b) { b = Object.assign(document.createElement('button'), { id: 'sm-launch', innerHTML: '<i class="sm-lg"></i>Study mode' });
    b.onclick = () => { sessionStorage.removeItem('sm-off-' + listId()); lset(listId(), '1'); enter(); }; document.body.append(b); }
  b.classList.toggle('show', onWatchList() && !S.active);
}
const html = document.documentElement;
const unveil = () => html.classList.remove('sm-pre');
const preveil = () => { html.classList.add('sm-pre'); clearTimeout(S.vt); S.vt = setTimeout(unveil, 12000); };
const lget = l => lsGet('sm-c-' + l);   // remembered course / not-course verdict per playlist
const lset = (l, v) => lsSet('sm-c-' + l, v);
const off = l => sessionStorage.getItem('sm-off-' + l);
async function onNav() {
  const n = ++S.nav; launcher();
  if (S.active) return onWatchList() ? refresh() : exit();
  const l = listId();
  if (!onWatchList() || off(l) || lget(l) === '0') return unveil();
  build();   // pre-build the study UI while we wait, so entering is instant
  if (lget(l) !== '1') {
    for (let i = 0; i < 100 && !document.querySelector('ytd-playlist-panel-video-renderer'); i++) await sleep(100);
    if (n !== S.nav || S.active) return;
    await sleep(150);
    const has = !!document.querySelector('ytd-playlist-panel-video-renderer'), ok = looksLikeCourse();
    if (has) lset(l, ok ? '1' : '0');
    if (!ok) return unveil();
  }
  for (let i = 0; i < 100 && !player(); i++) await sleep(100);
  if (n !== S.nav || S.active) return;
  enter();
}
window.addEventListener('yt-navigate-start', e => {
  const raw = e.detail && e.detail.url; if (!raw) return;
  let u; try { u = new URL(raw, location.origin); } catch { return; }
  if (S.active) { if (u.pathname !== '/watch') exit(); else if (u.searchParams.get('v') !== vid()) startSwitch(); return; }
  const l = u.searchParams.get('list') || '';
  if (u.pathname === '/watch' && /^PL/.test(l) && lget(l) !== '0' && !off(l)) preveil();
});
window.addEventListener('yt-navigate-finish', onNav);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.active && !document.fullscreenElement) exit(true); });
applyTheme(parseTheme(lsGet('sm-theme')));   // veil already wears the last theme → no colour jump
if (onWatchList() && lget(listId()) !== '0' && !off(listId())) preveil();
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', onNav, { once: true }) : onNav();
})();

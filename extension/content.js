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
  const BLK = /^(P|DIV|LI|UL|OL|H[1-6]|BR|TR|TABLE|BLOCKQUOTE|PRE|SECTION|ARTICLE)$/;
  const txt = n => { let s = ''; for (const c of n.childNodes) { if (c.nodeType === 3) s += c.data; else if (c.nodeType === 1) { const b = BLK.test(c.tagName) ? ' ' : ''; s += b + txt(c) + b; } } return s; };
  // messages area = biggest ancestor of our question bubble that doesn't also hold the input box
  const locate = (input, tail) => {
    let root = input.parentElement;
    for (let i = 0; root && i < 14 && !norm(txt(root)).includes(tail); i++) root = root.parentElement;
    if (!root || !norm(txt(root)).includes(tail)) return null;
    const bubble = $$('*', root).filter(e => !e.contains(input) && !input.contains(e) && norm(txt(e)).includes(tail))
      .sort((a, b) => a.textContent.length - b.textContent.length)[0];
    if (!bubble) return null;
    let area = bubble;
    while (area.parentElement && area.parentElement !== root && !area.parentElement.contains(input)) area = area.parentElement;
    return area;
  };
  // smallest element holding the whole answer, so its formatting survives
  const extract = (area, ans, tail) => {
    const a = ans.slice(0, 40), min = ans.length * .8;   // smallest element that starts the answer and holds most of it
    const c = $$('*', area).map(e => [e, norm(txt(e))]).filter(([, t]) => t.includes(a) && !t.includes(tail) && t.length >= min).sort((x, y) => x[1].length - y[1].length)[0];
    return { text: ans, node: c ? c[0] : null };
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
        if (Date.now() - sent > 4000 && tries++ < 4) { input = await open(); await send(); }   // panel was reset/closed: send again
        continue;
      }
      const cur = norm(txt(area)), i = cur.lastIndexOf(tail);
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
  'no-input': 'Opened Ask but couldn’t find its text box. YouTube’s layout may have changed, so the finders in content.js need updating.',
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
const S = { active: false, root: null, origin: null, v: null, nv: null, drag: false, nav: 0, ch: [], chc: {}, hs: {}, pal: {}, said: new Set(), sp: 0, pane: null };
const E = {};   // cached element refs (hot paths never re-query)
let toastT;
const toast = msg => { const t = $('.sm-toast') || Object.assign(document.body.appendChild(document.createElement('div')), { className: 'sm-toast' });
  t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); };
Object.assign(ICON, {   // bigger, cleaner icons for the full-screen controls
  pause: svg('M7 5h3.5v14H7zM13.5 5H17v14h-3.5z', 30), play: svg('M8 5v14l11-7z', 30),
  cam: svg('M9 4 7.6 6H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2.6L15 4zm3 4.5a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z', 28),
  up: chev(22)
});

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
// one colour per lecture: picked once, then left alone
function autoTheme() {
  const id = vid(); if (S.thFor === id || Date.now() - S.navAt < 1500) return;
  const t = ytColor() || (isPlaying() && now() > 1.2 ? frameColor() : null);
  if (!t) { if (Date.now() - S.navAt > 9000) S.thFor = id; return; }   // nothing usable: keep the current theme
  S.thFor = id; S.th = t; applyTheme(t); lsSet('sm-theme', t.h + ',' + t.s); lsSet('sm-t-' + id, t.h + ',' + t.s);
}

/* ───────── chapters ───────── */
const chapterAt = t => { let c = null; for (const x of S.ch) { if (x.t <= t) c = x; else break; } return c; };
function readChapters(d) {
  const wf = $('ytd-watch-flexy'), wid = wf && wf.getAttribute('video-id'); if (wid && wid !== vid()) return null;
  const scan = txt => { const out = [];   // "0:00 Intro", "(1:23) Topic", "02:10 - Topic"
    for (const line of (txt || '').split('\n')) {
      const m = line.trim().match(/^[\[(]?((?:\d{1,2}:)?\d{1,2}:\d{2})[\])]?\s*[-–—:|.)]*\s*(.*)$/);
      if (m) out.push({ t: toSec(m[1]), title: m[2].trim() });
    } return out; };
  const fromDesc = () => {   // textContent also covers the collapsed ("…more") part that innerText skips
    const el = $('ytd-watch-metadata #description-inner') || $('#description-inner') || $('ytd-text-inline-expander') || $('#description'); if (!el) return [];
    let l = scan(($('#expanded', el) || el).textContent);
    if (l.length < 3) l = scan(el.textContent);
    if (l.length < 3) l = scan(el.innerText);
    if (l.length < 3) { const c = el.cloneNode(true); $$('br', c).forEach(b => b.replaceWith('\n')); l = scan(($('#expanded', c) || c).textContent); }
    return l;
  };
  // YouTube's own chapter list when rendered (times are reliable, titles sometimes aren't) …
  let list = $$('ytd-macro-markers-list-item-renderer').map(el => {
    const t = norm($('#time', el)?.textContent);
    return { t: toSec(t || 'x'), title: norm($('h4', el)?.textContent) || norm($('#details', el)?.textContent).replace(t, '').trim() };
  }).filter(c => Number.isFinite(c.t));
  const desc = fromDesc();
  if (list.length < 3) list = desc;
  else if (desc.length >= 3) for (const c of list) if (!c.title) { const m = desc.find(x => Math.abs(x.t - c.t) <= 2); if (m) c.title = m.title; }   // … so fill missing titles from the description
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

/* ───────── detection (study playlists only) ───────── */
const listId = () => qs().get('list') || '';
const onWatchList = () => location.pathname === '/watch' && /^PL/.test(listId());
const plTitle = () => norm(($('ytd-playlist-panel-renderer .header .title') || $('ytd-playlist-panel-renderer #header-contents .title') || $('ytd-playlist-panel-renderer h3') || $('ytd-playlist-panel-renderer .title') || {}).textContent);
const STRONG = /\b(courses?|lectures?|lessons?|tutorials?|curriculum|syllabus|bootcamp|masterclass|semester|opencourseware|exam prep|crash course|full course|curso|clase|lecci[oó]n|cours|le[cç]on|vorlesung|lektion|aula|li[cç][aã]o|lezione|corso|kelas|pelajaran|ders|kurs)\b|\b(cs|ee|math|phys|chem|bio|econ|stat|psych)\s?\d{2,3}[a-z]?\b|\b(university|mit|stanford|harvard|berkeley|nptel|khan academy|coursera|edx)\b/i;
const STRONG_NL = /(课程|教程|讲座|講義|授業|レッスン|講座|강의|수업|강좌|курс|урок|лекци|कोर्स|पाठ|ट्यूटोरियल|कक्षा|درس|دورة|محاضرة|khóa học|bài giảng)/i;
const MEDIUM = /\b(learn|learning|study|beginners?|fundamentals|introduction|intro to|basics|module|chapter|class|grammar|vocabulary|algebra|calculus|physics|chemistry|biology|programming|python|javascript|sql|machine learning|data structures|algorithms)\b/i;
const EDU = /(academy|university|college|institute|school|tutor|tutorials?|lectures?|courses?|classes|education|learning|freecodecamp|crash ?course|khan|nptel|coursera|edx|ted-?ed|study|professor)/i;
const SEQ = /\b(lecture|lesson|part|chapter|module|day|week|unit|episode|ep|class|session)\.?\s*#?\d+\b|^\s*(#|no\.?|lec\.?)\s*\d+|\bL\d+\b|^\s*\d{1,3}\s*[.):-]/i;
const NEG = /\b(official (music )?video|lyrics?|lyric video|remix|feat\.?|ft\.?|soundtrack|ost|trailer|gameplay|walkthrough|let'?s play|highlights|vlog|reaction|unboxing|full album|songs?)\b/i;
// A playlist counts as "study" only with real evidence (course words in its name or titles, an educational channel or category…).
// Length alone never qualifies, and music / gaming / vlog signals veto it.
function courseScore() {
  const items = readPlaylist(); if (items.length < 3) return { ok: false, s: 0 };
  const top = items.slice(0, 12), titles = top.map(i => i.title), head = plTitle();
  const chan = norm($('ytd-playlist-panel-renderer #publisher-container, ytd-playlist-panel-renderer .byline-container')?.textContent) + ' ' + norm($('ytd-watch-metadata ytd-channel-name, #owner ytd-channel-name')?.textContent);
  const genre = ($('meta[itemprop="genre"]')?.content || '').trim(), strong = t => STRONG.test(t) || STRONG_NL.test(t);
  const secs = top.map(i => i.dur ? toSec(i.dur) : 0).filter(Boolean), avg = secs.length ? secs.reduce((a, b) => a + b, 0) / secs.length : 0;
  let s = 0, ev = 0;
  if (strong(head)) { s += 3; ev++; } else if (MEDIUM.test(head)) { s += 1; ev++; }
  const sN = titles.filter(strong).length, mN = titles.filter(t => MEDIUM.test(t)).length;
  if (sN >= 3) { s += 3; ev++; } else if (sN >= 1) { s += 1; ev++; }
  if (mN >= 3) { s += 1; ev++; }
  if (ev && titles.filter(t => SEQ.test(t)).length >= 3) s += 1;
  if (EDU.test(chan)) { s += 2; ev++; }
  if (/^Education$/i.test(genre)) { s += 2; ev++; } else if (/Science & Technology/i.test(genre)) s += 1;
  if (ev && items.length >= 5) s += 1;
  if (ev && avg >= 480) s += 1;   // lectures tend to be long
  if (NEG.test(head)) s -= 3;
  if (titles.filter(t => NEG.test(t)).length >= 3) s -= 3;
  if (/^(Music|Gaming|Entertainment|Comedy|Sports|Film & Animation|People & Blogs|Pets & Animals|Travel & Events|Autos & Vehicles)$/i.test(genre)) s -= 3;
  return { ok: s >= 3 && ev > 0, s };
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
    items.forEach((it, n) => {
      const b = document.createElement('button'); b.className = 'sm-item'; b.dataset.id = it.id; b.style.setProperty('--i', Math.min(n, 9));
      b.innerHTML = '<img loading="lazy" alt="" src="https://i.ytimg.com/vi/' + it.id + '/mqdefault.jpg"><span><b></b><em></em></span>';
      $('b', b).textContent = it.title; $('em', b).textContent = it.dur;
      b.onclick = () => { $$('.on', box).forEach(x => x.classList.remove('on')); b.classList.add('on'); if (it.id !== vid()) { startSwitch(); setPane(null); } go(it.id); };
      f.append(b);
    });
    box.append(f);
  }
  for (const b of box.children) {
    const is = b.dataset.id === cur; b.classList.toggle('on', is);
    if (is) { const em = $('em', b); if (!em.textContent && dur()) em.textContent = fmt(dur());
      if (S.scrolledTo !== cur) { S.scrolledTo = cur; box.scrollTop = Math.max(0, b.offsetTop - 8); } }
  }
}

/* ───────── notes beautifier: turns Gemini's reply into a structured study sheet ───────── */
const mk = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt) e.textContent = txt; return e; };
const BOLD = /^(STRONG|B)$/;
const firstNode = li => { for (const n of li.childNodes) if (n.nodeType !== 3 || n.data.trim()) return n; return null; };
const isHead = n => n.nodeType === 1 && (/^H[1-4]$/.test(n.tagName) || (n.tagName === 'P' && n.children.length === 1 && BOLD.test(n.firstElementChild.tagName) &&
  norm(n.textContent) === norm(n.firstElementChild.textContent) && norm(n.textContent).length < 90 && !/[.!?]$/.test(norm(n.textContent))));
const stripTs = s => s.replace(/\b\d{1,2}(?::\d{2}){1,2}\b/g, '').replace(/[()\[\]]/g, '').replace(/\s+/g, ' ').trim();
function kvList(ul) {   // "Label: text" bullets become tidy label / value rows
  const lis = [...ul.children].filter(x => x.tagName === 'LI'), lab = li => { const f = firstNode(li); return f && f.nodeType === 1 && BOLD.test(f.tagName) ? f : null; };
  if (lis.length < 2 || lis.filter(lab).length < lis.length * .6) return;
  ul.className = 'sm-kv';
  for (const li of lis) {
    const s = lab(li); if (!s) { li.classList.add('wide'); continue; }
    const k = mk('span', 'k', norm(s.textContent).replace(/[:\s]+$/, '')), v = mk('div', 'v');
    s.remove(); const f = firstNode(li); if (f && f.nodeType === 3) f.data = f.data.replace(/^[\s:\-–]+/, '');
    while (li.firstChild) v.append(li.firstChild);
    li.append(k, v);
  }
}
function beautify(art) {
  S.plain = art.innerText || art.textContent;
  while (art.children.length === 1 && art.firstElementChild.tagName === 'DIV') art.replaceChildren(...art.firstElementChild.childNodes);
  const kids = [...art.childNodes], words = norm(art.textContent).split(' ').length;
  const meta = n => { if (E.nmeta) E.nmeta.textContent = 'Study notes · ' + Math.max(1, Math.round(words / 200)) + ' min read' + (n > 1 ? ' · ' + n + ' sections' : ''); };
  if (!kids.some(isHead)) { $$('ul', art).forEach(kvList); meta(0); return; }
  const lead = mk('div', 'sm-lead'), secs = []; let num = 0;
  for (const n of kids) {
    if (isHead(n)) {
      let h = n; if (n.tagName === 'P') { h = mk('h3'); h.append(...n.firstElementChild.childNodes); }
      const txt = stripTs(h.textContent), kind = /takeaway|summary|recap|key points/i.test(txt) ? 'takeaway' : /self[- ]?test|test yourself|practice|check yourself|review questions|questions/i.test(txt) ? 'test' : '';
      const badge = kind === 'takeaway' ? '✦' : kind === 'test' ? '?' : String(++num).padStart(2, '0'), sh = mk('div', 'sm-sh');
      sh.append(mk('span', 'sm-sn', badge), h);
      const sec = mk('section', 'sm-sec' + (kind ? ' ' + kind : '')); sec.append(sh); secs.push({ sec, txt, badge });
    } else (secs.length ? secs[secs.length - 1].sec : lead).append(n);
  }
  art.textContent = '';
  if (lead.textContent.trim()) art.append(lead);
  if (secs.length >= 3) {   // clickable table of contents
    const nav = mk('nav', 'sm-toc');
    secs.forEach((s, i) => { const b = mk('button', 'sm-tocb'); b.dataset.i = i; b.append(mk('b', '', s.badge), mk('span', '', s.txt)); nav.append(b); });
    art.append(nav);
  }
  for (const { sec: s } of secs) {
    const top = [...s.children].filter(c => /^(OL|UL)$/.test(c.tagName));
    if (s.classList.contains('test')) top.forEach(l => { l.className = 'sm-qlist'; }); else top.filter(l => l.tagName === 'UL').forEach(kvList);
    art.append(s);
  }
  meta(secs.length);
}

/* labelled notes → structured sheet (independent of how YouTube formats its reply) */
const NTAG = /(?<![A-Z])(OVERVIEW|SECTION\s*\d+|TERM|POINT|EXAMPLE|TAKEAWAY|QUESTION)\s*(?:\(([^)]{0,16})\))?\s*:\s*/g;
function parseNotes(text) {
  const t = text.replace(/AI can make mistakes[\s\S]*$/i, '').replace(/[*`#]/g, ' ').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(), toks = []; let m;
  NTAG.lastIndex = 0;
  while ((m = NTAG.exec(t))) toks.push({ tag: m[1].replace(/\s*\d+$/, ''), ts: m[2] || '', i: m.index, e: NTAG.lastIndex });
  toks.forEach((k, n) => { k.body = t.slice(k.e, n + 1 < toks.length ? toks[n + 1].i : t.length).trim(); });
  const out = { overview: '', secs: [], take: [], qs: [] }; let sec = null;
  for (const k of toks) {
    if (!k.body) continue;
    if (k.tag === 'OVERVIEW') out.overview += (out.overview ? ' ' : '') + k.body;
    else if (k.tag === 'SECTION') {
      let ts = /\d/.test(k.ts) ? k.ts : '', title = k.body;
      if (!ts) { const mm = title.match(/\(?\b(\d{1,2}(?::\d{2}){1,2})\b\)?/); if (mm) { ts = mm[1]; title = title.replace(mm[0], '').replace(/\s+/g, ' ').trim(); } }
      sec = { title, ts, items: [] }; out.secs.push(sec);
    } else if (k.tag === 'TAKEAWAY') out.take.push(k.body);
    else if (k.tag === 'QUESTION') out.qs.push(k.body);
    else {
      if (!sec) { sec = { title: 'Notes', ts: '', items: [] }; out.secs.push(sec); }
      if (k.tag === 'TERM') { const [a, ...b] = k.body.split(/\s*::\s*/); sec.items.push(b.length ? { t: 'term', k: a.trim(), v: b.join(' :: ').trim() } : { t: 'point', v: k.body }); }
      else sec.items.push({ t: k.tag === 'EXAMPLE' ? 'ex' : 'point', v: k.body });
    }
  }
  return out.secs.length >= 2 || (out.secs.length === 1 && out.secs[0].items.length >= 3) ? out : null;
}
function renderNotes(d) {
  const art = E.article, plain = [];
  art.textContent = '';
  if (d.overview) { const l = mk('div', 'sm-lead'); l.append(mk('p', '', d.overview)); art.append(l); plain.push(d.overview); }
  if (d.secs.length >= 3) {
    const nav = mk('nav', 'sm-toc');
    d.secs.forEach((s, i) => { const b = mk('button', 'sm-tocb'); b.dataset.i = i; b.append(mk('b', '', String(i + 1).padStart(2, '0')), mk('span', '', s.title)); nav.append(b); });
    art.append(nav);
  }
  d.secs.forEach((s, i) => {
    const sec = mk('section', 'sm-sec'), sh = mk('div', 'sm-sh'); sh.append(mk('span', 'sm-sn', String(i + 1).padStart(2, '0')), mk('h3', '', s.title));
    if (s.ts) { const b = mk('button', 'sm-ts', s.ts); b.dataset.t = toSec(s.ts); sh.append(b); }
    sec.append(sh); plain.push('', s.title + (s.ts ? ' (' + s.ts + ')' : ''));
    let cur = null, curT = '';
    for (const it of s.items) {
      if (it.t === 'ex') { cur = null; curT = ''; const x = mk('div', 'sm-ex'); x.append(mk('b', '', 'Example'), mk('span', '', it.v)); sec.append(x); plain.push('Example: ' + it.v); continue; }
      const want = it.t === 'term' ? 'kv' : 'ul';
      if (curT !== want) { cur = mk('ul', want === 'kv' ? 'sm-kv' : ''); sec.append(cur); curT = want; }
      const li = mk('li');
      if (it.t === 'term') { li.append(mk('span', 'k', it.k), mk('div', 'v', it.v)); plain.push(it.k + ': ' + it.v); } else { li.textContent = it.v; plain.push('- ' + it.v); }
      cur.append(li);
    }
    art.append(sec);
  });
  const list = (cls, kind, badge, title, arr, ol) => {
    if (!arr.length) return; const sec = mk('section', 'sm-sec ' + kind), sh = mk('div', 'sm-sh'); sh.append(mk('span', 'sm-sn', badge), mk('h3', '', title));
    const l = mk(ol ? 'ol' : 'ul', cls); arr.forEach(x => l.append(mk('li', '', x))); sec.append(sh, l); art.append(sec); plain.push('', title, ...arr.map(x => '- ' + x));
  };
  list('', 'takeaway', '✦', 'Key takeaways', d.take); list('sm-qlist', 'test', '?', 'Test yourself', d.qs, true);
  linkify(art);   // timestamps mentioned inside sentences become clickable chips
  S.plain = plain.join('\n');
  const words = norm(art.textContent).split(' ').length;
  if (E.nmeta) E.nmeta.textContent = 'Study notes · ' + Math.max(1, Math.round(words / 200)) + ' min read · ' + d.secs.length + ' section' + (d.secs.length === 1 ? '' : 's');
}

/* ───────── notes ───────── */
const NOTES_PROMPT = 'Write detailed, well organised study notes for this entire video. Write ordinary plain text only: no markdown, no bold, no bullet symbols, no interactive cards or widgets. Put every item on its own line, starting with one of these labels exactly:\nOVERVIEW: <two or three sentence summary of the whole video>\nSECTION 1 (mm:ss): <section title>\nTERM: <term or concept> :: <clear explanation>\nPOINT: <one important point, rule or step>\nEXAMPLE: <a worked example or sample sentence from the lecture>\nUse as many TERM, POINT and EXAMPLE lines as needed under each section, then continue with SECTION 2 (mm:ss), SECTION 3 (mm:ss) and so on until the whole video is covered in order. Finish with five TAKEAWAY: lines and five QUESTION: lines (self-test questions). No introduction and no closing remarks.';
const STATUS = { idle: 'Notes start when the lecture plays', working: 'Writing your notes…', ready: 'Notes are ready!', error: 'Notes unavailable' };
function setNotes(state, msg) {
  E.foot.dataset.s = state; E.status.textContent = STATUS[state]; syncHint(); if (state !== 'ready' && E.nmeta) E.nmeta.textContent = 'Study notes';
  const art = E.article;
  if (state === 'working') art.innerHTML = '<div class="sm-skel"><i></i><i></i><i></i><i></i><i></i><i></i></div>';
  if (state === 'idle') art.innerHTML = '<p class="sm-note">Press play and detailed notes appear here as soon as the lecture starts.</p>';
  if (state === 'error') { art.innerHTML = '<p class="sm-note err"></p>'; art.firstChild.textContent = msg; }
}
async function genNotes(force) {
  const id = vid(); if (!id) return; S.nv = id; const tok = S.nwTok = (S.nwTok || 0) + 1;
  if (!force) { const c = await kv.get('n3:' + id); if (c && c.secs && vid() === id && tok === S.nwTok) { renderNotes(c); return setNotes('ready'); } }
  setNotes('working');
  try {
    const r = await Gemini.ask(NOTES_PROMPT, 4000);
    if (vid() !== id || tok !== S.nwTok) return;
    const d = parseNotes(r.text);
    if (d) { renderNotes(d); kv.set('n3:' + id, d); }
    else {   // the reply ignored the layout: keep whatever formatting it had
      if (r.text.length < 120) throw new Error('short');
      E.article.replaceChildren(toFrag(r)); linkify(E.article); beautify(E.article);
    }
    setNotes('ready'); say('Your notes are ready! Scroll down whenever you like.');
  } catch (e) {
    if (e && e.message === 'cancelled') return;
    if (vid() !== id || tok !== S.nwTok) return;
    if (/timeout|no-input|short/.test((e && e.message) || '') && S.nr !== id) { S.nr = id; return genNotes(true); }   // one automatic retry, so you never have to press Regenerate
    setNotes('error', human(e));
  }
}
function autoNotes() {
  if (!S.active || S.nv === vid() || !isPlaying() || Date.now() - S.navAt < 3000) return;
  const p = player(); if (p && p.classList.contains('ad-showing')) return;
  genNotes();
}

/* ───────── quiz (generated at 25 % of the lecture) ───────── */
// NB: the word "quiz" is avoided on purpose, because YouTube's Ask then answers with its own interactive card (no answers in the text).
const NOWIDGET = 'Write it as ordinary text only, do not use any interactive card or widget, and include the answers and explanations in the text itself.';
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
  const q = S.q, c = E.qcard; E.foot.dataset.q = q.state; E.qstatus.textContent = QSTATUS[q.state]; syncHint();
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
  E.qcard.innerHTML = `<div class="sm-qz-lock"><div class="sm-big">${q.score}/${n}</div><p>${p === 1 ? 'Perfect score! You have nailed this part.' : p >= .6 ? 'Nice work! A quick look at the notes will lock it in.' : 'Good start. Skim the notes, then try again.'}</p>
    <div class="sm-qz-pips">${q.res.map(r => `<i class="${r ? 'ok' : 'bad'}"></i>`).join('')}</div><button class="sm-next" id="sm-retry">Try again</button></div>`;
  $('#sm-retry').onclick = () => setQuiz(q.raw, true); pop();
}
function setQuiz(raw, quiet) { const q = S.q; q.raw = raw; q.qs = raw.map(prep); q.i = 0; q.score = 0; q.res = []; q.ans = false; q.state = 'ready'; renderQuiz(); if (!quiet) say('Your quiz is ready! Scroll down and show what you know.'); }
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
    if (vid() === id) { q.state = 'error'; q.msg = e && e.message === 'short' ? (/AI-generated quiz/i.test(q.dbg) ? 'YouTube answered with its own interactive quiz card, which can’t be read from the page. Try again.' : 'Gemini’s reply didn’t match the expected format. Try again. If it keeps happening, open “Show Gemini’s reply” below and send it to the developer.') : human(e); renderQuiz(); }
  }
}
function autoQuiz() {
  const q = S.q; if (!q || q.state !== 'locked' || q.req || q.id !== vid()) return;
  const d = dur(); if (!d || now() / d < .75 || Date.now() - S.navAt < 2500) return;
  const p = player(); if (p && p.classList.contains('ad-showing')) return;
  genQuiz();
}
function lockProgress() {
  if (!S.q || S.q.state !== 'locked') return;
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
const setBar = f => { E.fill.style.clipPath = `inset(0 ${((1 - f) * 100).toFixed(2)}% 0 0 round 6px)`; E.knob.style.left = f * 100 + '%'; };
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
const IDS = ['fs', 'slot', 'top', 'brand', 'title', 'bubt', 'el', 'plp', 'pl', 'list', 'er', 'qap', 'hist', 'ask', 'q', 'hint', 'pp', 'bar', 'buf', 'fill', 'gaps', 'knob', 'tip', 'chap', 'shot', 'up', 'notes', 'foot', 'status', 'qstatus', 'nmeta', 'ntitle', 'card', 'fold', 'article', 'qcard', 'wel', 'wm', 'wbub', 'wt', 'wp', 'wd', 'wnext', 'wback', 'wskip'];
const HN = { idle: 'Notes soon', working: 'Writing notes…', ready: 'Notes ready', error: 'Notes unavailable' };
const HQ = { locked: 'Quiz at 75%', working: 'Preparing quiz…', ready: 'Quiz ready', error: '' };
const syncHint = () => { if (!E.hint) return; const s = E.foot.dataset.s, q = E.foot.dataset.q;
  E.hint.title = [HN[s], HQ[q]].filter(Boolean).join(' · ') + ' · scroll down'; E.hint.dataset.r = s === 'ready' || q === 'ready' ? '1' : '0'; };

/* the logo talks: encouragement at every 25 %, and tells you when notes / quiz are ready */
const MSG = [
  [.25, ['Look at you go! A quarter of the lecture is done.', 'Great start! 25% in and your focus looks wonderful.', 'Nice one! A quarter down, and just warming up.']],
  [.5, ['Halfway there and still going strong! Keep it up!', '50% done! You are doing amazing, truly.', 'Half the lecture is behind you. So proud of you!']],
  [.75, ['Three quarters done! Your quiz is almost ready.', 'So close! One last push to master this part.', '75% complete! You are on a roll, keep shining.']],
  [1, ['You did it! Lecture complete, take a bow.', 'Finished! Your future self says thank you.', 'Lecture complete! Time to celebrate that brainpower.']]
];
const sq = []; let talking = false;
function say(text, ms = 6500) { if (!S.active || !E.top) return; sq.push({ text, ms }); if (!talking) speak(); }
function speak() {
  const m = sq.shift(); if (!m) { talking = false; return; }
  talking = true; E.bubt.textContent = m.text; E.top.classList.add('say');
  setTimeout(() => { E.top.classList.remove('say'); setTimeout(speak, 900); }, m.ms);
}
function milestones() {
  const d = dur(); if (!d || !isPlaying() || Date.now() - S.navAt < 3000) return;
  const p = now() / d; let hit = null;
  for (const [m, pool] of MSG) if (p >= (m === 1 ? .97 : m) && !S.said.has(m)) { S.said.add(m); hit = pool; }   // seeking past several → say only the latest
  if (hit) say(hit[Math.random() * hit.length | 0]);
}

/* welcome tour (first run, and whenever the logo is clicked) */
const WEL = [
  ['Your lecture, full screen', 'No clutter and no recommendations. Just you, the video, and and a background that takes on the colour of the lecture. Hover the logo to peek at the lecture title.', 'Title of Lecture'],
  ['Slide left for your playlist', 'Move your mouse to the left edge and the playlist glides out. Jump to any lecture in one click.'],
  ['Slide right to ask anything', 'Move to the right edge to ask a question. Answers are tied to the exact moment you’re at.'],
  ['Scroll down for notes & quiz', 'Notes write themselves while you watch, neatly organised into sections. At 75% a quiz unlocks to lock in what you’ve learned.'],
  ['Meet your study buddy', 'The little logo cheers you on at 25%, 50% and 75%, and taps you when your notes and quiz are ready.', 'Halfway there and still going strong!']
];
function drawWelcome() {
  const i = S.wi, [t, p, b] = WEL[i]; E.wt.textContent = t; E.wp.textContent = p; E.wbub.textContent = b || ''; E.wm.dataset.s = i + 1;
  $$('i', E.wd).forEach((d, k) => d.classList.toggle('on', k === i));
  E.wnext.textContent = i === WEL.length - 1 ? 'Start learning' : 'Next'; E.wback.style.visibility = i ? 'visible' : 'hidden';
}
function openWelcome(i = 0) {
  S.wel = true; S.wi = i; S.wp = isPlaying(); if (S.wp) togglePlay();
  setPane(null); E.wel.hidden = false; requestAnimationFrame(() => E.wel.classList.add('show')); drawWelcome();
}
function stepWelcome(d) { const i = S.wi + d; if (i >= WEL.length) return closeWelcome(); S.wi = Math.max(0, i); drawWelcome(); }
function closeWelcome() {
  S.wel = false; E.wel.classList.remove('show'); setTimeout(() => { if (!S.wel) E.wel.hidden = true; }, 450); lsSet('sm-welcomed', '1');
  if (S.wp) { S.wp = false; togglePlay(); }
}

/* edge panes: playlist (left) and questions (right) slide out when the pointer touches the edge */
function setPane(side) {
  if (S.pane === side || !E.fs) return; S.pane = side;
  E.plp.classList.toggle('open', side === 'l'); E.qap.classList.toggle('open', side === 'r'); E.fs.classList.toggle('pane', !!side);
}
function onMove(e) {
  E.fs.classList.remove('idle'); clearTimeout(S.idleT);
  S.idleT = setTimeout(() => { if (isPlaying() && !S.pane && !S.wel && document.activeElement !== E.q) E.fs.classList.add('idle'); }, 2800);
  if (S.wel || S.sp > .05) return;
  const x = e.clientX, w = innerWidth;
  const inside = S.pane === 'l' ? x <= E.plp.offsetWidth + 30 : S.pane === 'r' ? x >= w - E.qap.offsetWidth - 30 : false;
  const want = x <= 16 ? 'l' : x >= w - 16 ? 'r' : inside ? S.pane : null;
  if (want === S.pane) { clearTimeout(S.hT); S.hWant = undefined; return; }
  if (S.hWant === want) return;
  clearTimeout(S.hT); S.hWant = want;
  S.hT = setTimeout(() => { S.hWant = undefined; if (want === null && document.activeElement === E.q) return; setPane(want); }, want ? 90 : 320);
}
function onScroll() {   // scrolling drives the colour blur that slowly takes over the video
  if (S.sr) return;
  S.sr = requestAnimationFrame(() => {
    S.sr = 0; const sp = Math.min(1, S.root.scrollTop / (innerHeight * .8)); S.sp = sp;
    S.root.style.setProperty('--sp', sp.toFixed(3)); S.root.classList.toggle('scrolled', sp > .01); S.root.classList.toggle('deep', sp > .5);
    const up = S.rise ? sp > .08 : sp > .22; if (up !== S.rise) { S.rise = up; E.notes.classList.toggle('rise', up); }
    if (sp > .05 && S.pane) setPane(null);
  });
}

function build() {
  if (S.root) return;
  const r = S.root = document.createElement('div'); r.id = 'sm-root';
  applyTheme(parseTheme(lsGet('sm-theme')));
  r.innerHTML = `
  <div class="sm-fs" id="sm-fs">
    <div class="sm-slot" id="sm-slot"></div>
    <div class="sm-load"><i class="sm-lg"></i></div><div class="sm-flash"></div><div class="sm-shade"></div><div class="sm-scrim"></div>
    <header class="sm-top" id="sm-top">
      <button class="sm-brand" id="sm-brand" aria-label="CourseTube: hover for the lecture title, click for the tour"><i class="sm-lg"></i></button>
      <i class="sm-d1"></i><i class="sm-d2"></i>
      <div class="sm-pill" role="status" aria-live="polite"><span id="sm-title"></span><span id="sm-bubt"></span></div>
    </header>
    <button class="sm-exit" id="sm-exit" title="Exit study mode (Esc)">✕</button>
    <div class="sm-edge l" id="sm-el" title="Playlist"><i></i></div>
    <aside class="sm-pane l" id="sm-plp"><div class="sm-pane-in"><h2 class="sm-h">Next up…</h2><p class="sm-sub" id="sm-pl"></p><div class="sm-list" id="sm-list"></div></div></aside>
    <div class="sm-edge r" id="sm-er" title="Questions"><i></i></div>
    <aside class="sm-pane r" id="sm-qap"><div class="sm-pane-in"><h2 class="sm-h">Questions?</h2>
      <div class="sm-qa"><div class="sm-hist" id="sm-hist">${EMPTY}</div>
      <form class="sm-ask" id="sm-ask"><input id="sm-q" placeholder="Ask" autocomplete="off" spellcheck="false"><button class="sm-send" title="Ask">${ICON.send}</button></form></div></div></aside>
    <button class="sm-hint" id="sm-hint" aria-label="Scroll down for notes and quiz">${ICON.down}</button>
    <div class="sm-ctl" id="sm-ctl">
      <button class="sm-ib" id="sm-pp" title="Pause / Play"></button>
      <div class="sm-bar" id="sm-bar"><i class="sm-track"></i><i class="sm-buf" id="sm-buf"></i><i class="sm-fill" id="sm-fill"></i><div class="sm-gaps" id="sm-gaps"></div><b class="sm-knob" id="sm-knob"></b><span class="sm-tip" id="sm-tip"></span><span class="sm-chap" id="sm-chap" hidden></span></div>
      <button class="sm-ib" id="sm-shot" title="Screenshot"></button>
    </div>
  </div>
  <section class="sm-notes" id="sm-notes">
    <div class="sm-nh" id="sm-foot" data-s="idle" data-q="locked"><h2 id="sm-status"></h2><h2 class="sm-qh" id="sm-qstatus"></h2></div>
    <div class="sm-card" id="sm-card">
      <div class="sm-card-head"><div><p id="sm-nmeta">Study notes</p><h2 id="sm-ntitle"></h2></div>
        <div class="sm-acts"><button class="sm-fold" id="sm-fold" aria-expanded="true" title="Collapse notes">${ICON.fold}</button><button id="sm-copy">Copy</button><button id="sm-regen">Regenerate</button></div></div>
      <div class="sm-art-wrap"><article class="sm-article" id="sm-article"></article></div>
    </div>
    <aside class="sm-qz" id="sm-qz"><div id="sm-qcard"></div></aside>
  </section>
  <button class="sm-up" id="sm-up" title="Back to the lecture">${ICON.up}</button>
  <div class="sm-wel" id="sm-wel" hidden><div class="sm-wel-card">
    <div class="sm-wel-top"><i class="sm-lg"></i><span>Welcome to CourseTube</span></div>
    <div class="wm" id="sm-wm" data-s="1"><div class="wm-vid"></div><div class="wm-pill"><b></b></div>
      <div class="wm-pl"><i></i><i></i><i></i></div><div class="wm-qa"><i></i><i></i><em></em></div>
      <div class="wm-sheet"><i></i><i></i></div><div class="wm-bub" id="sm-wbub"></div><div class="wm-bar"><u></u></div><div class="wm-cur"></div></div>
    <h3 id="sm-wt"></h3><p id="sm-wp"></p>
    <div class="sm-wel-foot"><button class="sm-wl" id="sm-wskip">Skip</button><div class="sm-wd" id="sm-wd">${WEL.map(() => '<i></i>').join('')}</div>
      <div class="sm-wb"><button class="sm-wl" id="sm-wback">Back</button><button class="sm-next" id="sm-wnext">Next</button></div></div>
  </div></div>`;
  document.body.append(r);
  for (const id of IDS) E[id] = $('#sm-' + id, r);
  E.pp.innerHTML = ICON.play; E.shot.innerHTML = ICON.cam;

  $('#sm-exit').onclick = () => exit(true);
  E.brand.onclick = () => openWelcome(0);
  const hov = on => { clearTimeout(S.ht); S.ht = setTimeout(() => E.top.classList.toggle('hov', on), on ? 60 : 240); };   // hover the logo → title pill
  for (const [ev, on] of [['mouseenter', true], ['mouseleave', false], ['focus', true], ['blur', false]]) E.brand.addEventListener(ev, () => hov(on));
  E.pp.onclick = () => { togglePlay(); setTimeout(icons, 150); };
  E.shot.onclick = screenshot;
  E.hint.onclick = () => r.scrollTo({ top: E.notes.offsetTop - 24, behavior: 'smooth' });
  E.up.onclick = () => r.scrollTo({ top: 0, behavior: 'smooth' });
  E.el.onclick = () => setPane(S.pane === 'l' ? null : 'l');
  E.er.onclick = () => setPane(S.pane === 'r' ? null : 'r');
  E.ask.onsubmit = onAsk;
  E.q.addEventListener('keydown', e => e.stopPropagation());
  E.wnext.onclick = () => stepWelcome(1); E.wback.onclick = () => stepWelcome(-1); E.wskip.onclick = closeWelcome;
  $('#sm-copy').onclick = () => navigator.clipboard.writeText(S.plain || E.article.innerText).then(() => toast('Notes copied'));
  $('#sm-regen').onclick = () => genNotes(true);
  const fold = c => { E.card.classList.toggle('collapsed', c); E.fold.setAttribute('aria-expanded', !c); E.fold.title = c ? 'Expand notes' : 'Collapse notes'; };
  fold(lsGet('sm-ncol') === '1');
  E.fold.onclick = () => { const c = !E.card.classList.contains('collapsed'); fold(c); lsSet('sm-ncol', c ? '1' : '0'); };
  r.addEventListener('click', e => {
    const b = e.target.closest('.sm-ts'); if (b) { seek(+b.dataset.t); r.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const tb = e.target.closest('.sm-tocb'), s = tb && $$('.sm-sec', E.article)[+tb.dataset.i];
    if (s) r.scrollTo({ top: s.getBoundingClientRect().top + r.scrollTop - 96, behavior: 'smooth' });
  });
  r.addEventListener('mousemove', onMove, { capture: true, passive: true });
  r.addEventListener('scroll', onScroll, { passive: true });

  // seek bar (chapter-aware tooltip)
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

  // keep YouTube's player sized to our slot
  let raf; new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))); }).observe(E.slot);
  newQuiz(null); renderQuiz(); setNotes('idle');
}

function startSwitch() {   // fade to the ambient colour the instant a new lecture is requested; keep() fades back once frames play
  if (!E.fs || S.sw) return;
  S.sw = true; S.swFrom = vid(); S.swAt = Date.now(); E.fs.classList.add('sw');
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
  if (!S.root.isConnected) document.body.append(S.root);   // guards: YouTube must never be able to reveal itself
  if (!document.body.classList.contains('sm-on')) document.body.classList.add('sm-on');
  if (!S.root.classList.contains('on')) S.root.classList.add('on');
  if (S.sw && (Date.now() - S.swAt > 6000 || (vid() !== S.swFrom && st() === 1 && now() > 0.7))) { S.sw = false; E.fs.classList.remove('sw'); }
  if (p && E.slot && p.parentNode !== E.slot) { // YouTube re-homed its player: adopt it again
    const was = isPlaying(); S.origin = { parent: p.parentNode, next: p.nextSibling }; E.slot.append(p);
    if (was) setTimeout(() => { try { p.playVideo(); } catch {} }, 50);
  }
  const k = S.k = (S.k || 0) + 1;
  if (!document.hidden) { tick(); icons(); }
  if (k % 2 === 0) { bindVideo(); autoNotes(); autoChapters(); autoTheme(); autoQuiz(); lockProgress(); milestones(); }
  if (k % 4 === 0) { const n = document.querySelectorAll('ytd-playlist-panel-video-renderer').length;
    if (n !== S.plN) { S.plN = n; renderList(); E.pl.textContent = plTitle(); } }
}
function enter() {
  if (S.active) return;
  const p = player(); if (!p) return;
  build(); S.active = true;
  const v = video(), was = v && !v.paused;
  S.origin = { parent: p.parentNode, next: p.nextSibling };
  document.body.classList.add('sm-on'); S.root.classList.add('on'); E.slot.append(p);
  if (was) v.play().catch(() => {});
  $('#sm-launch')?.classList.remove('show');
  S.nv = null; refresh();
  clearInterval(S.iv); S.iv = setInterval(keep, 250); keep();
  requestAnimationFrame(() => requestAnimationFrame(unveil));
  setTimeout(() => S.active && Gemini.warm(), 1200);
  if (!lsGet('sm-welcomed')) setTimeout(() => S.active && !S.wel && openWelcome(0), 1100);
  const items = $('ytd-playlist-panel-renderer #items');
  if (items) { S.mo?.disconnect(); let t; S.mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(renderList, 400); }); S.mo.observe(items, { childList: true }); }
}
function exit(manual) {
  if (!S.active) return; S.active = false;
  if (S.wel) closeWelcome(); setPane(null); sq.length = 0;
  const p = player(), v = video(), was = v && !v.paused;
  if (p && S.origin && S.origin.parent.isConnected) S.origin.parent.insertBefore(p, S.origin.next && S.origin.next.isConnected ? S.origin.next : null);
  document.body.classList.remove('sm-on'); S.root.classList.remove('on'); S.mo?.disconnect(); clearInterval(S.iv); S.root.scrollTop = 0;
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
    newQuiz(id); renderQuiz(); S.said = new Set(); sq.length = 0; S.root.scrollTop = 0;
    const th = parseTheme(lsGet('sm-t-' + id)); if (th) { S.th = th; applyTheme(th); S.thFor = id; } else S.thFor = null;
    setTimeout(() => S.active && Gemini.warm(), 1800);
  }
  const set = () => { const it = readPlaylist().find(i => i.id === vid());
    const t = (it && it.title) || norm($('ytd-watch-metadata h1')?.textContent) || document.title.replace(/^\(\d+\)\s*/, '').replace(/ - YouTube$/, '');
    E.title.textContent = t; E.title.title = t; E.ntitle.textContent = t; E.pl.textContent = plTitle(); };
  set(); renderList(); icons(); tick();
  if (S.nv !== id) {
    setNotes('idle');
    kv.get('n3:' + id).then(c => { if (c && c.secs && vid() === id && S.active && S.nv !== id) { renderNotes(c); S.nv = id; setNotes('ready'); } });
  }
  setTimeout(() => { if (!S.active) return; set(); renderList(); }, 1800);
}

/* ───────── lifecycle ───────── */
const lget = l => lsGet('sm-c3-' + l);   // remembered study / not-study verdict per playlist (v2 keys: old guesses are ignored)
const lset = (l, v) => lsSet('sm-c3-' + l, v);
const off = l => sessionStorage.getItem('sm-off-' + l);
const html = document.documentElement;
const unveil = () => html.classList.remove('sm-pre');
const preveil = () => { html.classList.add('sm-pre'); clearTimeout(S.vt); S.vt = setTimeout(unveil, 12000); };
function launcher() {   // only ever offered on playlists that were recognised as study playlists
  let b = $('#sm-launch'); const show = onWatchList() && !S.active && lget(listId()) === '1';
  if (!b) { if (!show) return;
    b = Object.assign(document.createElement('button'), { id: 'sm-launch', innerHTML: '<i class="sm-lg"></i>Study mode' });
    b.onclick = () => { sessionStorage.removeItem('sm-off-' + listId()); enter(); }; document.body.append(b); }
  b.classList.toggle('show', show);
}
async function settled(n) {   // resolves once the playlist panel has stopped loading (items and title), or after a few seconds
  const t0 = Date.now(); let last = -1, since = t0;
  for (let i = 0; i < 90; i++) {
    if (n !== S.nav || S.active) return false;
    const c = document.querySelectorAll('ytd-playlist-panel-video-renderer').length;
    if (c !== last) { last = c; since = Date.now(); }
    if (c >= 3 && Date.now() - since > 600 && (plTitle() || Date.now() - t0 > 3000)) return true;
    await sleep(100);
  }
  return n === S.nav && !S.active;
}
async function onNav() {
  const n = ++S.nav; launcher();
  if (S.active) return onWatchList() ? refresh() : exit();
  const l = listId();
  if (!onWatchList() || off(l)) return unveil();
  if (lget(l) === '1') { preveil(); build(); }   // known study playlist: cover YouTube straight away
  else {   // unknown: judge quietly once the playlist has loaded. A "no" is never remembered, so the next lecture gets another look
    if (!(await settled(n)) || !courseScore().ok) return;
    lset(l, '1'); preveil(); build();
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
  if (u.pathname === '/watch' && /^PL/.test(l) && lget(l) === '1' && !off(l)) preveil();
});
window.addEventListener('yt-navigate-finish', onNav);
document.addEventListener('keydown', e => {
  if (e.altKey && e.shiftKey && e.code === 'KeyS' && onWatchList()) {   // manual switch for a study playlist we didn't recognise
    e.preventDefault(); if (S.active) return exit(true);
    sessionStorage.removeItem('sm-off-' + listId()); lset(listId(), '1'); build(); return enter();
  }
  if (!S.active) return;
  if (S.wel) {
    if (e.key === 'Escape') closeWelcome(); else if (e.key === 'ArrowRight' || e.key === 'Enter') stepWelcome(1); else if (e.key === 'ArrowLeft') stepWelcome(-1); else return;
    e.preventDefault(); e.stopPropagation(); return;
  }
  if (e.key === 'Escape' && !document.fullscreenElement) { if (S.pane) setPane(null); else exit(true); }
}, true);
applyTheme(parseTheme(lsGet('sm-theme')));   // veil already wears the last theme → no colour jump
if (onWatchList() && lget(listId()) === '1' && !off(listId())) preveil();
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', onNav, { once: true }) : onNav();
})();

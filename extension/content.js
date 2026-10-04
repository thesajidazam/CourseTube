(() => {
'use strict';
if (window.__smLoaded) return; window.__smLoaded = true;

/* ───────── helpers ───────── */
const $ = (s, r = document) => r.querySelector(s);
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
const isPlaying = () => { const p = player(); if (p && p.getPlayerState) return [1, 3].includes(p.getPlayerState()); const v = vEl(); return !!v && !v.paused; };
const togglePlay = () => { const p = player(), v = vEl();
  if (isPlaying()) p && p.pauseVideo ? p.pauseVideo() : v && v.pause(); else p && p.playVideo ? p.playVideo() : v && v.play(); };
const seek = t => { const p = player(); p && p.seekTo ? p.seekTo(t, true) : (vEl().currentTime = t); };
const svg = (d, s = 18) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="currentColor"><path d="${d}"/></svg>`;
const ICON = {
  pause: svg('M7 5h3.5v14H7zM13.5 5H17v14h-3.5z'), play: svg('M8 5v14l11-7z'),
  cam: svg('M9 4 7.6 6H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2.6L15 4zm3 4.5a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'),
  send: svg('M4 4l17 8-17 8 3-8z', 17), down: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`
};
const store = (typeof chrome !== 'undefined' && chrome.storage) ? chrome.storage.local : null;
const cacheGet = async id => { try { const k = 'n2:' + id; return (await store.get(k))[k] || null; } catch { return null; } };
const cacheSet = (id, html) => { try { store.set({ ['n2:' + id]: html }); } catch {} };

/* ───────── Gemini bridge (drives YouTube's own "Ask" panel) ─────────
   YouTube has no public API for Ask/Gemini, so this clicks through the real UI.
   If YouTube changes its markup, tweak the three finders below. */
const Gemini = (() => {
  const SKIP = '#sm-root,#sm-launch,#masthead-container,ytd-searchbox';
  const findInput = () => [...document.querySelectorAll('textarea,[contenteditable="true"],input[type="text"]')].find(el =>
    !el.closest(SKIP) && el.getClientRects().length &&
    /ask|chat|question|prompt/i.test(el.getAttribute('placeholder') || el.getAttribute('aria-label') || el.getAttribute('data-placeholder') || ''));
  const findAsk = () => [...document.querySelectorAll('ytd-watch-flexy button,ytd-watch-flexy [role="button"]')].find(b =>
    !b.closest(SKIP) && /^ask\b/i.test(norm(b.getAttribute('aria-label') || b.textContent)));
  const panelOf = el => el.closest('ytd-engagement-panel-section-list-renderer,[role="dialog"],[role="complementary"]') ||
    el.parentElement.parentElement.parentElement.parentElement;

  const waitFor = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(150); } return null; };
  const setValue = (el, text) => {
    el.focus();
    if (el.isContentEditable) { document.execCommand('selectAll'); document.execCommand('insertText', false, text); }
    else { const p = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(p, 'value').set.call(el, text); el.dispatchEvent(new Event('input', { bubbles: true })); }
  };
  const submit = (input, panel) => {
    const b = [...panel.querySelectorAll('button')].find(b => /send|submit/i.test(b.getAttribute('aria-label') || '') && !b.disabled);
    if (b) b.click();
    else ['keydown', 'keypress', 'keyup'].forEach(t => input.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true })));
  };
  // messages area = biggest ancestor of our question bubble that doesn't also hold the input box
  const locate = (input, tail) => {
    let root = input.parentElement;
    for (let i = 0; root && i < 14 && !norm(root.textContent).includes(tail); i++) root = root.parentElement;
    if (!root || !norm(root.textContent).includes(tail)) return null;
    const bubble = [...root.querySelectorAll('*')].filter(e => !e.contains(input) && !input.contains(e) && norm(e.textContent).includes(tail))
      .sort((a, b) => a.textContent.length - b.textContent.length)[0];
    if (!bubble) return null;
    let area = bubble;
    while (area.parentElement && area.parentElement !== root && !area.parentElement.contains(input)) area = area.parentElement;
    return area;
  };
  // smallest element holding the whole answer, so its formatting survives
  const extract = (area, ans, tail) => {
    const a = ans.slice(0, 40), b = ans.slice(-40);
    const node = [...area.querySelectorAll('*')].filter(e => { const t = norm(e.textContent); return t.includes(a) && t.includes(b) && !t.includes(tail); })
      .sort((x, y) => x.textContent.length - y.textContent.length)[0];
    return { text: ans, node: node || null };
  };

  const run = async prompt => {
    let input = findInput();
    if (!input) {
      const b = findAsk(); if (!b) throw new Error('no-ask');
      b.click(); input = await waitFor(findInput, 9000); if (!input) throw new Error('no-input');
    }
    const tail = norm(prompt).slice(-30);
    setValue(input, prompt); await sleep(250); submit(input, panelOf(input));
    let area = null, prev = '', same = 0; const t0 = Date.now();
    while (Date.now() - t0 < 150000) {
      await sleep(700);
      if (!input.isConnected) input = findInput() || input;
      if (!area || !area.isConnected) area = locate(input, tail);
      if (!area) continue;
      const cur = norm(area.textContent), i = cur.lastIndexOf(tail);
      if (i < 0) continue;
      let ans = cur.slice(i + tail.length).trim();
      const k = ans.search(/AI can make mistakes/i), done = k >= 0;   // disclaimer appears once the answer is complete
      if (done) ans = ans.slice(0, k).trim();
      ans = ans.replace(/\s*Ask\s*Gemini\s*$/i, '');
      if (!ans) continue;
      const busy = !!area.querySelector('button[aria-label*="Stop" i]');
      if (ans === prev) { if (++same >= (done ? 1 : 4) && (done || !busy)) return extract(area, ans, tail); } else same = 0;
      prev = ans;
    }
    throw new Error('timeout');
  };
  let queue = Promise.resolve();
  return { ask(prompt) { const p = queue.then(() => run(prompt), () => run(prompt)); queue = p.catch(() => {}); return p; } };
})();

const human = e => ({
  'no-ask': 'Couldn’t find YouTube’s “Ask” button on this video. Ask is rolling out gradually, so it may not be available for this account or video.',
  'no-input': 'Opened Ask but couldn’t find its text box. YouTube’s layout may have changed — update the finders in content.js.',
  timeout: 'Gemini took too long to answer. Try again.',
  short: 'Gemini’s reply looked incomplete. Hit Regenerate to try again.'
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
const S = { active: false, root: null, origin: null, v: null, nv: null, drag: false, nav: 0 };
let toastT;
const toast = msg => { const t = $('.sm-toast') || Object.assign(document.body.appendChild(document.createElement('div')), { className: 'sm-toast' });
  t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); };

/* ───────── detection ───────── */
const listId = () => qs().get('list') || '';
const onWatchList = () => location.pathname === '/watch' && /^PL/.test(listId());
const KEYWORDS = /\b(course|courses|lecture|lectures|tutorial|lesson|lessons|class|curriculum|bootcamp|crash course|masterclass|syllabus|semester|learn|learning|study|university|opencourseware|cs\s?\d{2,3}|[a-z]{2,4}\s?\d{3}|full course|from scratch|for beginners)\b/i;
const plTitle = () => norm($('ytd-playlist-panel-renderer .header .title, ytd-playlist-panel-renderer #header-contents .title, ytd-playlist-panel-renderer h3')?.textContent);
function looksLikeCourse() {
  const items = [...document.querySelectorAll('ytd-playlist-panel-video-renderer')];
  const head = plTitle();
  const titles = items.slice(0, 12).map(i => norm($('#video-title', i)?.textContent)).join(' | ');
  let s = 0;
  if (KEYWORDS.test(head + ' ' + document.title)) s += 2;
  if (items.length >= 5) s++;
  if (items.length >= 12) s++;
  if (/lecture|lesson|\bep(isode)?\.?\s?\d|\bpart\s?\d|#\s?\d+|\bL\d+\b|\bday\s?\d|\bchapter\b|\bmodule\b/i.test(titles)) s++;
  return s >= 2;
}

/* ───────── playlist ───────── */
function readPlaylist() {
  return [...document.querySelectorAll('ytd-playlist-panel-video-renderer')].map(el => {
    const a = $('a#wc-endpoint', el) || $('a[href*="watch"]', el);
    const id = a ? new URL(a.href, location.href).searchParams.get('v') : null;
    const d = (norm($('ytd-thumbnail-overlay-time-status-renderer', el)?.textContent).match(/\d+(?::\d+)+/) || [''])[0];
    return { a, id, title: norm($('#video-title', el)?.textContent), dur: d };
  }).filter(i => i.id);
}
function renderList() {
  if (!S.active) return;
  const box = $('#sm-list'), items = readPlaylist(), cur = vid();
  if (!items.length) { box.innerHTML = '<p class="sm-empty">Loading playlist…</p>'; return; }
  box.textContent = '';
  for (const it of items) {
    const b = document.createElement('button'); b.className = 'sm-item' + (it.id === cur ? ' on' : '');
    b.innerHTML = `<img loading="lazy" alt="" src="https://i.ytimg.com/vi/${it.id}/mqdefault.jpg"><span><b></b><em></em></span>`;
    b.querySelector('b').textContent = it.title;
    b.querySelector('em').textContent = it.dur || (it.id === cur && dur() ? fmt(dur()) : '');
    b.onclick = () => { box.querySelectorAll('.on').forEach(x => x.classList.remove('on')); b.classList.add('on'); $('#sm-player').classList.add('sw'); clearTimeout(S.swt); S.swt = setTimeout(() => $('#sm-player').classList.remove('sw'), 6000); it.a.click(); };
    box.append(b);
  }
  const on = $('.on', box); if (on) box.scrollTop = Math.max(0, on.offsetTop - 8);
}

/* ───────── notes ───────── */
const NOTES_PROMPT = 'Write detailed, well-organized study notes for this entire video. Use Markdown: a one-paragraph overview, then sections with clear headings (put the [mm:ss] timestamp in each heading), bullet points, precise definitions, formulas, step-by-step reasoning and worked examples. End with "Key takeaways" and 5 self-test questions. Be thorough but skip filler.';
const STATUS = { idle: 'Notes start when the lecture plays', working: 'Writing your notes…', ready: 'Notes are ready!', error: 'Notes unavailable' };
function setNotes(state, msg) {
  $('.sm-foot').dataset.s = state; $('#sm-status').textContent = STATUS[state];
  const art = $('#sm-article');
  if (state === 'working') art.innerHTML = '<div class="sm-skel"><i></i><i></i><i></i><i></i><i></i><i></i></div>';
  if (state === 'idle') art.innerHTML = '<p class="sm-note">Press play — detailed notes appear here as soon as the lecture starts.</p>';
  if (state === 'error') art.innerHTML = '<p class="sm-note err"></p>', art.firstChild.textContent = msg;
}
async function genNotes(force) {
  const id = vid(); if (!id) return; S.nv = id;
  if (!force) { const c = await cacheGet(id); if (c && vid() === id) { $('#sm-article').innerHTML = c; return setNotes('ready'); } }
  setNotes('working');
  try {
    const r = await Gemini.ask(NOTES_PROMPT);
    if (vid() !== id) return;
    if (r.text.length < 120) throw new Error('short');
    const art = $('#sm-article'); art.replaceChildren(toFrag(r)); linkify(art);
    cacheSet(id, art.innerHTML); $('.sm-foot').dataset.s = 'ready'; $('#sm-status').textContent = STATUS.ready;
  } catch (e) { if (vid() === id) setNotes('error', human(e)); }
}

/* ───────── questions ───────── */
async function onAsk(e) {
  e.preventDefault();
  const inp = $('#sm-q'), q = inp.value.trim(); if (!q) return; inp.value = '';
  const t = now(), hist = $('#sm-hist');
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
function tick() {
  if (!S.active || S.drag) return;
  const d = dur(), p = d ? Math.min(100, now() / d * 100) : 0, v = vEl();
  $('#sm-fill').style.width = p + '%'; $('#sm-knob').style.left = p + '%';
  $('#sm-buf').style.width = (d && v && v.buffered.length ? v.buffered.end(v.buffered.length - 1) / d * 100 : 0) + '%';
}
function icons() { const b = $('#sm-pp'), w = isPlaying() ? 'p' : 'q'; if (b && S.ic !== w) { S.ic = w; b.innerHTML = w === 'p' ? ICON.pause : ICON.play; } }
function autoNotes() {
  if (!S.active || S.nv === vid() || !isPlaying() || Date.now() - S.navAt < 2500) return;
  const p = player(); if (p && p.classList.contains('ad-showing')) return;
  genNotes();
}
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
    const a = document.createElement('a'), name = $('#sm-title').textContent.replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'lecture';
    a.href = URL.createObjectURL(blob); a.download = `${name} @ ${fmt(t).replace(/:/g, '-')}.png`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); } catch {}
    const fl = $('.sm-flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
    toast('Screenshot saved at ' + fmt(t));
  } catch { toast('This frame can’t be captured (protected video)'); }
}

/* ───────── build / enter / exit ───────── */
function build() {
  if (S.root) return;
  const r = S.root = document.createElement('div'); r.id = 'sm-root';
  r.innerHTML = `
  <section class="sm-stage">
    <button class="sm-exit" id="sm-exit" title="Exit study mode (Esc)">✕</button>
    <div class="sm-pl" id="sm-pl"></div>
    <h2 class="sm-h sm-h1">Next up…</h2><h1 class="sm-title" id="sm-title"></h1><h2 class="sm-h sm-h3">Questions?</h2>
    <div class="sm-list" id="sm-list"></div>
    <div class="sm-player" id="sm-player">
      <div class="sm-slot" id="sm-slot"></div><div class="sm-flash"></div>
      <div class="sm-ctl">
        <button class="sm-btn" id="sm-pp" title="Pause / Play"></button>
        <div class="sm-bar" id="sm-bar"><i class="sm-track" style="right:0"></i><i class="sm-buf" id="sm-buf"></i><i class="sm-fill" id="sm-fill"></i><b class="sm-knob" id="sm-knob"></b><span class="sm-tip" id="sm-tip">0:00</span></div>
        <button class="sm-btn" id="sm-shot" title="Screenshot"></button>
      </div>
    </div>
    <aside class="sm-qa">
      <div class="sm-hist" id="sm-hist"><p class="sm-empty">History<small>Ask anything about what’s being taught. Answers are tied to the moment you’re watching.</small></p></div>
      <form class="sm-ask" id="sm-ask"><input id="sm-q" placeholder="Ask" autocomplete="off" spellcheck="false"><button class="sm-btn sm-send" title="Ask">${ICON.send}</button></form>
    </aside>
    <footer class="sm-foot" data-s="idle"><h2 id="sm-status"></h2><button class="sm-btn sm-down" id="sm-down" title="Jump to notes">${ICON.down}</button></footer>
  </section>
  <section class="sm-notes" id="sm-notes"><div class="sm-card">
    <div class="sm-card-head"><div><p>Study notes</p><h2 id="sm-ntitle"></h2></div>
      <div class="sm-acts"><button id="sm-copy">Copy</button><button id="sm-regen">Regenerate</button></div></div>
    <article class="sm-article" id="sm-article"></article></div></section>`;
  document.body.append(r);
  $('#sm-shot').innerHTML = ICON.cam;

  $('#sm-exit').onclick = () => exit(true);
  $('#sm-pp').onclick = () => { togglePlay(); setTimeout(icons, 150); };
  $('#sm-shot').onclick = screenshot;
  $('#sm-down').onclick = () => $('#sm-notes').scrollIntoView({ behavior: 'smooth' });
  $('#sm-ask').onsubmit = onAsk;
  $('#sm-q').addEventListener('keydown', e => e.stopPropagation());
  $('#sm-copy').onclick = () => navigator.clipboard.writeText($('#sm-article').innerText).then(() => toast('Notes copied'));
  $('#sm-regen').onclick = () => genNotes(true);
  r.addEventListener('click', e => { const b = e.target.closest('.sm-ts'); if (b) { seek(+b.dataset.t); $('#sm-player').scrollIntoView({ behavior: 'smooth', block: 'center' }); } });

  // seek bar
  const bar = $('#sm-bar'), frac = e => { const b = bar.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)); };
  const preview = e => { const f = frac(e), d = dur(), tip = $('#sm-tip');
    tip.style.left = f * 100 + '%'; tip.textContent = fmt(f * d);
    if (S.drag) { $('#sm-fill').style.width = f * 100 + '%'; $('#sm-knob').style.left = f * 100 + '%'; } };
  bar.onpointerdown = e => { S.drag = true; bar.classList.add('drag'); bar.setPointerCapture(e.pointerId); preview(e); };
  bar.onpointermove = preview;
  bar.onpointerup = e => { if (!S.drag) return; S.drag = false; bar.classList.remove('drag'); seek(frac(e) * dur()); setTimeout(tick, 200); };

  // hide controls when idle
  const pl = $('#sm-player'); let it;
  pl.onmousemove = () => { pl.classList.remove('idle'); clearTimeout(it); it = setTimeout(() => isPlaying() && pl.classList.add('idle'), 2800); };
  pl.onmouseleave = () => pl.classList.remove('idle');

  // keep YouTube's player sized to our slot
  let raf; new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))); }).observe($('#sm-slot'));
}

function keep() {
  const p = player(), slot = $('#sm-slot');
  if (p && slot && p.parentNode !== slot) { // YouTube re-homed its player: adopt it again
    const was = isPlaying(); S.origin = { parent: p.parentNode, next: p.nextSibling }; slot.append(p);
    if (was) setTimeout(() => { try { p.playVideo(); } catch {} }, 50);
  }
  const n = document.querySelectorAll('ytd-playlist-panel-video-renderer').length;
  if (n !== S.plN) { S.plN = n; renderList(); const pl = $('#sm-pl'); if (pl) pl.textContent = plTitle(); }
  bindVideo(); icons(); tick(); autoNotes();
}
function enter() {
  if (S.active) return;
  const p = player(); if (!p) return;
  build(); S.active = true;
  const v = video(), was = v && !v.paused;
  S.origin = { parent: p.parentNode, next: p.nextSibling };
  document.body.classList.add('sm-on'); $('#sm-slot').append(p);
  if (was) v.play().catch(() => {});
  $('#sm-launch')?.classList.remove('show');
  S.nv = null; refresh();
  clearInterval(S.iv); S.iv = setInterval(keep, 400); keep();
  requestAnimationFrame(() => requestAnimationFrame(unveil));
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
  const set = () => { const it = readPlaylist().find(i => i.id === vid());
    const t = (it && it.title) || norm($('ytd-watch-metadata h1')?.textContent) || document.title.replace(/^\(\d+\)\s*/, '').replace(/ - YouTube$/, '');
    $('#sm-title').textContent = t; $('#sm-title').title = t; $('#sm-ntitle').textContent = t; $('#sm-pl').textContent = plTitle(); };
  setTimeout(() => { const p = $('#sm-player'); p && p.classList.remove('sw'); }, 900);
  set(); renderList(); icons(); tick();
  if (S.nv !== vid()) {
    setNotes('idle'); const id = vid();
    cacheGet(id).then(c => { if (c && vid() === id && S.active) { $('#sm-article').innerHTML = c; S.nv = id; setNotes('ready'); } });
  }
  setTimeout(() => { if (!S.active) return; set(); renderList(); }, 1800);
}

/* ───────── lifecycle ───────── */
function launcher() {
  let b = $('#sm-launch');
  if (!b) { b = Object.assign(document.createElement('button'), { id: 'sm-launch', textContent: '🎓 Study mode' });
    b.onclick = () => { sessionStorage.removeItem('sm-off-' + listId()); lset(listId(), '1'); enter(); }; document.body.append(b); }
  b.classList.toggle('show', onWatchList() && !S.active);
}
const html = document.documentElement;
const unveil = () => html.classList.remove('sm-pre');
const preveil = () => { html.classList.add('sm-pre'); clearTimeout(S.vt); S.vt = setTimeout(unveil, 12000); };
const lget = l => { try { return localStorage.getItem('sm-c-' + l); } catch { return null; } };   // remembered course/not-course verdict per playlist
const lset = (l, v) => { try { localStorage.setItem('sm-c-' + l, v); } catch {} };
const off = l => sessionStorage.getItem('sm-off-' + l);
async function onNav() {
  const n = ++S.nav; launcher();
  if (S.active) return onWatchList() ? refresh() : exit();
  const l = listId();
  if (!onWatchList() || off(l) || lget(l) === '0') return unveil();
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
  if (S.active) { if (u.pathname !== '/watch') exit(); return; }
  const l = u.searchParams.get('list') || '';
  if (u.pathname === '/watch' && /^PL/.test(l) && lget(l) !== '0' && !off(l)) preveil();
});
window.addEventListener('yt-navigate-finish', onNav);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.active && !document.fullscreenElement) exit(true); });
if (onWatchList() && lget(listId()) !== '0' && !off(listId())) preveil();
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', onNav, { once: true }) : onNav();
})();

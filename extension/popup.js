const $ = s => document.querySelector(s);
const send = msg => new Promise(done => {
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs || !tabs[0]) return done(null);
      chrome.tabs.sendMessage(tabs[0].id, msg, r => { void chrome.runtime.lastError; done(r || null); });
    });
  } catch { done(null); }
});
const btn = (label, mode, ghost) => { const b = document.createElement('button'); b.textContent = label; if (ghost) b.className = 'ghost'; b.onclick = async () => { await send({ type: 'sm-set', mode }); setTimeout(draw, 250); }; return b; };
async function draw() {
  const s = await send({ type: 'sm-status' }), b = $('#b'); b.textContent = '';
  if (!s) { $('#t').textContent = 'Not on a YouTube page'; $('#d').textContent = 'Open a lecture from a course playlist on YouTube, then click the CourseTube icon again.'; return; }
  if (!s.onList) { $('#t').textContent = 'This video is not in a playlist'; $('#d').textContent = 'CourseTube works on playlist pages. Open a lecture from a course playlist.'; return; }
  if (s.mode === 'off') { $('#t').textContent = 'Study mode is off for this playlist'; $('#d').textContent = 'You switched it off. It will stay off here until you change it.'; b.append(btn('Turn on for this playlist', 'on'), btn('Back to automatic', 'auto', true)); }
  else if (s.mode === 'on') { $('#t').textContent = s.active ? 'Study mode is on' : 'Study mode is on for this playlist'; $('#d').textContent = s.active ? 'This playlist always opens in study mode.' : 'It will open in study mode every time.'; b.append(btn('Turn off for this playlist', 'off'), btn('Back to automatic', 'auto', true)); }
  else if (s.active) { $('#t').textContent = 'Study mode is on'; $('#d').textContent = 'CourseTube recognised this as a study playlist.'; b.append(btn('Turn off for this playlist', 'off'), btn('Always keep it on', 'on', true)); }
  else { $('#t').textContent = 'Not recognised as a study playlist'; $('#d').textContent = 'Studying with it anyway? Turn study mode on and CourseTube will remember this playlist.'; b.append(btn('Turn on for this playlist', 'on')); }
}
draw();

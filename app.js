'use strict';
/* ====== Apps Script Web App URL ====== */
const API_URL = 'https://script.google.com/macros/s/AKfycbyQpajxPaWHJ6WgFk4X2ZZcHAO59wku0CUDsH2DwDjyw-94KRGq6levn2cRUGP1StS1zA/exec';
/* ===================================== */
const MAX_BYTES = 78000; // photos stay under 80 KB

const $ = id => document.getElementById(id);
const SCREENS = ['screenLoad', 'screenLogin', 'screenFlow', 'screenDash', 'screenDone'];
const show = id => { SCREENS.forEach(s => $(s).hidden = (s !== id)); window.scrollTo(0, 0); };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let user = null, stream = null, pos = null, photo = null, qr = null;

/* Nothing about the login is remembered: every scan starts fresh and asks for the mobile number. */
try { localStorage.removeItem('jh_phone'); } catch (e) {}

/* ---------- QR parameters (?a=in&k=KEY) ---------- */
(function () {
  const p = new URLSearchParams(location.search);
  if (p.get('a') && p.get('k')) {
    qr = { type: p.get('a').toUpperCase() === 'OUT' ? 'OUT' : 'IN', key: p.get('k') };
    try { sessionStorage.setItem('jh_qr', JSON.stringify(qr)); } catch (e) {}
    history.replaceState(null, '', location.pathname);
  } else {
    try { qr = JSON.parse(sessionStorage.getItem('jh_qr')); } catch (e) {}
  }
})();

/* If the browser restores an old copy of this page (back button), start over */
window.addEventListener('pageshow', e => { if (e.persisted) location.reload(); });

/* ---------- API ---------- */
async function api(action, data) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 60000);
  try {
    const r = await fetch(API_URL, { method: 'POST', body: JSON.stringify(Object.assign({ action }, data || {})), signal: ctl.signal });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    return j.data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Network is slow. Please try again.');
    if (e instanceof TypeError) throw new Error('No internet connection. Please try again.');
    throw e;
  } finally { clearTimeout(timer); }
}
const note = (id, text, cls) => { $(id).innerHTML = text ? `<div class="msg ${cls || 'err'}">${esc(text)}</div>` : ''; };
const creds = () => ({ phone: user.phone });

/* ---------- Sign in ---------- */
const phoneEl = $('phone'), loginBtn = $('loginBtn');
phoneEl.addEventListener('input', () => {
  let v = phoneEl.value.replace(/\D/g, '');
  if (v.length > 10) v = v.slice(-10); // pasted +91 / 0 prefix
  phoneEl.value = v; loginBtn.disabled = v.length !== 10; $('loginErr').textContent = '';
});
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (phoneEl.value.length !== 10) { $('loginErr').textContent = 'Please enter a 10-digit mobile number.'; return; }
  loginBtn.disabled = true; loginBtn.textContent = 'Verifying…';
  try {
    const phone = phoneEl.value;
    const u = await api('login', { phone });
    user = { phone, name: u.name, role: u.role };
    if (qr) await openFlow(); else await openDash();
  } catch (er) { $('loginErr').textContent = er.message; }
  finally { loginBtn.textContent = 'Continue'; loginBtn.disabled = phoneEl.value.length !== 10; }
});

function init() {
  if (qr) {
    $('loginTitle').textContent = 'Clock ' + (qr.type === 'IN' ? 'In' : 'Out');
    $('loginLead').textContent = 'Enter your mobile number to continue.';
  }
  show('screenLogin');
}

/* ---------- Exit the website ---------- */
function stopCam() { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } }
function exitSite() {
  stopCam(); user = null; photo = null; pos = null;
  try { sessionStorage.clear(); } catch (e) {}
  try { window.close(); } catch (e) {}
  setTimeout(() => { location.replace('about:blank'); }, 250); // if the browser blocks close()
}
$('btnCancel').addEventListener('click', exitSite);
$('btnClose').addEventListener('click', exitSite);
$('btnBlockClose').addEventListener('click', exitSite);

/* ---------- Clock In / Out flow ---------- */
function setStep(n) { [1, 2, 3].forEach(i => { $('st' + i).className = 'step' + (i < n ? ' done' : i === n ? ' on' : ''); }); }
async function openFlow() {
  const t = qr.type;
  $('flowBadge').textContent = t; $('flowBadge').className = 'badge ' + t;
  $('flowTitle').textContent = t === 'IN' ? 'Clock In' : 'Clock Out';
  $('flowName').textContent = user.name + ' · ' + user.role;
  $('flowMain').hidden = false; $('flowBlock').hidden = true;
  setStep(1);

  // one clock in and one clock out per day: check BEFORE opening the camera
  const s = await api('status', creds());
  let blocked = '';
  if (t === 'IN' && s.inTime) blocked = 'You already clocked in today at ' + s.inTime + '. Only one clock in per day is allowed.';
  else if (t === 'OUT' && !s.inTime) blocked = 'Please clock in first.';
  else if (t === 'OUT' && s.outTime) blocked = 'You already clocked out today at ' + s.outTime + '. Only one clock out per day is allowed.';
  if (blocked) { $('flowMain').hidden = true; $('flowBlock').hidden = false; $('flowBlockMsg').textContent = blocked; }
  show('screenFlow');
}
const getPos = () => new Promise((res, rej) => {
  if (!navigator.geolocation) return rej(new Error('Location is not supported on this device.'));
  navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
});
$('btnStart').addEventListener('click', async () => {
  note('flowMsg', ''); $('btnStart').disabled = true;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    note('flowMsg', 'Camera is not available. Please open this page in Chrome or Safari using the https link.'); $('btnStart').disabled = false; return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false });
    const v = $('video'); v.srcObject = stream; v.setAttribute('playsinline', ''); v.muted = true; v.play().catch(() => {});
  } catch (e) { note('flowMsg', 'Please allow camera access and try again.'); $('btnStart').disabled = false; return; }
  const g = $('gpsInfo'); g.hidden = false; g.className = 'msg info'; g.textContent = 'Getting your location…';
  try {
    const p = await getPos();
    pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
    g.className = 'msg ok'; g.textContent = 'Location captured (accuracy ' + Math.round(pos.acc) + ' m)';
  } catch (e) {
    stopCam(); g.className = 'msg err'; g.textContent = 'Please allow location access and try again.';
    $('btnStart').disabled = false; return;
  }
  $('btnStart').hidden = true; $('camWrap').hidden = false; $('btnShot').hidden = false; setStep(2);
});

async function compress(src, w, h, stamp) {
  let scale = Math.min(1, 720 / Math.max(w, h)), q = 0.75;
  for (let i = 0; i < 14; i++) {
    const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    const x = c.getContext('2d'); x.drawImage(src, 0, 0, c.width, c.height);
    if (stamp) {
      const fs = Math.max(11, c.width / 34); x.font = 'bold ' + fs + 'px sans-serif';
      x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, c.height - fs * 2.2, c.width, fs * 2.2);
      x.fillStyle = '#fff'; x.fillText(stamp, 6, c.height - fs * 0.7);
    }
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= MAX_BYTES) return blob;
    if (q > 0.4) q -= 0.1; else scale *= 0.85;
  }
  throw new Error('Could not compress the image below 80 KB.');
}
const toDataURL = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });

$('btnShot').addEventListener('click', async () => {
  const v = $('video');
  if (!v.videoWidth) { note('flowMsg', 'Camera is still starting. Try again in a second.'); return; }
  const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0);
  const stamp = user.name + ' | CLOCK ' + qr.type + ' | ' + new Date().toLocaleString('en-IN') + ' | ' + pos.lat.toFixed(5) + ',' + pos.lng.toFixed(5);
  try {
    const blob = await compress(c, c.width, c.height, stamp);
    photo = await toDataURL(blob);
    $('preview').src = photo; $('prevWrap').hidden = false; $('camWrap').hidden = true; $('btnShot').hidden = true;
    $('sizeInfo').hidden = false; $('sizeInfo').textContent = 'Photo ready (' + (blob.size / 1024).toFixed(1) + ' KB)';
    $('btnRetake').hidden = false; $('btnSubmit').hidden = false; setStep(3); note('flowMsg', '');
    stopCam();
  } catch (e) { note('flowMsg', e.message); }
});
$('btnRetake').addEventListener('click', async () => {
  photo = null; $('prevWrap').hidden = true; $('sizeInfo').hidden = true; $('btnRetake').hidden = $('btnSubmit').hidden = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    $('video').srcObject = stream; $('camWrap').hidden = false; $('btnShot').hidden = false; setStep(2);
  } catch (e) { note('flowMsg', 'Please allow camera access.'); }
});
$('btnSubmit').addEventListener('click', async () => {
  const b = $('btnSubmit'); b.disabled = true; b.textContent = 'Saving…'; note('flowMsg', '');
  try {
    const r = await api('clock', Object.assign(creds(), { type: qr.type, qr: qr.key, lat: pos.lat, lng: pos.lng, acc: pos.acc, photo }));
    showDone(r);
  } catch (e) {
    note('flowMsg', e.message); b.disabled = false; b.textContent = 'Submit';
  }
});

function showDone(r) {
  const t = qr.type;
  $('doneTitle').textContent = 'Clock ' + (t === 'IN' ? 'In' : 'Out') + ' recorded';
  $('doneName').textContent = user.name;
  $('doneWhen').textContent = r.date + ' · ' + r.time;
  show('screenDone');
  let n = 5; $('doneCount').textContent = 'This page will close in ' + n + ' seconds';
  const iv = setInterval(() => {
    n--; if (n <= 0) { clearInterval(iv); exitSite(); } else $('doneCount').textContent = 'This page will close in ' + n + ' seconds';
  }, 1000);
}

/* ---------- My attendance (site opened without a QR) ---------- */
async function openDash() {
  $('avatar').textContent = user.name.trim().charAt(0).toUpperCase();
  $('dName').textContent = user.name; $('dRole').textContent = user.role;
  show('screenDash');
  try {
    const d = await api('mine', creds());
    $('attTbl').innerHTML = d.attendance.length
      ? '<tr><th>Date</th><th>In</th><th>Out</th><th>Hours</th></tr>' + d.attendance.map(r => `<tr><td>${esc(r.date)}</td><td>${esc(r.inT)}</td><td>${esc(r.outT) || '–'}</td><td>${esc(r.hours) || '–'}</td></tr>`).join('')
      : '<tr><td class="empty">No attendance yet</td></tr>';
  } catch (e) { $('attTbl').innerHTML = `<tr><td class="empty">${esc(e.message)}</td></tr>`; }
}
$('btnLogout').addEventListener('click', () => location.replace(location.pathname));

init();

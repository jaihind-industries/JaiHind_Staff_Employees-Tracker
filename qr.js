'use strict';
/* Must be the SAME as QR_IN_KEY / QR_OUT_KEY in Code.gs */
const IN_KEY = 'JHI-IN-7Q4X', OUT_KEY = 'JHI-OUT-9M2K';
/* The QR opens index.html in the same folder as this page (no editing needed after hosting) */
const SITE_URL = location.href.split('#')[0].split('?')[0].replace(/[^\/]*$/, '') + 'index.html';

if (location.protocol === 'file:') {
  document.getElementById('warn').textContent = 'Host these files on your website first (Netlify, GitHub Pages…), then open qr.html from the website address so the QR contains the correct link.';
}

const SIZE = 480;
function make(id, action, key) {
  const el = document.getElementById(id);
  new QRCode(el, { text: SITE_URL + '?a=' + action + '&k=' + key, width: SIZE, height: SIZE, colorDark: '#0f3340', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
}
make('qrIn', 'in', IN_KEY);
make('qrOut', 'out', OUT_KEY);

/* Download a ready-to-print PNG poster for each QR */
function download(id, label, color, filename) {
  const qrCanvas = document.querySelector('#' + id + ' canvas');
  if (!qrCanvas) return;
  const W = 700, H = 900, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
  x.fillStyle = color; x.fillRect(0, 0, W, 34);
  x.textAlign = 'center'; x.fillStyle = '#0f3340';
  x.font = 'bold 34px Arial, sans-serif'; x.fillText('J A I H I N D   I N D U S T R I E S', W / 2, 100);
  x.fillStyle = color; x.font = 'bold 78px Arial, sans-serif'; x.fillText(label, W / 2, 200);
  x.drawImage(qrCanvas, (W - 520) / 2, 250, 520, 520);
  x.fillStyle = '#5b747d'; x.font = '28px Arial, sans-serif';
  x.fillText('Scan with your phone camera', W / 2, 840);
  const a = document.createElement('a'); a.download = filename; a.href = c.toDataURL('image/png'); document.body.appendChild(a); a.click(); a.remove();
}
document.getElementById('dlIn').onclick = () => download('qrIn', 'CLOCK IN', '#1f7a3a', 'JaiHind-Clock-IN-QR.png');
document.getElementById('dlOut').onclick = () => download('qrOut', 'CLOCK OUT', '#1e4c5c', 'JaiHind-Clock-OUT-QR.png');

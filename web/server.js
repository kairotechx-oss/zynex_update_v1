import http from 'http';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import { startSession, listSessionNumbers } from '../utils/connector.js';

const LOGO_PATH = path.resolve('menu.jpg');

const PORT = Number(process.env.PORT || 3000);
const PAIRING_SECRET = process.env.PAIRING_SECRET || '';

const TELEGRAM_URL = 'https://t.me/chatbenoirkairi';
const WHATSAPP_URL = 'https://whatsapp.com/channel/0029VbDmi1g77qVOA4cfRq13';
const SOUND_URL = 'https://files.catbox.moe/jwmgkf.mp3';

// A "waiting" pairing request older than this is considered stuck/abandoned
// and is cleared automatically so new requests are never blocked forever.
const PAIRING_STALE_MS = 2 * 60 * 1000;

const icon = (name) => {
    const icons = {
        link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07.07l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15"/><path d="M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 7 20l1.15-1.15"/></svg>',
        copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/></svg>',
        refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8.1 8.1 0 0 0-15.5-2"/><path d="M4 4v5h5"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2"/><path d="M20 20v-5h-5"/></svg>',
        menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
        x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
        telegram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 4L3.8 10.7c-1.2.5-1.2 1.2-.2 1.5l4.4 1.4 1.7 5.2c.2.6.1.8.7.8.5 0 .7-.2 1-.5l2.1-2 4.4 3.2c.8.4 1.4.2 1.6-.7L22 5.1c.3-1.1-.4-1.6-1-1.1z"/></svg>',
        whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 3.5A11.7 11.7 0 0 0 12.2 0C5.7 0 .5 5.2.5 11.7c0 2 .5 4 1.5 5.7L.4 23.9l6.7-1.7a11.8 11.8 0 0 0 5.1 1.2h.1c6.5 0 11.7-5.2 11.7-11.7 0-3.1-1.2-6-3.5-8.2zM12.3 21.3c-1.6 0-3.2-.4-4.6-1.2l-.3-.2-4 .9 1.1-3.9-.2-.4a9.6 9.6 0 0 1-1.4-5c0-5.3 4.3-9.6 9.6-9.6 2.6 0 5 1 6.8 2.8a9.5 9.5 0 0 1 2.8 6.8c0 5.3-4.3 9.6-9.6 9.6z"/><path d="M17.7 14.5c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-1.5-.7-2.5-1.3-3.5-2.9-.3-.5.3-.5.8-1.6.1-.2.1-.4 0-.6-.1-.2-.7-1.7-1-2.3-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.2-1.2 2.8 0 1.6 1.2 3.2 1.4 3.4.2.2 2.3 3.6 5.6 4.9 2.1.8 2.9.8 3.9.7.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.2-.1-.4-.2-.7-.4z"/></svg>',
        shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 3v5c0 5.2-3.4 8.9-8 10-4.6-1.1-8-4.8-8-10V6l8-3z"/><path d="M9 12l2 2 4-4"/></svg>',
        volume: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9a5 5 0 0 1 0 6M18.5 6.5a8.5 8.5 0 0 1 0 11"/></svg>',
        spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg>'
    };
    return icons[name] || '';
};

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="#0a0612">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>KAIRO ZYNEX — Whatsapp Pairing</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#0a0612;--panel:#140d22;--panel-2:#190f2b;--line:rgba(196,163,255,.16);
  --text:#f3eefc;--muted:#8d80ab;
  --accent:#a855f7;--accent2:#f0b94d;--good:#34e2b0;--danger:#ff6b7a
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text);font-family:'Sora',ui-sans-serif,system-ui,sans-serif;overflow-x:hidden}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:26px 14px;overscroll-behavior:none;position:relative}
body:before{content:"";position:fixed;z-index:-2;width:460px;height:460px;top:-170px;left:50%;transform:translateX(-50%);background:radial-gradient(circle,rgba(168,85,247,.35),transparent 70%);filter:blur(20px)}
body:after{content:"";position:fixed;z-index:-2;width:380px;height:380px;bottom:-160px;right:-80px;background:radial-gradient(circle,rgba(240,185,77,.18),transparent 70%);filter:blur(30px)}
svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.shell{width:min(100%,460px);position:relative}

.topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted);letter-spacing:.5px}
.topbar .live{display:inline-flex;align-items:center;gap:7px;color:var(--good)}
.topbar .live i{width:6px;height:6px;border-radius:50%;background:var(--good);box-shadow:0 0 10px var(--good);animation:blink 1.6s ease-in-out infinite}
@keyframes blink{50%{opacity:.35}}
.icon-btn{width:36px;height:36px;border:1px solid var(--line);background:rgba(168,85,247,.08);color:#e6d9ff;border-radius:10px;display:grid;place-items:center;cursor:pointer;transition:.2s}
.icon-btn:hover{background:rgba(168,85,247,.18)}

.card{position:relative;background:linear-gradient(165deg,var(--panel),var(--panel-2));border:1px solid var(--line);border-radius:22px;box-shadow:0 40px 90px rgba(0,0,0,.55),0 0 0 1px rgba(168,85,247,.06) inset;animation:rise .5s ease both;overflow:hidden;padding:30px 26px 26px}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.card:before{content:"";position:absolute;inset:0;background:linear-gradient(135deg,rgba(168,85,247,.10),transparent 45%,rgba(240,185,77,.06));pointer-events:none}

.brand-row{position:relative;display:flex;align-items:center;gap:14px;margin-bottom:22px}
.logo{width:50px;height:50px;border-radius:14px;overflow:hidden;border:1px solid rgba(240,185,77,.5);box-shadow:0 0 24px rgba(168,85,247,.4);flex-shrink:0}
.logo img{width:100%;height:100%;object-fit:cover}
.brand-row h1{margin:0;font-size:19px;font-weight:800;letter-spacing:.3px;background:linear-gradient(90deg,#f3eefc,#e6c86b);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.brand-row p{margin:3px 0 0;font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--muted);letter-spacing:1.5px;text-transform:uppercase}

.badge{position:relative;display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:999px;background:rgba(168,85,247,.12);border:1px solid var(--line);color:#d9c6ff;font-size:11px;font-weight:600;letter-spacing:.3px;margin-bottom:18px}
.badge svg{width:13px;height:13px;color:var(--accent2)}

h2.title{position:relative;font-size:23px;line-height:1.3;font-weight:700;margin:0 0 20px;letter-spacing:-.2px}

.field{position:relative}
.field label{display:block;font-family:'JetBrains Mono',monospace;color:#b5a6dd;font-size:11px;letter-spacing:1.2px;margin-bottom:9px;text-transform:uppercase}
.input-wrap{display:flex;align-items:center;background:rgba(0,0,0,.28);border:1px solid var(--line);border-radius:12px;padding:0 14px;transition:.2s}
.input-wrap:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px rgba(168,85,247,.18)}
.prefix{font-family:'JetBrains Mono',monospace;color:var(--accent2);font-size:14px;margin-right:2px}
input{width:100%;height:52px;border:0;outline:0;background:transparent;color:#fff;font-size:15px;font-family:'JetBrains Mono',monospace;letter-spacing:.4px}
input::placeholder{color:#473a62}

.primary{position:relative;width:100%;height:52px;margin-top:13px;border:0;border-radius:12px;background:linear-gradient(100deg,#a855f7,#f0b94d);color:#160a26;font-weight:800;font-size:13.5px;letter-spacing:.3px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;transition:.2s;font-family:'Sora',sans-serif;box-shadow:0 14px 34px rgba(168,85,247,.3)}
.primary:hover{filter:brightness(1.07);transform:translateY(-1px)}
.primary:active{transform:translateY(1px)}
.primary:disabled{opacity:.5;cursor:wait;transform:none}

.status{min-height:18px;text-align:left;font-family:'JetBrains Mono',monospace;color:var(--muted);font-size:11.5px;margin:12px 0 0}
.status:before{content:"> "}
.status.good{color:var(--good)}.status.bad{color:var(--danger)}

.code-box{display:none;margin-top:16px;border:1px solid rgba(52,226,176,.3);background:rgba(52,226,176,.06);border-radius:12px;padding:17px}
.code-box.show{display:block;animation:pop .3s ease}
@keyframes pop{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}
.code-label{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:1.5px;color:#9fe8cf;text-align:center;text-transform:uppercase}
.code{font-family:'JetBrains Mono',monospace;font-size:28px;letter-spacing:7px;text-align:center;font-weight:700;color:var(--good);margin:9px 0 13px}
.copy{width:100%;height:42px;border:1px solid var(--line);border-radius:10px;background:rgba(255,255,255,.03);color:#e8ddfb;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:600;cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:12px}
.copy:hover{background:rgba(255,255,255,.08)}

.steps{position:relative;font-family:'JetBrains Mono',monospace;font-size:11.5px;color:#b5a6dd;margin-top:24px;line-height:2.2;border-top:1px solid var(--line);padding-top:17px}
.steps span{display:inline-block;width:20px;color:var(--accent2);font-weight:700}

.footer{text-align:center;font-family:'JetBrains Mono',monospace;color:#473a62;font-size:10px;margin-top:17px;letter-spacing:.5px}
.footer strong{color:#8a74b8}

.drawer{position:fixed;inset:0;background:rgba(5,2,10,.65);backdrop-filter:blur(6px);display:none;z-index:20}
.drawer.open{display:block}
.panel{position:absolute;right:0;top:0;height:100%;width:min(88vw,340px);background:#0f0a1b;border-left:1px solid var(--line);padding:20px;transform:translateX(100%);transition:.28s ease}
.drawer.open .panel{transform:none}
.panel-head{display:flex;align-items:center;justify-content:space-between}
.panel h3{margin:0;font-size:16px;font-family:'JetBrains Mono',monospace;letter-spacing:.5px}
.panel p{color:var(--muted);font-size:12px;line-height:1.55}
.nav-link{display:flex;align-items:center;gap:12px;padding:13px;border:1px solid var(--line);border-radius:12px;color:#fff;text-decoration:none;margin:9px 0;background:rgba(168,85,247,.06)}
.nav-link span{font-size:13px;font-weight:600}
.nav-link small{display:block;color:#776692;font-size:10px;margin-top:2px}
.sound{width:100%;height:42px;border:1px solid var(--line);background:rgba(255,255,255,.03);color:#fff;border-radius:10px;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:600;cursor:pointer;margin-top:12px;font-family:'JetBrains Mono',monospace;font-size:12px}
@media(max-width:420px){.card{padding:24px 18px 20px}h2.title{font-size:20px}}
</style>
</head>
<body>
<main class="shell">
<div class="topbar"><span class="live"><i></i> SYSTEM ONLINE</span><span id="connectedCount" class="live" style="color:var(--accent2)">· 0 connected</span><button class="icon-btn" id="menuBtn" aria-label="Open menu">${icon('menu')}</button></div>

<section class="card">
<div class="brand-row"><div class="logo"><img src="/logo.jpg" alt="KAIRO ZYNEX"></div><div><h1>KAIRO ZYNEX</h1><p>WhatsApp Bot · Pairing</p></div></div>

<div class="badge">${icon('spark')} Secure multi-device pairing</div>

<h2 class="title">Link a device to run KAIRO ZYNEX on your number.</h2>

<div class="field">
<label for="number">WhatsApp number</label>
<div class="input-wrap"><span class="prefix">+</span><input id="number" type="tel" inputmode="tel" autocomplete="tel" placeholder="509xxxxxxxx" maxlength="20"></div>
</div>

<button class="primary" id="generate">${icon('refresh')}<span>Generate pairing code</span></button>
<div class="status" id="status" aria-live="polite"></div>
<div class="code-box" id="codeBox"><div class="code-label">Pairing code</div><div class="code" id="code">--------</div><button class="copy" id="copy">${icon('copy')}<span>Copy code</span></button></div>

<div class="steps">
<div><span>01</span>Generate the code above</div>
<div><span>02</span>WhatsApp → Linked devices</div>
<div><span>03</span>Link with phone number → enter code</div>
</div>
</section>

<div class="footer">Powered by <strong>KAIRO DEV</strong> — keep your pairing code private.</div>
</main>

<div class="drawer" id="drawer">
<aside class="panel">
<div class="panel-head"><h3>KAIRO_ZYNEX/menu</h3><button class="icon-btn" id="closeMenu" aria-label="Close menu">${icon('x')}</button></div>
<p>Official channels and quick instructions.</p>
<a class="nav-link" href="${TELEGRAM_URL}" target="_blank" rel="noopener noreferrer">${icon('telegram')}<div><span>Telegram</span><small>Join the developer channel</small></div></a>
<a class="nav-link" href="${WHATSAPP_URL}" target="_blank" rel="noopener noreferrer">${icon('whatsapp')}<div><span>WhatsApp Channel</span><small>Follow official updates</small></div></a>

<button class="sound" id="soundTest">${icon('volume')}<span>Test pairing sound</span></button>
<p style="margin-top:18px"><strong>How to link:</strong><br>Generate the code above, then open WhatsApp → Linked devices → Link a device → Link with phone number.</p>
</aside>
</div>

<audio id="pairSound" preload="auto" src="${SOUND_URL}"></audio>
<script>
const numberEl=document.getElementById('number');
const generate=document.getElementById('generate');
const statusEl=document.getElementById('status');
const codeBox=document.getElementById('codeBox');
const codeEl=document.getElementById('code');
const copy=document.getElementById('copy');
const audio=document.getElementById('pairSound');
const drawer=document.getElementById('drawer');

function cleanNumber(v){return String(v||'').replace(/[^0-9]/g,'');}
function setStatus(text,type=''){statusEl.textContent=text;statusEl.className='status '+type}
function unlockSound(){audio.play().then(()=>{audio.pause();audio.currentTime=0}).catch(()=>{});}
function playSound(){audio.currentTime=0;audio.play().catch(()=>{});}
let firstInteractionSoundPlayed=false;
function playSoundOnFirstInteraction(){
  if(firstInteractionSoundPlayed) return;
  firstInteractionSoundPlayed=true;
  playSound();
}
['pointerdown','touchstart','click','keydown'].forEach(evt=>document.addEventListener(evt,playSoundOnFirstInteraction,{once:true,passive:true}));
async function getStatus(){
  const r=await fetch('/api/status',{cache:'no-store'});
  return await r.json();
}
async function waitForCode(number){
  for(let i=0;i<35;i++){
    await new Promise(r=>setTimeout(r,1000));
    try{
      const d=await getStatus();
      if(d.number!==number) continue;
      if(d.status==='connected'){setStatus('WhatsApp is already connected on this session.','good');generate.disabled=false;generate.querySelector('span').textContent='Generate pairing code';return;}
      if(d.status==='ready' && d.code){
        codeEl.textContent=d.code;
        codeBox.classList.add('show');
        setStatus('Pairing code ready. Use it in WhatsApp.','good');
        generate.disabled=false;
        generate.querySelector('span').textContent='Generate new code';
        playSound();
        return;
      }
      if(d.status==='error'){
        setStatus(d.message||'Unable to generate the code.','bad');
        generate.disabled=false;
        generate.querySelector('span').textContent='Try again';
        return;
      }
    }catch(e){}
  }
  setStatus('The request is taking longer than expected. Tap Generate again if needed.','');
  generate.disabled=false;
  generate.querySelector('span').textContent='Generate pairing code';
}
async function pair(){
  const number=cleanNumber(numberEl.value);
  if(number.length<7||number.length>15){setStatus('Enter a valid WhatsApp number with country code.','bad');return;}
  unlockSound();
  generate.disabled=true;
  generate.querySelector('span').textContent='Generating…';
  codeBox.classList.remove('show');
  codeEl.textContent='--------';
  setStatus('Connecting securely…');
  try{
    const body={number};

    const r=await fetch('/api/pair',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const d=await r.json();
    if(!r.ok){setStatus(d.message||'Request failed.','bad');generate.disabled=false;generate.querySelector('span').textContent='Try again';return;}
    setStatus('Waiting for pairing code…');
    await waitForCode(number);
  }catch(e){
    setStatus('Connection error. Check the service and try again.','bad');
    generate.disabled=false;
    generate.querySelector('span').textContent='Try again';
  }
}
generate.addEventListener('click',pair);
copy.addEventListener('click',async()=>{
  const value=codeEl.textContent.trim();
  if(!value||value==='--------')return;
  try{await navigator.clipboard.writeText(value);copy.querySelector('span').textContent='Copied';setTimeout(()=>copy.querySelector('span').textContent='Copy code',1400)}
  catch{setStatus('Copy is unavailable. Select the code manually.','bad')}
});
numberEl.addEventListener('input',()=>{numberEl.value=numberEl.value.replace(/[^0-9+ ()-]/g,'').slice(0,20)});
document.getElementById('menuBtn').addEventListener('click',()=>drawer.classList.add('open'));
document.getElementById('closeMenu').addEventListener('click',()=>drawer.classList.remove('open'));
drawer.addEventListener('click',e=>{if(e.target===drawer)drawer.classList.remove('open')});
document.getElementById('soundTest').addEventListener('click',()=>{unlockSound();playSound()});

async function refreshConnectedCount(){
  try{
    const r=await fetch('/api/connected-count',{cache:'no-store'});
    const d=await r.json();
    document.getElementById('connectedCount').textContent='· '+d.count+' connected';
  }catch(e){}
}
refreshConnectedCount();
setInterval(refreshConnectedCount,15000);

// Prevent browser zoom gestures where supported.
document.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});
document.addEventListener('gesturechange',e=>e.preventDefault(),{passive:false});
document.addEventListener('wheel',e=>{if(e.ctrlKey)e.preventDefault()},{passive:false});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&['+','-','=','0'].includes(e.key))e.preventDefault()});
</script>
</body>
</html>`;

function json(res, status, data) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
    });
    res.end(JSON.stringify(data));
}

async function readBody(req) {
    let data = '';
    for await (const chunk of req) data += chunk;
    if (data.length > 5000) throw new Error('Request too large');
    return JSON.parse(data || '{}');
}

let pairing = null;
let pairingStartedAt = 0;

export function getPairingState() {
    return pairing;
}

export async function startPairingServer(handleMessage) {
    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

            if (req.method === 'GET' && url.pathname === '/') {
                res.writeHead(200, {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Cache-Control': 'no-store',
                    'X-Content-Type-Options': 'nosniff'
                });
                return res.end(page);
            }

            if (req.method === 'GET' && url.pathname === '/logo.jpg') {
                try {
                    const buf = fs.readFileSync(LOGO_PATH);
                    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' });
                    return res.end(buf);
                } catch {
                    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                    return res.end('Not found');
                }
            }

            if (req.method === 'GET' && url.pathname === '/api/status') {
                return json(res, 200, pairing || { status: 'idle' });
            }

            if (req.method === 'GET' && url.pathname === '/api/connected-count') {
                return json(res, 200, { count: listSessionNumbers().length });
            }

            if (req.method === 'POST' && url.pathname === '/api/pair') {
                const body = await readBody(req);
                const number = String(body.number || '').replace(/\D/g, '');
                if (number.length < 7 || number.length > 15) {
                    return json(res, 400, { message: 'Invalid phone number.' });
                }

                // A "waiting" request that's been stuck longer than the
                // stale threshold is treated as abandoned, not active.
                if (pairing?.status === 'waiting' && Date.now() - pairingStartedAt > PAIRING_STALE_MS) {
                    pairing = null;
                }

                if (pairing?.status === 'waiting' && pairing.number === number) {
                    return json(res, 200, { message: 'Pairing request already active.', status: pairing.status, code: pairing.code });
                }
                if (pairing?.status === 'waiting' && pairing.number !== number) {
                    return json(res, 409, { message: 'Another pairing request is already active. Try again in a minute.' });
                }

                pairing = { status: 'waiting', number, code: null };
                pairingStartedAt = Date.now();

                const existing = await import('../utils/connector.js');
                if (existing.getSession(number)?.user) {
                    pairing = { status: 'connected', number, code: null, message: 'This WhatsApp session is already connected.' };
                    return json(res, 200, { message: pairing.message, status: pairing.status });
                }

                await startSession(number, handleMessage, true, (code, n, error) => {
                    if (error) pairing = { status: 'error', number: n, code: null, message: error.message };
                    else if (code) pairing = { status: 'ready', number: n, code };
                }, false, () => {
                    // Fired once WhatsApp actually finishes linking, so the
                    // pairing page stops waiting on the old code.
                    if (pairing?.number === number) {
                        pairing = { status: 'connected', number, code: null };
                    }
                });

                return json(res, 200, { message: 'Pairing request started.', status: pairing.status, code: pairing.code });
            }

            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not found');
        } catch (e) {
            console.error('Web server:', e);
            // A crashed pairing attempt must not leave the server stuck
            // in "waiting" forever.
            if (pairing?.status === 'waiting') pairing = null;
            json(res, 500, { message: e.message });
        }
    });

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Pairing website listening on port ${PORT}`);
    });

    return server;
}

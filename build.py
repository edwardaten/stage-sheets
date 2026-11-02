#!/usr/bin/env python3
"""Build Stage Sheets: an artifact page and a GitHub Pages offline app."""
import base64, json, os, shutil
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
SP = None
FONTS = {'Mono': 'mono-reg', 'MonoSemi': 'mono-semi', 'MonoBold': 'mono-bold', 'CondBold': 'cond-bold', 'CondMed': 'cond-med', 'Sym': 'sym'}
FONT_DIR = os.path.join(ROOT, 'assets', 'fonts')
VENDOR = {n: os.path.join(ROOT, 'assets', 'vendor', n) for n in ('jspdf.umd.min.js', 'jszip.min.js')}
CDN = ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js']
VERSION = '1.2.0'

def rd(p): return open(os.path.join(ROOT, p), encoding='utf8').read()

b64 = {k: base64.b64encode(open(os.path.join(FONT_DIR, v + '.ttf'), 'rb').read()).decode() for k, v in FONTS.items()}
fonts_js = 'window.SS_FONTS=' + json.dumps(b64) + ';'
shell = rd('src/shell.html')
for k, v in b64.items(): shell = shell.replace(f'__F_{k}__', v)
inline = '\n'.join(f'<script>\n{s}\n</script>' for s in [fonts_js, rd('src/engine.js'), rd('src/examples.js'), rd('src/app.js')])

# Artifact page
os.makedirs(f'{ROOT}/dist/artifact', exist_ok=True)
art = shell.replace('<!--HEAD_EXTRA-->', '').replace('<!--SCRIPTS-->', ''.join(f'<script src="{u}"></script>\n' for u in CDN) + inline)
open(f'{ROOT}/dist/artifact/stage-sheets.html', 'w').write(art)

# GitHub Pages site
site = f'{ROOT}/docs'
shutil.rmtree(site, ignore_errors=True); os.makedirs(f'{site}/vendor')
for n, p in VENDOR.items(): shutil.copy(p, f'{site}/vendor/{n}')
head = '''<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Stage Sheets">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#15181C">'''
body = shell.replace('<!--HEAD_EXTRA-->', head).replace('<!--SCRIPTS-->', '<script src="vendor/jspdf.umd.min.js"></script>\n<script src="vendor/jszip.min.js"></script>\n' + inline)
page = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);box-sizing:border-box}body{margin:0}[hidden]{display:none!important}*,*::before,*::after{box-sizing:border-box}</style>'
        '</head><body>\n' + body + '\n</body></html>')
open(f'{site}/index.html', 'w').write(page)
open(f'{site}/manifest.webmanifest', 'w').write(json.dumps({
    'name': 'Stage Sheets', 'short_name': 'Stage Sheets', 'start_url': './', 'scope': './', 'display': 'standalone',
    'background_color': '#15181C', 'theme_color': '#15181C',
    'icons': [{'src': 'icon-192.png', 'sizes': '192x192', 'type': 'image/png'}, {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png'}]}, indent=1))
open(f'{site}/sw.js', 'w').write(f'''const CACHE = 'stage-sheets-{VERSION}';
const FILES = ['./', './index.html', './manifest.webmanifest', './vendor/jspdf.umd.min.js', './vendor/jszip.min.js', './icon-180.png', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => {{ e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); }});
self.addEventListener('activate', e => {{ e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); }});
self.addEventListener('fetch', e => {{
  if (e.request.method !== 'GET') return;
  // network first for the page so updates arrive; cache fallback when offline
  if (e.request.mode === 'navigate') {{
    e.respondWith(fetch(e.request).then(r => {{ const c = r.clone(); caches.open(CACHE).then(x => x.put('./index.html', c)); return r; }}).catch(() => caches.match('./index.html')));
    return;
  }}
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
}});
''')

def icon(n):
    im = Image.new('RGB', (n, n), '#15181C'); d = ImageDraw.Draw(im)
    f = ImageFont.truetype(os.path.join(FONT_DIR, 'cond-bold.ttf'), int(n * 0.36))
    m = ImageFont.truetype(os.path.join(FONT_DIR, 'mono-bold.ttf'), int(n * 0.2))
    d.text((n * 0.5, n * 0.36), 'Am', font=m, fill='#7FB0FF', anchor='mm')
    d.rounded_rectangle([n * 0.2, n * 0.52, n * 0.8, n * 0.8], radius=n * 0.05, fill='#F4B400')
    d.text((n * 0.5, n * 0.66), 'SS', font=f, fill='#1D1702', anchor='mm')
    im.save(f'{site}/icon-{n}.png')
for n in (180, 192, 512): icon(n)
open(f'{site}/.nojekyll', 'w').close()
print('built', len(art) // 1024, 'KB artifact;', len(page) // 1024, 'KB site page')

#!/usr/bin/env python3
"""Sammelt alle übersetzbaren deutschen Texte (Schlüssel für src/i18n-en.js)."""
import re, os, sys, html
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def read(p): return open(os.path.join(BASE, p), encoding='utf-8').read()
keys = []
def add(k):
    k = k.replace("\\'", "'")
    if k and k not in keys: keys.append(k)
app = read('src/app.js')
for m in re.finditer(r"\bt\(\s*'((?:[^'\\]|\\.)*)'", app): add(m.group(1))
# Tabellen im App-Code
for name in ['LEVELS', 'THEMES']:
    blk = app[app.index('var ' + name):]; blk = blk[:blk.index('];')]
    for m in re.finditer(r"label: '((?:[^'\\]|\\.)*)'", blk): add(m.group(1))
for name in ['PIECE', 'TAG_TEXT', 'TAG_LABEL', 'PRO_REASON']:
    blk = app[app.index('var ' + name + ' ='):]; blk = blk[:blk.index('};')]
    for m in re.finditer(r":\s*'((?:[^'\\]|\\.)*)'", blk): add(m.group(1))
blk = app[app.index('var WEAK ='):]; blk = blk[:blk.index('};')]
for m in re.finditer(r"'((?:[^'\\]|\\.)*)'", blk):
    if ':' not in m.group(0) or ' ' in m.group(1): add(m.group(1))
for fn, end in [('function article', '}'), ('var withPiece', '};')]:
    blk = app[app.index(fn):]; blk = blk[:blk.index(end)]
    for m in re.finditer(r":\s*'((?:[^'\\]|\\.)*)'", blk): add(m.group(1))
cl = read('src/classify.js')
for m in re.finditer(r"label: '([^']+)'", cl): add(m.group(1))
add('Fehler des Gegners nicht bestraft')
co = read('src/coach.js')
blk = co[co.index('var PHASES'):]; blk = blk[:blk.index('};')]
for m in re.finditer(r":\s*'([^']+)'", blk): add(m.group(1))
cn = read('src/connect.js')
blk = cn[cn.index('var SPEED'):]; blk = blk[:blk.index('};')]
for m in re.finditer(r":\s*'([^']+)'", blk): add(m.group(1))
en = read('src/engine.js')
for m in re.finditer(r"note: '([^']+)'", en): add(m.group(1))
tpl = read('template.html')
for m in re.finditer(r'<([a-z0-9]+)[^>]*\sdata-t(?:=""|(?=[\s>]))[^>]*>(.*?)</\1>', tpl, re.S):
    add(re.sub(r'\s+', ' ', html.unescape(m.group(2))).strip())
for m in re.finditer(r'data-t-(?:title|placeholder|aria)="([^"]+)"', tpl): add(html.unescape(m.group(1)))
for m in re.finditer(r'<li data-t-html>(.*?)</li>', tpl, re.S): add(re.sub(r'\s+', ' ', m.group(1)).strip())
if __name__ == '__main__':
    import json
    if '--check' in sys.argv:
        src = read('src/i18n-en.js')
        body = src[src.index('{', src.index('i18nEN')):]
        missing = [k for k in keys if json.dumps(k, ensure_ascii=False) not in body]
        print('Schlüssel:', len(keys), 'fehlend:', len(missing))
        for k in missing: print('  ', k)
        sys.exit(1 if missing else 0)
    for k in keys: print(json.dumps(k, ensure_ascii=False))

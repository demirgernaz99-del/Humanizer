#!/usr/bin/env python3
"""Baut die komplette Website aus template.html, src/ und pages/:

  zugradar.html          die App (Schriften lokal, offline-fähig)
  index.html             Landingpage mit Preisen
  impressum.html, datenschutz.html, agb.html, lizenzen.html
  sw.js                  Service Worker (Offline-Cache)

  python3 build.py                  → Website bauen
  python3 build.py --fragment OUT   → zusätzlich eine App-Fassung ohne <html>-Hülle (für gehostete Vorschauen)

Geschäftsdaten (Preise, Shop-Link, Impressum) stehen in seller.json.
"""
import os, sys, re, json, html, hashlib, subprocess

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "src")
PAGES = os.path.join(BASE, "pages")

def read(*p): return open(os.path.join(BASE, *p), encoding="utf-8").read()
def write(name, text):
    open(os.path.join(BASE, name), "w", encoding="utf-8").write(text)
    print(f"OK: {name} ({len(text):,} Bytes)")

# Englische Texte erzeugen und auf Vollständigkeit prüfen
subprocess.run([sys.executable, os.path.join(BASE, "tools", "en_build.py")], check=True)

APP_VERSION = "1.0"
seller = json.loads(read("seller.json"))
# Build-Kennung: Versionsnummer + Kurz-Hash aller Quelltexte (für Hilfe-Dialog und Support-Anfragen)
_src = "".join(read("src", f) for f in sorted(os.listdir(os.path.join(BASE, "src"))) if f.endswith((".js", ".css")))
build_id = APP_VERSION + " (" + hashlib.sha1((_src + read("template.html")).encode("utf-8")).hexdigest()[:7] + ")"
seller_js = ("(function(){var r=typeof window!=='undefined'?window:globalThis;r.SK=r.SK||{};r.SK.seller=" + json.dumps(seller, ensure_ascii=False) +
             ";r.SK.build=" + json.dumps({"version": build_id}) + ";})();")

parts = {
    "@@CONFIG@@": "config.js", "@@I18N@@": "i18n.js", "@@I18N_EN@@": "i18n-en.js", "@@LICENSE@@": "license.js",
    "@@LIBRARY@@": "library.js", "@@INSIGHTS@@": "insights.js", "@@SHARE@@": "share.js",
    "@@STYLES@@": "styles.css", "@@PIECES@@": "pieces.css", "@@CHESS@@": "vendor/chess.js",
    "@@OPENINGS@@": "openings.js", "@@CLASSIFY@@": "classify.js", "@@COACH@@": "coach.js",
    "@@CONNECT@@": "connect.js", "@@ENGINE@@": "engine.js", "@@BOARD@@": "board.js", "@@APP@@": "app.js",
}
pieces_css = read("src", "pieces.css")
pieces = dict(re.findall(r"\.pc\.(\w\w)\{background-image:url\('([^']+)'\)\}", pieces_css))
if len(pieces) != 12:
    print("FEHLER: pieces.css enthält", len(pieces), "Figuren"); sys.exit(1)

tpl = read("template.html")
tpl = tpl.replace("@@SELLER@@", seller_js)
tpl = tpl.replace("@@PIECES_JS@@", "(function(){var r=typeof window!=='undefined'?window:globalThis;r.SK=r.SK||{};r.SK.PIECES=" + json.dumps(pieces) + ";})();")
for marker, fname in parts.items():
    code = read("src", fname)
    if fname.endswith(".js") and "</script" in code.lower():
        print("ABBRUCH: '</script' in", fname); sys.exit(1)
    tpl = tpl.replace(marker, code)
left = re.findall(r"@@[A-Z_]+@@", tpl)
if [m for m in left if m != "@@FONTS@@"]:
    print("FEHLER: nicht ersetzt:", left); sys.exit(1)

FONTS_LOCAL = '<link rel="stylesheet" href="fonts/fonts.css">'
FONTS_GOOGLE = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
                '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">')

head, body = tpl.split("<!--BODY-->", 1)
app = ('<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n'
       '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
       + head.replace("@@FONTS@@", FONTS_LOCAL).strip() + '\n</head>\n<body>\n' + body.strip() + '\n</body>\n</html>\n')
write("zugradar.html", app)

# --- Seiten (Landingpage, Rechtliches) ---
def val(path):
    cur = seller
    for k in path.split("."):
        cur = cur.get(k) if isinstance(cur, dict) else None
    return cur
def fill(text):
    def rep(m):
        key = m.group(1); optional = key.endswith("?"); key = key.rstrip("?")
        if key == "legalName": v = val("legal.name") or seller.get("brand")
        else: v = val(key)
        if v in (None, ""):
            return "–" if optional else '<mark class="todo">[bitte ausfüllen: ' + key + ']</mark>'
        return html.escape(str(v))
    return re.sub(r"\{\{([a-zA-Z.?]+)\}\}", rep, text)

landing = read("pages", "landing.html")
landing = landing.replace("{{PIECES_CSS}}", pieces_css).replace("{{SELLER_JS}}", seller_js)
write("index.html", fill(landing))

LEGAL = """<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} – {brand}</title>
<meta name="robots" content="noindex">
<link rel="icon" href="icons/favicon-32.png" type="image/png">
<link rel="stylesheet" href="fonts/fonts.css">
<style>
:root {{ color-scheme: dark; }}
body {{ margin: 0; background: #111416; color: #e8ebe6; font: 16px/1.6 "IBM Plex Sans", system-ui, sans-serif; }}
.wrap {{ max-width: 760px; margin: 0 auto; padding: 28px 20px 60px; }}
a {{ color: #d9a646; }}
.top {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 26px; }}
.top a.logo {{ font: 800 22px "Bricolage Grotesque", system-ui, sans-serif; color: #e8ebe6; text-decoration: none; }}
h1 {{ font: 800 34px/1.1 "Bricolage Grotesque", system-ui, sans-serif; margin: 0 0 16px; }}
h2 {{ font: 700 19px/1.3 "Bricolage Grotesque", system-ui, sans-serif; margin: 28px 0 8px; }}
p, li {{ color: #b6bdb7; }}
code {{ font: 14px "IBM Plex Mono", monospace; }}
.draft {{ background: #3a2f18; color: #f0d9a3; padding: 10px 14px; border-radius: 10px; font-size: 14px; }}
mark.todo {{ background: #c4352a; color: #fff; padding: 0 4px; border-radius: 4px; }}
footer {{ margin-top: 40px; font-size: 14px; }}
footer a {{ margin-right: 14px; }}
</style>
</head>
<body><div class="wrap">
<div class="top"><a class="logo" href="./">{brand}</a><a href="zugradar.html">App öffnen</a></div>
{content}
<footer><a href="impressum.html">Impressum</a><a href="datenschutz.html">Datenschutz</a><a href="agb.html">Nutzungsbedingungen</a><a href="lizenzen.html">Lizenzen</a></footer>
</div></body>
</html>
"""
for page in ["impressum", "datenschutz", "agb", "lizenzen"]:
    content = read("pages", page + ".html")
    m = re.match(r"<!--title:(.+?)-->", content)
    title = m.group(1) if m else page
    write(page + ".html", LEGAL.format(title=title, brand=html.escape(seller.get("brand", "Zugradar")), content=fill(content)))

# --- Service Worker mit Inhalts-Version ---
version = hashlib.sha1((app + landing).encode("utf-8")).hexdigest()[:10]
write("sw.js", read("pages", "sw.js").replace("@@VERSION@@", version))

if "--fragment" in sys.argv:
    dest = sys.argv[sys.argv.index("--fragment") + 1]
    frag = head.replace("@@FONTS@@", FONTS_GOOGLE).strip() + "\n" + body.strip() + "\n"
    open(dest, "w", encoding="utf-8").write(frag)
    print(f"OK: {dest} (Fragment)")

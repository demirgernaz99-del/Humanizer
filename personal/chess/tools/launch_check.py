#!/usr/bin/env python3
"""Launch-Check: Ist Zugradar bereit für den Verkauf?

Prüft seller.json (Shop, Lizenz, Impressum), ob der Build aktuell ist, ob auf der Website
noch Platzhalter stehen, ob die Engine-Dateien da sind, und führt die Selbsttests aus.

    python3 tools/launch_check.py            # alles prüfen
    python3 tools/launch_check.py --no-tests # ohne Selbsttests

Rückgabewert 0 = startklar, 1 = es fehlt noch etwas. Schritt-für-Schritt-Anleitung: LAUNCH.md
"""
import json, os, re, shutil, subprocess, sys
from urllib.parse import urlparse

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
problems, warnings, oks = [], [], []


def ok(msg): oks.append(msg)
def bad(msg): problems.append(msg)
def warn(msg): warnings.append(msg)
def path(*p): return os.path.join(BASE, *p)


def is_https(url):
    try:
        u = urlparse(url)
        return u.scheme == "https" and bool(u.netloc)
    except ValueError:
        return False


# ---------- seller.json ----------
try:
    seller = json.load(open(path("seller.json"), encoding="utf-8"))
except (OSError, ValueError) as e:
    print("seller.json ist nicht lesbar:", e)
    sys.exit(1)

brand = (seller.get("brand") or "").strip()
ok(f"Marke: {brand}") if brand else bad("Marke fehlt (seller.json → brand).")

site = (seller.get("siteUrl") or "").strip()
if not is_https(site):
    bad("Website-Adresse fehlt oder ist nicht https (seller.json → siteUrl).")
else:
    if not site.endswith("/"):
        warn("siteUrl sollte mit „/“ enden, z. B. https://zugradar.de/")
    if "github.io" in site:
        warn("Die Seite läuft unter github.io. Für den Verkauf wirkt eine eigene Domain vertrauenswürdiger (LAUNCH.md, Schritt 6).")
    else:
        warn("Eigene Domain: Steht der Hoster in pages/datenschutz.html (Abschnitt „Hosting“) noch auf GitHub Pages? Bitte anpassen.")
    ok(f"Website: {site}")

lic = seller.get("license") or {}
provider = (lic.get("provider") or "lemonsqueezy").strip()
checkout = (seller.get("checkoutUrl") or "").strip()
if not checkout:
    bad("Checkout-Link fehlt (seller.json → checkoutUrl). Ohne ihn kann niemand kaufen (LAUNCH.md, Schritt 3).")
elif not is_https(checkout):
    bad("Checkout-Link muss mit https:// beginnen (seller.json → checkoutUrl).")
else:
    host = urlparse(checkout).netloc
    known = {"lemonsqueezy": ("lemonsqueezy.com",), "polar": ("polar.sh",)}.get(provider, ())
    if known and not any(host == k or host.endswith("." + k) for k in known):
        warn(f"Checkout-Link zeigt auf {host}, der Lizenz-Anbieter ist aber „{provider}“. Passt das zusammen?")
    ok(f"Checkout: {checkout}")

for key in ("prices", "pricesEn"):
    p = seller.get(key) or {}
    missing = [k for k in ("monthly", "yearly", "lifetime") if not (p.get(k) or "").strip()]
    if missing:
        bad(f"Preise unvollständig (seller.json → {key}: {', '.join(missing)}).")
if not problems or not any("Preise" in p for p in problems):
    pr = seller.get("prices") or {}
    ok(f"Preise: {pr.get('monthly')} / Monat · {pr.get('yearly')} / Jahr · {pr.get('lifetime')} einmalig")
warn("Preise in seller.json müssen genau den Preisen im Shop entsprechen (bitte einmal vergleichen).")

# ---------- Lizenz ----------
if provider == "lemonsqueezy":
    store = lic.get("storeId")
    if not store:
        bad("Lemon Squeezy: storeId fehlt. Ohne sie nimmt die App auch Schlüssel fremder Shops an (seller.json → license.storeId).")
    elif not str(store).isdigit():
        bad("Lemon Squeezy: storeId muss eine Zahl sein, z. B. 12345.")
    else:
        ok(f"Lizenz: Lemon Squeezy, Shop {store}")
    ids = lic.get("productIds") or []
    if not ids:
        warn("Lemon Squeezy: productIds ist leer. Dann gilt jeder Schlüssel aus deinem Shop als Pro-Schlüssel.")
    elif not all(str(i).isdigit() for i in ids):
        bad("Lemon Squeezy: productIds müssen Zahlen sein, z. B. [67890].")
elif provider == "polar":
    org = (lic.get("organizationId") or "").strip()
    if not re.fullmatch(r"[0-9a-fA-F-]{36}", org):
        bad("Polar: organizationId fehlt oder ist keine gültige ID (seller.json → license.organizationId).")
    else:
        ok(f"Lizenz: Polar, Organisation {org[:8]}…")
    if not lic.get("benefitIds"):
        warn("Polar: benefitIds ist leer. Dann gilt jeder Lizenzschlüssel deiner Organisation als Pro-Schlüssel.")
else:
    bad(f"Unbekannter Lizenz-Anbieter „{provider}“ (erlaubt: lemonsqueezy, polar).")

api = (lic.get("api") or "").strip()
if api:
    if not is_https(api):
        bad("license.api muss eine https-Adresse sein.")
    else:
        warn(f"Lizenzprüfung über Proxy {urlparse(api).netloc}: Datenschutzerklärung um den Proxy-Anbieter (z. B. Cloudflare) ergänzen.")

mor = (seller.get("merchantOfRecord") or "").strip()
if not mor:
    bad("merchantOfRecord fehlt (seller.json). Er steht in Impressum, AGB und Datenschutz.")
elif provider == "polar" and "lemon" in mor.lower():
    bad("Lizenz-Anbieter ist Polar, aber merchantOfRecord nennt Lemon Squeezy. Bitte anpassen.")
elif provider == "lemonsqueezy" and "polar" in mor.lower():
    bad("Lizenz-Anbieter ist Lemon Squeezy, aber merchantOfRecord nennt Polar. Bitte anpassen.")
else:
    ok(f"Verkäufer (Merchant of Record): {mor}")

# ---------- Impressum ----------
legal = seller.get("legal") or {}
labels = {"name": "Name", "street": "Straße und Hausnummer", "city": "PLZ und Ort", "country": "Land", "email": "E-Mail"}
missing = [labels[k] for k in labels if not (legal.get(k) or "").strip()]
if missing:
    bad("Impressum unvollständig (seller.json → legal): " + ", ".join(missing) + ".")
else:
    ok(f"Impressum: {legal['name']}, {legal['city']}")
email = (legal.get("email") or "").strip()
if email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
    bad(f"E-Mail-Adresse sieht ungültig aus: {email}")
if not (legal.get("phone") or "").strip():
    warn("Keine Telefonnummer im Impressum. Eine zweite schnelle Kontaktmöglichkeit neben der E-Mail wird empfohlen (prüfen lassen).")
if not (legal.get("vatId") or "").strip():
    warn("Keine USt-IdNr. eingetragen. Nur nötig, wenn du eine hast (Kleinunternehmer oft nicht).")

# ---------- Build ----------
built = ["zugradar.html", "index.html", "impressum.html", "datenschutz.html", "agb.html", "lizenzen.html", "404.html", "sw.js"]
missing_files = [f for f in built if not os.path.exists(path(f))]
if missing_files:
    bad("Build-Dateien fehlen: " + ", ".join(missing_files) + " → python3 build.py")
else:
    sources = [path("seller.json"), path("template.html")]
    for d in ("src", "pages"):
        for root, _, files in os.walk(path(d)):
            sources += [os.path.join(root, f) for f in files if f.endswith((".js", ".css", ".html"))]
    newest = max(os.path.getmtime(s) for s in sources)
    oldest_built = min(os.path.getmtime(path(f)) for f in built)
    if newest > oldest_built + 1:
        bad("Der Build ist veraltet (Quellen wurden danach geändert) → python3 build.py")
    else:
        ok("Build ist aktuell")
    todo = []
    for f in ("index.html", "impressum.html", "datenschutz.html", "agb.html"):
        txt = open(path(f), encoding="utf-8").read()
        n = txt.count("bitte ausfüllen")
        if n:
            todo.append(f"{f} ({n}×)")
    if todo:
        bad("Auf der Website stehen noch Platzhalter „[bitte ausfüllen]“: " + ", ".join(todo))
    else:
        ok("Keine Platzhalter mehr auf der Website")

for f in ("stockfish-18-lite-single.js", "stockfish-18-lite-single.wasm", "stockfish-10-asm.js", "COPYING-stockfish.txt"):
    if not os.path.exists(path("engine", f)):
        bad(f"Engine-Datei fehlt: engine/{f} → python3 get_engine.py")
if all(os.path.exists(path("engine", f)) for f in ("stockfish-18-lite-single.js", "stockfish-18-lite-single.wasm")):
    ok("Engine-Dateien vorhanden (Stockfish 18 + Ersatz)")

shots = ["shots/%s-%s.jpg" % (l, n) for l in ("de", "en") for n in ("analyse", "diagnose", "review", "training")] + ["icons/og-image.png"]
missing_shots = [f for f in shots if not os.path.exists(path(f))]
if missing_shots:
    warn("Produktbilder fehlen: " + ", ".join(missing_shots) + " → node tools/screenshots.js")
else:
    ok("Produktbilder und Vorschaubild vorhanden")

repo_root = os.path.dirname(os.path.dirname(BASE))
if "github.io" in site and not os.path.exists(os.path.join(repo_root, ".nojekyll")):
    warn(".nojekyll im Repository-Hauptordner fehlt (GitHub Pages).")

# ---------- Selbsttests ----------
if "--no-tests" not in sys.argv:
    node = shutil.which("node")
    if not node:
        warn("Node.js nicht gefunden – Selbsttests übersprungen.")
    else:
        for t in ("classify.selftest.js", "coach.selftest.js", "pro.selftest.js"):
            r = subprocess.run([node, path("src", t)], capture_output=True, text=True, timeout=300)
            last = (r.stdout.strip().splitlines() or [""])[-1]
            if r.returncode == 0 and "0 fehlgeschlagen" in last:
                ok(f"Selbsttest {t}: {last.replace('OK: ', '')}")
            else:
                bad(f"Selbsttest {t} fehlgeschlagen: {last or r.stderr.strip()[-200:]}")

# ---------- Ausgabe ----------
print(f"\n{brand or 'Zugradar'} – Launch-Check\n")
for m in oks:
    print("  ✓", m)
if warnings:
    print()
    for m in warnings:
        print("  !", m)
if problems:
    print()
    for m in problems:
        print("  ✗", m)
print()
if problems:
    print(f"Ergebnis: {len(problems)} Punkt(e) offen – noch nicht startklar. Anleitung: LAUNCH.md")
    sys.exit(1)
print("Ergebnis: startklar. Hinweise (!) bitte einmal durchsehen, dann einen Testkauf machen (LAUNCH.md, Schritt 7).")

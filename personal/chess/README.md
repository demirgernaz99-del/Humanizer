# Zugradar – Schachanalyse mit Stockfish 18

Zugradar bewertet jeden Zug sofort. Das Spektrum reicht von **brillant (!!)** und **großartig (!)** bis zum Patzer (??).
Dazu zeigt die App live den besten Zug und erklärt Fehler in Klartext. Insights über viele Partien und ein Taktik-Trainer
aus deinen eigenen Fehlern kommen hinzu. Alles läuft im Browser, auch offline, ohne Konto, auf Deutsch und Englisch.

**Verkaufen:** [LAUNCH.md](LAUNCH.md) (Schritt für Schritt zum ersten Verkauf), [VERKAUF.md](VERKAUF.md) (Preise, Recht,
Marketing). Stand prüfen: `python3 tools/launch_check.py`.

## Starten

```bash
cd personal/chess
python3 -m http.server 8000
# Landingpage: http://localhost:8000/   App: http://localhost:8000/zugradar.html
```

Online über GitHub Pages: Repo → Settings → Pages → „Deploy from a branch“ → Branch `claude/trusting-pascal-xy0947`,
Ordner `/ (root)`. Dann läuft die Seite unter <https://demirgernaz99-del.github.io/Humanizer/personal/chess/>.

Die Engine liegt in `engine/` (Stockfish 18 NNUE als WebAssembly, dazu Stockfish 10 als Ersatz, falls WebAssembly
blockiert ist). Fehlen die Dateien, lädt die App Stockfish von cdn.jsdelivr.net (`python3 get_engine.py` holt sie neu).

## Bereiche der App

- **Analyse:** bester Zug live (Pfeil, Bewertungsbalken, bis zu 5 Linien), Bewertung jedes Zuges mit Coach-Erklärung
  („Die Dame auf d5 steht ungedeckt – exd5 gewinnt Material“), Partie-Review mit Genauigkeit, Phasen,
  Schlüsselmomenten, Uhr-Auswertung und Fehler-Training, Varianten, PGN-Export mit `[%eval]` und `[%clk]`.
- **Spielen:** gegen Stockfish in 8 Stärken, mit abschaltbaren Hinweisen.
- **Insights (Pro):** analysiert deine letzten Partien von chess.com oder lichess im Hintergrund. Du siehst Genauigkeit
  je Partie, Punkte, Patzer pro Partie, Phasen, Fehlermuster, Eröffnungs-Bilanz und deine drei größten Baustellen
  mit Tipps. Free: letzte 5 Partien.
- **Trainer:** Deine Fehler, Patzer und verpassten Chancen werden zu Aufgaben. Gelöste Aufgaben kommen nach
  1, 3, 7, 14, 30, 60 Tagen wieder (Leitner-System). Free: 5 Aufgaben pro Tag.
- **Partie laden:** beendete Partien per Benutzername (chess.com, lichess), Auto-Import neuer Partien (Pro), PGN/FEN einfügen.
- **Pro:** 7-Tage-Test ohne Zahlungsdaten; Freischaltung über einen Lizenzschlüssel (Lemon Squeezy oder Polar).
  Direktlink nach dem Kauf: `zugradar.html#lizenz` (auch `#lizenz=SCHLÜSSEL`, `#pro`, `#hilfe`, `#spielen`, `#laden`).
- **Hilfe und Daten:** Willkommenskarte beim ersten Start, Hilfe (`?`) mit Symbolen, Tastenkürzeln und Support-Adresse,
  Datensicherung und -wiederherstellung als JSON-Datei (Einstellungen).
- **Teilen:** Bild eines brillanten Zuges oder des Reviews (1080×1350), in Free mit Wasserzeichen.
- Deutsch/Englisch automatisch, 5 Brett-Designs, Zugtöne, Hell/Dunkel, installierbar als App (PWA). Nach dem ersten
  Besuch läuft alles offline, auch die Engine.

**Fair Play:** Zugradar fragt nie laufende Partien ab (nur `finished=true&ongoing=false` bzw. Monatsarchive).

## So wird bewertet

Grundlage ist die **Gewinnchance** aus Sicht des Ziehenden (Lichess-Formel). Verglichen werden bester und gespielter Zug:
Bester Zug (Engine-Zug), Exzellent (< 2 %), Gut (< 5 %), Ungenauigkeit (< 10 %), Fehler (< 20 %), Patzer (≥ 20 %).

- **Brillant (!!):** (fast) bester Zug mit echtem, **neu** angebotenem Materialopfer (Abtauschbilanz ≥ 2, nur legale Züge).
  Man steht danach nicht schlechter, die Bewertung liegt ≥ 1,5 Bauern über dem Material nach Annahme,
  und man wäre ohne den Zug nicht ohnehin völlig auf Gewinn gestanden. Tausch, Desperado und Gegenangriff zählen nicht.
- **Großartig (!):** einziger guter Zug, der zweitbeste ist ≥ 20 % schlechter und kippt das Ergebnis.
  Rückschläge, freies Material, Schachabwehr und Mattsetzen zählen nicht.
- **Verpasst:** Matt in ≤ 3 ausgelassen, oder ein gegnerischer Fehler wurde nicht bestraft. **Theorie:** 117 benannte
  Eröffnungsvarianten (Deutsch/Englisch). **Erzwungen:** einziger legaler Zug.

Geprüft an Légals Matt (5.Sxe5!!), Morphys Opernpartie (16.Db8+!!) und Kasparow – Topalow 1999 (24.Txd4!!, 25.Te7+!!, 36.Lf1!!).
Alle Schwellen stehen in `src/classify.js` (`THRESHOLDS`).

## Aufbau

```
personal/chess/
├── seller.json          Geschäftsdaten: Preise, Shop-Link, Impressum  ← hier anpassen
├── build.py             baut App, Landingpage, Rechtstexte und Service Worker
├── template.html        Gerüst der App
├── pages/               Landingpage, Rechtstext-Vorlagen, Service Worker
├── src/
│   ├── config.js        Free/Pro-Grenzen, Lizenz-API, Test-Dauer
│   ├── license.js       Free/Test/Pro, Lizenzschlüssel (Lemon Squeezy / Polar), Offline-Kulanz
│   ├── classify.js      Gewinnchance, Abtauschbilanz, Opfer-Erkennung, Kategorien, Genauigkeit
│   ├── coach.js         Erklärungen und Motiv-Tags (DE/EN), Partiephasen, Uhr
│   ├── insights.js      Auswertung einer Partie und Profil über viele Partien
│   ├── library.js       Partie-Bibliothek und Trainer-Wiederholung (localStorage)
│   ├── connect.js       chess.com/lichess: nur beendete Partien
│   ├── engine.js        Stockfish-Worker, UCI, Planer (KI-Zug > live > Review > Serie)
│   ├── share.js         Teilen-Bilder (Canvas)
│   ├── i18n.js, i18n-en.js   Übersetzung (englische Texte in tools/en.py)
│   ├── board.js, openings.js, app.js, styles.css, pieces.css, vendor/chess.js
│   └── *.selftest.js    Selbsttests
├── server/license-proxy.js   optionaler CORS-Proxy für die Lizenz-API (Cloudflare Worker)
├── tools/               launch_check.py (Startklar-Prüfung), Übersetzungs-Werkzeuge, Icon-Erzeugung
├── engine/, fonts/, icons/   selbst gehostete Engine, Schriften, App-Icons
└── zugradar.html, index.html, impressum.html, …   Build-Ergebnis
```

```bash
python3 build.py                  # nach jeder Änderung
node src/classify.selftest.js     # 46 Tests: Bewertung, Buch, UCI-Parser
node src/coach.selftest.js        # 39 Tests: Coach, Phasen, Uhr, Konnektor
node src/pro.selftest.js          # 71 Tests: Lizenz (beide Anbieter), Test, Bibliothek, Trainer, Insights
python3 tools/launch_check.py     # alles zusammen + Shop-, Impressums- und Build-Prüfung
```

Neue Texte in der Oberfläche immer mit `t('Deutscher Text')` schreiben und die englische Fassung in `tools/en.py`
eintragen. `build.py` warnt bei fehlenden Übersetzungen.

## Lizenzen

Stockfish (GPLv3, stockfish.js), chess.js (BSD-2), Figuren „cburnett“ (GPLv2+), IBM Plex und Bricolage Grotesque (OFL).
Details und Quellcode-Links: `lizenzen.html`.

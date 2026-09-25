# Zugradar – Schachanalyse mit Stockfish 18

Zugradar rechnet für jede Stellung den besten Zug aus und bewertet jeden gespielten Zug sofort:
**Brillant (!!)**, **Großartig (!)**, Bester Zug, Exzellent, Gut, Theorie, Ungenauigkeit (?!),
Fehler (?), Verpasst und Patzer (??). Das funktioniert live, während du Züge auf dem Brett machst,
beim Spiel gegen die KI und für ganze Partien (PGN-Import mit Genauigkeit und Bewertungsverlauf).

Die komplette App ist **eine Datei: `zugradar.html`**. Stockfish läuft im Browser (WebAssembly),
es gibt keinen Server und keine Anmeldung.

## Starten

```bash
cd personal/chess
python3 -m http.server 8000
# → http://localhost:8000/zugradar.html
```

`zugradar.html` per Doppelklick geht auch. Dann lädt die App Stockfish von `cdn.jsdelivr.net`.

**Offline:** `python3 get_engine.py` lädt die Engine-Dateien nach `engine/` (≈ 9 MB, nicht im Git).
Über den lokalen Webserver nutzt die App dann diese Dateien.

Die App probiert die Engines in dieser Reihenfolge:

1. Stockfish 18 NNUE (lite, WebAssembly) aus `engine/`
2. dasselbe vom CDN
3. Stockfish 10 (asm.js) als Kompatibilitätsmodus, falls der Browser oder die Seite kein WebAssembly erlaubt

Das Engine-Symbol oben rechts zeigt, welche Engine läuft.

## Was die App kann

- **Bester Zug, live:** Pfeil auf dem Brett, Bewertungsbalken und bis zu 5 Engine-Linien mit Tiefe.
  Klick auf eine Linie oder „Besten Zug spielen“ (Leertaste) führt den Zug aus.
- **Zugbewertung in Echtzeit:** Symbol auf dem Zielfeld wie bei chess.com, Erklärung in Klartext
  („Die Dame auf d1 wird geopfert – Stockfish bestätigt …“, „Besser war …, Gewinnchance −18 %“).
  Brillante und großartige Züge werden zusätzlich mit einem Banner angezeigt.
- **Gegen KI spielen:** 8 Stärken von ~800 bis volle Stärke. Hinweise (bester Zug, Linien)
  lassen sich ein- und ausschalten. Deine Züge werden nach jedem Zug bewertet.
- **Partie-Review:** PGN von chess.com/lichess einfügen (Dialog oder einfach Strg+V auf der Seite).
  Alle Züge werden im Hintergrund bewertet. Dazu kommen Genauigkeit pro Spieler, eine Tabelle
  mit allen Kategorien und der Verlauf der Gewinnchance (klickbar).
- **Varianten:** In einer geladenen Partie einen anderen Zug spielen → Variante, die Partie bleibt erhalten.
- **Export:** „PGN kopieren“ schreibt die Partie mit `!!`/`?`-Zeichen und `[%eval]`-Kommentaren.
- Deutsche oder englische Notation, Hell/Dunkel automatisch, Handy-tauglich, Zustand bleibt nach dem Neuladen erhalten.

## So wird bewertet

Grundlage ist die **Gewinnchance** aus Sicht des Ziehenden (Lichess-Formel aus der Stockfish-Bewertung).
Verglichen wird der beste Zug mit dem gespielten Zug:

| Verlust an Gewinnchance | Kategorie |
|---|---|
| 0 (Engine-Zug) | Bester Zug |
| unter 2 % | Exzellent |
| unter 5 % | Gut |
| unter 10 % | Ungenauigkeit |
| unter 20 % | Fehler |
| ab 20 % | Patzer |

Sonderregeln (alle in `src/classify.js`, Schwellen in `THRESHOLDS`):

- **Brillant (!!):** bester oder fast bester Zug (unter 2 % Verlust) **mit echtem Materialopfer**.
  Nach dem Zug kann der Gegner per Abtauschbilanz (SEE, nur legale Züge) mindestens 2 Punkte gewinnen.
  Das Material wurde durch diesen Zug **neu** angeboten und nicht schon vorher. Man steht danach nicht
  schlechter (Gewinnchance ab 45 %). Die Bewertung liegt mindestens 1,5 Bauern über dem Material nach
  Annahme des Opfers. Man wäre auch ohne den Zug nicht ohnehin völlig auf Gewinn gestanden.
  Kein Tausch mit sofortigem Rückgewinn, kein Desperado.
- **Großartig (!):** der einzige gute Zug. Der zweitbeste Zug ist mindestens 20 % schlechter und
  kippt das Ergebnis (Gewinn → offen oder offen → Verlust). Rückschläge, das Einsammeln hängender
  Figuren, Schachabwehr und Mattsetzen zählen nicht.
- **Verpasst:** Matt in ≤ 3 ausgelassen, oder ein Fehler des Gegners wurde nicht bestraft.
- **Theorie:** Züge aus dem eingebauten Eröffnungsbuch (117 benannte Varianten, erkennt Zugumstellungen).
- **Erzwungen:** es gab nur einen legalen Zug.

Getestet an berühmten Partien: Légals Matt (5.Sxe5!!), Morphys Opernpartie (16.Db8+!!) und
Kasparow – Topalow 1999 (24.Txd4!!, 25.Te7+!!, 36.Lf1!!) werden als brillant erkannt.
Die Bewertungen hängen von der Rechentiefe ab. Höhere Review-Tiefe (Einstellungen) ist genauer, braucht aber länger.

## Fair Play

Zugradar ist für Analyse, Training, Partien gegen die KI und die Nachbesprechung eigener Partien gedacht.
Die App liest bewusst **keine laufenden Online-Partien** mit. Engine-Hilfe in Partien gegen Menschen
ist auf chess.com, lichess und im Verein verboten und führt zur Sperre.

## Entwicklung

```
personal/chess/
├── template.html        Seitengerüst (Marker @@…@@)
├── build.py             baut zugradar.html (und mit --fragment OUT eine Version ohne <html>-Hülle)
├── get_engine.py        lädt Stockfish nach engine/ (für Offline-Betrieb)
├── zugradar.html        fertige App (Build-Ergebnis)
└── src/
    ├── classify.js      Gewinnchance, SEE, Opfer-Erkennung, Kategorien, Genauigkeit
    ├── classify.selftest.js
    ├── engine.js        Stockfish-Worker, UCI-Parser, Planer (KI-Zug > Live-Stellung > Review)
    ├── board.js         Brett: Klick/Drag, Umwandlung, Pfeile, Symbole
    ├── openings.js      Eröffnungsbuch
    ├── app.js           Zustand, Oberfläche, Spiel gegen KI, PGN-Import/-Export
    ├── styles.css, pieces.css
    └── vendor/chess.js  Zuggenerator (chess.js 1.4.0)
```

```bash
python3 build.py                 # nach jeder Änderung in src/
node src/classify.selftest.js    # 46 Tests für Bewertung, Buch und UCI-Parser
```

## Lizenzen

- Stockfish: GPLv3 (stockfish.js von Nathan Rugg / Chess.com); Quellcode unter <https://github.com/nmrugg/stockfish.js>
- chess.js: BSD-2-Clause (Jeff Hlywa)
- Figuren: cburnett-Satz (Colin M.L. Burnett, GPLv2+), über lichess chessground

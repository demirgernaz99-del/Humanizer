# Zugradar verkaufen – Leitfaden

Dieser Leitfaden erklärt Preise, Recht und Marketing. Die konkreten Klicks bis zum ersten Verkauf stehen in
**[LAUNCH.md](LAUNCH.md)**. Ob alles bereit ist, zeigt `python3 tools/launch_check.py`.
Der Leitfaden ersetzt keine Rechts- oder Steuerberatung. Die markierten Punkte solltest du von Fachleuten prüfen lassen.

## 1. Was fertig ist

| | Free | Pro |
|---|---|---|
| Live-Analyse, bester Zug, Engine-Linien | ✓ | ✓ |
| Bewertung jedes Zuges inkl. brillant/großartig, Coach-Erklärungen | ✓ | ✓ |
| Partie-Review (Genauigkeit, Phasen, Schlüsselmomente, Uhr), Fehler-Training der Partie | ✓ unbegrenzt | ✓ |
| Spiel gegen die KI, PGN-Import/-Export, Teilen-Bilder | ✓ (mit Wasserzeichen) | ✓ (ohne) |
| Partien von chess.com/lichess laden | ✓ | ✓ |
| Insights über viele Partien | 5 Partien | 100 Partien |
| Taktik-Trainer aus eigenen Fehlern (Wiederholung) | 5 Aufgaben/Tag | unbegrenzt |
| Auto-Import beendeter Partien | – | ✓ |
| Review-Tiefe | bis 16 | bis 22 |
| Brett-Designs | 2 | 5 |

Die Grenzen stehen in `src/config.js` (`free` / `pro`). Dazu gibt es einen 7-Tage-Test ohne Zahlungsdaten,
Deutsch/Englisch mit automatischer Erkennung, eine Landingpage mit Preisen, Rechtstext-Vorlagen und eine installierbare, offline-fähige Web-App (PWA).
In der App gibt es außerdem eine Willkommenskarte für neue Nutzer, eine Hilfe mit Symbol-Erklärung und Tastenkürzeln sowie
Datensicherung und -wiederherstellung als Datei. Der Direktlink `zugradar.html#lizenz` führt Käufer nach dem Kauf zur
Schlüssel-Eingabe.

## 2. Checkliste bis zum ersten Verkauf

1. **Gewerbe anmelden** beim Gewerbeamt deiner Stadt (Online-Anmeldung meist möglich).
   Kläre mit Steuerberatung, ob die Kleinunternehmerregelung (§ 19 UStG) für dich passt. *(prüfen lassen)*
2. **Shop über einen „Merchant of Record“ anlegen:** Lemon Squeezy oder Polar, beide sind eingebaut. Der Anbieter
   verkauft im eigenen Namen, kassiert, führt die Mehrwertsteuer in allen EU-Ländern ab und stellt Rechnungen aus.
   Du bekommst eine Auszahlung. Das spart dir die EU-Umsatzsteuer-Bürokratie (OSS).
   Lemon Squeezy wird seit 2026 schrittweise mit Stripe Managed Payments zusammengeführt. Prüfe deshalb, ob es noch
   neue Shops annimmt; sonst nimm Polar. Die Gebühren ändern sich; prüfe sie vor dem Start auf der Anbieterseite.
3. **Produkt anlegen:** „Zugradar Pro“ mit drei Varianten (monatlich, jährlich, einmalig), Lizenzschlüssel an,
   Aktivierungslimit 3 Geräte. Details für beide Anbieter: LAUNCH.md, Schritt 3.
4. **`seller.json` ausfüllen:**
   - `checkoutUrl`: der Checkout-Link aus dem Shop
   - `license`: Anbieter und IDs (Lemon Squeezy: `storeId`, `productIds`; Polar: `organizationId`). Dann akzeptiert
     die App nur deine Schlüssel.
   - `legal`: Name, Anschrift, E-Mail, ggf. USt-IdNr. (Impressumspflicht)
   - `prices` / `pricesEn`: so, wie sie im Shop stehen
   - `merchantOfRecord`: Name des Anbieters (erscheint in Impressum, AGB, Datenschutz)
   Danach `python3 build.py` und `python3 tools/launch_check.py`.
5. **Lizenz testen:** Im Testmodus des Shops einen Kauf auslösen und den Schlüssel über `zugradar.html#lizenz`
   aktivieren. Meldet die App „Lizenzserver nicht erreichbar“, obwohl Internet da ist, blockiert der Browser die
   Anfrage (CORS). Dann den kleinen Proxy `server/license-proxy.js` als Cloudflare Worker deployen und dessen Adresse
   in `seller.json` → `license.api` eintragen.
6. **Rechtstexte prüfen lassen:** `pages/impressum.html`, `pages/datenschutz.html`, `pages/agb.html`.
   Günstig sind Abo-Dienste für geprüfte Rechtstexte (z. B. IT-Recht-Kanzlei, Händlerbund). *(prüfen lassen)*
7. **Online stellen** (siehe Abschnitt 4), die Seite einmal am Handy installieren („Zum Home-Bildschirm“) und durchklicken.
8. **Markenname prüfen:** „Zugradar“ im DPMAregister und bei der EUIPO suchen. Bei Bedarf anmelden
   (Deutschland ab ca. 290 € für drei Klassen, z. B. Klasse 9 und 42).

## 3. Preise

Vorschlag (in `seller.json`): **4,99 €/Monat · 34,99 €/Jahr · 69 € einmalig.**
Zum Vergleich: chess.com verlangt für unbegrenzte Reviews mit Coach das Diamond-Abo, lichess ist kostenlos, hat aber
kein „Brillant“, keinen Coach und keine Insights. Zugradar Free ist bewusst großzügig, denn das bringt Nutzer.
Pro verkauft das *Besserwerden*: Insights, Trainer und Auto-Import.

Tipps:
- Zum Start einen **Einführungspreis** (z. B. −30 % im ersten Monat) über einen Rabattcode im Shop.
- Die Jahresvariante hervorheben. Sie ist im Pro-Dialog schon als „beliebt“ markiert.
- **Affiliate-Programm** des Shops für Schach-Streamer und Trainer einschalten (Provision z. B. 30 %).

## 4. Online stellen

**Schnellstart (kostenlos):** GitHub → Repo *Humanizer* → Settings → Pages → „Deploy from a branch“ →
Branch `claude/trusting-pascal-xy0947`, Ordner `/ (root)` → Save. Nach 1–2 Minuten ist die Seite erreichbar unter
<https://demirgernaz99-del.github.io/Humanizer/personal/chess/>.

**Für den Verkauf besser:** eine eigene Domain (z. B. `zugradar.de`, ca. 10 €/Jahr) und ein eigenes Repository nur für
Zugradar. Das wirkt vertrauenswürdiger, und die Adresse bleibt, auch wenn du das Hosting wechselst. Cloudflare Pages oder
Netlify funktionieren genauso wie GitHub Pages: den Ordner `personal/chess/` ausliefern, fertig. Danach `siteUrl` in
`seller.json` anpassen.

Updates: Dateien in `src/` oder `pages/` ändern → `python3 build.py` → committen → pushen.

## 5. Recht und Lizenzen – was du wissen musst

- **Stockfish (GPLv3):** Du darfst Stockfish mitverkaufen. Bedingung: Lizenztext und Zugang zum Quellcode. Beides
  steht auf `lizenzen.html`. Zugradar spricht die Engine als eigenständiges Programm über das UCI-Protokoll an.
  Deshalb gilt der eigene App-Code üblicherweise nicht als abgeleitetes Werk. Ganz abschließend ist diese Frage rechtlich
  nicht geklärt. *(prüfen lassen, falls du den App-Code geschlossen halten willst)*
- **Figuren „cburnett“ (GPLv2+):** Nutzung mit Namensnennung (steht auf `lizenzen.html`). Wer eine eigene Optik und
  keinerlei GPL-Grafik will, lässt einen eigenen Figurensatz zeichnen.
- **chess.js (BSD-2), Schriften (OFL):** Kommerzielle Nutzung erlaubt, Hinweise sind vorhanden.
  Die Schriften liegen auf deinem Server (keine Google-Fonts-Abmahnung möglich).
- **Vergleichende Werbung:** Der Vergleich mit chess.com und lichess auf der Landingpage ist sachlich und nachprüfbar
  (§ 6 UWG). Keine fremden Logos verwenden, den Vergleich aktuell halten (Datum steht dabei).
- **Fair Play:** Zugradar liest laufende Partien bewusst nicht mit. So soll es bleiben. Eine Echtzeit-Hilfe
  für laufende Partien wäre Beihilfe zum Betrug, verstößt gegen die Regeln der Plattformen und würde die Marke ruinieren.
- **Datenschutz:** Keine Tracker, keine Cookies. Falls du später Statistiken willst, nimm ein cookieloses Werkzeug
  (z. B. Plausible, selbst gehostet) und ergänze die Datenschutzerklärung.

## 6. Ehrliche technische Grenzen

- **Die Pro-Freischaltung prüft der Browser.** Wer sich auskennt, könnte sie umgehen. Das ist bei reinen Web-Apps
  normal und in der Praxis selten ein Problem: Wer zahlen will, zahlt. Echten Schutz gibt es nur mit einem Server,
  der die Pro-Funktionen ausliefert (möglich als nächste Ausbaustufe).
- **Lizenz-API im Browser:** Ob der Anbieter direkte Browser-Anfragen erlaubt (CORS), musst du mit einem Testkauf
  prüfen. Polar gibt seine Kundenportal-Schnittstelle ausdrücklich für öffentliche Clients frei. Für den Fall, dass es
  trotzdem hakt, liegt der Proxy fertig bereit. Server-Fehler des Anbieters entziehen Pro nicht, sie zählen wie offline.
- **Rechenleistung:** Stockfish läuft auf dem Gerät des Nutzers. Alte Handys rechnen langsamer, die Bewertungen
  sind aber auch bei Tiefe 16 schon sehr stark.
- **Nicht mit echten Konten getestet:** Der Konnektor ist gegen nachgebildete Antworten von chess.com und lichess
  getestet. Teste ihn nach dem Online-Stellen einmal mit deinem eigenen Benutzernamen.

## 7. Nutzer gewinnen

- **Teilen-Bilder** sind eingebaut („Zug teilen“ bei brillanten Zügen, „Review teilen“). Jedes Bild trägt die Adresse.
  Das ist dein Wachstumsmotor auf Instagram, TikTok und in WhatsApp-Gruppen.
- **Communities:** r/chess, r/chessbeginners, Schach-Discords, Facebook-Gruppen. Lies vorher die Regeln zur Eigenwerbung
  und zeig lieber ein spannendes Review als Werbung.
- **Schachvereine:** Ein kurzes Mail an Vereine (Jugendtrainer!) mit einem Vereins-Rabattcode.
- **Streamer und YouTuber:** Affiliate-Provision anbieten; Format-Idee: „Stockfish bewertet eure Partien live nach dem Spiel“.
- **Suchmaschinen:** Artikel wie „Was ist ein brillanter Zug?“ oder „Schachpartie kostenlos analysieren“
  auf der Website ergänzen.
- **Kennzahlen:** Besucher → App geöffnet → Test gestartet → gekauft. Ab rund 2–5 % Käufern unter den Testern bist du auf einem guten Weg.

## 8. Nächste Ausbaustufen

1. Eigene Domain und eigenes Repository
2. Android-App über die Play-Store-Hülle für Web-Apps (Trusted Web Activity), später iOS
3. Konto mit Synchronisation zwischen Geräten (braucht einen kleinen Server)
4. Eröffnungs-Datenbank und Endspiel-Tablebases
5. Weitere Sprachen (Spanisch, Französisch) – die Übersetzungsstruktur ist vorhanden (`tools/en.py` als Vorlage)

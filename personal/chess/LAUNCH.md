# Zugradar starten – Schritt für Schritt

Diese Anleitung bringt Zugradar vom jetzigen Stand zum ersten echten Verkauf. Rechne mit 2–3 Stunden Arbeit.
Dazu kommt Wartezeit, bis der Zahlungsanbieter deinen Shop freigibt. Hintergründe (Preise, Recht, Marketing) stehen in
[VERKAUF.md](VERKAUF.md).

Den Stand prüfst du jederzeit mit:

```bash
cd personal/chess
python3 build.py
python3 tools/launch_check.py
```

Der Check zeigt ✓ (erledigt), ! (bitte ansehen) und ✗ (fehlt noch). Er meldet „startklar“, sobald kein ✗ mehr übrig ist.

---

## Schritt 1 – Gewerbe und Steuer

1. Gewerbe beim Gewerbeamt anmelden (meist online möglich).
2. Mit Steuerberatung klären, ob die Kleinunternehmerregelung (§ 19 UStG) passt. Der Zahlungsanbieter führt die
   Umsatzsteuer der Kunden ab (Merchant of Record). Deine Auszahlungen sind trotzdem Einnahmen, die du versteuerst.

## Schritt 2 – Zahlungsanbieter wählen

Zugradar unterstützt zwei Anbieter. Beide verkaufen in eigenem Namen, stellen Rechnungen aus, kümmern sich um die
Mehrwertsteuer in der EU und erzeugen Lizenzschlüssel, die die App prüft.

| | Lemon Squeezy | Polar |
|---|---|---|
| Lizenzschlüssel | eingebaut | eingebaut (Vorteil „License Keys“) |
| Einstellung in `seller.json` | `"provider": "lemonsqueezy"` | `"provider": "polar"` |
| Was die App braucht | Store-ID, Produkt-ID(s) | Organisations-ID |

**Stand 2026:** Lemon Squeezy gehört zu Stripe und wird schrittweise mit „Stripe Managed Payments“ zusammengeführt.
Bestehende Shops laufen normal weiter. Prüfe vor dem Start, ob Lemon Squeezy noch neue Shops annimmt. Falls nicht,
nimm Polar. Die Gebühren beider Anbieter ändern sich gelegentlich; vergleiche sie auf deren Preisseiten.

## Schritt 3 – Shop und Produkt anlegen

### Variante A: Lemon Squeezy

1. Konto anlegen, einen Store erstellen und die Identitätsprüfung abschließen (sonst bleibt der Shop im Testmodus).
2. Produkt **„Zugradar Pro“** anlegen mit drei Varianten:
   - Monatlich: Abo, 4,99 € pro Monat
   - Jährlich: Abo, 34,99 € pro Jahr
   - Einmalig: Einmalzahlung, 69 €
3. Bei **jeder Variante** Lizenzschlüssel einschalten („Generate license keys“):
   - Aktivierungslimit: **3** (drei Geräte pro Kauf)
   - Gültigkeit: unbegrenzt. Bei Abos endet der Schlüssel mit dem Abo.
4. Nach dem Kauf zurück in die App: Setze in der Bestätigung nach dem Kauf und in der Kauf-E-Mail einen Button oder Link
   auf `https://DEINE-SEITE/zugradar.html#lizenz`. Dieser Link öffnet direkt die Schlüssel-Eingabe.
5. Den **Checkout-Link** des Produkts kopieren (Teilen-Funktion im Produkt).
6. IDs notieren. Die **Store-ID** steht in den Store-Einstellungen, die **Produkt-ID** in der Produktübersicht
   (beides sind Zahlen).

`seller.json`:

```json
"checkoutUrl": "https://DEIN-SHOP.lemonsqueezy.com/checkout/buy/…",
"license": { "provider": "lemonsqueezy", "storeId": 12345, "productIds": [67890], "organizationId": "", "benefitIds": [], "api": "" },
"merchantOfRecord": "Lemon Squeezy (Lemon Squeezy LLC)"
```

### Variante B: Polar

1. Organisation anlegen und die Auszahlung einrichten (Identitätsprüfung).
2. Produkt(e) **„Zugradar Pro“** anlegen: monatlich 4,99 €, jährlich 34,99 €, einmalig 69 €.
3. Einen Vorteil (Benefit) vom Typ **„License Keys“** anlegen und allen drei Produkten zuordnen:
   - Aktivierungslimit: **3**. Ohne Limit funktioniert es auch, dann prüft die App den Schlüssel nur und
     zählt keine Geräte.
   - Präfix z. B. `ZUGRADAR`
4. Einen **Checkout-Link** erstellen. Als Erfolgsseite `https://DEINE-SEITE/zugradar.html#lizenz` eintragen.
5. Die **Organisations-ID** (eine lange ID mit Bindestrichen) aus den Organisations-Einstellungen kopieren.
   Optional die ID des License-Keys-Vorteils notieren.

`seller.json`:

```json
"checkoutUrl": "https://buy.polar.sh/…",
"license": { "provider": "polar", "storeId": null, "productIds": [], "organizationId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", "benefitIds": [], "api": "" },
"merchantOfRecord": "Polar (Polar Software, Inc.)"
```

Den genauen Firmennamen für `merchantOfRecord` findest du in den Bedingungen des Anbieters.

## Schritt 4 – Deine Angaben eintragen

In `seller.json` unter `legal`: Name, Straße, PLZ und Ort, Land, E-Mail. Optional kommen Telefon und USt-IdNr. dazu.
Die E-Mail erscheint im Impressum und in der App-Hilfe als Support-Adresse. Danach:

```bash
python3 build.py
python3 tools/launch_check.py
```

## Schritt 5 – Rechtstexte prüfen lassen

`impressum.html`, `datenschutz.html` und `agb.html` werden aus `pages/` mit deinen Angaben erzeugt. Sie sind eine
sorgfältige Vorlage, ersetzen aber keine Rechtsberatung. Lass sie prüfen, z. B. über ein Abo für Rechtstexte
(IT-Recht-Kanzlei, Händlerbund).

## Schritt 6 – Online stellen

**Wichtig – erst damit funktioniert die Verbindung zu chess.com und lichess:** In Vorschauen (z. B. claude.ai) sperrt
der Browser alle fremden Verbindungen. Zugradar braucht eine eigene Website.

**Schnell und kostenlos (1 Minute):** <https://github.com/demirgernaz99-del/Humanizer/settings/pages> öffnen →
„Source: Deploy from a branch“ → Branch `claude/trusting-pascal-xy0947`, Ordner `/ (root)` → Save. Nach 1–2 Minuten
läuft die App unter <https://demirgernaz99-del.github.io/Humanizer/personal/chess/zugradar.html>.

**Besser für den Verkauf:** eine eigene Domain (z. B. `zugradar.de`). Den Ordner `personal/chess/` über GitHub Pages,
Cloudflare Pages oder Netlify ausliefern. Danach `siteUrl` in `seller.json` anpassen und neu bauen.
Bei der Lizenz-Weiterleitung (Schritt 3) die neue Adresse eintragen.

## Schritt 7 – Testkauf

1. Den Shop in den **Testmodus** schalten und das Produkt mit einer Testkarte kaufen.
2. Den Link `…/zugradar.html#lizenz` aus der Bestätigung öffnen und den Schlüssel aus der E-Mail einfügen.
   Erwartung: „Pro ist aktiv“.
3. Unter „Pro“ → „Lizenz auf diesem Gerät abmelden“ testen und den Schlüssel erneut aktivieren.
4. **Kommt „Lizenzserver nicht erreichbar“,** obwohl Internet da ist, blockiert der Browser die Anfrage (CORS).
   Dann den Proxy aus `server/license-proxy.js` als Cloudflare Worker einrichten (kostenlos, Anleitung in der
   Datei). Seine Adresse kommt in `seller.json` → `license.api`. Neu bauen und in `pages/datenschutz.html` den Proxy
   (Cloudflare) als Empfänger ergänzen.

## Schritt 8 – Live schalten

1. Testmodus im Shop ausschalten. `python3 tools/launch_check.py` muss „startklar“ melden.
2. Einen echten Kauf mit deiner eigenen Karte machen und ihn danach erstatten. So siehst du den ganzen Weg einmal selbst.
3. Committen und pushen. Die Seite aktualisiert sich nach 1–2 Minuten.

## Nach dem Start

- **Support:** Anfragen kommen an die E-Mail aus dem Impressum. Die Hilfe in der App zeigt die Versionsnummer an
  (z. B. `1.0 (d4a25ab)`); frag bei Fehlerberichten danach.
- **Erstattungen:** Sie laufen im Dashboard des Anbieters. Prüfe dort, dass der Lizenzschlüssel danach deaktiviert
  ist. Die App merkt das bei der nächsten Nachprüfung, spätestens nach 7 Tagen.
- **Geräte-Limit:** Meldet ein Kunde „Aktivierungslimit erreicht“, kannst du im Dashboard alte Aktivierungen löschen.
- **Updates:** Dateien in `src/` oder `pages/` ändern → `python3 build.py` → `python3 tools/launch_check.py` →
  committen → pushen. Die App lädt Updates beim nächsten Öffnen. Die Engine (7 MB) bleibt dabei im Speicher des Geräts.

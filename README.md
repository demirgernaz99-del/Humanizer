# ⚡ SignalBot – Krypto-Signal-SaaS

Verkaufsfertiges Grundgerüst für einen abonnierbaren Krypto-Signaldienst:
Binance-Marktscanner, transparente Multi-Indikator-Signale, Weboberfläche mit
Accounts, Free/Pro-Tarif-Gating und Stripe-Abrechnung.

> **Wichtig (Recht):** Das Verkaufen von Handelssignalen kann je nach
> Ausgestaltung erlaubnispflichtig sein (in DE: BaFin / WpIG – Anlageberatung
> bzw. -vermittlung). Dieses Projekt positioniert sich bewusst als
> *Informations-/Bildungsdienst ohne individuelle Empfehlung* und enthält
> entsprechende Disclaimer. **Vor dem Launch anwaltlich prüfen lassen.**
> Impressum/AGB/Datenschutz unter `/legal` sind Platzhalter (TODO-markiert).

## Features

- **Signal-Engine** (`app/signals/`): RSI (Wilder), EMA, MACD, Bollinger-Bänder
  in purem Python. Offener Score von −6 bis +6 mit Klartext-Begründungen —
  ab +3 BUY, ab −3 SELL. Schwellen und Regeln in `app/signals/engine.py`.
- **24/7-Scanner** (`app/scheduler.py`): scannt alle konfigurierten Paare im
  Intervall, speichert Signal*wechsel* in der DB (keine Duplikate).
- **Weboberfläche**: Landing Page, Dashboard mit Live-Candlestick-Chart
  (lightweight-charts), Analyse-Karten pro Paar, Signal-Historie, Pricing.
- **Accounts**: Registrierung/Login (PBKDF2-Hashes, HMAC-signierte
  Session-Cookies — keine Auth-Zusatzabhängigkeiten).
- **Tarif-Gating**: Free = nur `FREE_PAIRS`, Historie um `FREE_DELAY_MIN`
  Minuten verzögert. Pro = alle Paare, Echtzeit.
- **Stripe**: Checkout (Monats-/Jahresabo), Webhook-Sync des Abo-Status,
  Kundenportal zum Kündigen. Ohne Stripe-Keys läuft alles trotzdem —
  im `DEV_MODE` gibt es einen Dev-Upgrade-Button zum Testen des Gatings.

## Quickstart (lokal)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env          # SECRET_KEY setzen!
set -a; source .env; set +a
uvicorn app.main:app --reload
```

→ http://localhost:8000 — registrieren, Dashboard öffnen. Der erste Scan
läuft direkt beim Start (danach alle `SCAN_INTERVAL` Sekunden).

Tests:

```bash
pytest
```

## Docker

```bash
cp .env.example .env   # anpassen
docker compose up --build
```

## Stripe einrichten

1. [Stripe-Konto](https://dashboard.stripe.com) anlegen, Produkt „Pro“ mit
   wiederkehrenden Preisen (monatlich/jährlich) erstellen.
2. `.env` füllen: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_MONTHLY`,
   `STRIPE_PRICE_ID_YEARLY`.
3. Webhook-Endpoint `https://deine-domain/stripe/webhook` im
   Stripe-Dashboard anlegen mit den Events
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted` — Signing-Secret in
   `STRIPE_WEBHOOK_SECRET` eintragen.
4. Lokal testen: `stripe listen --forward-to localhost:8000/stripe/webhook`
   (Stripe CLI) und Testkarte `4242 4242 4242 4242`.
5. Für die Produktion `DEV_MODE=0` setzen (deaktiviert den Dev-Upgrade-Button).

## Konfiguration

Alle Einstellungen über Umgebungsvariablen — siehe [`.env.example`](.env.example).
Wichtige Stellschrauben:

| Variable | Bedeutung |
|---|---|
| `PAIRS` | Gescannte Binance-Paare (Kommaliste) |
| `TIMEFRAME` | Kerzen-Intervall (`15m`, `1h`, `4h`, …) |
| `SCAN_INTERVAL` | Sekunden zwischen Scans |
| `FREE_PAIRS` / `FREE_DELAY_MIN` | Free-Tarif-Beschränkungen |
| `BINANCE_BASE_URL` | z. B. `https://api.binance.us`, falls binance.com regional gesperrt ist |

## Architektur

```
app/
├── main.py            FastAPI-App + Lifespan (startet den Scanner)
├── config.py          Konfiguration aus ENV
├── database.py        SQLAlchemy (SQLite per Default, DATABASE_URL für Postgres)
├── models.py          User, Signal
├── auth.py            PBKDF2 + signierte Session-Cookies
├── billing.py         Stripe Checkout / Portal / Webhooks
├── scheduler.py       Hintergrund-Scanner
├── signals/
│   ├── binance.py     Öffentliche Binance-REST-API (keine Keys nötig)
│   ├── indicators.py  RSI, EMA, SMA, MACD, Bollinger (pure Python)
│   └── engine.py      Score-Logik → BUY/SELL/NEUTRAL + Begründungen
├── routers/           pages (HTML), account (Auth+Billing), api (JSON, Gating)
├── templates/         Jinja2
└── static/            CSS + Dashboard-JS
```

## Roadmap-Ideen (nächste Ausbaustufen)

- Telegram-/E-Mail-Benachrichtigungen bei neuen Signalen (Pro-Feature)
- Backtesting-Modul mit Performance-Report pro Strategie
- Mehr Timeframes pro Nutzer wählbar, eigene Watchlists
- Admin-Panel (Nutzer, MRR, Signal-Statistiken)
- Postgres + Alembic-Migrationen für den Produktivbetrieb

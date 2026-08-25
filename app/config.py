"""Zentrale Konfiguration – alles kommt aus Umgebungsvariablen (.env)."""
import os


def _bool(name: str, default: str = "0") -> bool:
    return os.environ.get(name, default).strip() in ("1", "true", "yes", "on")


def _list(name: str, default: str) -> list[str]:
    return [p.strip().upper() for p in os.environ.get(name, default).split(",") if p.strip()]


APP_NAME = os.environ.get("APP_NAME", "SignalBot")
BASE_URL = os.environ.get("BASE_URL", "http://localhost:8000").rstrip("/")
SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-insecure-secret")
DEV_MODE = _bool("DEV_MODE", "1")

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./signalbot.db")

BINANCE_BASE_URL = os.environ.get("BINANCE_BASE_URL", "https://api.binance.com").rstrip("/")
PAIRS = _list("PAIRS", "BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT")
TIMEFRAME = os.environ.get("TIMEFRAME", "1h")
SCAN_INTERVAL = int(os.environ.get("SCAN_INTERVAL", "300"))
DISABLE_SCHEDULER = _bool("DISABLE_SCHEDULER", "0")

FREE_PAIRS = _list("FREE_PAIRS", "BTCUSDT,ETHUSDT")
FREE_DELAY_MIN = int(os.environ.get("FREE_DELAY_MIN", "60"))

STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRICE_ID_MONTHLY = os.environ.get("STRIPE_PRICE_ID_MONTHLY", "")
STRIPE_PRICE_ID_YEARLY = os.environ.get("STRIPE_PRICE_ID_YEARLY", "")
PRICE_MONTHLY_DISPLAY = os.environ.get("PRICE_MONTHLY_DISPLAY", "19,99 €")
PRICE_YEARLY_DISPLAY = os.environ.get("PRICE_YEARLY_DISPLAY", "199 €")

STRIPE_ENABLED = bool(STRIPE_SECRET_KEY and STRIPE_PRICE_ID_MONTHLY)

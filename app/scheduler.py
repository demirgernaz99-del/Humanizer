"""Hintergrund-Scanner: prüft alle konfigurierten Paare in festem Intervall.

- Das jeweils letzte Analyse-Ergebnis pro Paar liegt in `latest_analysis`
  (für das Dashboard).
- Nur *Wechsel* auf BUY/SELL werden als Signal in der DB gespeichert –
  so entsteht eine saubere Historie ohne Spam bei jedem Scan.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

from app import config
from app.database import SessionLocal
from app.models import Signal
from app.signals import binance, engine

log = logging.getLogger("signalbot.scheduler")

# pair -> letztes Analyse-Ergebnis (dict aus engine.analyze + Metadaten)
latest_analysis: dict[str, dict] = {}
# pair -> letzte gespeicherte Action, um Duplikate zu vermeiden
_last_action: dict[str, str] = {}


async def scan_pair(pair: str) -> None:
    candles = await binance.fetch_klines(pair, config.TIMEFRAME, limit=300)
    closes = [c.close for c in candles]
    result = engine.analyze(closes)
    result["pair"] = pair
    result["timeframe"] = config.TIMEFRAME
    result["updated_at"] = datetime.now(timezone.utc).isoformat()
    latest_analysis[pair] = result

    action = result["action"]
    if action in ("BUY", "SELL") and _last_action.get(pair) != action:
        _last_action[pair] = action
        db = SessionLocal()
        try:
            db.add(
                Signal(
                    pair=pair,
                    timeframe=config.TIMEFRAME,
                    action=action,
                    score=result["score"],
                    confidence=result["confidence"],
                    price=result["price"],
                    details=json.dumps(
                        {"indicators": result["indicators"], "reasons": result["reasons"]},
                        ensure_ascii=False,
                    ),
                )
            )
            db.commit()
            log.info("Signal gespeichert: %s %s (Score %s)", action, pair, result["score"])
        finally:
            db.close()
    elif action == "NEUTRAL":
        # Neutral setzt den Zustand zurück, damit das nächste BUY/SELL wieder zählt
        _last_action.pop(pair, None)


async def scan_all() -> None:
    for pair in config.PAIRS:
        try:
            await scan_pair(pair)
        except Exception:
            log.exception("Scan fehlgeschlagen für %s", pair)


async def run_forever() -> None:
    log.info(
        "Scanner gestartet: %s auf %s, alle %ss",
        ",".join(config.PAIRS), config.TIMEFRAME, config.SCAN_INTERVAL,
    )
    while True:
        await scan_all()
        await asyncio.sleep(config.SCAN_INTERVAL)

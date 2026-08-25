"""JSON-API fürs Dashboard – hier passiert das Tarif-Gating.

Free-Nutzer:  nur FREE_PAIRS, Signale um FREE_DELAY_MIN Minuten verzögert.
Pro-Nutzer:   alle Paare, Signale in Echtzeit.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import config, scheduler
from app.auth import get_current_user
from app.database import get_db
from app.models import Signal, User
from app.signals import binance

router = APIRouter(prefix="/api")


def _allowed_pairs(user: User) -> list[str]:
    return config.PAIRS if user.is_pro else [p for p in config.PAIRS if p in config.FREE_PAIRS]


@router.get("/analysis")
def analysis(user: User = Depends(get_current_user)):
    """Letzte Analyse pro Paar (für die Dashboard-Karten)."""
    allowed = _allowed_pairs(user)
    data = [scheduler.latest_analysis[p] for p in allowed if p in scheduler.latest_analysis]
    locked = [p for p in config.PAIRS if p not in allowed]
    return {"plan": user.plan, "pairs": data, "locked_pairs": locked}


@router.get("/signals")
def signals(
    user: User = Depends(get_current_user),
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
):
    """Signal-Historie, für Free-Nutzer zeitverzögert."""
    allowed = _allowed_pairs(user)
    query = db.query(Signal).filter(Signal.pair.in_(allowed))
    if not user.is_pro:
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=config.FREE_DELAY_MIN)
        query = query.filter(Signal.created_at <= cutoff)
    rows = query.order_by(Signal.created_at.desc()).limit(limit).all()
    return {
        "plan": user.plan,
        "delay_min": 0 if user.is_pro else config.FREE_DELAY_MIN,
        "signals": [
            {
                "pair": s.pair,
                "timeframe": s.timeframe,
                "action": s.action,
                "score": s.score,
                "confidence": s.confidence,
                "price": s.price,
                "details": json.loads(s.details),
                "created_at": s.created_at.isoformat(),
            }
            for s in rows
        ],
    }


@router.get("/klines")
async def klines(
    pair: str,
    interval: str = "1h",
    limit: int = Query(200, le=500),
    user: User = Depends(get_current_user),
):
    """Kerzendaten-Proxy für den Chart (umgeht CORS im Browser)."""
    pair = pair.upper()
    if pair not in _allowed_pairs(user):
        raise HTTPException(status_code=403, detail="Dieses Paar ist im Pro-Tarif enthalten.")
    raw = await binance.fetch_klines_raw(pair, interval, limit)
    return {
        "pair": pair,
        "candles": [
            {
                "time": row[0] // 1000,
                "open": float(row[1]),
                "high": float(row[2]),
                "low": float(row[3]),
                "close": float(row[4]),
            }
            for row in raw
        ],
    }

"""Signal-Engine: kombiniert mehrere Indikatoren zu einem Score.

Score-Regeln (bewusst simpel und transparent – Verkaufsargument ist
Nachvollziehbarkeit, keine Blackbox):

  RSI            < 30 → +2   | < 40 → +1   | > 70 → -2   | > 60 → -1
  MACD-Histogramm  Kreuz nach oben → +2 | Kreuz nach unten → -2
                   sonst: positiv → +1 | negativ → -1
  Trendfilter    Kurs über EMA50 → +1 | darunter → -1
  Bollinger      Schluss unter unterem Band → +1 | über oberem Band → -1

  Gesamtscore ≥ +3 → BUY, ≤ -3 → SELL, sonst NEUTRAL.
  Confidence = |Score| / 6 (gedeckelt bei 1.0).
"""
from __future__ import annotations

from app.signals import indicators

MAX_SCORE = 6
BUY_THRESHOLD = 3
SELL_THRESHOLD = -3

# Mindestanzahl Kerzen, damit alle Indikatoren stabil berechnet werden können
MIN_CANDLES = 60


def analyze(closes: list[float]) -> dict:
    """Bewertet eine Schlusskursreihe (älteste zuerst) und liefert das Ergebnis."""
    if len(closes) < MIN_CANDLES:
        raise ValueError(f"Mindestens {MIN_CANDLES} Kerzen nötig, bekommen: {len(closes)}")

    price = closes[-1]
    reasons: list[str] = []
    score = 0

    # --- RSI ---
    rsi_series = indicators.rsi(closes, 14)
    rsi_now = rsi_series[-1]
    if rsi_now < 30:
        score += 2
        reasons.append(f"RSI stark überverkauft ({rsi_now:.1f})")
    elif rsi_now < 40:
        score += 1
        reasons.append(f"RSI überverkauft ({rsi_now:.1f})")
    elif rsi_now > 70:
        score -= 2
        reasons.append(f"RSI stark überkauft ({rsi_now:.1f})")
    elif rsi_now > 60:
        score -= 1
        reasons.append(f"RSI überkauft ({rsi_now:.1f})")

    # --- MACD ---
    _, _, hist = indicators.macd(closes)
    # Float-Rauschen (z.B. bei nahezu linearen Reihen) nicht als Momentum werten
    eps = abs(price) * 1e-9
    hist_now = hist[-1] if abs(hist[-1]) > eps else 0.0
    hist_prev = hist[-2] if abs(hist[-2]) > eps else 0.0
    if hist_prev <= 0 < hist_now:
        score += 2
        reasons.append("MACD-Histogramm kreuzt nach oben")
    elif hist_prev >= 0 > hist_now:
        score -= 2
        reasons.append("MACD-Histogramm kreuzt nach unten")
    elif hist_now > 0:
        score += 1
        reasons.append("MACD-Momentum positiv")
    else:
        score -= 1
        reasons.append("MACD-Momentum negativ")

    # --- Trendfilter EMA50 ---
    ema50 = indicators.ema(closes, 50)[-1]
    if price > ema50:
        score += 1
        reasons.append("Kurs über EMA50 (Aufwärtstrend)")
    else:
        score -= 1
        reasons.append("Kurs unter EMA50 (Abwärtstrend)")

    # --- Bollinger-Bänder ---
    lower, mid, upper = indicators.bollinger(closes, 20)[-1]
    if price < lower:
        score += 1
        reasons.append("Kurs unter unterem Bollinger-Band")
    elif price > upper:
        score -= 1
        reasons.append("Kurs über oberem Bollinger-Band")

    if score >= BUY_THRESHOLD:
        action = "BUY"
    elif score <= SELL_THRESHOLD:
        action = "SELL"
    else:
        action = "NEUTRAL"

    return {
        "action": action,
        "score": score,
        "confidence": round(min(abs(score) / MAX_SCORE, 1.0), 2),
        "price": price,
        "indicators": {
            "rsi": round(rsi_now, 2),
            "macd_hist": round(hist_now, 6),
            "ema50": round(ema50, 6),
            "bb_lower": round(lower, 6),
            "bb_mid": round(mid, 6),
            "bb_upper": round(upper, 6),
        },
        "reasons": reasons,
    }

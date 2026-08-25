import pytest

from app.signals import engine


def _flat(n=80, level=100.0):
    return [level] * n


def test_requires_min_candles():
    with pytest.raises(ValueError):
        engine.analyze([100.0] * 10)


def test_result_shape():
    # leichte Wellenbewegung, damit die Indikatoren nicht degenerieren
    closes = [100 + (i % 7) * 0.5 for i in range(100)]
    result = engine.analyze(closes)
    assert result["action"] in ("BUY", "SELL", "NEUTRAL")
    assert -6 <= result["score"] <= 6
    assert 0.0 <= result["confidence"] <= 1.0
    assert set(result["indicators"]) == {"rsi", "macd_hist", "ema50", "bb_lower", "bb_mid", "bb_upper"}
    assert result["reasons"]


def test_strong_downtrend_is_not_buy():
    # stetiger Abverkauf: RSI-Mean-Reversion (+) wird von Trend/Momentum (−)
    # neutralisiert – ein "falling knife" darf nie ein BUY sein
    closes = [float(200 - i) for i in range(100)]
    result = engine.analyze(closes)
    assert result["action"] != "BUY"
    assert result["score"] <= 0


def test_strong_uptrend_is_not_sell():
    closes = [float(100 + i) for i in range(100)]
    result = engine.analyze(closes)
    assert result["action"] != "SELL"


def test_oversold_bounce_gives_buy():
    # langer Abverkauf drückt den RSI in den Keller, dann erste Erholung:
    # RSI bleibt tief (+), MACD-Histogramm kreuzt nach oben (+2) → BUY-Zone
    closes = [float(300 - 2 * i) for i in range(90)] + [126.0]
    result = engine.analyze(closes)
    assert result["indicators"]["rsi"] < 40
    assert result["action"] == "BUY"


def test_confidence_matches_score():
    closes = [100 + (i % 7) * 0.5 for i in range(100)]
    result = engine.analyze(closes)
    assert result["confidence"] == round(min(abs(result["score"]) / 6, 1.0), 2)

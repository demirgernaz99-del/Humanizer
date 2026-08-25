import math

from app.signals import indicators


def test_sma_basic():
    assert indicators.sma([1, 2, 3, 4, 5], 3) == [2.0, 3.0, 4.0]


def test_sma_too_short():
    assert indicators.sma([1, 2], 5) == []


def test_ema_constant_series():
    # EMA einer konstanten Reihe ist die Konstante selbst
    out = indicators.ema([10.0] * 30, 10)
    assert all(math.isclose(v, 10.0) for v in out)


def test_ema_alignment():
    values = list(range(1, 21))
    out = indicators.ema(values, 5)
    # Ausgabe rechtsbündig: len = len(values) - period + 1
    assert len(out) == 16
    # EMA folgt einem steigenden Trend, bleibt aber unter dem letzten Wert
    assert out[-1] < values[-1]
    assert out[-1] > out[0]


def test_rsi_all_gains_is_100():
    values = [float(i) for i in range(1, 30)]
    out = indicators.rsi(values, 14)
    assert all(math.isclose(v, 100.0) for v in out)


def test_rsi_all_losses_is_0():
    values = [float(i) for i in range(30, 1, -1)]
    out = indicators.rsi(values, 14)
    assert all(v < 1e-9 for v in out)


def test_rsi_range():
    # Zickzack-Reihe: RSI muss immer in [0, 100] liegen
    values = [100 + (5 if i % 2 else -3) * (i % 7) for i in range(60)]
    out = indicators.rsi([float(v) for v in values], 14)
    assert out
    assert all(0.0 <= v <= 100.0 for v in out)


def test_macd_shapes_and_alignment():
    values = [float(100 + i + (i % 5)) for i in range(120)]
    macd_line, signal_line, hist = indicators.macd(values)
    assert len(macd_line) == len(values) - 26 + 1
    assert len(signal_line) == len(macd_line) - 9 + 1
    assert len(hist) == len(signal_line)
    # Histogramm = MACD - Signal (rechtsbündig)
    assert math.isclose(hist[-1], macd_line[-1] - signal_line[-1])


def test_bollinger_constant_series():
    out = indicators.bollinger([50.0] * 25, 20)
    lower, mid, upper = out[-1]
    assert math.isclose(lower, 50.0)
    assert math.isclose(mid, 50.0)
    assert math.isclose(upper, 50.0)


def test_bollinger_band_order():
    values = [float(100 + (i % 10)) for i in range(40)]
    for lower, mid, upper in indicators.bollinger(values, 20):
        assert lower <= mid <= upper

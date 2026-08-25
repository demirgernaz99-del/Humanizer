"""Technische Indikatoren in purem Python (keine numpy/pandas-Abhängigkeit).

Alle Funktionen erwarten eine Liste von Schlusskursen (älteste zuerst).
Rückgabelisten sind rechtsbündig ausgerichtet: das letzte Element gehört
immer zur letzten Kerze der Eingabe.
"""
from __future__ import annotations


def sma(values: list[float], period: int) -> list[float]:
    if len(values) < period:
        return []
    out = []
    window_sum = sum(values[:period])
    out.append(window_sum / period)
    for i in range(period, len(values)):
        window_sum += values[i] - values[i - period]
        out.append(window_sum / period)
    return out


def ema(values: list[float], period: int) -> list[float]:
    if len(values) < period:
        return []
    k = 2.0 / (period + 1)
    out = [sum(values[:period]) / period]  # Start: SMA der ersten `period` Werte
    for v in values[period:]:
        out.append(v * k + out[-1] * (1 - k))
    return out


def rsi(values: list[float], period: int = 14) -> list[float]:
    """Relative Strength Index nach Wilder (geglättete Mittelwerte)."""
    if len(values) <= period:
        return []
    gains, losses = [], []
    for prev, cur in zip(values, values[1:]):
        change = cur - prev
        gains.append(max(change, 0.0))
        losses.append(max(-change, 0.0))

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    def _rsi(g: float, l: float) -> float:
        if l == 0:
            return 100.0
        rs = g / l
        return 100.0 - 100.0 / (1.0 + rs)

    out = [_rsi(avg_gain, avg_loss)]
    for g, l in zip(gains[period:], losses[period:]):
        avg_gain = (avg_gain * (period - 1) + g) / period
        avg_loss = (avg_loss * (period - 1) + l) / period
        out.append(_rsi(avg_gain, avg_loss))
    return out


def macd(
    values: list[float], fast: int = 12, slow: int = 26, signal: int = 9
) -> tuple[list[float], list[float], list[float]]:
    """MACD-Linie, Signallinie und Histogramm (jeweils rechtsbündig)."""
    ema_fast = ema(values, fast)
    ema_slow = ema(values, slow)
    if not ema_slow:
        return [], [], []
    offset = slow - fast
    macd_line = [f - s for f, s in zip(ema_fast[offset:], ema_slow)]
    signal_line = ema(macd_line, signal)
    if not signal_line:
        return macd_line, [], []
    hist = [m - s for m, s in zip(macd_line[signal - 1:], signal_line)]
    return macd_line, signal_line, hist


def bollinger(
    values: list[float], period: int = 20, num_std: float = 2.0
) -> list[tuple[float, float, float]]:
    """Liste von (unteres Band, Mittellinie, oberes Band)."""
    if len(values) < period:
        return []
    out = []
    for i in range(period - 1, len(values)):
        window = values[i - period + 1 : i + 1]
        mean = sum(window) / period
        var = sum((v - mean) ** 2 for v in window) / period
        std = var ** 0.5
        out.append((mean - num_std * std, mean, mean + num_std * std))
    return out

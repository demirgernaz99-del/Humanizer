"""Schlanker Client für die öffentliche Binance-REST-API (keine Auth nötig)."""
from __future__ import annotations

import httpx

from app import config


class Candle:
    __slots__ = ("open_time", "open", "high", "low", "close", "volume")

    def __init__(self, raw: list):
        self.open_time = int(raw[0])
        self.open = float(raw[1])
        self.high = float(raw[2])
        self.low = float(raw[3])
        self.close = float(raw[4])
        self.volume = float(raw[5])


async def fetch_klines(pair: str, interval: str, limit: int = 300) -> list[Candle]:
    url = f"{config.BINANCE_BASE_URL}/api/v3/klines"
    params = {"symbol": pair.upper(), "interval": interval, "limit": limit}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        return [Candle(row) for row in resp.json()]


async def fetch_klines_raw(pair: str, interval: str, limit: int = 300) -> list[list]:
    """Rohdaten für den Chart im Frontend (Proxy vermeidet CORS-Probleme)."""
    url = f"{config.BINANCE_BASE_URL}/api/v3/klines"
    params = {"symbol": pair.upper(), "interval": interval, "limit": limit}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()

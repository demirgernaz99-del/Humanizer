"""SignalBot – Krypto-Signal-SaaS.

Start (Entwicklung):  uvicorn app.main:app --reload
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app import config, scheduler
from app.database import init_db
from app.routers import account, api, pages

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    task = None
    if not config.DISABLE_SCHEDULER:
        task = asyncio.create_task(scheduler.run_forever())
    yield
    if task:
        task.cancel()


app = FastAPI(title=config.APP_NAME, lifespan=lifespan)
app.mount("/static", StaticFiles(directory="app/static"), name="static")
app.include_router(pages.router)
app.include_router(account.router)
app.include_router(api.router)

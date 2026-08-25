"""HTML-Seiten (Jinja2)."""
from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app import config
from app.auth import get_current_user_optional
from app.models import User

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")
templates.env.globals.update(
    APP_NAME=config.APP_NAME,
    PRICE_MONTHLY=config.PRICE_MONTHLY_DISPLAY,
    PRICE_YEARLY=config.PRICE_YEARLY_DISPLAY,
    STRIPE_ENABLED=config.STRIPE_ENABLED,
    DEV_MODE=config.DEV_MODE,
    FREE_PAIRS=config.FREE_PAIRS,
    FREE_DELAY_MIN=config.FREE_DELAY_MIN,
)


@router.get("/", response_class=HTMLResponse)
def landing(request: Request, user: User | None = Depends(get_current_user_optional)):
    return templates.TemplateResponse(request, "landing.html", {"user": user})


@router.get("/pricing", response_class=HTMLResponse)
def pricing(request: Request, user: User | None = Depends(get_current_user_optional)):
    return templates.TemplateResponse(request, "pricing.html", {"user": user})


@router.get("/dashboard", response_class=HTMLResponse)
def dashboard(request: Request, user: User | None = Depends(get_current_user_optional)):
    if user is None:
        return RedirectResponse("/login", status_code=302)
    return templates.TemplateResponse(request, "dashboard.html", {"user": user})


@router.get("/legal", response_class=HTMLResponse)
def legal(request: Request, user: User | None = Depends(get_current_user_optional)):
    return templates.TemplateResponse(request, "legal.html", {"user": user})

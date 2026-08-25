"""Registrierung, Login, Account-Seite und Billing-Endpunkte."""
from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from sqlalchemy.orm import Session

from app import billing, config
from app.auth import (
    SESSION_COOKIE,
    SESSION_MAX_AGE,
    create_session_token,
    get_current_user,
    get_current_user_optional,
    hash_password,
    verify_password,
)
from app.database import get_db
from app.models import User
from app.routers.pages import templates

router = APIRouter()


def _set_session(response: RedirectResponse, user: User) -> RedirectResponse:
    response.set_cookie(
        SESSION_COOKIE,
        create_session_token(user.id),
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=config.BASE_URL.startswith("https"),
    )
    return response


@router.get("/register", response_class=HTMLResponse)
def register_page(request: Request, user: User | None = Depends(get_current_user_optional)):
    if user:
        return RedirectResponse("/dashboard", status_code=302)
    return templates.TemplateResponse(request, "register.html", {"user": None, "error": None})


@router.post("/register")
def register(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
):
    email = email.strip().lower()
    error = None
    if "@" not in email or len(email) > 255:
        error = "Bitte eine gültige E-Mail-Adresse angeben."
    elif len(password) < 8:
        error = "Das Passwort muss mindestens 8 Zeichen haben."
    elif db.query(User).filter(User.email == email).first():
        error = "Diese E-Mail ist bereits registriert."
    if error:
        return templates.TemplateResponse(
            request, "register.html", {"user": None, "error": error}, status_code=400
        )
    user = User(email=email, password_hash=hash_password(password))
    db.add(user)
    db.commit()
    return _set_session(RedirectResponse("/dashboard", status_code=302), user)


@router.get("/login", response_class=HTMLResponse)
def login_page(request: Request, user: User | None = Depends(get_current_user_optional)):
    if user:
        return RedirectResponse("/dashboard", status_code=302)
    return templates.TemplateResponse(request, "login.html", {"user": None, "error": None})


@router.post("/login")
def login(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == email.strip().lower()).first()
    if not user or not verify_password(password, user.password_hash):
        return templates.TemplateResponse(
            request,
            "login.html",
            {"user": None, "error": "E-Mail oder Passwort falsch."},
            status_code=401,
        )
    return _set_session(RedirectResponse("/dashboard", status_code=302), user)


@router.post("/logout")
def logout():
    response = RedirectResponse("/", status_code=302)
    response.delete_cookie(SESSION_COOKIE)
    return response


@router.get("/account", response_class=HTMLResponse)
def account_page(request: Request, user: User = Depends(get_current_user)):
    return templates.TemplateResponse(request, "account.html", {"user": user})


# --- Billing ---

@router.post("/billing/checkout")
def checkout(interval: str = Form("monthly"), user: User = Depends(get_current_user)):
    url = billing.create_checkout_url(user, interval)
    return RedirectResponse(url, status_code=303)


@router.get("/billing/portal")
def portal(user: User = Depends(get_current_user)):
    url = billing.create_portal_url(user)
    return RedirectResponse(url, status_code=302)


@router.post("/billing/dev-upgrade")
def dev_upgrade(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Nur im DEV_MODE: Pro-Plan ohne Zahlung umschalten (zum Testen des Gatings)."""
    if not config.DEV_MODE:
        return JSONResponse({"error": "Nur im DEV_MODE verfügbar"}, status_code=403)
    user.plan = "free" if user.is_pro else "pro"
    db.merge(user)
    db.commit()
    return RedirectResponse("/account", status_code=302)


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    return await billing.handle_webhook(request, db)

"""Stripe-Anbindung: Checkout (Abo), Kundenportal und Webhook-Verarbeitung.

Ohne konfigurierte Stripe-Keys läuft die App trotzdem – im DEV_MODE gibt es
einen "Dev-Upgrade"-Button, damit sich das Pro-Gating lokal testen lässt.
"""
from __future__ import annotations

import logging

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app import config
from app.models import User

log = logging.getLogger("signalbot.billing")

if config.STRIPE_ENABLED:
    import stripe

    stripe.api_key = config.STRIPE_SECRET_KEY


def _require_stripe() -> None:
    if not config.STRIPE_ENABLED:
        raise HTTPException(status_code=503, detail="Stripe ist nicht konfiguriert (STRIPE_SECRET_KEY / STRIPE_PRICE_ID_MONTHLY setzen).")


def create_checkout_url(user: User, interval: str) -> str:
    """Erzeugt eine Stripe-Checkout-Session für ein Abo und liefert die URL."""
    _require_stripe()
    price_id = config.STRIPE_PRICE_ID_YEARLY if interval == "yearly" else config.STRIPE_PRICE_ID_MONTHLY
    if not price_id:
        raise HTTPException(status_code=400, detail="Für dieses Intervall ist keine Stripe-Price-ID konfiguriert.")
    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        customer=user.stripe_customer_id or None,
        customer_email=None if user.stripe_customer_id else user.email,
        client_reference_id=str(user.id),
        success_url=f"{config.BASE_URL}/dashboard?checkout=success",
        cancel_url=f"{config.BASE_URL}/pricing?checkout=cancelled",
    )
    return session.url


def create_portal_url(user: User) -> str:
    """Stripe-Kundenportal: Zahlungsmethode ändern, kündigen usw."""
    _require_stripe()
    if not user.stripe_customer_id:
        raise HTTPException(status_code=400, detail="Kein Stripe-Kunde vorhanden.")
    session = stripe.billing_portal.Session.create(
        customer=user.stripe_customer_id,
        return_url=f"{config.BASE_URL}/account",
    )
    return session.url


async def handle_webhook(request: Request, db: Session) -> dict:
    """Verarbeitet Stripe-Webhooks und hält den Abo-Status der Nutzer aktuell."""
    _require_stripe()
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, config.STRIPE_WEBHOOK_SECRET)
    except Exception:
        raise HTTPException(status_code=400, detail="Ungültige Webhook-Signatur")

    obj = event["data"]["object"]
    etype = event["type"]

    if etype == "checkout.session.completed":
        user_id = obj.get("client_reference_id")
        user = db.get(User, int(user_id)) if user_id else None
        if user:
            user.stripe_customer_id = obj.get("customer")
            user.stripe_subscription_id = obj.get("subscription")
            user.subscription_status = "active"
            user.plan = "pro"
            db.commit()
            log.info("Abo aktiviert für User %s", user.id)

    elif etype in ("customer.subscription.updated", "customer.subscription.deleted"):
        customer_id = obj.get("customer")
        user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
        if user:
            status = obj.get("status")
            user.subscription_status = status
            user.plan = "pro" if status in ("active", "trialing", "past_due") else "free"
            if etype == "customer.subscription.deleted":
                user.plan = "free"
                user.stripe_subscription_id = None
            db.commit()
            log.info("Abo-Status für User %s: %s -> Plan %s", user.id, status, user.plan)

    return {"received": True}

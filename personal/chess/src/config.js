/* SK.config – alles, was du zum Verkaufen anpassen musst, an einer Stelle.
   Nach Änderungen: python3 build.py */
(function () {
  var root = (typeof window !== 'undefined') ? window : globalThis;
  root.SK = root.SK || {};

  var cfg = root.SK.config = {
    brand: 'Zugradar',
    version: '2.0.0',
    siteUrl: 'https://demirgernaz99-del.github.io/Humanizer/personal/chess/',

    // Shop: Link zum Checkout deines Merchant of Record (z. B. Lemon Squeezy, Paddle).
    // Leer lassen, solange kein Shop existiert – der Kaufen-Knopf erklärt das dann.
    checkoutUrl: '',

    // Lizenzprüfung über die öffentliche Lizenz-API von Lemon Squeezy (kein API-Schlüssel nötig).
    // Falls der Browser die API wegen CORS nicht erreicht: server/license-proxy.js als
    // Cloudflare Worker deployen und dessen URL hier eintragen.
    license: {
      provider: 'lemonsqueezy',
      api: 'https://api.lemonsqueezy.com/v1/licenses',
      storeId: null,        // z. B. 12345 – Schlüssel anderer Shops werden dann abgelehnt
      productIds: [],       // leer = jedes Produkt deines Shops
      revalidateDays: 7,    // so oft wird online nachgeprüft
      offlineGraceDays: 14  // so lange gilt Pro ohne Verbindung weiter
    },

    trialDays: 7,
    prices: { monthly: '4,99 €', yearly: '34,99 €', lifetime: '69 €' },

    // Was die kostenlose Version darf. Alles für EINE Partie bleibt kostenlos
    // (Analyse, Bewertung inkl. Brillant, Coach, Review, Training der aktuellen Partie).
    free: {
      reviewDepthMax: 16,   // höhere Review-Tiefen sind Pro
      insightsGames: 5,     // Insights über so viele Partien
      trainerPerDay: 5,     // Aufgaben pro Tag im Taktik-Trainer
      autoImport: false,    // Auto-Import neuer Partien
      shareWatermark: true, // Teilen-Karten mit Wasserzeichen
      themes: ['club', 'walnut']
    },
    pro: {
      reviewDepthMax: 22,
      insightsGames: 100,
      trainerPerDay: Infinity,
      autoImport: true,
      shareWatermark: false,
      themes: ['club', 'walnut', 'slate', 'marble', 'night']
    },

    support: { email: '' },
    // Für Impressum/Datenschutz (Pflicht in DE). Bitte ausfüllen und rechtlich prüfen lassen.
    legal: { name: '', street: '', city: '', email: '', vatId: '' }
  };

  // Geschäftsdaten aus seller.json (der Build fügt sie als SK.seller ein) haben Vorrang
  var s = root.SK.seller;
  if (s) {
    ['brand', 'siteUrl', 'checkoutUrl', 'legal'].forEach(function (k) { if (s[k] != null) cfg[k] = s[k]; });
    var lang = root.SK.i18n && root.SK.i18n.lang ? root.SK.i18n.lang() : 'de';
    if (s.prices) cfg.prices = (lang === 'en' && s.pricesEn) ? s.pricesEn : s.prices;
    if (s.license) { cfg.license.storeId = s.license.storeId; cfg.license.productIds = s.license.productIds || []; }
    if (s.legal && s.legal.email) cfg.support.email = s.legal.email;
  }
})();
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SK.config;

/* SK.license – Free / Test / Pro. Pro wird über einen Lizenzschlüssel freigeschaltet
   (Lemon Squeezy oder Polar: activate / validate / deactivate). Alles clientseitig:
   Der Schlüssel und der Status liegen nur im Browser des Käufers. */
(function () {
  var root = (typeof window !== 'undefined') ? window : globalThis;
  root.SK = root.SK || {};

  var KEY = 'zugradar.license.v1', TRIAL = 'zugradar.trial.v1', DAY = 86400000;
  var mem = {}; // Fallback, wenn localStorage blockiert ist
  function load(k) {
    try { var v = root.localStorage && root.localStorage.getItem(k); if (v != null) return JSON.parse(v); } catch (e) { /* egal */ }
    return mem[k] || null;
  }
  function store(k, v) {
    mem[k] = v;
    try { if (root.localStorage) { if (v == null) root.localStorage.removeItem(k); else root.localStorage.setItem(k, JSON.stringify(v)); } } catch (e) { /* egal */ }
  }
  function cfg() { return root.SK.config || {}; }
  function now() { return (root.SK.license && root.SK.license._now) ? root.SK.license._now() : Date.now(); }
  function mask(k) { return k ? k.slice(0, 4) + '…' + k.slice(-4) : ''; }

  var listeners = [];
  function emit() { var s = state(); listeners.forEach(function (f) { try { f(s); } catch (e) { /* egal */ } }); }

  /* Zustand: { plan: 'free'|'trial'|'pro', until, key, email, product, trialUsed, checkedAt, offline } */
  function state() {
    var lic = load(KEY), tr = load(TRIAL), t = now();
    if (lic && lic.key) {
      var grace = (cfg().license || {}).offlineGraceDays || 14;
      var expired = lic.expiresAt && t > lic.expiresAt;
      var stale = lic.checkedAt && t > lic.checkedAt + grace * DAY;
      if (!expired && !stale && lic.status === 'active') {
        return { plan: 'pro', until: lic.expiresAt || null, key: mask(lic.key), email: lic.email || '', product: lic.product || '',
                 trialUsed: !!tr, checkedAt: lic.checkedAt, offline: !!lic.offline };
      }
    }
    if (tr && tr.until > t) return { plan: 'trial', until: tr.until, trialUsed: true };
    return { plan: 'free', trialUsed: !!tr, key: lic && lic.key ? mask(lic.key) : '', problem: lic && lic.problem || '' };
  }
  function isPro() { return state().plan !== 'free'; }
  function limits() { return isPro() ? (cfg().pro || {}) : (cfg().free || {}); }

  function startTrial() {
    if (load(TRIAL)) return false;
    store(TRIAL, { started: now(), until: now() + (cfg().trialDays || 7) * DAY });
    emit();
    return true;
  }

  function err(code, msg) { var e = new Error(msg); e.code = code; return e; }
  function lc() { return cfg().license || {}; }

  /* ---------- Anbieter ----------
     Jeder Anbieter liefert einheitliche Ergebnisse:
     activate → { ok, instanceId, status, expiresAt, email, product, meta, error, noActivation }
     validate → { ok, status, expiresAt, email, product, meta, error, down }
     down = Server-Fehler (5xx) → wie offline behandeln, Pro nicht entziehen. */

  function post(url, body, json, fetchImpl) {
    var f = fetchImpl || (root.fetch && root.fetch.bind(root));
    return f(url, {
      method: 'POST',
      headers: json ? { Accept: 'application/json', 'Content-Type': 'application/json' }
                    : { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: json ? JSON.stringify(body) : Object.keys(body).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(body[k]); }).join('&')
    }).then(function (res) {
      return res.json().then(function (j) { return { status: res.status, json: j || {} }; }, function () { return { status: res.status, json: {} }; });
    });
  }
  function ms(iso) { return iso ? Date.parse(iso) : null; }

  var PROVIDERS = {
    // Lemon Squeezy: öffentliche Lizenz-API, formularkodiert
    lemonsqueezy: {
      api: 'https://api.lemonsqueezy.com/v1/licenses',
      activate: function (api, key, label, f) {
        return post(api + '/activate', { license_key: key, instance_name: label }, false, f).then(function (r) {
          var j = r.json;
          if (r.status >= 500) return { ok: false, down: true, error: '' };
          if (!j.activated) return { ok: false, error: j.error || '' };
          var lk = j.license_key || {};
          return { ok: true, instanceId: j.instance && j.instance.id, status: lk.status === 'active' || !lk.status ? 'active' : lk.status,
                   expiresAt: ms(lk.expires_at), email: j.meta && j.meta.customer_email || '', product: j.meta && j.meta.product_name || '', meta: j.meta };
        });
      },
      validate: function (api, lic, f) {
        return post(api + '/validate', { license_key: lic.key, instance_id: lic.instanceId || '' }, false, f).then(function (r) {
          var j = r.json, lk = j.license_key || {};
          if (r.status >= 500) return { ok: false, down: true };
          var active = j.valid && (!lk.status || lk.status === 'active');
          return { ok: !!active, status: active ? 'active' : (lk.status || 'invalid'), expiresAt: ms(lk.expires_at),
                   email: j.meta && j.meta.customer_email, product: j.meta && j.meta.product_name, meta: j.meta, error: j.error || '' };
        });
      },
      deactivate: function (api, lic, f) {
        return post(api + '/deactivate', { license_key: lic.key, instance_id: lic.instanceId }, false, f);
      },
      // Passt der Schlüssel zu diesem Shop/Produkt?
      foreign: function (meta) {
        var c = lc();
        if (c.storeId && meta && +meta.store_id !== +c.storeId) return 'store';
        if (c.productIds && c.productIds.length && meta && c.productIds.indexOf(+meta.product_id) < 0) return 'product';
        return null;
      }
    },
    // Polar: Kundenportal-API (für öffentliche Clients gedacht), JSON, braucht die Organisations-ID
    polar: {
      api: 'https://api.polar.sh/v1/customer-portal/license-keys',
      activate: function (api, key, label, f) {
        var org = lc().organizationId;
        return post(api + '/activate', { key: key, organization_id: org, label: label }, true, f).then(function (r) {
          var j = r.json;
          if (r.status >= 500) return { ok: false, down: true, error: '' };
          var detail = typeof j.detail === 'string' ? j.detail : '';
          // Schlüssel ohne Aktivierungs-Limit: Polar will dann nur „validate“
          if (r.status === 403 && /does not support activations/i.test(detail)) return { ok: false, noActivation: true };
          if (r.status !== 200 || !j.id) return { ok: false, error: detail || (r.status === 404 ? 'License key not found.' : '') };
          var lk = j.license_key || {};
          return { ok: lk.status === 'granted', instanceId: j.id, status: lk.status === 'granted' ? 'active' : (lk.status || 'invalid'),
                   expiresAt: ms(lk.expires_at), email: lk.customer && lk.customer.email || '', product: '', meta: lk };
        });
      },
      validate: function (api, lic, f) {
        var body = { key: lic.key, organization_id: lc().organizationId };
        if (lic.instanceId) body.activation_id = lic.instanceId;
        return post(api + '/validate', body, true, f).then(function (r) {
          var j = r.json;
          if (r.status >= 500) return { ok: false, down: true };
          if (r.status !== 200) return { ok: false, status: 'invalid', error: typeof j.detail === 'string' ? j.detail : '' };
          return { ok: j.status === 'granted', status: j.status === 'granted' ? 'active' : (j.status || 'invalid'),
                   expiresAt: ms(j.expires_at), email: j.customer && j.customer.email, product: '', meta: j };
        });
      },
      deactivate: function (api, lic, f) {
        return post(api + '/deactivate', { key: lic.key, organization_id: lc().organizationId, activation_id: lic.instanceId }, true, f);
      },
      // Optional: nur Schlüssel bestimmter Vorteile (Benefits) annehmen
      foreign: function (meta) {
        var ids = lc().benefitIds || [];
        if (ids.length && meta && meta.benefit_id && ids.indexOf(meta.benefit_id) < 0) return 'product';
        return null;
      }
    }
  };
  function provider() {
    var c = lc(), p = PROVIDERS[c.provider] || PROVIDERS.lemonsqueezy;
    return { p: p, api: c.api || p.api };
  }
  function foreignText(kind) {
    return kind === 'store' ? 'Dieser Schlüssel gehört nicht zu ' + (cfg().brand || 'dieser App') + '.' : 'Dieser Schlüssel gilt für ein anderes Produkt.';
  }
  function record(key, instanceId, r) {
    store(KEY, {
      key: key, instanceId: instanceId || null, status: r.status || 'active', expiresAt: r.expiresAt || null,
      email: r.email || '', product: r.product || '', checkedAt: now(), offline: false, problem: ''
    });
  }

  function activate(key, fetchImpl) {
    key = String(key || '').trim();
    if (key.length < 8) return Promise.reject(err('input', 'Bitte den vollständigen Lizenzschlüssel eingeben.'));
    var pv = provider();
    var label = (cfg().brand || 'Zugradar') + ' Web · ' + new Date(now()).toISOString().slice(0, 10);
    return pv.p.activate(pv.api, key, label, fetchImpl).then(function (r) {
      if (r.noActivation) {
        // Kein Geräte-Limit beim Anbieter eingestellt → Schlüssel nur prüfen
        return pv.p.validate(pv.api, { key: key }, fetchImpl).then(function (v) {
          if (v.down) throw err('network', 'Lizenzserver nicht erreichbar. Prüfe die Verbindung und versuche es erneut.');
          if (!v.ok) throw err('rejected', v.error || 'Der Schlüssel wurde nicht angenommen.');
          if (pv.p.foreign(v.meta)) throw err('wrong_product', foreignText(pv.p.foreign(v.meta)));
          record(key, null, v); emit(); return state();
        });
      }
      if (r.down) throw err('network', 'Lizenzserver nicht erreichbar. Prüfe die Verbindung und versuche es erneut.');
      if (!r.ok && !r.instanceId) throw err('rejected', r.error || 'Der Schlüssel wurde nicht angenommen.');
      var bad = pv.p.foreign(r.meta);
      if (bad || !r.ok) {
        // Aktivierung sofort wieder freigeben, damit kein Geräteplatz verbraucht wird
        if (r.instanceId) pv.p.deactivate(pv.api, { key: key, instanceId: r.instanceId }, fetchImpl).catch(function () {});
        if (bad) throw err('wrong_product', foreignText(bad));
        throw err('inactive', 'Der Schlüssel ist ' + r.status + '.');
      }
      record(key, r.instanceId, r);
      emit();
      return state();
    }, function (e) {
      if (e && e.code) throw e;
      throw err('network', 'Lizenzserver nicht erreichbar. Prüfe die Verbindung und versuche es erneut.');
    });
  }

  // Nachprüfen, wenn fällig. Netz- oder Serverfehler → Kulanzzeit läuft weiter (offline: true).
  function revalidate(force, fetchImpl) {
    var lic = load(KEY);
    if (!lic || !lic.key) return Promise.resolve(state());
    var due = force || !lic.checkedAt || now() > lic.checkedAt + (lc().revalidateDays || 7) * DAY;
    if (!due) return Promise.resolve(state());
    var pv = provider();
    function offline() { lic.offline = true; store(KEY, lic); emit(); return state(); }
    return pv.p.validate(pv.api, lic, fetchImpl).then(function (v) {
      if (v.down) return offline();
      if (v.ok && !pv.p.foreign(v.meta)) {
        record(lic.key, lic.instanceId, { status: 'active', expiresAt: v.expiresAt, email: v.email || lic.email, product: v.product || lic.product });
      } else {
        lic.status = v.ok ? 'foreign' : (v.status || 'invalid');
        lic.problem = v.error || 'Die Lizenz ist nicht mehr gültig (' + lic.status + ').';
        lic.checkedAt = now();
        store(KEY, lic);
      }
      emit();
      return state();
    }, offline);
  }

  function deactivate(fetchImpl) {
    var lic = load(KEY);
    store(KEY, null);
    emit();
    if (!lic || !lic.key || !lic.instanceId) return Promise.resolve(state());
    var pv = provider();
    return pv.p.deactivate(pv.api, lic, fetchImpl).then(function () { return state(); }, function () { return state(); });
  }

  // Tageszähler (z. B. Trainer-Aufgaben in der kostenlosen Version)
  function dayCount(name, add) {
    var k = 'zugradar.count.' + name, d = new Date(now()).toISOString().slice(0, 10);
    var v = load(k) || {};
    if (v.day !== d) v = { day: d, n: 0 };
    if (add) { v.n += add; store(k, v); }
    return v.n;
  }

  root.SK.license = {
    state: state, isPro: isPro, limits: limits, startTrial: startTrial, activate: activate,
    revalidate: revalidate, deactivate: deactivate, dayCount: dayCount,
    onChange: function (f) { listeners.push(f); }, _now: null, _providers: PROVIDERS
  };
})();
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SK.license;

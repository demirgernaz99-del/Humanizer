/* SK.license – Free / Test / Pro. Pro wird über einen Lizenzschlüssel freigeschaltet
   (Lemon-Squeezy-Lizenz-API: activate / validate / deactivate). Alles clientseitig:
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

  function form(obj) {
    return Object.keys(obj).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]); }).join('&');
  }
  function call(path, body, fetchImpl) {
    var f = fetchImpl || (root.fetch && root.fetch.bind(root));
    var api = (cfg().license || {}).api;
    return f(api + '/' + path, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form(body)
    }).then(function (res) {
      return res.json().then(function (j) { return { status: res.status, json: j }; }, function () { return { status: res.status, json: {} }; });
    });
  }
  function err(code, msg) { var e = new Error(msg); e.code = code; return e; }

  // Passt der Schlüssel zu diesem Shop/Produkt?
  function checkMeta(meta) {
    var c = cfg().license || {};
    if (c.storeId && meta && +meta.store_id !== +c.storeId) return 'Dieser Schlüssel gehört nicht zu ' + (cfg().brand || 'dieser App') + '.';
    if (c.productIds && c.productIds.length && meta && c.productIds.indexOf(+meta.product_id) < 0) return 'Dieser Schlüssel gilt für ein anderes Produkt.';
    return null;
  }
  function record(key, instanceId, lk, meta) {
    store(KEY, {
      key: key, instanceId: instanceId, status: lk.status,
      expiresAt: lk.expires_at ? Date.parse(lk.expires_at) : null,
      email: meta && meta.customer_email || '', product: meta && meta.product_name || '',
      checkedAt: now(), offline: false, problem: ''
    });
  }

  function activate(key, fetchImpl) {
    key = String(key || '').trim();
    if (key.length < 8) return Promise.reject(err('input', 'Bitte den vollständigen Lizenzschlüssel eingeben.'));
    var name = (cfg().brand || 'Zugradar') + ' Web · ' + new Date(now()).toISOString().slice(0, 10);
    return call('activate', { license_key: key, instance_name: name }, fetchImpl).then(function (r) {
      var j = r.json || {};
      if (!j.activated) throw err('rejected', j.error || 'Der Schlüssel wurde nicht angenommen.');
      var bad = checkMeta(j.meta);
      if (bad) {
        // Aktivierung sofort wieder freigeben, damit kein Platz verbraucht wird
        call('deactivate', { license_key: key, instance_id: j.instance && j.instance.id }, fetchImpl).catch(function () {});
        throw err('wrong_product', bad);
      }
      if (j.license_key && j.license_key.status && j.license_key.status !== 'active') throw err('inactive', 'Der Schlüssel ist ' + j.license_key.status + '.');
      record(key, j.instance && j.instance.id, j.license_key || { status: 'active' }, j.meta);
      emit();
      return state();
    }, function (e) {
      if (e && e.code) throw e;
      throw err('network', 'Lizenzserver nicht erreichbar. Prüfe die Verbindung und versuche es erneut.');
    });
  }

  // Nachprüfen, wenn fällig. Netzfehler → Kulanzzeit läuft weiter (offline: true).
  function revalidate(force, fetchImpl) {
    var lic = load(KEY);
    if (!lic || !lic.key) return Promise.resolve(state());
    var due = force || !lic.checkedAt || now() > lic.checkedAt + ((cfg().license || {}).revalidateDays || 7) * DAY;
    if (!due) return Promise.resolve(state());
    return call('validate', { license_key: lic.key, instance_id: lic.instanceId || '' }, fetchImpl).then(function (r) {
      var j = r.json || {};
      if (j.valid && (!j.license_key || j.license_key.status === 'active') && !checkMeta(j.meta)) {
        record(lic.key, lic.instanceId, j.license_key || { status: 'active' }, j.meta || { customer_email: lic.email, product_name: lic.product });
      } else {
        lic.status = (j.license_key && j.license_key.status) || 'invalid';
        lic.problem = j.error || 'Die Lizenz ist nicht mehr gültig (' + lic.status + ').';
        lic.checkedAt = now();
        store(KEY, lic);
      }
      emit();
      return state();
    }, function () {
      lic.offline = true; store(KEY, lic); emit();
      return state();
    });
  }

  function deactivate(fetchImpl) {
    var lic = load(KEY);
    store(KEY, null);
    emit();
    if (!lic || !lic.key || !lic.instanceId) return Promise.resolve(state());
    return call('deactivate', { license_key: lic.key, instance_id: lic.instanceId }, fetchImpl)
      .then(function () { return state(); }, function () { return state(); });
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
    onChange: function (f) { listeners.push(f); }, _now: null
  };
})();
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SK.license;

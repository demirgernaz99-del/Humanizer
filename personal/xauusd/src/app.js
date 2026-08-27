/* XAU.data + App – Datenschicht und komplette UI-Verdrahtung des Gold-Dashboards.
   Läuft als klassisches <script>; in Node wird nur XAU.data exportiert (kein DOM-Code). */
(function () {
  "use strict";
  var root = (typeof window !== "undefined") ? window : globalThis;
  root.XAU = root.XAU || {};

  function num(x) { return typeof x === "number" && isFinite(x); }

  /* ================= Datenschicht: XAU.data ================= */
  var BASES = ["https://api.binance.com", "https://data-api.binance.vision"];
  var SYMBOL = "PAXGUSDT";
  var workingBase = null;

  async function fetchKlines(interval, limit) {
    limit = limit || 400;
    var bases = workingBase
      ? [workingBase].concat(BASES.filter(function (b) { return b !== workingBase; }))
      : BASES.slice();
    var lastErr = null;
    for (var i = 0; i < bases.length; i++) {
      var base = bases[i];
      try {
        var url = base + "/api/v3/klines?symbol=" + SYMBOL +
          "&interval=" + encodeURIComponent(interval) + "&limit=" + encodeURIComponent(limit);
        var res = await fetch(url);
        if (!res.ok) throw new Error("HTTP " + res.status + " von " + base);
        var raw = await res.json();
        if (!Array.isArray(raw)) throw new Error("Unerwartete Antwort von " + base);
        workingBase = base;
        return raw.map(function (r) {
          return { time: +r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] };
        });
      } catch (e) { lastErr = e; }
    }
    throw (lastErr || new Error("Keine Datenquelle erreichbar"));
  }

  root.XAU.data = { SYMBOL: SYMBOL, BASES: BASES, fetchKlines: fetchKlines };

  /* ================= Pure Helfer (Tuned-Params & Optimizer-UI) =================
     Kein DOM nötig – in Node über XAU.apputil testbar. */
  var TF_KEYS = ["15m", "1h", "4h", "1d"];
  var DEFAULT_CONFIG = { threshold: 4, atrMult: 1.5, rr: 2, exitMode: "fixed", sessionFilter: "none", maxHoldBars: 0 };

  function validConfig(c) {
    if (!c || typeof c !== "object" || Array.isArray(c)) return false;
    if (!num(c.threshold) || c.threshold <= 0) return false;
    if (!num(c.atrMult) || c.atrMult <= 0) return false;
    if (!num(c.rr) || c.rr <= 0) return false;
    if (c.exitMode !== "fixed" && c.exitMode !== "trailing" && c.exitMode !== "breakeven") return false;
    if (c.sessionFilter !== "none" && c.sessionFilter !== "londonNY") return false;
    if (!num(c.maxHoldBars) || c.maxHoldBars < 0) return false;
    return true;
  }
  // Nur die Vertragsfelder übernehmen – Fremdfelder aus dem Storage fliegen raus.
  function cleanConfig(c) {
    return { threshold: c.threshold, atrMult: c.atrMult, rr: c.rr,
      exitMode: c.exitMode, sessionFilter: c.sessionFilter, maxHoldBars: c.maxHoldBars };
  }
  function configsEqual(a, b) {
    if (!validConfig(a) || !validConfig(b)) return false;
    return a.threshold === b.threshold && a.atrMult === b.atrMult && a.rr === b.rr &&
      a.exitMode === b.exitMode && a.sessionFilter === b.sessionFilter && a.maxHoldBars === b.maxHoldBars;
  }
  function validStats(s) {
    return !!s && typeof s === "object" && !Array.isArray(s) &&
      num(s.n) && num(s.wins) && num(s.losses) && num(s.winrate) &&
      num(s.totalR) && num(s.maxDrawdownR) &&
      (s.profitFactor === null || num(s.profitFactor));
  }
  function cleanStats(s) {
    return { n: s.n, wins: s.wins, losses: s.losses, winrate: s.winrate,
      totalR: s.totalR, profitFactor: (s.profitFactor === null ? null : s.profitFactor),
      maxDrawdownR: s.maxDrawdownR };
  }
  // localStorage "sb2_tuned" ({tf: config}) robust validieren – Unbrauchbares ignorieren.
  function sanitizeTuned(raw) {
    var out = {};
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (var i = 0; i < TF_KEYS.length; i++) {
        var tf = TF_KEYS[i];
        if (validConfig(raw[tf])) out[tf] = cleanConfig(raw[tf]);
      }
    }
    return out;
  }
  // localStorage "sb2_optresults" ({tf: Walk-Forward-Ergebnis}) robust validieren.
  function sanitizeOptResults(raw) {
    var out = {};
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (var i = 0; i < TF_KEYS.length; i++) {
        var tf = TF_KEYS[i], r = raw[tf];
        if (r && typeof r === "object" && !Array.isArray(r) &&
            validConfig(r.config) && validStats(r.inSample) && validStats(r.outOfSample)) {
          out[tf] = { tf: tf, config: cleanConfig(r.config),
            inSample: cleanStats(r.inSample), outOfSample: cleanStats(r.outOfSample),
            evaluated: num(r.evaluated) ? r.evaluated : null,
            objective: (r.objective === "winrate" || r.objective === "pf" || r.objective === "totalR") ? r.objective : null,
            guardRelaxed: r.guardRelaxed === true };
        }
      }
    }
    return out;
  }
  function fmtMult(x) { return num(x) ? x.toLocaleString("de-DE", { maximumFractionDigits: 2 }) : "–"; }
  // Lesbare Konfigurationszeile, z. B. "Schwelle ±5 · Stop 2×ATR · Target 1,5R · Trailing · nur London/NY · Zeit-Exit 24"
  function configLabel(c) {
    if (!validConfig(c)) return "–";
    var parts = [
      "Schwelle ±" + fmtMult(c.threshold),
      "Stop " + fmtMult(c.atrMult) + "×ATR",
      "Target " + fmtMult(c.rr) + "R",
      c.exitMode === "trailing" ? "Trailing" : (c.exitMode === "breakeven" ? "Breakeven" : "Fixer Exit")
    ];
    if (c.sessionFilter === "londonNY") parts.push("nur London/NY");
    if (c.maxHoldBars > 0) parts.push("Zeit-Exit " + fmtMult(c.maxHoldBars));
    return parts.join(" · ");
  }
  // onProgress-Argumente des Optimizers normalisieren: ({done, total}) oder (done, total).
  function parseProgress(a, b) {
    if (a && typeof a === "object" && !Array.isArray(a)) {
      var d = num(a.done) ? a.done : (num(a.evaluated) ? a.evaluated : null);
      return { done: d, total: num(a.total) ? a.total : null };
    }
    return { done: num(a) ? a : null, total: num(b) ? b : null };
  }

  root.XAU.apputil = {
    TF_KEYS: TF_KEYS,
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    validConfig: validConfig,
    cleanConfig: cleanConfig,
    configsEqual: configsEqual,
    validStats: validStats,
    cleanStats: cleanStats,
    sanitizeTuned: sanitizeTuned,
    sanitizeOptResults: sanitizeOptResults,
    fmtMult: fmtMult,
    configLabel: configLabel,
    parseProgress: parseProgress
  };

  /* ================= App (nur im Browser mit Template-DOM) ================= */
  if (typeof document === "undefined" || !document.getElementById || !document.getElementById("tf-cards")) return;

  var XAU = root.XAU;
  function $(id) { return document.getElementById(id); }

  var LS = {
    get: function (k, fb) {
      try {
        var v = localStorage.getItem(k);
        if (v === null) return fb;
        var parsed = JSON.parse(v);
        // Typ des Fallbacks erzwingen: korrupter Storage darf die App nie brechen
        if (Array.isArray(fb) && !Array.isArray(parsed)) return fb;
        if (fb && typeof fb === "object" && !Array.isArray(fb) && (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))) return fb;
        if (parsed === null || parsed === undefined) return fb;
        return parsed;
      } catch (e) { return fb; }
    },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  var TFS = TF_KEYS;
  var TF_LABEL = { "15m": "15 Min", "1h": "1 Std", "4h": "4 Std", "1d": "1 Tag" };
  var ICONS = { BUY: "▲", SELL: "▼", NEUTRAL: "→" };
  var HIST_TFS = ["1h", "4h"]; // nur diese TFs in den Signal-Verlauf

  function fmtPrice(p) {
    return num(p) ? p.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–";
  }
  function fmtSigned(p) { return (num(p) && p >= 0 ? "+" : "") + fmtPrice(p); }
  function fmt1(x) { return num(x) ? x.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "–"; }
  function fmtTime(t) {
    return new Date(t).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  function fmtClock(t) { return new Date(t).toLocaleTimeString("de-DE"); }

  var candlesByTF = {};
  var analysesByTF = {};
  var confluenceRes = null;
  var history = LS.get("sb2_history", []);
  var lastAction = LS.get("sb2_lastaction", {});
  var alerts = LS.get("sb2_alerts", []);
  var currentSetup = null; // {entry, stop} bei aktivem 1h-Signal
  var chartApi = null;
  var scanning = false;
  var tuned = sanitizeTuned(LS.get("sb2_tuned", {}));                // {tf: config} – nur validierte Einträge
  var optResults = sanitizeOptResults(LS.get("sb2_optresults", {})); // {tf: Walk-Forward-Ergebnis}
  var optErrors = {};   // {tf: Fehlermeldung} – nur für die laufende Sitzung, nicht persistiert
  var fetchErrors = {}; // {tf: true} – letzter Kursabruf dieses TF fehlgeschlagen
  var optRunning = false;

  function tunedFor(tf) { return tuned[tf] || null; }

  function currentPrice() {
    // 1h bevorzugt; fällt der 1h-Fetch aus, liefert der nächste verfügbare TF den Kurs
    var order = ["1h", "15m", "4h", "1d"];
    for (var i = 0; i < order.length; i++) {
      var c = candlesByTF[order[i]];
      if (c && c.length) return c[c.length - 1].close;
    }
    return null;
  }

  /* ---------- Banner ---------- */
  function showBanner(msg) { var b = $("banner"); b.textContent = msg; b.style.display = "block"; }
  function hideBanner() { var b = $("banner"); b.textContent = ""; b.style.display = "none"; }

  /* ---------- Scan ---------- */
  async function scan() {
    if (scanning) return;
    scanning = true;
    try {
      $("status").textContent = "Aktualisiere…";
      var results = await Promise.allSettled(TFS.map(function (tf) { return XAU.data.fetchKlines(tf, 400); }));
      var okCount = 0;
      for (var i = 0; i < TFS.length; i++) {
        var tf = TFS[i];
        if (results[i].status === "fulfilled") {
          okCount++;
          delete fetchErrors[tf];
          candlesByTF[tf] = results[i].value;
          var a = null;
          var tc = tunedFor(tf); // aktive optimierte Parameter: nur der Threshold wirkt live
          try { a = XAU.engine.analyzeTF(results[i].value, tc ? { threshold: tc.threshold } : undefined); } catch (e) { a = null; }
          analysesByTF[tf] = a;
          if (a && HIST_TFS.indexOf(tf) !== -1) recordSignal(tf, a);
        } else {
          fetchErrors[tf] = true;
        }
      }
      try { confluenceRes = XAU.engine.confluence(analysesByTF); } catch (e2) { confluenceRes = null; }

      var bannerParts = [];
      if (okCount === 0) {
        bannerParts.push("Binance nicht erreichbar – Internet/Firewall prüfen, ggf. VPN");
      }
      var fired = checkAlerts();
      for (var k = 0; k < fired.length; k++) bannerParts.push(fired[k]);
      if (bannerParts.length) showBanner(bannerParts.join(" · ")); else hideBanner();

      renderHeader(okCount);
      renderCards();
      renderConfluence();
      renderChart();
      renderSetup();
      renderHistory();
      renderAlerts();
    } catch (e3) {
      showBanner("Unerwarteter Fehler: " + (e3 && e3.message ? e3.message : String(e3)));
      $("status").textContent = "Stand " + fmtClock(Date.now()) + " · Fehler beim Aktualisieren";
    } finally {
      scanning = false;
    }
  }

  /* ---------- Header ---------- */
  function sessionLabel(d) {
    var h = d.getUTCHours();
    var label;
    if (h >= 22 || h < 7) label = "Asien-Session (ruhig)";
    else if (h < 12) label = "London-Session";
    else if (h < 16) label = "London+NY (höchste Liquidität)";
    else if (h < 21) label = "New-York-Session";
    else label = "Zwischen den Sessions";
    var day = d.getUTCDay();
    if (day === 0 || day === 6) label += " · Wochenende: nur Token-Handel, Spotmarkt zu";
    return label;
  }

  function renderHeader(okCount) {
    var c1h = candlesByTF["1h"];
    var changeEl = $("price-change");
    if (c1h && c1h.length) {
      var last = c1h[c1h.length - 1].close;
      $("price-hero").textContent = "$" + fmtPrice(last);
      var idx = c1h.length - 1 - 24; // 24 Stunden zurück
      if (idx >= 0 && num(c1h[idx].close) && c1h[idx].close !== 0) {
        var prev = c1h[idx].close;
        var diff = last - prev;
        var pct = diff / prev * 100;
        changeEl.textContent = fmtSigned(diff) + " $ (" + fmtSigned(pct) + " %) / 24 h";
        changeEl.className = diff >= 0 ? "up" : "down";
      } else {
        changeEl.textContent = "–";
        changeEl.className = "";
      }
    }
    $("session-badge").textContent = sessionLabel(new Date());
    var status = "Stand " + fmtClock(Date.now()) + " · Quelle PAXG/USDT · Auto-Refresh 60 s";
    if (okCount > 0 && okCount < TFS.length) {
      status += " · " + (TFS.length - okCount) + " Timeframe(s) ohne Daten";
    } else if (okCount === 0) {
      status = "Stand " + fmtClock(Date.now()) + " · keine Daten – Verbindung prüfen";
    }
    $("status").textContent = status;
  }

  /* ---------- Badges ---------- */
  function makeBadge(action, big) {
    var b = document.createElement("span");
    b.className = "badge badge-" + action + (big ? " badge-big" : "");
    b.textContent = ICONS[action] + " " + action;
    return b;
  }

  /* ---------- TF-Karten ---------- */
  function renderCards() {
    var grid = $("tf-cards");
    grid.replaceChildren();
    for (var i = 0; i < TFS.length; i++) {
      (function (tf) {
        var a = analysesByTF[tf];
        var card = document.createElement("div");
        card.className = "card tf-card" + ($("chart-tf").value === tf ? " selected" : "");

        var head = document.createElement("div");
        head.className = "pair-head";
        var name = document.createElement("span");
        name.textContent = TF_LABEL[tf] || tf;
        head.appendChild(name);
        var tc = tunedFor(tf);
        if (tc) {
          var chip = document.createElement("span");
          chip.className = "tuned-chip";
          chip.textContent = "optimiert";
          chip.title = "Nutzt optimierte Parameter: " + configLabel(tc);
          head.appendChild(chip);
        }
        if (a) head.appendChild(makeBadge(a.action, false));
        card.appendChild(head);

        if (a) {
          // Score-Meter: divergierend um die Mitte (−10 … +10)
          var meter = document.createElement("div"); meter.className = "meter";
          var mid = document.createElement("div"); mid.className = "mid"; meter.appendChild(mid);
          if (a.score !== 0) {
            var fill = document.createElement("div"); fill.className = "fill";
            fill.style.width = (Math.min(Math.abs(a.score) / (a.maxScore || 9), 1) * 50) + "%";
            fill.style.background = a.score > 0 ? "var(--good)" : "var(--critical)";
            if (a.score > 0) fill.style.left = "50%"; else fill.style.right = "50%";
            meter.appendChild(fill);
          }
          card.appendChild(meter);

          var stats = document.createElement("div"); stats.className = "stats";
          stats.textContent = "Score " + (a.score > 0 ? "+" + a.score : String(a.score)) +
            " · RSI " + fmt1(a.indicators.rsi) + " · ADX " + fmt1(a.indicators.adx);
          card.appendChild(stats);

          var det = document.createElement("details");
          var sum = document.createElement("summary"); sum.textContent = "Begründung"; det.appendChild(sum);
          var ul = document.createElement("ul");
          for (var r = 0; r < a.reasons.length; r++) {
            var li = document.createElement("li"); li.textContent = a.reasons[r]; ul.appendChild(li);
          }
          det.appendChild(ul);
          det.addEventListener("click", function (ev) { ev.stopPropagation(); });
          card.appendChild(det);
        } else {
          var load = document.createElement("div"); load.className = "stats";
          var have = candlesByTF[tf] ? candlesByTF[tf].length : 0;
          if (fetchErrors[tf]) load.textContent = "Daten nicht abrufbar – letzter Versuch fehlgeschlagen";
          else if (have && XAU.engine && have < XAU.engine.MIN_CANDLES)
            load.textContent = "Zu wenig Historie (" + have + " von " + XAU.engine.MIN_CANDLES + " Kerzen)";
          else load.textContent = "Lade…";
          card.appendChild(load);
        }
        if (a && fetchErrors[tf]) {
          var stale = document.createElement("div"); stale.className = "stats";
          stale.textContent = "⚠ Aktualisierung fehlgeschlagen – Stand ist älter";
          card.appendChild(stale);
        }

        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", TF_LABEL[tf] + "-Chart anzeigen");
        var activate = function () {
          $("chart-tf").value = tf;
          renderCards();
          renderChart();
        };
        card.addEventListener("click", activate);
        card.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); activate(); }
        });
        grid.appendChild(card);
      })(TFS[i]);
    }
  }

  /* ---------- Konfluenz ---------- */
  function renderConfluence() {
    var el = $("confluence-card");
    el.replaceChildren();
    var h = document.createElement("h2");
    h.textContent = "Timeframe-Konfluenz";
    el.appendChild(h);
    var anyData = TFS.some(function (t) { return analysesByTF[t]; });
    if (!confluenceRes || !anyData) {
      var p0 = document.createElement("p"); p0.className = "hint";
      p0.textContent = confluenceRes && !anyData ? "Keine Daten verfügbar – warte auf den nächsten erfolgreichen Abruf." : "Lade…";
      el.appendChild(p0);
      return;
    }
    el.appendChild(makeBadge(confluenceRes.action, true));
    var p = document.createElement("p");
    p.textContent = confluenceRes.summary;
    el.appendChild(p);
    var small = document.createElement("div");
    small.className = "stats";
    var parts = [];
    for (var i = 0; i < TFS.length; i++) {
      var act = confluenceRes.perTF && confluenceRes.perTF[TFS[i]];
      parts.push(TFS[i] + ": " + (act || "–"));
    }
    small.textContent = parts.join(" · ");
    el.appendChild(small);
  }

  /* ---------- Chart ---------- */
  function ensureChart() {
    if (chartApi) return chartApi;
    if (!XAU.chart || typeof XAU.chart.create !== "function") return null;
    try { chartApi = XAU.chart.create($("chart"), $("tooltip")); } catch (e) { chartApi = null; }
    return chartApi;
  }

  function dailyPivots() {
    var d = candlesByTF["1d"];
    if (!d || d.length < 2) return null; // vorletzte 1d-Kerze (letzte = laufender Tag)
    try { return XAU.ind.pivots(d[d.length - 2]); } catch (e) { return null; }
  }

  function renderLegend() {
    var leg = $("chart-legend");
    leg.replaceChildren();
    var entries = [
      ["EMA50", "var(--accent)", "solid"],
      ["EMA200", "var(--gold)", "solid"],
      ["Bollinger (20, 2σ)", "var(--accent)", "dotted"],
      ["Pivots (P/R/S)", "var(--text-muted)", "dashed"]
    ];
    for (var i = 0; i < entries.length; i++) {
      var span = document.createElement("span");
      var key = document.createElement("span");
      key.className = "key";
      key.style.borderColor = entries[i][1];
      key.style.borderTopStyle = entries[i][2];
      span.appendChild(key);
      span.appendChild(document.createTextNode(entries[i][0]));
      leg.appendChild(span);
    }
  }

  function renderChart() {
    var tf = $("chart-tf").value;
    $("charttitle").textContent = "XAU/USD (PAXG) · " + (TF_LABEL[tf] || tf);
    renderLegend();
    var api = ensureChart();
    if (!api) return;
    var candles = candlesByTF[tf];
    if (!candles || !candles.length || !XAU.ind) return;
    var closes = candles.map(function (c) { return c.close; });
    var ind = XAU.ind;
    var m = null;
    try { m = ind.macd(closes, 12, 26, 9); } catch (e) { m = null; }
    m = m || {};
    var a = analysesByTF[tf];
    var markers = (a && (a.action === "BUY" || a.action === "SELL"))
      ? [{ index: candles.length - 1, type: a.action }] : [];
    var data;
    try {
      data = {
        candles: candles,
        tfLabel: TF_LABEL[tf] || tf,
        ema50: ind.ema(closes, 50) || [],
        ema200: ind.ema(closes, 200) || [],
        bb: ind.bollinger(closes, 20, 2) || [],
        rsi: ind.rsi(closes, 14) || [],
        macdHist: m.hist || [],
        macdLine: m.macdLine || [],
        macdSignal: m.signalLine || [],
        pivots: dailyPivots(),
        markers: markers
      };
    } catch (e2) { return; }
    try { api.render(data); } catch (e3) {}
  }

  /* ---------- Trade-Setup + Positionsrechner (1h-Basis) ---------- */
  function renderSetup() {
    var el = $("setup-card");
    el.replaceChildren();
    currentSetup = null;
    var a = analysesByTF["1h"];
    if (!a) {
      var pl = document.createElement("p"); pl.className = "hint"; pl.textContent = "Lade…";
      el.appendChild(pl);
      renderSizer();
      return;
    }
    var atr = a.indicators ? a.indicators.atr : null;
    if (a.action === "NEUTRAL" || !num(atr) || atr <= 0) {
      var pn = document.createElement("p"); pn.className = "hint";
      pn.textContent = "Kein Setup – warten auf klares Signal.";
      el.appendChild(pn);
      renderSizer();
      return;
    }
    var isLong = a.action === "BUY";
    var entry = a.price;
    // Stop-Abstand und Target aus den optimierten 1h-Parametern (Fallback 1,5 × ATR / 2R)
    var t1 = tunedFor("1h");
    var atrMult = t1 ? t1.atrMult : 1.5;
    var rr = t1 ? t1.rr : 2;
    var risk = atrMult * atr;
    var stop = isLong ? entry - risk : entry + risk;
    var tp1 = isLong ? entry + risk : entry - risk;
    var tp2 = isLong ? entry + 2 * risk : entry - 2 * risk;
    var tp3 = isLong ? entry + 3 * risk : entry - 3 * risk;
    // Strategie-Ziel (rr aus Optimierung) für die Pivot-Nähe und die Info-Zeile
    var tpStrat = isLong ? entry + rr * risk : entry - rr * risk;
    currentSetup = { entry: entry, stop: stop };

    el.appendChild(makeBadge(a.action, false));
    if (t1) {
      var tn = document.createElement("p");
      tn.className = "hint tuned-note";
      tn.textContent = "Nutzt optimierte 1h-Parameter: Stop " + fmtMult(atrMult) + " × ATR, Target " + fmtMult(rr) + "R.";
      el.appendChild(tn);
    }
    var rows = [
      ["Richtung", isLong ? "LONG (Kaufen)" : "SHORT (Verkaufen)"],
      ["Entry", "$" + fmtPrice(entry)],
      ["Stop-Loss (" + fmtMult(atrMult) + " × ATR)", "$" + fmtPrice(stop)],
      ["TP1 (1R)", "$" + fmtPrice(tp1)],
      ["TP2 (2R)", "$" + fmtPrice(tp2)],
      ["TP3 (3R)", "$" + fmtPrice(tp3)],
      ["Strategie-Ziel (" + fmtMult(rr) + "R)", "$" + fmtPrice(tpStrat)]
    ];
    for (var i = 0; i < rows.length; i++) {
      var div = document.createElement("div");
      div.className = "setup-row";
      var lab = document.createElement("span"); lab.className = "setup-label"; lab.textContent = rows[i][0];
      var val = document.createElement("span"); val.className = "setup-value"; val.textContent = rows[i][1];
      div.appendChild(lab); div.appendChild(val);
      el.appendChild(div);
    }

    // Nächstgelegenes Pivot-Level zum TP2
    var pv = dailyPivots();
    if (pv) {
      var levels = [["P", pv.p], ["R1", pv.r1], ["R2", pv.r2], ["S1", pv.s1], ["S2", pv.s2]];
      var best = null;
      for (var j = 0; j < levels.length; j++) {
        if (num(levels[j][1]) && (!best || Math.abs(levels[j][1] - tpStrat) < Math.abs(best[1] - tpStrat))) best = levels[j];
      }
      if (best) {
        var hint = document.createElement("p");
        hint.className = "hint";
        hint.textContent = "Das Strategie-Ziel liegt am nächsten am Pivot-Level " + best[0] + " (" + fmtPrice(best[1]) + " $).";
        el.appendChild(hint);
      }
    }

    // Fibonacci-Retracement des letzten Swings (letzte 100 1h-Kerzen)
    var fc = candlesByTF["1h"];
    if (fc && fc.length >= 100 && XAU.ind && XAU.ind.fib) {
      var win = fc.slice(-100), hi = -Infinity, lo = Infinity;
      for (var w = 0; w < win.length; w++) {
        if (win[w].high > hi) hi = win[w].high;
        if (win[w].low < lo) lo = win[w].low;
      }
      if (hi > lo) {
        var fl = XAU.ind.fib(hi, lo);
        var fibs = [["23,6 %", fl.level_236], ["38,2 %", fl.level_382], ["50 %", fl.level_500], ["61,8 %", fl.level_618], ["78,6 %", fl.level_786]];
        var nearest = null;
        for (var q = 0; q < fibs.length; q++) {
          if (!nearest || Math.abs(fibs[q][1] - entry) < Math.abs(nearest[1] - entry)) nearest = fibs[q];
        }
        if (nearest) {
          var fh = document.createElement("p");
          fh.className = "hint";
          fh.textContent = "Fibonacci (Swing der letzten 100 Kerzen: " + fmtPrice(lo) + "–" + fmtPrice(hi) +
            " $): Kurs notiert am " + nearest[0] + "-Retracement (" + fmtPrice(nearest[1]) + " $).";
          el.appendChild(fh);
        }
      }
    }
    renderSizer();
  }

  function renderSizer() {
    var el = $("size-result");
    el.replaceChildren();
    var acct = parseFloat($("acct-size").value);
    var pct = parseFloat($("risk-pct").value);
    if (!num(acct) || !num(pct) || acct <= 0 || pct <= 0) {
      el.textContent = "Bitte Kontogröße und Risiko angeben.";
      return;
    }
    var t1 = tunedFor("1h");
    var atrMult = t1 ? t1.atrMult : 1.5;
    var dist = null, hypothetical = false;
    if (currentSetup) {
      dist = Math.abs(currentSetup.entry - currentSetup.stop);
    } else {
      var a = analysesByTF["1h"];
      if (a && a.indicators && num(a.indicators.atr) && a.indicators.atr > 0) {
        dist = atrMult * a.indicators.atr;
        hypothetical = true;
      }
    }
    if (!num(dist) || dist <= 0) {
      el.textContent = "Noch keine Daten für die Berechnung.";
      return;
    }
    var riskUsd = acct * pct / 100;
    var oz = riskUsd / dist;
    var lots = oz / 100; // 1 Lot = 100 oz
    var l1 = document.createElement("div");
    l1.textContent = "Risiko: " + fmtPrice(riskUsd) + " $";
    var l2 = document.createElement("div");
    l2.textContent = "Positionsgröße: " + fmtPrice(oz) + " oz (" + fmtPrice(lots) + " Lots)";
    el.appendChild(l1); el.appendChild(l2);
    if (hypothetical) {
      var l3 = document.createElement("div");
      l3.className = "hint";
      l3.textContent = "Ohne aktives Setup: gerechnet mit hypothetischem Stop-Abstand " + fmtMult(atrMult) + " × ATR (" + fmtPrice(dist) + " $).";
      el.appendChild(l3);
    }
  }

  /* ---------- Preis-Alarme ---------- */
  function updateNotifyHint() {
    if (hintTimer) return; // temporärer Hinweis hat Vorrang
    var el = $("notify-hint");
    if (typeof Notification === "undefined") {
      el.textContent = "Browser-Benachrichtigungen werden hier nicht unterstützt – Alarme erscheinen als Banner.";
    } else if (Notification.permission === "granted") {
      el.textContent = "Benachrichtigungen erlaubt – Alarme kommen auch als Browser-Meldung.";
    } else if (Notification.permission === "denied") {
      el.textContent = "Benachrichtigungen blockiert – Alarme erscheinen nur als Banner.";
    } else {
      el.textContent = "Beim ersten Alarm fragt der Browser nach Erlaubnis für Benachrichtigungen.";
    }
  }

  function renderAlerts() {
    var ul = $("alert-list");
    ul.replaceChildren();
    if (!alerts.length) {
      var li0 = document.createElement("li");
      li0.className = "hint";
      li0.textContent = "Keine Alarme gesetzt.";
      ul.appendChild(li0);
    }
    for (var i = 0; i < alerts.length; i++) {
      (function (idx) {
        var al = alerts[idx];
        var li = document.createElement("li");
        var txt = document.createElement("span");
        txt.textContent = (al.dir === "über" ? "▲ über " : "▼ unter ") + fmtPrice(al.price) + " $";
        li.appendChild(txt);
        var rm = document.createElement("button");
        rm.className = "rm";
        rm.textContent = "✕";
        rm.title = "Alarm entfernen";
        rm.addEventListener("click", function () {
          alerts.splice(idx, 1);
          LS.set("sb2_alerts", alerts);
          renderAlerts();
        });
        li.appendChild(rm);
        ul.appendChild(li);
      })(i);
    }
    updateNotifyHint();
  }

  var hintTimer = null;
  function setHint(msg) {
    var el = $("notify-hint");
    if (!el) return;
    el.textContent = msg;
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hintTimer = null; updateNotifyHint(); }, 5000);
  }

  function addAlert() {
    var v = parseFloat($("alert-price").value);
    if (!num(v) || v <= 0) { setHint("Bitte einen gültigen Preis > 0 eingeben."); return; }
    var cp = currentPrice();
    if (cp === null) { setHint("Kurs noch unbekannt – bitte warten, bis Daten geladen sind, und erneut versuchen."); return; }
    for (var d = 0; d < alerts.length; d++) {
      if (alerts[d].price === v) { setHint("Für diesen Preis existiert bereits ein Alarm."); return; }
    }
    var dir = v < cp ? "unter" : "über";
    alerts.push({ price: v, dir: dir });
    LS.set("sb2_alerts", alerts);
    $("alert-price").value = "";
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      try {
        var req = Notification.requestPermission();
        if (req && typeof req.then === "function") req.then(updateNotifyHint).catch(function () {});
      } catch (e) {}
    }
    renderAlerts();
  }

  function notify(msg) {
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("XAU/USD Gold-Cockpit", { body: msg });
      }
    } catch (e) {}
  }

  function checkAlerts() {
    var msgs = [];
    var cp = currentPrice();
    if (cp === null || !alerts.length) return msgs;
    var remaining = [];
    for (var i = 0; i < alerts.length; i++) {
      var al = alerts[i];
      var hit = (al.dir === "über" && cp >= al.price) || (al.dir === "unter" && cp <= al.price);
      if (hit) {
        var msg = "Preis-Alarm ausgelöst: Gold " + al.dir + " " + fmtPrice(al.price) +
          " $ (aktuell " + fmtPrice(cp) + " $)";
        msgs.push(msg);
        notify(msg);
      } else {
        remaining.push(al);
      }
    }
    if (msgs.length) { alerts = remaining; LS.set("sb2_alerts", alerts); }
    return msgs;
  }

  /* ---------- Backtest ---------- */
  async function runBacktest() {
    var btn = $("bt-run");
    var statsEl = $("bt-stats");
    var tbody = $("bt-trades");
    btn.disabled = true;
    statsEl.replaceChildren();
    statsEl.textContent = "Backtest läuft…";
    tbody.replaceChildren();
    try {
      var tf = $("bt-tf").value;
      var tc = tunedFor(tf);
      var config = tc ? tc : DEFAULT_CONFIG;
      var candles = await XAU.data.fetchKlines(tf, 1000);
      var res = XAU.backtest.run(candles, config);
      renderBtStats(res.stats);
      if (tc) {
        var tunedNote = document.createElement("p");
        tunedNote.className = "hint tuned-note";
        tunedNote.textContent = "Nutzt optimierte Parameter.";
        $("bt-stats").appendChild(tunedNote);
      }
      var meth = document.createElement("p");
      meth.className = "hint";
      meth.textContent = "Konfiguration: " + configLabel(config) + ". Methodik: Entry am Open der Folgekerze, " +
        "konservative Stop-zuerst-Regel, Gaps zum Open abgerechnet; Gegensignal-/Zeit-Exits idealisiert zum Kerzenschluss. " +
        "Vergangenheit ist kein Indikator für die Zukunft.";
      $("bt-stats").appendChild(meth);
      renderBtTrades(res.trades);
    } catch (e) {
      statsEl.textContent = /fetch|network|Failed/i.test(String(e && e.message))
        ? "Backtest fehlgeschlagen: Kursdaten nicht abrufbar (Internet/Firewall prüfen)."
        : "Backtest fehlgeschlagen: " + (e && e.message ? e.message : "Datenfehler");
    } finally {
      btn.disabled = false;
    }
  }

  function fmtR(v) {
    if (!num(v)) return "–";
    return (v >= 0 ? "+" : "") + v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function renderBtStats(s) {
    var el = $("bt-stats");
    el.replaceChildren();
    var tiles = [
      ["Trades", String(s.n)],
      ["Winrate", fmt1(s.winrate * 100) + " %"],
      ["Ø R", fmtR(s.avgR)],
      ["Gesamt-R", fmtR(s.totalR)],
      ["Profit-Faktor", s.profitFactor === null ? (s.wins > 0 ? "∞" : "–") : fmtPrice(s.profitFactor)],
      ["Max. Drawdown", fmtPrice(s.maxDrawdownR) + " R"]
    ];
    for (var i = 0; i < tiles.length; i++) {
      var tile = document.createElement("div");
      tile.className = "stat-tile";
      var val = document.createElement("div"); val.className = "value"; val.textContent = tiles[i][1];
      var lab = document.createElement("div"); lab.className = "label"; lab.textContent = tiles[i][0];
      tile.appendChild(val); tile.appendChild(lab);
      el.appendChild(tile);
    }
  }

  function renderBtTrades(trades) {
    var tbody = $("bt-trades");
    tbody.replaceChildren();
    if (!trades.length) {
      var tr0 = document.createElement("tr");
      var td0 = document.createElement("td");
      td0.colSpan = 6;
      td0.className = "hint";
      td0.textContent = "Keine Trades im Testzeitraum.";
      tr0.appendChild(td0);
      tbody.appendChild(tr0);
      return;
    }
    var view = trades.slice(-40).reverse(); // neueste zuerst
    for (var i = 0; i < view.length; i++) {
      var t = view[i];
      var tr = document.createElement("tr");
      var cells = [
        fmtTime(t.entryTime),
        t.direction,
        "$" + fmtPrice(t.entry),
        "$" + fmtPrice(t.exit),
        fmtR(t.rMultiple),
        t.reason
      ];
      for (var c = 0; c < cells.length; c++) {
        var td = document.createElement("td");
        td.textContent = cells[c];
        if (c >= 2 && c <= 4) td.className = "num";
        if (c === 4) td.style.color = t.rMultiple > 0 ? "var(--good-text)" : (t.rMultiple < 0 ? "var(--critical-text)" : "var(--text-secondary)");
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  /* ---------- Strategie-Optimierung (Walk-Forward) ---------- */
  function fmtInt(x) { return num(x) ? x.toLocaleString("de-DE", { maximumFractionDigits: 0 }) : "–"; }

  // Fortschrittszeile: Text + <progress>; ohne done/total indeterminiert.
  function setOptProgress(text, done, total) {
    var el = $("opt-progress");
    el.replaceChildren();
    if (!text) return;
    var span = document.createElement("span");
    span.className = "opt-progress-text";
    span.textContent = text;
    el.appendChild(span);
    var bar = document.createElement("progress");
    if (num(done) && num(total) && total > 0) {
      bar.max = total;
      bar.value = Math.max(0, Math.min(done, total));
    }
    el.appendChild(bar);
  }

  function makeProgress(tf) {
    return function (a, b) {
      var p = parseProgress(a, b);
      if (num(p.done) && num(p.total) && p.total > 0) {
        setOptProgress(tf + ": " + fmtInt(p.done) + " von " + fmtInt(p.total) + " Kombinationen …", p.done, p.total);
      }
    };
  }

  function saveOptResults() { LS.set("sb2_optresults", optResults); }

  function nextTick() { return new Promise(function (resolve) { setTimeout(resolve, 0); }); }

  async function runOptimization() {
    if (optRunning) return;
    var btn = $("opt-run");
    if (!XAU.opt || typeof XAU.opt.optimize !== "function") {
      setOptProgress("Optimizer-Modul nicht geladen – bitte Seite neu laden.");
      return;
    }
    optRunning = true;
    btn.disabled = true;
    var objective = $("opt-objective").value;
    LS.set("sb2_objective", objective);
    try {
      for (var i = 0; i < TFS.length; i++) {
        var tf = TFS[i];
        try {
          setOptProgress(tf + ": Lade Kursdaten (1000 Kerzen) …");
          await nextTick();
          var candles = await XAU.data.fetchKlines(tf, 1000);
          setOptProgress(tf + ": Optimierung läuft …");
          await nextTick();
          var res = await Promise.resolve(
            XAU.opt.optimize(candles, { tf: tf, objective: objective, onProgress: makeProgress(tf) })
          );
          if (!res || !validConfig(res.config) || !validStats(res.inSample) || !validStats(res.outOfSample)) {
            throw new Error("Unerwartetes Optimizer-Ergebnis");
          }
          optResults[tf] = { tf: tf, config: cleanConfig(res.config),
            inSample: cleanStats(res.inSample), outOfSample: cleanStats(res.outOfSample),
            evaluated: num(res.evaluated) ? res.evaluated : null,
            objective: objective,
            guardRelaxed: res.guardRelaxed === true };
          delete optErrors[tf];
          saveOptResults();
        } catch (e) {
          optErrors[tf] = /fetch|network|Failed|HTTP/i.test(String(e && e.message))
            ? "Kursdaten nicht abrufbar (Internet/Firewall prüfen)."
            : (e && e.message ? e.message : "Unbekannter Fehler");
        }
        (function restoreObjective() {
    var saved = LS.get("sb2_objective", null);
    if (saved === "winrate" || saved === "pf" || saved === "totalR") $("opt-objective").value = saved;
  })();
  renderOptResults();
        await nextTick();
      }
      setOptProgress("Optimierung abgeschlossen.");
    } finally {
      optRunning = false;
      btn.disabled = false;
    }
  }

  function statTiles(s, big) {
    var wrap = document.createElement("div");
    wrap.className = "opt-tiles " + (big ? "opt-tiles-big" : "opt-tiles-small");
    var tiles = [
      [fmt1(s.winrate * 100) + " %", "Winrate"],
      [fmtInt(s.n), "Trades"],
      [fmtR(s.totalR), "Gesamt-R"],
      [s.profitFactor === null ? (s.wins > 0 ? "∞" : "–") : fmtPrice(s.profitFactor), "Profit-Faktor"]
    ];
    for (var i = 0; i < tiles.length; i++) {
      var tile = document.createElement("div");
      tile.className = "stat-tile";
      var val = document.createElement("div"); val.className = "value"; val.textContent = tiles[i][0];
      var lab = document.createElement("div"); lab.className = "label"; lab.textContent = tiles[i][1];
      tile.appendChild(val); tile.appendChild(lab);
      wrap.appendChild(tile);
    }
    return wrap;
  }

  function buildOptCard(tf, res, err) {
    var card = document.createElement("div");
    card.className = "opt-tf-card";

    var head = document.createElement("div");
    head.className = "opt-tf-head";
    var name = document.createElement("strong");
    name.className = "opt-tf-name";
    name.textContent = TF_LABEL[tf] || tf;
    head.appendChild(name);
    var active = !!(res && tunedFor(tf) && configsEqual(tuned[tf], res.config));
    if (active) {
      var chip = document.createElement("span");
      chip.className = "tuned-chip";
      chip.textContent = "aktiv";
      head.appendChild(chip);
    }
    card.appendChild(head);

    if (err) {
      var pe = document.createElement("p");
      pe.className = "opt-error";
      pe.textContent = "Fehler bei der Optimierung: " + err;
      card.appendChild(pe);
      if (res) {
        var old = document.createElement("p");
        old.className = "hint";
        old.textContent = "Es wird das zuletzt gespeicherte Ergebnis angezeigt.";
        card.appendChild(old);
      }
    }
    if (!res) return card;

    var cfgLine = document.createElement("div");
    cfgLine.className = "opt-config";
    cfgLine.textContent = configLabel(res.config);
    card.appendChild(cfgLine);

    var cmp = document.createElement("div");
    cmp.className = "opt-compare";
    var oos = document.createElement("div");
    oos.className = "opt-block opt-oos";
    var oosLab = document.createElement("div");
    oosLab.className = "opt-group-label";
    oosLab.textContent = "Out-of-Sample (Walk-Forward-Test)";
    oos.appendChild(oosLab);
    oos.appendChild(statTiles(res.outOfSample, true));
    cmp.appendChild(oos);
    var ins = document.createElement("div");
    ins.className = "opt-block opt-is";
    var insLab = document.createElement("div");
    insLab.className = "opt-group-label";
    insLab.textContent = "In-Sample (Anpassung)";
    ins.appendChild(insLab);
    ins.appendChild(statTiles(res.inSample, false));
    cmp.appendChild(ins);
    card.appendChild(cmp);

    if (res.guardRelaxed) {
      var warnG = document.createElement("p");
      warnG.className = "opt-warn";
      warnG.textContent = "Mindest-Trade-Anzahl nicht erreicht – Ergebnis nicht belastbar.";
      card.appendChild(warnG);
    }
    var warnAt = res.objective === "winrate" ? 30 : 20;
    if (res.outOfSample.n < warnAt) {
      var warn = document.createElement("p");
      warn.className = "opt-warn";
      warn.textContent = "Nur " + fmtInt(res.outOfSample.n) + " Out-of-Sample-Trades (unter " + warnAt + ") – wenig Aussagekraft.";
      card.appendChild(warn);
    }
    if (num(res.evaluated)) {
      var ev = document.createElement("p");
      ev.className = "hint";
      var objName = { winrate: "Winrate", pf: "Profit-Faktor", totalR: "Gesamt-R" }[res.objective] || null;
      ev.textContent = fmtInt(res.evaluated) + " Kombinationen getestet (Walk-Forward)" +
        (objName ? " · Ziel: " + objName : "") + ".";
      card.appendChild(ev);
    }

    var actions = document.createElement("div");
    actions.className = "opt-actions";
    var apply = document.createElement("button");
    apply.textContent = active ? "Übernommen" : "Übernehmen";
    apply.disabled = active;
    apply.addEventListener("click", function () {
      tuned[tf] = cleanConfig(res.config);
      LS.set("sb2_tuned", tuned);
      renderOptResults();
      renderCards();
      renderSetup();
      scan();
    });
    actions.appendChild(apply);
    if (tunedFor(tf)) {
      var reset = document.createElement("button");
      reset.textContent = "Zurücksetzen";
      reset.addEventListener("click", function () {
        delete tuned[tf];
        LS.set("sb2_tuned", tuned);
        renderOptResults();
        renderCards();
        renderSetup();
        scan();
      });
      actions.appendChild(reset);
    }
    card.appendChild(actions);
    return card;
  }

  function buildOrphanTunedCard(tf) {
    var card = document.createElement("div");
    card.className = "opt-tf-card";
    var head = document.createElement("div"); head.className = "pair-head";
    var name = document.createElement("span"); name.textContent = TF_LABEL[tf] || tf; head.appendChild(name);
    var chip = document.createElement("span"); chip.className = "tuned-chip"; chip.textContent = "aktiv"; head.appendChild(chip);
    card.appendChild(head);
    var p = document.createElement("p"); p.className = "hint";
    p.textContent = "Optimierte Parameter sind aktiv (" + configLabel(tuned[tf]) + "), die Ergebnisdetails liegen nicht mehr vor.";
    card.appendChild(p);
    var row = document.createElement("div"); row.className = "opt-actions";
    var btn = document.createElement("button"); btn.textContent = "Zurücksetzen";
    btn.addEventListener("click", function () {
      delete tuned[tf]; LS.set("sb2_tuned", tuned);
      renderOptResults(); scan();
    });
    row.appendChild(btn); card.appendChild(row);
    return card;
  }

  function renderOptResults() {
    var wrap = $("opt-results");
    wrap.replaceChildren();
    var shown = 0;
    for (var i = 0; i < TFS.length; i++) {
      var tf = TFS[i];
      if (!optResults[tf] && !optErrors[tf]) {
        if (tunedFor(tf)) wrap.appendChild(buildOrphanTunedCard(tf));
        continue;
      }
      shown++;
      wrap.appendChild(buildOptCard(tf, optResults[tf] || null, optErrors[tf] || null));
    }
    if (!shown) {
      var p = document.createElement("p");
      p.className = "hint";
      p.textContent = "Noch keine Optimierung gelaufen – „Alle Timeframes optimieren“ startet den Walk-Forward-Test.";
      wrap.appendChild(p);
    }
  }

  /* ---------- Signal-Verlauf (nur 1h und 4h) ---------- */
  function recordSignal(tf, result) {
    if (result.action === "NEUTRAL") {
      if (lastAction[tf]) { delete lastAction[tf]; LS.set("sb2_lastaction", lastAction); }
      return;
    }
    if (lastAction[tf] === result.action) return;
    lastAction[tf] = result.action;
    LS.set("sb2_lastaction", lastAction);
    history.unshift({
      time: Date.now(), tf: tf, action: result.action,
      score: result.score, price: result.price, reasons: result.reasons
    });
    history = history.slice(0, 300);
    LS.set("sb2_history", history);
  }

  function renderHistory() {
    var tbody = $("histrows");
    tbody.replaceChildren();
    if (!history.length) {
      var tr0 = document.createElement("tr");
      var td0 = document.createElement("td");
      td0.colSpan = 6;
      td0.textContent = "Noch keine Signalwechsel aufgezeichnet (entsteht, während das Dashboard offen ist).";
      td0.style.color = "var(--text-muted)";
      tr0.appendChild(td0);
      tbody.appendChild(tr0);
      return;
    }
    var view = history.slice(0, 60);
    for (var i = 0; i < view.length; i++) {
      var h = view[i];
      var tr = document.createElement("tr");
      var cells = [
        fmtTime(h.time),
        TF_LABEL[h.tf] || h.tf,
        null, // Badge
        (h.score > 0 ? "+" : "") + h.score,
        "$" + fmtPrice(h.price),
        (h.reasons || []).join(", ")
      ];
      for (var c = 0; c < cells.length; c++) {
        var td = document.createElement("td");
        if (c === 2) td.appendChild(makeBadge(h.action, false));
        else td.textContent = cells[c];
        if (c === 3 || c === 4) td.className = "num";
        if (c === 5) td.style.color = "var(--text-secondary)";
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  /* ---------- Gold-Wissen (statisch) ---------- */
  function renderGoldInfo() {
    var el = $("gold-info");
    el.replaceChildren();
    function h3(t) { var e = document.createElement("h3"); e.textContent = t; el.appendChild(e); }
    function p(t) { var e = document.createElement("p"); e.textContent = t; el.appendChild(e); }
    function ul(items) {
      var e = document.createElement("ul");
      for (var i = 0; i < items.length; i++) {
        var li = document.createElement("li"); li.textContent = items[i]; e.appendChild(li);
      }
      el.appendChild(e);
    }
    h3("Handelszeiten & Sessions");
    p("Der Spot-Goldmarkt handelt Sonntagabend bis Freitagabend (UTC) fast rund um die Uhr. " +
      "Die meiste Bewegung entsteht in der London-Session (ab ca. 7 Uhr UTC) und besonders in der " +
      "Überlappung London+New York (ca. 12–16 Uhr UTC). Die Asien-Session ist meist ruhig – " +
      "gut für Range-Strategien, schlecht für Ausbrüche.");
    h3("Was Gold bewegt");
    ul([
      "Realzinsen: steigende US-Realrenditen belasten Gold (zinsloses Asset), fallende stützen es.",
      "US-Dollar (DXY): starker Dollar drückt den Goldpreis, schwacher Dollar hebt ihn.",
      "Geopolitik & Krisen: Gold ist der klassische sichere Hafen – Spitzen bei Unsicherheit.",
      "Notenbanken: Zinsentscheide (Fed!) und physische Käufe der Zentralbanken prägen den Trend."
    ]);
    h3("Typische Volatilität");
    p("Als grober Anhaltspunkt dient der ATR(14): auf Tagesbasis oft rund 1–2 % des Kurses. " +
      "Stops unterhalb von ca. 1,5 × ATR werden häufig vom normalen Rauschen ausgelöst – " +
      "deshalb rechnet das Setup hier mit 1,5 × ATR Abstand. Um US-Daten (CPI, NFP, Fed) kann sich " +
      "die Spanne kurzfristig vervielfachen.");
    h3("Warum PAXG/USDT?");
    p("PAXG (Pax Gold) ist tokenisiertes physisches Gold: 1 PAXG entspricht 1 Feinunze in Londoner Tresoren. " +
      "Der Kurs läuft eng am XAU/USD-Spotpreis, kleine Abweichungen (Premium/Spread) sind möglich. " +
      "Vorteil für dieses Dashboard: frei zugängliche Kursdaten und Handel auch am Wochenende, " +
      "während der Spotmarkt geschlossen ist.");
  }

  /* ---------- Theme ---------- */
  function applySavedTheme() {
    var saved = LS.get("sb2_theme", null);
    if (saved) document.documentElement.dataset.theme = saved;
  }
  function toggleTheme() {
    var cur = document.documentElement.dataset.theme ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    var next = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    LS.set("sb2_theme", next);
    renderChart(); // Canvas mit neuen Farben neu zeichnen
  }

  /* ---------- Verdrahtung + Start ---------- */
  $("refresh").addEventListener("click", function () { scan(); });
  $("themetoggle").addEventListener("click", toggleTheme);
  $("chart-tf").addEventListener("change", function () { renderCards(); renderChart(); });
  $("acct-size").addEventListener("input", renderSizer);
  $("risk-pct").addEventListener("input", renderSizer);
  $("alert-add").addEventListener("click", addAlert);
  $("alert-price").addEventListener("keydown", function (e) { if (e.key === "Enter") addAlert(); });
  $("bt-run").addEventListener("click", function () { runBacktest(); });
  $("opt-run").addEventListener("click", function () { runOptimization(); });
  $("clearhist").addEventListener("click", function () {
    history = []; lastAction = {};
    LS.set("sb2_history", history);
    LS.set("sb2_lastaction", lastAction);
    renderHistory();
  });
  window.addEventListener("resize", function () { renderChart(); });

  applySavedTheme();
  renderGoldInfo();
  renderCards();
  renderConfluence();
  renderSetup();
  renderHistory();
  renderAlerts();
  renderOptResults();
  scan();
  setInterval(scan, 60000);
})();
if (typeof module !== "undefined") module.exports = (typeof window !== "undefined" ? window : globalThis).XAU.data;

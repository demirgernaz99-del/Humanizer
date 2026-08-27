/* XAU.fast – Schnelle Score-Serien für Backtest & Optimizer (XAU/USD).
   Berechnet alle Indikator-Serien EINMAL über die volle Historie und leitet daraus
   je Kerze den Score mit EXAKT den Regeln aus XAU.engine.analyzeTF ab.
   Da alle Indikatoren kausal sind (Vorwärts-Rekursion bzw. Fenster), gilt:
     score[i] === XAU.engine.analyzeTF(candles.slice(0, i+1)).score  (für i >= MIN_CANDLES-1)
   Alle Rückgabe-Serien sind rechtsbündig und gleich lang wie candles; führende
   Kerzen ohne Wert tragen null. Nie werfen – im Zweifel leere/null-Serien. */
(function () {
  "use strict";
  var root = (typeof window !== "undefined") ? window : globalThis;
  root.XAU = root.XAU || {};

  // In Node: Indikatoren defensiv lokal laden; im Browser hängt XAU.ind am globalen Objekt.
  var indLocal = null;
  if (typeof module !== "undefined" && typeof require === "function") {
    try { indLocal = require("./indicators.js"); } catch (e) { indLocal = null; }
  }
  function getInd() { return root.XAU.ind || indLocal || null; }

  var MIN_CANDLES = 220; // identisch zu XAU.engine (wegen EMA200)
  var MAX_SCORE = 9;

  function num(x) { return typeof x === "number" && isFinite(x); }
  function clampScore(s) { return Math.max(-MAX_SCORE, Math.min(MAX_SCORE, s)); }

  // Rechtsbündige Serie: series[i - offset] gehört zur Kerze i. Außerhalb: null.
  function at(series, idx) {
    if (!series || idx < 0 || idx >= series.length) return null;
    var v = series[idx];
    return (v === undefined) ? null : v;
  }

  function emptyResult() {
    return {
      score: [], atr: [], time: [], close: [], utcHour: [],
      // v3-Feature-Serien (rechtsbündig, führend null, strikt kausal aus Bars <= i)
      volumeRel: [], atrSpike: [],
      bullDiv: [], bearDiv: [],
      bullEngulf: [], bearEngulf: [],
      bullPin: [], bearPin: []
    };
  }

  var FEATURE_KEYS = ["volumeRel", "atrSpike", "bullDiv", "bearDiv",
    "bullEngulf", "bearEngulf", "bullPin", "bearPin"];

  function ohlcOk(c) {
    return !!c && num(c.open) && num(c.high) && num(c.low) && num(c.close);
  }

  function computeSeries(candles) {
    var res = emptyResult();
    if (!Array.isArray(candles) || candles.length === 0) return res;
    var ind = getInd();
    var n = candles.length;

    // Basis-Serien (time/close/utcHour) immer über die volle Länge füllen.
    var i, c;
    for (i = 0; i < n; i++) {
      c = candles[i];
      var t = (c && num(c.time)) ? c.time : null;
      res.time.push(t);
      res.close.push((c && num(c.close)) ? c.close : null);
      // Deterministisch aus dem Kerzen-Timestamp (ms, UTC) – keine Date.now()-Abhängigkeit.
      res.utcHour.push(t === null ? null : new Date(t).getUTCHours());
      res.score.push(null);
      res.atr.push(null);
      for (var fk = 0; fk < FEATURE_KEYS.length; fk++) res[FEATURE_KEYS[fk]].push(null);
    }
    if (!ind) return res;

    // Engine-Parität: analyzeTF liefert null, sobald der Prefix eine ungültige
    // Kerze enthält -> ab der ersten ungültigen Kerze bleibt score null.
    var clean = n;
    for (i = 0; i < n; i++) {
      c = candles[i];
      if (!c || !num(c.close)) { clean = i; break; }
    }
    var work = (clean === n) ? candles : candles.slice(0, clean);
    if (work.length === 0) return res;

    var closes = [];
    for (i = 0; i < work.length; i++) closes.push(work[i].close);

    // Alle Indikator-Serien einmal über die volle (saubere) Historie.
    var rsiArr = ind.rsi(closes, 14) || [];                                   // offset 14
    var macdRes = ind.macd(closes, 12, 26, 9) || { hist: [] };
    var hist = macdRes.hist || [];                                            // offset 33 (=25+8)
    var e50 = ind.ema(closes, 50) || [];                                      // offset 49
    var e200 = ind.ema(closes, 200) || [];                                    // offset 199
    var bb = ind.bollinger(closes, 20, 2) || [];                              // offset 19
    var st = ind.stochastic(work, 14, 3, 3) || { k: [], d: [] };
    var kArr = st.k || [];                                                    // offset 15
    var dArr = st.d || [];                                                    // offset 17
    var atrArr = ind.atr(work, 14) || [];                                     // offset 14
    var adxRes = ind.adx(work, 14) || { adx: [] };
    var adxArr = adxRes.adx || [];                                            // offset 27 (=13+14)

    for (i = 0; i < work.length; i++) {
      var a = at(atrArr, i - 14);
      res.atr[i] = num(a) ? a : null;
      if (i < MIN_CANDLES - 1) continue; // analyzeTF verlangt >= 220 Kerzen -> score bleibt null

      var price = closes[i];
      var s = 0;

      // RSI(14) – Zonen exakt wie engine.js
      var rsiNow = at(rsiArr, i - 14);
      if (num(rsiNow)) {
        if (rsiNow < 30) s += 2;
        else if (rsiNow < 40) s += 1;
        else if (rsiNow > 70) s -= 2;
        else if (rsiNow > 60) s -= 1;
      }

      // MACD-Histogramm mit Epsilon gegen Rundungsrauschen + Kreuz-Logik
      var eps = Math.abs(price) * 1e-9;
      var histNow = at(hist, i - 33);
      var histPrev = at(hist, i - 34);
      if (num(histNow) && Math.abs(histNow) <= eps) histNow = 0;
      if (num(histPrev) && Math.abs(histPrev) <= eps) histPrev = 0;
      if (num(histNow)) {
        if (num(histPrev) && histPrev <= 0 && histNow > 0) s += 2;
        else if (num(histPrev) && histPrev >= 0 && histNow < 0) s -= 2;
        else if (histNow > 0) s += 1;
        else if (histNow < 0) s -= 1;
      }

      // EMA50 / EMA200
      var ema50 = at(e50, i - 49);
      var ema200 = at(e200, i - 199);
      var above50 = null, above200 = null;
      if (num(ema50)) { above50 = price > ema50; s += above50 ? 1 : -1; }
      if (num(ema200)) { above200 = price > ema200; s += above200 ? 1 : -1; }

      // Bollinger(20, 2)
      var bbRow = at(bb, i - 19);
      var bbLower = bbRow ? bbRow[0] : null;
      var bbUpper = bbRow ? bbRow[2] : null;
      if (num(bbLower) && price < bbLower) s += 1;
      else if (num(bbUpper) && price > bbUpper) s -= 1;

      // Slow-Stochastik(14, 3, 3): Kreuzungen in Extremzonen
      var kNow = at(kArr, i - 15), kPrev = at(kArr, i - 16);
      var dNow = at(dArr, i - 17), dPrev = at(dArr, i - 18);
      if (num(kNow) && num(dNow) && num(kPrev) && num(dPrev)) {
        if (kNow < 20 && kPrev <= dPrev && kNow > dNow) s += 1;
        else if (kNow > 80 && kPrev >= dPrev && kNow < dNow) s -= 1;
      }

      // ADX(14): starker Trend verstärkt gleichgerichtete EMA-Signale
      var adxNow = at(adxArr, i - 27);
      if (num(adxNow) && adxNow > 25 && above50 !== null && above200 !== null && above50 === above200) {
        s += above50 ? 1 : -1;
      }

      res.score[i] = clampScore(s);
    }

    computeFeatureSeries(res, work, closes, rsiArr);
    return res;
  }

  /* v3-Feature-Serien – alle strikt kausal (nur Bars <= i), rechtsbündig,
     führend null. Wird nur über den "sauberen" Prefix (work) berechnet;
     dahinter bleibt alles null (wie score). */
  var VOL_PERIOD = 20;      // volumeRel: SMA(volume, 20)
  var DIV_FAR = 30;         // Divergenz-Fenster [i-30, i-5]
  var DIV_NEAR = 5;
  var DIV_RSI_GAP = 2;      // RSI-Mindestabstand für Divergenz
  var RSI_OFFSET = 14;      // rsiArr[k - 14] gehört zu Kerze k

  function computeFeatureSeries(res, work, closes, rsiArr) {
    var n = work.length;
    var i, k, c;

    // --- volumeRel[i] = volume[i] / SMA(volume, 20)[i] (rollend, nur Bars <= i) ---
    var vols = new Array(n);
    for (i = 0; i < n; i++) {
      c = work[i];
      vols[i] = (c && num(c.volume)) ? c.volume : null;
    }
    var volSum = 0, volBad = 0;
    for (i = 0; i < n; i++) {
      if (vols[i] === null) volBad++; else volSum += vols[i];
      if (i >= VOL_PERIOD) {
        if (vols[i - VOL_PERIOD] === null) volBad--; else volSum -= vols[i - VOL_PERIOD];
      }
      if (i >= VOL_PERIOD - 1 && volBad === 0 && vols[i] !== null) {
        var smaVol = volSum / VOL_PERIOD;
        res.volumeRel[i] = (smaVol > 0) ? vols[i] / smaVol : null;
      }
    }

    // --- atrSpike[i] = (high-low) / atr[i] (null wenn atr null/0) ---
    for (i = 0; i < n; i++) {
      c = work[i];
      var a = res.atr[i];
      if (num(a) && a !== 0 && c && num(c.high) && num(c.low)) {
        res.atrSpike[i] = (c.high - c.low) / a;
      }
    }

    // --- RSI-Divergenzen: Extrem-Close j in [i-30, i-5] vs. aktuelle Kerze i ---
    for (i = DIV_FAR; i < n; i++) {
      var rNow = at(rsiArr, i - RSI_OFFSET);
      if (!num(rNow)) continue; // RSI fehlt -> null
      var jMin = i - DIV_FAR, jMax = i - DIV_FAR;
      for (k = i - DIV_FAR + 1; k <= i - DIV_NEAR; k++) {
        if (closes[k] < closes[jMin]) jMin = k; // erster tiefster Close gewinnt
        if (closes[k] > closes[jMax]) jMax = k; // erster höchster Close gewinnt
      }
      var rMin = at(rsiArr, jMin - RSI_OFFSET);
      var rMax = at(rsiArr, jMax - RSI_OFFSET);
      if (num(rMin)) res.bullDiv[i] = (closes[i] < closes[jMin] && rNow > rMin + DIV_RSI_GAP);
      if (num(rMax)) res.bearDiv[i] = (closes[i] > closes[jMax] && rNow < rMax - DIV_RSI_GAP);
    }

    // --- Engulfing (braucht Vorkerze) & Pin-Bars (Einzelkerze) ---
    for (i = 0; i < n; i++) {
      c = work[i];
      if (!ohlcOk(c)) continue; // OHLC unvollständig -> null
      var range = c.high - c.low;
      var body = Math.abs(c.close - c.open);
      var bTop = Math.max(c.open, c.close);
      var bBot = Math.min(c.open, c.close);
      var lowerWick = bBot - c.low;
      var upperWick = c.high - bTop;

      // Pin: Docht >= 2x Körper und >= 60% der Range (range > 0 verlangt)
      res.bullPin[i] = range > 0 && lowerWick >= 2 * body && lowerWick >= 0.6 * range;
      res.bearPin[i] = range > 0 && upperWick >= 2 * body && upperWick >= 0.6 * range;

      if (i === 0) continue; // Engulfing braucht Bar i-1 -> führend null
      var p = work[i - 1];
      if (!ohlcOk(p)) continue;
      var pTop = Math.max(p.open, p.close);
      var pBot = Math.min(p.open, p.close);
      // Körper i umschließt Körper i-1 (inklusive), Körper i >= 50% der Range i
      var enclose = bTop >= pTop && bBot <= pBot && range > 0 && body >= 0.5 * range;
      res.bullEngulf[i] = enclose && c.close > c.open && p.close < p.open;
      res.bearEngulf[i] = enclose && c.close < c.open && p.close > p.open;
    }
  }

  // Median der positiven openTime-Abstände einer Kerzenreihe (Bar-Intervall in ms).
  function medianStep(candles) {
    if (!Array.isArray(candles) || candles.length < 2) return null;
    var diffs = [];
    for (var i = 1; i < candles.length; i++) {
      var a = candles[i - 1], b = candles[i];
      if (!a || !b || !num(a.time) || !num(b.time)) continue;
      var d = b.time - a.time;
      if (d > 0) diffs.push(d);
    }
    if (!diffs.length) return null;
    diffs.sort(function (x, y) { return x - y; });
    var m = diffs.length >> 1;
    return (diffs.length % 2 === 1) ? diffs[m] : (diffs[m - 1] + diffs[m]) / 2;
  }

  /* mapHTFScore(lowCandles, htfPre, htfCandles) -> Array (Länge lowCandles).
     Wert[i] = htfPre.score[j] des LETZTEN Higher-TF-Bars j, dessen Bar-ENDE
     (openTime + Intervall) <= Bar-ENDE des Low-Bars i ist. Ein HTF-Bar, der exakt
     am Low-Bar-Ende endet, zählt als geschlossen (<=). Der noch LAUFENDE HTF-Bar
     fließt damit NIE ein (Leck-Kante). Intervalle = Median der openTime-Abstände
     beider Reihen. Im Zweifel null; wirft nie. */
  function mapHTFScore(lowCandles, htfPre, htfCandles) {
    if (!Array.isArray(lowCandles)) return [];
    var n = lowCandles.length;
    var out = new Array(n);
    var i;
    for (i = 0; i < n; i++) out[i] = null;
    if (!htfPre || !Array.isArray(htfPre.score) || !Array.isArray(htfCandles)) return out;
    var lowStep = medianStep(lowCandles);
    var htfStep = medianStep(htfCandles);
    if (!num(lowStep) || !num(htfStep)) return out;

    var j = -1; // Index des letzten GESCHLOSSENEN HTF-Bars
    for (i = 0; i < n; i++) {
      var c = lowCandles[i];
      if (!c || !num(c.time)) continue; // Low-Bar ohne Zeit -> null
      var lowEnd = c.time + lowStep;
      while (j + 1 < htfCandles.length) {
        var h = htfCandles[j + 1];
        if (h && num(h.time) && h.time + htfStep <= lowEnd) j++;
        else break;
      }
      if (j >= 0 && j < htfPre.score.length && htfPre.score[j] !== undefined) {
        out[i] = htfPre.score[j];
      }
    }
    return out;
  }

  // Action-Ableitung aus einem Score-Wert – identisch zur engine-Regel.
  function actionAt(score, threshold) {
    var th = num(threshold) ? threshold : 4;
    if (!num(score)) return "NEUTRAL";
    return score >= th ? "BUY" : (score <= -th ? "SELL" : "NEUTRAL");
  }

  root.XAU.fast = {
    MIN_CANDLES: MIN_CANDLES,
    MAX_SCORE: MAX_SCORE,
    computeSeries: computeSeries,
    actionAt: actionAt,
    mapHTFScore: mapHTFScore
  };
})();
if (typeof module !== "undefined") module.exports = (typeof window !== "undefined" ? window : globalThis).XAU.fast;

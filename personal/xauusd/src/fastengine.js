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
    return { score: [], atr: [], time: [], close: [], utcHour: [] };
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
    return res;
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
    actionAt: actionAt
  };
})();
if (typeof module !== "undefined") module.exports = (typeof window !== "undefined" ? window : globalThis).XAU.fast;

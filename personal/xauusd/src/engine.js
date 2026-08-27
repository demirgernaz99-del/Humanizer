/* XAU.engine – Signal-Engine für XAU/USD: Scoring pro Timeframe + Konfluenz. */
(function () {
  var root = (typeof window !== 'undefined') ? window : globalThis;
  root.XAU = root.XAU || {};

  // In Node: Indikatoren lokal laden; im Browser hängt XAU.ind am globalen Objekt.
  var indLocal = null;
  if (typeof module !== 'undefined' && typeof require === 'function') {
    try { indLocal = require('./indicators.js'); } catch (e) { indLocal = null; }
  }
  function getInd() { return indLocal || root.XAU.ind || null; }

  var MIN_CANDLES = 220; // wegen EMA200

  function num(x) { return typeof x === 'number' && isFinite(x); }
  function last(a) { return (a && a.length) ? a[a.length - 1] : null; }
  function f1(x) { return num(x) ? x.toFixed(1) : '–'; }
  var MAX_SCORE = 9; // Summe aller Regel-Maxima (2+2+1+1+1+1+1)
  function clampScore(s) { return Math.max(-MAX_SCORE, Math.min(MAX_SCORE, s)); }

  function analyzeTF(candles, opts) {
    var ind = getInd();
    if (!ind || !Array.isArray(candles) || candles.length < MIN_CANDLES) return null;
    var closes = [];
    for (var i = 0; i < candles.length; i++) {
      var c = candles[i];
      if (!c || !num(c.close)) return null;
      closes.push(c.close);
    }
    var price = closes[closes.length - 1];
    var reasons = [];
    var score = 0;

    // RSI(14)
    var rsiSeries = ind.rsi(closes, 14) || [];
    var rsiNow = last(rsiSeries);
    if (num(rsiNow)) {
      if (rsiNow < 30) { score += 2; reasons.push('RSI stark überverkauft (' + f1(rsiNow) + ')'); }
      else if (rsiNow < 40) { score += 1; reasons.push('RSI überverkauft (' + f1(rsiNow) + ')'); }
      else if (rsiNow > 70) { score -= 2; reasons.push('RSI stark überkauft (' + f1(rsiNow) + ')'); }
      else if (rsiNow > 60) { score -= 1; reasons.push('RSI überkauft (' + f1(rsiNow) + ')'); }
    }

    // MACD-Histogramm mit Epsilon gegen Rundungsrauschen
    var macdRes = ind.macd(closes, 12, 26, 9) || { hist: [] };
    var hist = macdRes.hist || [];
    var eps = Math.abs(price) * 1e-9;
    var histNow = last(hist);
    var histPrev = (hist.length > 1) ? hist[hist.length - 2] : null;
    if (num(histNow) && Math.abs(histNow) <= eps) histNow = 0;
    if (num(histPrev) && Math.abs(histPrev) <= eps) histPrev = 0;
    if (num(histNow)) {
      if (num(histPrev) && histPrev <= 0 && histNow > 0) {
        score += 2; reasons.push('MACD-Histogramm kreuzt nach oben (' + f1(histNow) + ')');
      } else if (num(histPrev) && histPrev >= 0 && histNow < 0) {
        score -= 2; reasons.push('MACD-Histogramm kreuzt nach unten (' + f1(histNow) + ')');
      } else if (histNow > 0) {
        score += 1; reasons.push('MACD-Momentum positiv (' + f1(histNow) + ')');
      } else if (histNow < 0) {
        score -= 1; reasons.push('MACD-Momentum negativ (' + f1(histNow) + ')');
      }
    }

    // EMA50 / EMA200
    var ema50 = last(ind.ema(closes, 50) || []);
    var ema200 = last(ind.ema(closes, 200) || []);
    var above50 = null, above200 = null;
    if (num(ema50)) {
      above50 = price > ema50;
      if (above50) { score += 1; reasons.push('Kurs (' + f1(price) + ') über EMA50 (' + f1(ema50) + ') – Aufwärtstrend'); }
      else { score -= 1; reasons.push('Kurs (' + f1(price) + ') unter EMA50 (' + f1(ema50) + ') – Abwärtstrend'); }
    }
    if (num(ema200)) {
      above200 = price > ema200;
      if (above200) { score += 1; reasons.push('Kurs (' + f1(price) + ') über EMA200 (' + f1(ema200) + ') – langfristiger Aufwärtstrend'); }
      else { score -= 1; reasons.push('Kurs (' + f1(price) + ') unter EMA200 (' + f1(ema200) + ') – langfristiger Abwärtstrend'); }
    }

    // Bollinger(20, 2)
    var bb = ind.bollinger(closes, 20, 2) || [];
    var bbNow = last(bb);
    var bbLower = null, bbMid = null, bbUpper = null;
    if (bbNow) { bbLower = bbNow[0]; bbMid = bbNow[1]; bbUpper = bbNow[2]; }
    if (num(bbLower) && price < bbLower) { score += 1; reasons.push('Kurs unter unterem Bollinger-Band (' + f1(bbLower) + ')'); }
    else if (num(bbUpper) && price > bbUpper) { score -= 1; reasons.push('Kurs über oberem Bollinger-Band (' + f1(bbUpper) + ')'); }

    // Slow-Stochastik(14, 3, 3): Kreuzungen in Extremzonen
    var st = ind.stochastic(candles, 14, 3, 3) || { k: [], d: [] };
    var kArr = st.k || [], dArr = st.d || [];
    var kNow = last(kArr), dNow = last(dArr);
    var kPrev = (kArr.length > 1) ? kArr[kArr.length - 2] : null;
    var dPrev = (dArr.length > 1) ? dArr[dArr.length - 2] : null;
    if (num(kNow) && num(dNow) && num(kPrev) && num(dPrev)) {
      if (kNow < 20 && kPrev <= dPrev && kNow > dNow) {
        score += 1; reasons.push('Stochastik: %K (' + f1(kNow) + ') kreuzt über %D (' + f1(dNow) + ') im überverkauften Bereich');
      } else if (kNow > 80 && kPrev >= dPrev && kNow < dNow) {
        score -= 1; reasons.push('Stochastik: %K (' + f1(kNow) + ') kreuzt unter %D (' + f1(dNow) + ') im überkauften Bereich');
      }
    }

    // ATR(14) – nur informativ für Setup/Backtest
    var atrNow = last(ind.atr(candles, 14) || []);

    // ADX(14): starker Trend verstärkt gleichgerichtete EMA-Signale
    var adxRes = ind.adx(candles, 14) || { adx: [], plusDI: [], minusDI: [] };
    var adxNow = last(adxRes.adx || []);
    var plusDI = last(adxRes.plusDI || []);
    var minusDI = last(adxRes.minusDI || []);
    if (num(adxNow) && adxNow > 25 && above50 !== null && above200 !== null && above50 === above200) {
      score += above50 ? 1 : -1;
      reasons.push('Starker Trend (ADX ' + f1(adxNow) + ') bestätigt Richtung');
    }

    score = clampScore(score);
    // Optionaler Threshold (default 4) – beeinflusst NUR die action-Ableitung aus dem Score.
    var threshold = (opts && num(opts.threshold)) ? opts.threshold : 4;
    var action = score >= threshold ? 'BUY' : (score <= -threshold ? 'SELL' : 'NEUTRAL');
    return {
      action: action,
      score: score,
      maxScore: MAX_SCORE,
      confidence: Math.round((Math.abs(score) / MAX_SCORE) * 100) / 100,
      price: price,
      indicators: {
        rsi: num(rsiNow) ? rsiNow : null,
        macd_hist: num(histNow) ? histNow : null,
        ema50: num(ema50) ? ema50 : null,
        ema200: num(ema200) ? ema200 : null,
        bb_lower: num(bbLower) ? bbLower : null,
        bb_mid: num(bbMid) ? bbMid : null,
        bb_upper: num(bbUpper) ? bbUpper : null,
        stoch_k: num(kNow) ? kNow : null,
        stoch_d: num(dNow) ? dNow : null,
        atr: num(atrNow) ? atrNow : null,
        adx: num(adxNow) ? adxNow : null,
        plus_di: num(plusDI) ? plusDI : null,
        minus_di: num(minusDI) ? minusDI : null
      },
      reasons: reasons
    };
  }

  function confluence(byTF) {
    byTF = byTF || {};
    var tfs = ['15m', '1h', '4h', '1d'];
    var perTF = {};
    var total = 0;
    for (var i = 0; i < tfs.length; i++) {
      var r = byTF[tfs[i]];
      if (r && r.action) { perTF[tfs[i]] = r.action; total++; }
    }
    var base = byTF['1h'];
    if (!base || !base.action || base.action === 'NEUTRAL') {
      return { action: 'NEUTRAL', agree: 0, total: total, summary: 'Kein klares 1h-Signal – Markt neutral', perTF: perTF };
    }
    var action = base.action;
    var agree = 0;
    for (var j = 0; j < tfs.length; j++) {
      var rj = byTF[tfs[j]];
      if (rj && rj.action === action) agree++;
    }
    // 4h-Veto: 1h-Signal gegen den übergeordneten Trend wird neutralisiert
    var h4 = byTF['4h'];
    if (h4 && num(h4.score) && ((action === 'BUY' && h4.score < 0) || (action === 'SELL' && h4.score > 0))) {
      return { action: 'NEUTRAL', agree: agree, total: total, summary: '1h-Signal steht gegen den 4h-Trend – abwarten', perTF: perTF };
    }
    var richtung = action === 'BUY' ? 'bullisch' : 'bärisch';
    return {
      action: action,
      agree: agree,
      total: total,
      summary: agree <= 1
        ? action + ' nur auf 1h – ohne Bestätigung anderer Timeframes (schwache Konfluenz)'
        : action + '-Konfluenz: ' + agree + ' von ' + total + ' Timeframes ' + richtung,
      perTF: perTF
    };
  }

  root.XAU.engine = { MIN_CANDLES: MIN_CANDLES, analyzeTF: analyzeTF, confluence: confluence };
})();
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).XAU.engine;

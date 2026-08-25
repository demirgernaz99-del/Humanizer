/* Indikatoren + Signal-Engine — 1:1-Port von app/signals/ (Python).
   Läuft im Browser und in Node (für Paritätstests). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SignalEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  function sma(values, period) {
    if (values.length < period) return [];
    const out = [];
    let s = 0;
    for (let i = 0; i < period; i++) s += values[i];
    out.push(s / period);
    for (let i = period; i < values.length; i++) {
      s += values[i] - values[i - period];
      out.push(s / period);
    }
    return out;
  }

  function ema(values, period) {
    if (values.length < period) return [];
    const k = 2 / (period + 1);
    let s = 0;
    for (let i = 0; i < period; i++) s += values[i];
    const out = [s / period];
    for (let i = period; i < values.length; i++) {
      out.push(values[i] * k + out[out.length - 1] * (1 - k));
    }
    return out;
  }

  function rsi(values, period = 14) {
    if (values.length <= period) return [];
    const gains = [], losses = [];
    for (let i = 1; i < values.length; i++) {
      const ch = values[i] - values[i - 1];
      gains.push(Math.max(ch, 0));
      losses.push(Math.max(-ch, 0));
    }
    let avgGain = 0, avgLoss = 0;
    for (let i = 0; i < period; i++) { avgGain += gains[i]; avgLoss += losses[i]; }
    avgGain /= period; avgLoss /= period;
    const calc = (g, l) => (l === 0 ? 100 : 100 - 100 / (1 + g / l));
    const out = [calc(avgGain, avgLoss)];
    for (let i = period; i < gains.length; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
      out.push(calc(avgGain, avgLoss));
    }
    return out;
  }

  function macd(values, fast = 12, slow = 26, signal = 9) {
    const emaFast = ema(values, fast);
    const emaSlow = ema(values, slow);
    if (!emaSlow.length) return { macdLine: [], signalLine: [], hist: [] };
    const offset = slow - fast;
    const macdLine = [];
    for (let i = 0; i < emaSlow.length; i++) macdLine.push(emaFast[i + offset] - emaSlow[i]);
    const signalLine = ema(macdLine, signal);
    if (!signalLine.length) return { macdLine, signalLine: [], hist: [] };
    const hist = [];
    for (let i = 0; i < signalLine.length; i++) hist.push(macdLine[i + signal - 1] - signalLine[i]);
    return { macdLine, signalLine, hist };
  }

  function bollinger(values, period = 20, numStd = 2.0) {
    if (values.length < period) return [];
    const out = [];
    for (let i = period - 1; i < values.length; i++) {
      const win = values.slice(i - period + 1, i + 1);
      const mean = win.reduce((a, b) => a + b, 0) / period;
      const variance = win.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
      const std = Math.sqrt(variance);
      out.push([mean - numStd * std, mean, mean + numStd * std]);
    }
    return out;
  }

  const MIN_CANDLES = 60;

  function analyze(closes) {
    if (closes.length < MIN_CANDLES) throw new Error(`Mindestens ${MIN_CANDLES} Kerzen nötig`);
    const price = closes[closes.length - 1];
    const reasons = [];
    let score = 0;

    const rsiSeries = rsi(closes, 14);
    const rsiNow = rsiSeries[rsiSeries.length - 1];
    if (rsiNow < 30) { score += 2; reasons.push(`RSI stark überverkauft (${rsiNow.toFixed(1)})`); }
    else if (rsiNow < 40) { score += 1; reasons.push(`RSI überverkauft (${rsiNow.toFixed(1)})`); }
    else if (rsiNow > 70) { score -= 2; reasons.push(`RSI stark überkauft (${rsiNow.toFixed(1)})`); }
    else if (rsiNow > 60) { score -= 1; reasons.push(`RSI überkauft (${rsiNow.toFixed(1)})`); }

    const { hist } = macd(closes);
    const eps = Math.abs(price) * 1e-9;
    let histNow = hist[hist.length - 1]; if (Math.abs(histNow) <= eps) histNow = 0;
    let histPrev = hist[hist.length - 2]; if (Math.abs(histPrev) <= eps) histPrev = 0;
    if (histPrev <= 0 && histNow > 0) { score += 2; reasons.push("MACD-Histogramm kreuzt nach oben"); }
    else if (histPrev >= 0 && histNow < 0) { score -= 2; reasons.push("MACD-Histogramm kreuzt nach unten"); }
    else if (histNow > 0) { score += 1; reasons.push("MACD-Momentum positiv"); }
    else { score -= 1; reasons.push("MACD-Momentum negativ"); }

    const emaSeries = ema(closes, 50);
    const ema50 = emaSeries[emaSeries.length - 1];
    if (price > ema50) { score += 1; reasons.push("Kurs über EMA50 (Aufwärtstrend)"); }
    else { score -= 1; reasons.push("Kurs unter EMA50 (Abwärtstrend)"); }

    const bb = bollinger(closes, 20);
    const [lower, mid, upper] = bb[bb.length - 1];
    if (price < lower) { score += 1; reasons.push("Kurs unter unterem Bollinger-Band"); }
    else if (price > upper) { score -= 1; reasons.push("Kurs über oberem Bollinger-Band"); }

    const action = score >= 3 ? "BUY" : score <= -3 ? "SELL" : "NEUTRAL";
    return {
      action, score,
      confidence: Math.round(Math.min(Math.abs(score) / 6, 1) * 100) / 100,
      price,
      indicators: { rsi: rsiNow, macd_hist: histNow, ema50, bb_lower: lower, bb_mid: mid, bb_upper: upper },
      reasons,
    };
  }

  return { sma, ema, rsi, macd, bollinger, analyze, MIN_CANDLES };
});

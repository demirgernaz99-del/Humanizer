/* XAU.ind — Technische Indikatoren für das XAU/USD-Dashboard.
   Alle Rückgaben rechtsbündig: letztes Element gehört zur letzten Kerze.
   Ausnahmefälle werfen nie, sondern liefern leere Arrays / null. */
(function () {
  "use strict";
  var root = typeof window !== "undefined" ? window : globalThis;
  root.XAU = root.XAU || {};
  var XAU = root.XAU;

  function isNum(x) { return typeof x === "number" && isFinite(x); }
  function okArr(a, min) { return Array.isArray(a) && a.length >= min; }

  function sma(values, period) {
    if (!okArr(values, period) || !(period > 0)) return [];
    var out = [];
    var s = 0;
    for (var i = 0; i < period; i++) s += values[i];
    out.push(s / period);
    for (var j = period; j < values.length; j++) {
      s += values[j] - values[j - period];
      out.push(s / period);
    }
    return out;
  }

  function ema(values, period) {
    if (!okArr(values, period) || !(period > 0)) return [];
    var k = 2 / (period + 1);
    var s = 0;
    for (var i = 0; i < period; i++) s += values[i];
    var out = [s / period];
    for (var j = period; j < values.length; j++) {
      out.push(values[j] * k + out[out.length - 1] * (1 - k));
    }
    return out;
  }

  function rsi(values, period) {
    if (period === undefined) period = 14;
    if (!Array.isArray(values) || values.length <= period || !(period > 0)) return [];
    var gains = [], losses = [];
    for (var i = 1; i < values.length; i++) {
      var ch = values[i] - values[i - 1];
      gains.push(Math.max(ch, 0));
      losses.push(Math.max(-ch, 0));
    }
    var avgGain = 0, avgLoss = 0;
    for (var j = 0; j < period; j++) { avgGain += gains[j]; avgLoss += losses[j]; }
    avgGain /= period; avgLoss /= period;
    var calc = function (g, l) { return l === 0 ? 100 : 100 - 100 / (1 + g / l); };
    var out = [calc(avgGain, avgLoss)];
    for (var m = period; m < gains.length; m++) {
      avgGain = (avgGain * (period - 1) + gains[m]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[m]) / period;
      out.push(calc(avgGain, avgLoss));
    }
    return out;
  }

  function macd(values, fast, slow, signal) {
    if (fast === undefined) fast = 12;
    if (slow === undefined) slow = 26;
    if (signal === undefined) signal = 9;
    if (!Array.isArray(values)) return { macdLine: [], signalLine: [], hist: [] };
    var emaFast = ema(values, fast);
    var emaSlow = ema(values, slow);
    if (!emaSlow.length) return { macdLine: [], signalLine: [], hist: [] };
    var offset = slow - fast;
    var macdLine = [];
    for (var i = 0; i < emaSlow.length; i++) macdLine.push(emaFast[i + offset] - emaSlow[i]);
    var signalLine = ema(macdLine, signal);
    if (!signalLine.length) return { macdLine: macdLine, signalLine: [], hist: [] };
    var hist = [];
    for (var j = 0; j < signalLine.length; j++) hist.push(macdLine[j + signal - 1] - signalLine[j]);
    return { macdLine: macdLine, signalLine: signalLine, hist: hist };
  }

  function bollinger(values, period, numStd) {
    if (period === undefined) period = 20;
    if (numStd === undefined) numStd = 2.0;
    if (!okArr(values, period) || !(period > 0)) return [];
    var out = [];
    for (var i = period - 1; i < values.length; i++) {
      var mean = 0;
      for (var j = i - period + 1; j <= i; j++) mean += values[j];
      mean /= period;
      var variance = 0;
      for (var m = i - period + 1; m <= i; m++) variance += (values[m] - mean) * (values[m] - mean);
      variance /= period;
      var std = Math.sqrt(variance);
      out.push([mean - numStd * std, mean, mean + numStd * std]);
    }
    return out;
  }

  // Slow-Stochastik: FastK -> SMA(smooth) = SlowK, %D = SMA(SlowK, dPeriod)
  function stochastic(candles, kPeriod, dPeriod, smooth) {
    if (kPeriod === undefined) kPeriod = 14;
    if (dPeriod === undefined) dPeriod = 3;
    if (smooth === undefined) smooth = 3;
    if (!okArr(candles, kPeriod) || !(kPeriod > 0)) return { k: [], d: [] };
    var fastK = [];
    for (var i = kPeriod - 1; i < candles.length; i++) {
      var hi = -Infinity, lo = Infinity;
      for (var j = i - kPeriod + 1; j <= i; j++) {
        if (candles[j].high > hi) hi = candles[j].high;
        if (candles[j].low < lo) lo = candles[j].low;
      }
      var range = hi - lo;
      fastK.push(range === 0 ? 50 : ((candles[i].close - lo) / range) * 100);
    }
    var slowK = sma(fastK, smooth);
    var d = sma(slowK, dPeriod);
    return { k: slowK, d: d };
  }

  function trueRanges(candles) {
    var trs = [];
    for (var i = 1; i < candles.length; i++) {
      var h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
      trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    return trs;
  }

  // Wilder-Glättung: Start = SMA der ersten period Werte, danach (prev*(p-1)+x)/p
  function wilderSmooth(values, period) {
    if (!okArr(values, period) || !(period > 0)) return [];
    var s = 0;
    for (var i = 0; i < period; i++) s += values[i];
    var out = [s / period];
    for (var j = period; j < values.length; j++) {
      out.push((out[out.length - 1] * (period - 1) + values[j]) / period);
    }
    return out;
  }

  function atr(candles, period) {
    if (period === undefined) period = 14;
    if (!okArr(candles, period + 1) || !(period > 0)) return [];
    return wilderSmooth(trueRanges(candles), period);
  }

  function adx(candles, period) {
    if (period === undefined) period = 14;
    if (!okArr(candles, period + 1) || !(period > 0)) return { adx: [], plusDI: [], minusDI: [] };
    var plusDM = [], minusDM = [];
    for (var i = 1; i < candles.length; i++) {
      var up = candles[i].high - candles[i - 1].high;
      var dn = candles[i - 1].low - candles[i].low;
      plusDM.push(up > dn && up > 0 ? up : 0);
      minusDM.push(dn > up && dn > 0 ? dn : 0);
    }
    var smTR = wilderSmooth(trueRanges(candles), period);
    var smPlus = wilderSmooth(plusDM, period);
    var smMinus = wilderSmooth(minusDM, period);
    var plusDI = [], minusDI = [], dx = [];
    for (var j = 0; j < smTR.length; j++) {
      var pdi = smTR[j] === 0 ? 0 : (100 * smPlus[j]) / smTR[j];
      var mdi = smTR[j] === 0 ? 0 : (100 * smMinus[j]) / smTR[j];
      plusDI.push(pdi);
      minusDI.push(mdi);
      var sum = pdi + mdi;
      dx.push(sum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / sum);
    }
    return { adx: wilderSmooth(dx, period), plusDI: plusDI, minusDI: minusDI };
  }

  // Klassische Pivot-Punkte aus der Vorperiode
  function pivots(prevCandle) {
    if (!prevCandle || !isNum(prevCandle.high) || !isNum(prevCandle.low) || !isNum(prevCandle.close)) return null;
    var h = prevCandle.high, l = prevCandle.low, c = prevCandle.close;
    var p = (h + l + c) / 3;
    return { p: p, r1: 2 * p - l, r2: p + (h - l), s1: 2 * p - h, s2: p - (h - l) };
  }

  // Fibonacci-Retracement-Preise zwischen high und low
  function fib(high, low) {
    if (!isNum(high) || !isNum(low)) return null;
    var d = high - low;
    return {
      level_0: high,
      level_236: high - 0.236 * d,
      level_382: high - 0.382 * d,
      level_500: high - 0.5 * d,
      level_618: high - 0.618 * d,
      level_786: high - 0.786 * d,
      level_100: low,
    };
  }

  XAU.ind = {
    sma: sma, ema: ema, rsi: rsi, macd: macd, bollinger: bollinger,
    stochastic: stochastic, atr: atr, adx: adx, pivots: pivots, fib: fib,
  };

  if (typeof module !== "undefined") module.exports = XAU.ind;
})();

/* Selbsttest für XAU.engine (Node). Nutzt src/indicators.js falls vorhanden,
   sonst eine vertragskonforme Fallback-Implementierung der Indikatoren. */
'use strict';

var path = require('path');
globalThis.XAU = globalThis.XAU || {};

var ind = null;
try { ind = require(path.join(__dirname, 'indicators.js')); } catch (e) { ind = null; }
if (!ind) {
  // Fallback: minimale, vertragskonforme Indikatoren (rechtsbündig)
  function sma(values, period) {
    if (!values || values.length < period) return [];
    var out = [], s = 0, i;
    for (i = 0; i < period; i++) s += values[i];
    out.push(s / period);
    for (i = period; i < values.length; i++) { s += values[i] - values[i - period]; out.push(s / period); }
    return out;
  }
  function ema(values, period) {
    if (!values || values.length < period) return [];
    var k = 2 / (period + 1), s = 0, i;
    for (i = 0; i < period; i++) s += values[i];
    var out = [s / period];
    for (i = period; i < values.length; i++) out.push(values[i] * k + out[out.length - 1] * (1 - k));
    return out;
  }
  function rsi(values, period) {
    period = period || 14;
    if (!values || values.length <= period) return [];
    var gains = [], losses = [], i;
    for (i = 1; i < values.length; i++) {
      var ch = values[i] - values[i - 1];
      gains.push(Math.max(ch, 0)); losses.push(Math.max(-ch, 0));
    }
    var avgGain = 0, avgLoss = 0;
    for (i = 0; i < period; i++) { avgGain += gains[i]; avgLoss += losses[i]; }
    avgGain /= period; avgLoss /= period;
    var calc = function (g, l) { return l === 0 ? 100 : 100 - 100 / (1 + g / l); };
    var out = [calc(avgGain, avgLoss)];
    for (i = period; i < gains.length; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
      out.push(calc(avgGain, avgLoss));
    }
    return out;
  }
  function macd(values, fast, slow, signal) {
    fast = fast || 12; slow = slow || 26; signal = signal || 9;
    var emaFast = ema(values, fast), emaSlow = ema(values, slow);
    if (!emaSlow.length) return { macdLine: [], signalLine: [], hist: [] };
    var offset = slow - fast, macdLine = [], i;
    for (i = 0; i < emaSlow.length; i++) macdLine.push(emaFast[i + offset] - emaSlow[i]);
    var signalLine = ema(macdLine, signal);
    if (!signalLine.length) return { macdLine: macdLine, signalLine: [], hist: [] };
    var hist = [];
    for (i = 0; i < signalLine.length; i++) hist.push(macdLine[i + signal - 1] - signalLine[i]);
    return { macdLine: macdLine, signalLine: signalLine, hist: hist };
  }
  function bollinger(values, period, numStd) {
    period = period || 20; numStd = (numStd === undefined) ? 2 : numStd;
    if (!values || values.length < period) return [];
    var out = [];
    for (var i = period - 1; i < values.length; i++) {
      var win = values.slice(i - period + 1, i + 1);
      var mean = win.reduce(function (a, b) { return a + b; }, 0) / period;
      var variance = win.reduce(function (a, b) { return a + Math.pow(b - mean, 2); }, 0) / period;
      var std = Math.sqrt(variance);
      out.push([mean - numStd * std, mean, mean + numStd * std]);
    }
    return out;
  }
  function stochastic(candles, kPeriod, dPeriod, smooth) {
    kPeriod = kPeriod || 14; dPeriod = dPeriod || 3; smooth = smooth || 3;
    if (!candles || candles.length < kPeriod) return { k: [], d: [] };
    var raw = [];
    for (var i = kPeriod - 1; i < candles.length; i++) {
      var hh = -Infinity, ll = Infinity;
      for (var j = i - kPeriod + 1; j <= i; j++) {
        if (candles[j].high > hh) hh = candles[j].high;
        if (candles[j].low < ll) ll = candles[j].low;
      }
      raw.push(hh === ll ? 50 : 100 * (candles[i].close - ll) / (hh - ll));
    }
    var k = sma(raw, smooth);
    var d = sma(k, dPeriod);
    return { k: k, d: d };
  }
  function atr(candles, period) {
    period = period || 14;
    if (!candles || candles.length <= period) return [];
    var tr = [];
    for (var i = 1; i < candles.length; i++) {
      var c = candles[i], p = candles[i - 1];
      tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
    }
    var s = 0;
    for (var j = 0; j < period; j++) s += tr[j];
    var out = [s / period];
    for (var m = period; m < tr.length; m++) out.push((out[out.length - 1] * (period - 1) + tr[m]) / period);
    return out;
  }
  function adx(candles, period) {
    period = period || 14;
    if (!candles || candles.length <= 2 * period) return { adx: [], plusDI: [], minusDI: [] };
    var trs = [], pdms = [], mdms = [];
    for (var i = 1; i < candles.length; i++) {
      var c = candles[i], p = candles[i - 1];
      trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
      var up = c.high - p.high, dn = p.low - c.low;
      pdms.push(up > dn && up > 0 ? up : 0);
      mdms.push(dn > up && dn > 0 ? dn : 0);
    }
    var sTR = 0, sP = 0, sM = 0;
    for (var j = 0; j < period; j++) { sTR += trs[j]; sP += pdms[j]; sM += mdms[j]; }
    var plusDI = [], minusDI = [], dx = [];
    function push() {
      var pd = sTR === 0 ? 0 : 100 * sP / sTR;
      var md = sTR === 0 ? 0 : 100 * sM / sTR;
      plusDI.push(pd); minusDI.push(md);
      dx.push(pd + md === 0 ? 0 : 100 * Math.abs(pd - md) / (pd + md));
    }
    push();
    for (var m = period; m < trs.length; m++) {
      sTR = sTR - sTR / period + trs[m];
      sP = sP - sP / period + pdms[m];
      sM = sM - sM / period + mdms[m];
      push();
    }
    if (dx.length < period) return { adx: [], plusDI: plusDI, minusDI: minusDI };
    var a = 0;
    for (var q = 0; q < period; q++) a += dx[q];
    var adxOut = [a / period];
    for (var r = period; r < dx.length; r++) adxOut.push((adxOut[adxOut.length - 1] * (period - 1) + dx[r]) / period);
    return { adx: adxOut, plusDI: plusDI, minusDI: minusDI };
  }
  ind = { sma: sma, ema: ema, rsi: rsi, macd: macd, bollinger: bollinger, stochastic: stochastic, atr: atr, adx: adx };
  globalThis.XAU.ind = ind;
  console.log('Hinweis: Fallback-Indikatoren aktiv (src/indicators.js noch nicht vorhanden).');
}

var engine = require(path.join(__dirname, 'engine.js'));

// ---- Hilfsfunktionen ----
function candlesFromCloses(closes) {
  var out = [];
  for (var i = 0; i < closes.length; i++) {
    out.push({
      time: i * 3600000,
      open: i === 0 ? closes[0] : closes[i - 1],
      high: closes[i] * 1.001,
      low: closes[i] * 0.999,
      close: closes[i],
      volume: 1
    });
  }
  return out;
}

var failures = 0;
function assert(cond, msg) {
  if (cond) console.log('ok   - ' + msg);
  else { failures++; console.error('FAIL - ' + msg); }
}

// ---- Synthetische Serien (>= 240 Kerzen) ----

// BUY: langer Aufwärtstrend, moderater Pullback, frischer Schub nach oben
// (240 Kerzen; RSI bleibt neutral, MACD-Hist kreuzt nach oben)
function trendSeries(up) {
  var cl = [], s = up ? 1 : -1, v = up ? 1900 : 2100, i;
  for (i = 0; i < 214; i++) { v += s * 0.5; cl.push(v); }  // Trend
  for (i = 0; i < 20; i++) { v -= s * 0.6; cl.push(v); }   // Pullback
  for (i = 0; i < 6; i++) { v += s * 0.8; cl.push(v); }    // Wiederaufnahme
  return cl;
}
var buyCloses = trendSeries(true);
var sellCloses = trendSeries(false); // SELL: Spiegelbild

// NEUTRAL: Seitwärts mit leichter Schwingung
var flatCloses = [];
for (var fi = 0; fi < 240; fi++) flatCloses.push(2000 + 3 * Math.sin(fi / 7));

var buyRes = engine.analyzeTF(candlesFromCloses(buyCloses));
var sellRes = engine.analyzeTF(candlesFromCloses(sellCloses));
var flatRes = engine.analyzeTF(candlesFromCloses(flatCloses));

if (process.env.DEBUG) {
  console.log('BUY:', buyRes && buyRes.score, buyRes && buyRes.reasons);
  console.log('SELL:', sellRes && sellRes.score, sellRes && sellRes.reasons);
  console.log('FLAT:', flatRes && flatRes.score, flatRes && flatRes.reasons);
}

// ---- analyzeTF ----
assert(buyRes && buyRes.action === 'BUY' && buyRes.score >= 4,
  'BUY-Szenario liefert BUY (score=' + (buyRes && buyRes.score) + ')');
assert(sellRes && sellRes.action === 'SELL' && sellRes.score <= -4,
  'SELL-Szenario liefert SELL (score=' + (sellRes && sellRes.score) + ')');
assert(flatRes && flatRes.action === 'NEUTRAL',
  'Seitwärts-Szenario liefert NEUTRAL (score=' + (flatRes && flatRes.score) + ')');
assert(buyRes.maxScore === 10 && Math.abs(buyRes.confidence - Math.round(Math.abs(buyRes.score) / 10 * 100) / 100) < 1e-12,
  'confidence = |score|/10 (2 Dezimalen), maxScore = 10');
assert(buyRes.reasons.length > 0 && buyRes.reasons.every(function (r) { return typeof r === 'string'; }),
  'reasons sind nicht-leere deutsche Strings');
assert(buyRes.indicators && ['rsi', 'macd_hist', 'ema50', 'ema200', 'bb_lower', 'bb_mid', 'bb_upper',
  'stoch_k', 'stoch_d', 'atr', 'adx', 'plus_di', 'minus_di'].every(function (k) { return k in buyRes.indicators; }),
  'indicators enthält alle Vertragsfelder');
assert(engine.analyzeTF([]) === null && engine.analyzeTF(candlesFromCloses(flatCloses.slice(0, 100))) === null,
  'zu wenige Kerzen -> null (wirft nicht)');
assert(engine.MIN_CANDLES === 220, 'MIN_CANDLES = 220');

// ---- confluence ----
function mk(action, score) { return { action: action, score: score }; }

var allBuy = engine.confluence({ '15m': mk('BUY', 5), '1h': mk('BUY', 6), '4h': mk('BUY', 4), '1d': mk('BUY', 5) });
assert(allBuy.action === 'BUY' && allBuy.agree === 4 && allBuy.total === 4,
  'Konfluenz: 4x BUY -> BUY, agree=4');
assert(allBuy.summary.indexOf('BUY-Konfluenz') === 0 && allBuy.summary.indexOf('4 von 4') !== -1,
  'Konfluenz-Summary nennt "BUY-Konfluenz: 4 von 4"');
assert(allBuy.perTF['1h'] === 'BUY' && allBuy.perTF['1d'] === 'BUY', 'perTF enthält Aktionen je TF');

var veto = engine.confluence({ '15m': mk('BUY', 5), '1h': mk('BUY', 6), '4h': mk('NEUTRAL', -2), '1d': mk('BUY', 5) });
assert(veto.action === 'NEUTRAL' && veto.summary === '1h-Signal steht gegen den 4h-Trend – abwarten',
  '4h-Veto (BUY vs. 4h-Score < 0) -> NEUTRAL mit Veto-Summary');

var vetoSell = engine.confluence({ '1h': mk('SELL', -5), '4h': mk('NEUTRAL', 2) });
assert(vetoSell.action === 'NEUTRAL' && vetoSell.summary === '1h-Signal steht gegen den 4h-Trend – abwarten',
  '4h-Veto (SELL vs. 4h-Score > 0) -> NEUTRAL');

var neutralBase = engine.confluence({ '15m': mk('BUY', 5), '1h': mk('NEUTRAL', 1), '4h': mk('BUY', 4), '1d': mk('BUY', 5) });
assert(neutralBase.action === 'NEUTRAL' && neutralBase.agree === 0,
  '1h NEUTRAL -> Konfluenz NEUTRAL, agree=0');

var partial = engine.confluence({ '1h': mk('SELL', -5), '4h': mk('SELL', -4) });
assert(partial.action === 'SELL' && partial.agree === 2 && partial.total === 2 &&
  partial.summary.indexOf('bärisch') !== -1,
  'Fehlende TFs werden toleriert (nur 1h+4h, beide SELL)');

var empty = engine.confluence({});
assert(empty.action === 'NEUTRAL' && empty.total === 0, 'Leere TF-Map -> NEUTRAL ohne Absturz');

// ---- Ergebnis ----
if (failures === 0) { console.log('SELFTEST OK'); process.exit(0); }
else { console.error(failures + ' Assertion(s) fehlgeschlagen'); process.exit(1); }

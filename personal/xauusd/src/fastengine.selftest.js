/* Selbsttest für XAU.fast (Node): Parität zu XAU.engine.analyzeTF für JEDES gültige i,
   Threshold-Override, utcHour-Korrektheit und Speedup-Messung. Deterministisch. */
'use strict';

var path = require('path');
globalThis.XAU = globalThis.XAU || {};

try { require(path.join(__dirname, 'indicators.js')); } catch (e) {
  console.error('FAIL - indicators.js nicht ladbar: ' + e.message);
  process.exit(1);
}
var engine = require(path.join(__dirname, 'engine.js'));
var fast = require(path.join(__dirname, 'fastengine.js'));

var failures = 0;
function assert(cond, msg) {
  if (cond) console.log('ok   - ' + msg);
  else { failures++; console.error('FAIL - ' + msg); }
}

// ---- Deterministische Kerzen-Fabrik (kein Math.random, kein Date.now) ----
var T0 = Date.UTC(2024, 0, 1, 0, 0, 0); // 2024-01-01 00:00 UTC
var STEP = 3600000; // 1h-Kerzen -> utcHour rotiert 0..23

function candlesFromCloses(closes) {
  var out = [];
  for (var i = 0; i < closes.length; i++) {
    var cl = closes[i];
    var op = i === 0 ? cl : closes[i - 1];
    var wick = 0.4 + 0.3 * Math.abs(Math.sin(i * 1.7)); // deterministische Dochtgröße
    out.push({
      time: T0 + i * STEP,
      open: op,
      high: Math.max(op, cl) + wick,
      low: Math.min(op, cl) - wick,
      close: cl,
      volume: 100 + (i % 17)
    });
  }
  return out;
}

var N = 400;

// Serie 1: Trend + Welle (Aufwärtstrend mit überlagerter Schwingung)
var s1 = [];
for (var i1 = 0; i1 < N; i1++) s1.push(1900 + 0.45 * i1 + 9 * Math.sin(i1 / 9));

// Serie 2: Pullback-Szenario (langer Trend, kräftiger Rücksetzer, Wiederaufnahme)
var s2 = [];
var v2 = 1950;
for (var i2 = 0; i2 < N; i2++) {
  if (i2 < 280) v2 += 0.6 + 0.2 * Math.sin(i2 / 5);
  else if (i2 < 340) v2 -= 1.1 + 0.3 * Math.cos(i2 / 4);
  else v2 += 1.4;
  s2.push(v2);
}

// Serie 3: Zickzack (wechselnde Richtung, variierende Amplitude)
var s3 = [];
var v3 = 2000;
for (var i3 = 0; i3 < N; i3++) {
  var amp = 2 + 1.5 * Math.sin(i3 / 13);
  v3 += (i3 % 2 === 0 ? amp : -amp * 0.9) + 0.8 * Math.sin(i3 / 23);
  s3.push(v3);
}

var seriesList = [
  { name: 'Trend+Welle', candles: candlesFromCloses(s1) },
  { name: 'Pullback', candles: candlesFromCloses(s2) },
  { name: 'Zickzack', candles: candlesFromCloses(s3) }
];

var MIN = engine.MIN_CANDLES;
assert(fast.MIN_CANDLES === MIN, 'MIN_CANDLES identisch zu engine (' + MIN + ')');

// ---- Struktur + Parität für JEDES gültige i (alle drei Serien) ----
seriesList.forEach(function (sc) {
  var candles = sc.candles;
  var res = fast.computeSeries(candles);

  assert(res.score.length === candles.length && res.atr.length === candles.length &&
    res.time.length === candles.length && res.close.length === candles.length &&
    res.utcHour.length === candles.length,
    sc.name + ': alle Serien gleich lang wie candles (' + candles.length + ')');

  var leadOk = true;
  for (var j = 0; j < MIN - 1; j++) if (res.score[j] !== null) { leadOk = false; break; }
  assert(leadOk, sc.name + ': score[i] === null für i < MIN_CANDLES-1');

  var atrLeadOk = true;
  for (var j2 = 0; j2 < 14; j2++) if (res.atr[j2] !== null) { atrLeadOk = false; break; }
  assert(atrLeadOk && typeof res.atr[14] === 'number',
    sc.name + ': ATR-Serie rechtsbündig (null bis i<14, ab i=14 Zahl)');

  var mismatches = 0, atrMismatches = 0, firstBad = null;
  for (var i = MIN - 1; i < candles.length; i++) {
    var ref = engine.analyzeTF(candles.slice(0, i + 1));
    if (!ref || res.score[i] !== ref.score) {
      mismatches++;
      if (firstBad === null) {
        firstBad = 'i=' + i + ': fast=' + res.score[i] + ' engine=' + (ref && ref.score);
      }
    }
    if (ref && res.atr[i] !== ref.indicators.atr) atrMismatches++;
  }
  assert(mismatches === 0,
    sc.name + ': Score-Parität für jedes gültige i (' + (candles.length - MIN + 1) + ' Bars)' +
    (firstBad ? ' – erster Fehler: ' + firstBad : ''));
  assert(atrMismatches === 0, sc.name + ': ATR-Parität für jedes gültige i');

  // Threshold-Override-Parität an der letzten Bar (mehrere Schwellen)
  var lastScore = res.score[candles.length - 1];
  [3, 4, 5, 6].forEach(function (th) {
    var refTh = engine.analyzeTF(candles, { threshold: th });
    assert(refTh && refTh.action === fast.actionAt(lastScore, th),
      sc.name + ': analyzeTF(c,{threshold:' + th + '}).action === actionAt(score, ' + th + ') (' + refTh.action + ')');
  });
  // Rückwärtskompatibilität: ohne opts identisch zu threshold 4
  var refDefault = engine.analyzeTF(candles);
  assert(refDefault.action === fast.actionAt(lastScore, 4) &&
    refDefault.action === engine.analyzeTF(candles, { threshold: 4 }).action,
    sc.name + ': analyzeTF ohne opts === threshold 4 (Default unverändert)');
});

// ---- Threshold-Override an Extrem-Bars (BUY/SELL-Zweige wirklich treffen) ----
(function () {
  var candles = seriesList[1].candles; // Pullback-Serie enthält Scores +4 und -4
  var res = fast.computeSeries(candles);
  var posI = -1, negI = -1;
  for (var i = MIN - 1; i < candles.length; i++) {
    if (posI === -1 && res.score[i] >= 4) posI = i;
    if (negI === -1 && res.score[i] <= -4) negI = i;
  }
  assert(posI !== -1 && negI !== -1,
    'Testdaten enthalten Bars mit score >= 4 und <= -4 (i=' + posI + '/' + negI + ')');
  [[posI, 'BUY'], [negI, 'SELL']].forEach(function (pair) {
    var i = pair[0], want = pair[1];
    var prefix = candles.slice(0, i + 1);
    [3, 4, 5, 6].forEach(function (th) {
      var ref = engine.analyzeTF(prefix, { threshold: th });
      var got = fast.actionAt(res.score[i], th);
      assert(ref && ref.action === got,
        'Override an Bar ' + i + ' (score=' + res.score[i] + ', th=' + th + '): engine=' +
        (ref && ref.action) + ' === fast=' + got);
    });
    assert(engine.analyzeTF(prefix, { threshold: 4 }).action === want ||
      Math.abs(res.score[i]) > 4,
      'Bar ' + i + ' liefert bei th=4 die erwartete Aktion ' + want);
  });
})();

// ---- utcHour-Korrektheit ----
var c1 = seriesList[0].candles;
var r1 = fast.computeSeries(c1);
var utcOk = true;
for (var u = 0; u < c1.length; u++) {
  if (r1.utcHour[u] !== new Date(c1[u].time).getUTCHours()) { utcOk = false; break; }
}
assert(utcOk, 'utcHour[i] === getUTCHours(candles[i].time) für alle i');
assert(r1.utcHour[0] === 0 && r1.utcHour[5] === 5 && r1.utcHour[25] === 1,
  'utcHour rotiert korrekt über Mitternacht (0, 5, 25 -> 0, 5, 1)');
assert(r1.time[7] === c1[7].time && r1.close[7] === c1[7].close,
  'time/close spiegeln die Kerzen 1:1');

// ---- actionAt-Grundregeln ----
assert(fast.actionAt(4, 4) === 'BUY' && fast.actionAt(-4, 4) === 'SELL' &&
  fast.actionAt(3, 4) === 'NEUTRAL' && fast.actionAt(-3, 4) === 'NEUTRAL',
  'actionAt: Schwellen-Logik (>=th BUY, <=-th SELL, sonst NEUTRAL)');
assert(fast.actionAt(null, 4) === 'NEUTRAL' && fast.actionAt(5) === 'BUY',
  'actionAt: null -> NEUTRAL, Default-Threshold 4');

// ---- Robustheit ----
var emptyRes = fast.computeSeries([]);
assert(emptyRes.score.length === 0 && emptyRes.utcHour.length === 0, 'leere Eingabe -> leere Serien');
assert(fast.computeSeries(null).score.length === 0, 'null-Eingabe -> leere Serien (wirft nicht)');
var broken = candlesFromCloses(s1.slice(0, 260));
broken[240] = { time: broken[240].time, open: 1, high: 1, low: 1, close: NaN };
var brokenRes = fast.computeSeries(broken);
assert(brokenRes.score[239] !== null && brokenRes.score[240] === null && brokenRes.score[259] === null,
  'ungültige Kerze: score ab dort null (wie analyzeTF -> null)');

// ---- Speedup-Messung (nur Logging, keine Assertion auf Zeit) ----
var bench = seriesList[0].candles;
var tFast0 = process.hrtime.bigint();
var REPS = 20;
for (var rep = 0; rep < REPS; rep++) fast.computeSeries(bench);
var tFast1 = process.hrtime.bigint();
var fastMs = Number(tFast1 - tFast0) / 1e6 / REPS;

var tSlow0 = process.hrtime.bigint();
for (var si = MIN - 1; si < bench.length; si++) engine.analyzeTF(bench.slice(0, si + 1));
var tSlow1 = process.hrtime.bigint();
var slowMs = Number(tSlow1 - tSlow0) / 1e6;

console.log('Speedup: computeSeries ' + fastMs.toFixed(2) + ' ms vs. ' +
  (bench.length - MIN + 1) + ' x analyzeTF ' + slowMs.toFixed(2) + ' ms -> Faktor ' +
  (slowMs / fastMs).toFixed(1) + 'x');

// ---- Ergebnis ----
if (failures === 0) { console.log('SELFTEST OK'); process.exit(0); }
else { console.error(failures + ' Assertion(s) fehlgeschlagen'); process.exit(1); }

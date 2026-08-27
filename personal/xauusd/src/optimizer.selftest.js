/* Selbsttest für XAU.opt (Node): node optimizer.selftest.js
   (a) Mini-Grid + synthetische Serie -> vollständige Ergebnisstruktur, evaluated,
       onProgress monoton; (b) konstruierter Overfitting-Fall mit precomputed-Stub;
   (c) minTrades-Guard; (d) Determinismus; (e) sessionFilter nur für 15m/1h.
   Kein Zufall, keine Uhrzeit – alles deterministisch. */
"use strict";
var opt = require("./optimizer.js");

var failures = 0;
function assert(cond, msg) {
  if (cond) { console.log("ok      - " + msg); }
  else { failures++; console.error("FEHLER  - " + msg); }
}
function approx(a, b, eps) { return typeof a === "number" && Math.abs(a - b) <= (eps || 1e-9); }
function J(x) { return JSON.stringify(x); }

var H = 3600000; // 1 Stunde in ms

/* ---------- Blockbau: 3 Kerzen pro Block (Signal, Auflösung, Pause) ----------
   blockFn(b) -> null (kein Signal) oder { score, win }. Preise so gewählt, dass
   ein LONG mit atrMult 1.0, rr 1.0, ATR 10 (Risiko 10, Stop 90, Target 110) auf
   der Auflösungskerze deterministisch per TP (+1R) oder SL (-1R) endet. */
function buildBlocks(nBlocks, blockFn) {
  var candles = [], score = [], atr = [];
  function bar(t, o, h, l, c, s) {
    candles.push({ time: t * H, open: o, high: h, low: l, close: c, volume: 1000 });
    score.push(s); atr.push(10);
  }
  for (var b = 0; b < nBlocks; b++) {
    var sig = blockFn(b);
    var t = 3 * b;
    bar(t, 100, 101, 99, 100, sig ? sig.score : 0);                    // Signalkerze
    if (sig && sig.win) bar(t + 1, 100, 111, 99, 105, 0);              // TP bei 110 -> +1R
    else if (sig) bar(t + 1, 100, 101, 89, 92, 0);                     // SL bei 90 -> -1R
    else bar(t + 1, 100, 101, 99, 100, 0);
    bar(t + 2, 100, 101, 99, 100, 0);                                  // Pause
  }
  return { candles: candles, pre: { score: score, atr: atr } };
}
function cfg(threshold) {
  return { threshold: threshold, atrMult: 1.0, rr: 1.0, exitMode: "fixed", sessionFilter: "none", maxHoldBars: 0 };
}
function statsComplete(s) {
  return s && typeof s === "object" &&
    typeof s.n === "number" && typeof s.wins === "number" && typeof s.losses === "number" &&
    typeof s.winrate === "number" && typeof s.totalR === "number" &&
    (s.profitFactor === null || typeof s.profitFactor === "number") &&
    typeof s.maxDrawdownR === "number";
}

/* ---------- (e) Grid: sessionFilter 'londonNY' nur für 15m/1h ---------- */
var g15 = opt.buildGrid("15m"), g1h = opt.buildGrid("1h"), g4h = opt.buildGrid("4h"), g1d = opt.buildGrid("1d");
function countSess(g) { var k = 0; for (var i = 0; i < g.length; i++) if (g[i].sessionFilter === "londonNY") k++; return k; }
assert(g15.length === 1152 && g1h.length === 1152, "Grid 15m/1h: 4*4*4*3*2*3 = 1152 Configs");
assert(countSess(g15) === 576 && countSess(g1h) === 576, "Grid 15m/1h: Hälfte der Configs mit sessionFilter 'londonNY'");
assert(g4h.length === 576 && g1d.length === 576, "Grid 4h/1d: 4*4*4*3*1*3 = 576 Configs");
assert(countSess(g4h) === 0 && countSess(g1d) === 0, "Grid 4h/1d: kein 'londonNY' (nur 'none')");
assert(J(opt.buildGrid("15m")) === J(g15), "Grid: deterministische Reihenfolge (zweiter Aufruf identisch)");

/* ---------- sliceRange: Arrays mit Offset slicen, Rest kopieren ---------- */
var sl = opt.sliceRange({ score: [0, 1, 2, 3, 4], atr: [9, 8, 7, 6, 5], tf: "1h" }, 1, 3);
assert(J(sl.score) === "[1,2]" && J(sl.atr) === "[8,7]", "sliceRange: Serien werden [start,end) mitgeslict");
assert(sl.tf === "1h", "sliceRange: Nicht-Array-Felder bleiben erhalten");

/* ---------- (a) Mini-Grid + synthetische Serie: Struktur, evaluated, Progress ---------- */
function synth(n) {
  var cs = [], t0 = Date.UTC(2024, 0, 1), prev = 2000;
  for (var i = 0; i < n; i++) {
    var close = 2000 + 40 * Math.sin(i / 10) + 25 * Math.sin(i / 33) + i * 0.03;
    var hi = Math.max(prev, close) + 3 + (i % 4);
    var lo = Math.min(prev, close) - 3 - ((i + 2) % 5);
    cs.push({ time: t0 + i * H, open: prev, high: hi, low: lo, close: close, volume: 1000 + (i % 7) });
    prev = close;
  }
  return cs;
}
var mini = [
  { threshold: 3, atrMult: 1.0, rr: 1.5, exitMode: "fixed", sessionFilter: "none", maxHoldBars: 0 },
  { threshold: 3, atrMult: 1.5, rr: 2.0, exitMode: "trailing", sessionFilter: "none", maxHoldBars: 24 },
  { threshold: 4, atrMult: 2.0, rr: 2.0, exitMode: "breakeven", sessionFilter: "none", maxHoldBars: 0 },
  { threshold: 5, atrMult: 2.5, rr: 3.0, exitMode: "fixed", sessionFilter: "none", maxHoldBars: 48 }
];

(async function main() {
  var sy = synth(600);
  var calls = [];
  var rA = await opt.optimize(sy, {
    tf: "1h", objective: "totalR", minTrades: 1, grid: mini,
    onProgress: function (done, total) { calls.push([done, total]); }
  });
  assert(rA && rA.tf === "1h" && rA.evaluated === 4, "a: tf und evaluated (= Grid-Größe 4)");
  assert(Array.isArray(rA.folds) && rA.folds.length === 3, "a: 3 Walk-Forward-Folds");
  assert(J(rA.folds.map(function (f) { return [f.trainRange, f.testRange]; })) ===
    J([[[0, 300], [300, 400]], [[0, 400], [400, 500]], [[0, 500], [500, 600]]]),
    "a: Fold-Bereiche 50/66.7/83.3% in Bar-Indizes");
  assert(statsComplete(rA.inSample) && statsComplete(rA.outOfSample), "a: inSample/outOfSample vollständig (7 Felder)");
  assert(rA.folds.every(function (f) { return statsComplete(f.testStats) && f.config && typeof f.config.threshold === "number"; }),
    "a: jeder Fold trägt config + vollständige testStats");
  assert(mini.some(function (c) { return J(c) === J(rA.config); }), "a: finale Config stammt aus dem Grid");
  var mono = calls.length >= 1;
  for (var i = 1; i < calls.length; i++) if (calls[i][0] < calls[i - 1][0] || calls[i][1] !== calls[i - 1][1]) mono = false;
  assert(mono, "a: onProgress monoton nicht-fallend, total konstant");
  assert(J(calls[calls.length - 1]) === J([12, 12]), "a: letzter Progress = (total, total) mit total = 4 Configs x 3 Folds");

  /* ---------- (d.1) Determinismus auf der echten Pipeline ---------- */
  var rA2 = await opt.optimize(sy, { tf: "1h", objective: "totalR", minTrades: 1, grid: mini });
  assert(J(rA) === J(rA2), "d: zwei Läufe (echte Fast-Engine + Backtest) -> identisches JSON");

  /* ---------- (b) Overfitting-Fall mit präpariertem precomputed-Stub ----------
     80 Blöcke (240 Kerzen). Config A (threshold 3) handelt jeden Block, Config B
     (threshold 6) nur die Score-6-Blöcke. Erste Hälfte: alles gewinnt (A glänzt im
     Train von Fold 1 per Tiebreak totalR). Zweite Hälfte: A-Signale verlieren,
     B-Signale gewinnen weiter -> Final-Config = B per TRAIN-Mehrheit (Folds 2+3);
     outOfSample = WFA-Verkettung inkl. des teuren Fold-1-Fehlgriffs auf A. */
  var A = cfg(3), B = cfg(6);
  var ovr = buildBlocks(80, function (b) {
    if (b % 2 === 1) return { score: 6, win: true };           // robust (A und B handeln)
    return { score: 3, win: b < 40 };                           // nur A: Train-Glanz, Test-Absturz
  });
  var rB = await opt.optimize(ovr.candles, {
    tf: "4h", objective: "winrate", minTrades: 8, grid: [A, B], precomputed: ovr.pre
  });
  assert(rB.folds[0].config.threshold === 3, "b: Fold 1 fällt im Train auf Overfit-Config A herein (Tiebreak totalR)");
  assert(rB.folds[1].config.threshold === 6 && rB.folds[2].config.threshold === 6, "b: Folds 2+3 wählen im Train bereits B");
  assert(J(rB.config) === J(B), "b: Final-Config ist B – per Train-Mehrheit (Folds 2+3), OHNE Testdaten");
  assert(rB.oosMethod === "wfa" && rB.guardRelaxed === false, "b: oosMethod 'wfa', Guards nicht gelockert");
  assert(rB.outOfSample.n === 26 && rB.outOfSample.wins === 19 && rB.outOfSample.losses === 7 &&
    approx(rB.outOfSample.totalR, 12),
    "b: outOfSample = ehrliche WFA-Verkettung (A@Test1 13/-1 + B@Test2 6/+6 + B@Test3 7/+7 = 26 Trades, +12R)");
  var sumN = rB.folds.reduce(function (a, f) { return a + f.testStats.n; }, 0);
  var sumR = rB.folds.reduce(function (a, f) { return a + f.testStats.totalR; }, 0);
  assert(rB.outOfSample.n === sumN && approx(rB.outOfSample.totalR, sumR),
    "b: OOS ist exakt die Summe der fold-eigenen Test-Ergebnisse (kein Test-Bar im Train des Bewerteten)");
  assert(rB.folds[0].testStats.n === 13 && approx(rB.folds[0].testStats.totalR, -1),
    "b: Fold-1-Test straft A ab (13 Trades, totalR -1) – Signal an Slice-Index 0 zählt (kein Nullen)");
  assert(rB.inSample.n === 33 && approx(rB.inSample.totalR, 33), "b: inSample = Final-Config B auf [0, 83.3%)");

  /* ---------- (d.2) Determinismus auf dem Stub-Szenario ---------- */
  var rB2 = await opt.optimize(ovr.candles, {
    tf: "4h", objective: "winrate", minTrades: 8, grid: [A, B], precomputed: ovr.pre
  });
  assert(J(rB) === J(rB2), "d: Stub-Szenario zweimal -> identisches JSON");

  /* ---------- (c) minTrades-Guard ----------
     X (threshold 3) handelt oft mit Winrate 0.75; Y (threshold 6) selten (Blöcke
     b%10==5), aber perfekt. Mit minTrades 8 ist Y in jedem Train unzulässig -> X;
     mit minTrades 2 ist Y zulässig und gewinnt per Winrate. */
  var X = cfg(3), Y = cfg(6);
  var rare = buildBlocks(80, function (b) {
    if (b % 10 === 5) return { score: 6, win: true };
    return { score: 3, win: b % 4 !== 0 };
  });
  var rC8 = await opt.optimize(rare.candles, { objective: "winrate", minTrades: 8, grid: [X, Y], precomputed: rare.pre });
  assert(rC8.config.threshold === 3 && rC8.folds.every(function (f) { return f.config.threshold === 3; }),
    "c: minTrades 8 -> Y (max. 7 Train-Trades) unzulässig, X gewinnt überall");
  var rC2 = await opt.optimize(rare.candles, { objective: "winrate", minTrades: 2, grid: [X, Y], precomputed: rare.pre });
  assert(rC2.config.threshold === 3,
    "c: minTrades 2 -> Y (4/4 = 100%) ist zulässig, verliert aber per Wilson-Lower-Bound gegen X (grosse Stichprobe, 75%)");

  /* ---------- guardRelaxed-Flag ---------- */
  var rGuard = await opt.optimize(rare.candles, { objective: "winrate", minTrades: 1000, grid: [X, Y], precomputed: rare.pre });
  assert(rGuard.guardRelaxed === true, "guard: minTrades 1000 -> kein Fold zulässig, guardRelaxed=true");

  /* ---------- Objective 'pf': profitFactor null wie Infinity, aber nur bei wins >= 3 ---------- */
  var rPf = await opt.optimize(rare.candles, { objective: "pf", minTrades: 2, grid: [X, Y], precomputed: rare.pre });
  assert(rPf.config.threshold === 6, "pf: null-profitFactor mit wins >= 3 zählt wie Infinity -> Y schlägt X (pf 3)");
  var ultraRare = buildBlocks(80, function (b) {
    if (b % 40 === 5) return { score: 6, win: true };           // max. 2 Y-Trades je Train
    return { score: 3, win: b % 4 !== 0 };
  });
  var rPf2 = await opt.optimize(ultraRare.candles, { objective: "pf", minTrades: 1, grid: [X, Y], precomputed: ultraRare.pre });
  assert(rPf2.config.threshold === 3, "pf: null-profitFactor mit wins < 3 ist unzulässig -> X gewinnt");

  /* ---------- Progress-Drosselung: ~alle 50 Auswertungen + Abschlussmeldung ---------- */
  var grid20 = [];
  [1.0, 1.5, 2.0, 2.5].forEach(function (am) {
    [1.0, 1.5, 2.0, 3.0].forEach(function (rr) {
      grid20.push({ threshold: 3, atrMult: am, rr: rr, exitMode: "fixed", sessionFilter: "none", maxHoldBars: 0 });
    });
  });
  [1.0, 1.5, 2.0, 2.5].forEach(function (am) {
    grid20.push({ threshold: 3, atrMult: am, rr: 2.0, exitMode: "trailing", sessionFilter: "none", maxHoldBars: 24 });
  });
  var calls20 = [];
  var rP = await opt.optimize(rare.candles, {
    objective: "totalR", minTrades: 1, grid: grid20, precomputed: rare.pre,
    onProgress: function (done, total) { calls20.push([done, total]); }
  });
  assert(rP.evaluated === 20 && J(calls20) === J([[50, 60], [60, 60]]),
    "Progress: 20 Configs x 3 Folds -> gedrosselte Meldung bei 50 und Abschluss bei 60");

  /* ---------- Robustheit: ungültige Eingaben -> leeres, wohlgeformtes Ergebnis ---------- */
  var rE1 = await opt.optimize([], { grid: [X], precomputed: { score: [], atr: [] } });
  var rE2 = await opt.optimize(null, { tf: "1h" });
  assert(rE1.config === null && rE1.evaluated === 0 && rE1.folds.length === 0 && statsComplete(rE1.outOfSample),
    "Robust: zu wenig Kerzen -> leeres Ergebnis in Vertragsform");
  assert(rE2.config === null && rE2.tf === "1h" && statsComplete(rE2.inSample), "Robust: null-Kerzen -> leeres Ergebnis");

  if (failures === 0) console.log("SELFTEST OK");
  else { console.error(failures + " Assertion(s) fehlgeschlagen"); process.exit(1); }
})().catch(function (err) {
  console.error("FEHLER  - unerwartete Exception:", err && err.stack || err);
  process.exit(1);
});

/* Selbsttest für XAU.backtest (Node): node backtest.selftest.js */
"use strict";
var bt = require("./backtest.js");
var XAU = globalThis.XAU;
var realEngine = XAU.engine;

var failures = 0;
function assert(cond, msg) {
  if (cond) { console.log("ok      - " + msg); }
  else { failures++; console.error("FEHLER  - " + msg); }
}
function approx(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-9); }

/* Stub-Engine: Signal wird über candle.sig ('BUY'/'SELL') gesteuert,
   ATR über candle.atrVal (Default 10). So sind die Trade-Mechaniken
   des Backtests deterministisch prüfbar. */
var stubEngine = {
  MIN_CANDLES: 1,
  analyzeTF: function (w) {
    if (!Array.isArray(w) || !w.length) return null;
    var last = w[w.length - 1];
    var score = last.sig === "BUY" ? 10 : (last.sig === "SELL" ? -10 : 0);
    return {
      action: last.sig || "NEUTRAL", score: score, maxScore: 10,
      confidence: Math.abs(score) / 10, price: last.close,
      indicators: { atr: (last.atrVal !== undefined ? last.atrVal : 10) },
      reasons: []
    };
  }
};

function C(t, o, h, l, c, sig, atrVal) {
  var x = { time: t, open: o, high: h, low: l, close: c, volume: 1000 };
  if (sig) x.sig = sig;
  if (atrVal !== undefined) x.atrVal = atrVal;
  return x;
}

XAU.engine = stubEngine;
var opts = { atrMult: 1.5, rr: 2, threshold: 4, warmup: 3 };

/* Szenario 1: 1 BUY-Signal, Kurs läuft klar über das Target -> Take-Profit, r ~= rr */
var s1 = [
  C(0, 100, 101, 99, 100),
  C(1, 100, 101, 99, 100),
  C(2, 100, 101, 99, 100),
  C(3, 100, 101, 99, 100, "BUY", 10), // Signal -> Entry am Open der nächsten Kerze
  C(4, 100, 110, 95, 108),            // Entry 100, Stop 85, Target 130
  C(5, 108, 135, 107, 132),           // High 135 >= 130 -> Take-Profit
  C(6, 132, 133, 131, 132),
  C(7, 132, 133, 131, 132)
];
var r1 = bt.run(s1, opts);
assert(r1.trades.length === 1, "Szenario 1: genau 1 Trade");
var t1 = r1.trades[0] || {};
assert(t1.direction === "LONG" && t1.entry === 100 && t1.entryTime === 4, "Szenario 1: LONG-Entry 100 am Open der Folgekerze (t=4)");
assert(t1.reason === "Take-Profit" && approx(t1.exit, 130), "Szenario 1: Exit 130 per Take-Profit");
assert(approx(t1.rMultiple, 2), "Szenario 1: rMultiple ~= rr (2)");
assert(r1.stats.n === 1 && r1.stats.wins === 1 && r1.stats.losses === 0, "Szenario 1: Statistik n/wins/losses = 1/1/0");
assert(r1.stats.profitFactor === null, "Szenario 1: profitFactor null bei 0 Verlusten");
assert(approx(r1.stats.winrate, 1) && approx(r1.stats.totalR, 2) && approx(r1.stats.avgR, 2), "Szenario 1: winrate/totalR/avgR = 1/2/2");

/* Szenario 2: Kerze berührt Stop UND Target -> konservativ zählt der Stop, r = -1 */
var s2 = [
  C(0, 100, 101, 99, 100),
  C(1, 100, 101, 99, 100),
  C(2, 100, 101, 99, 100),
  C(3, 100, 101, 99, 100, "BUY", 10),
  C(4, 100, 105, 98, 103),            // Entry 100, Stop 85, Target 130
  C(5, 103, 140, 80, 120),            // beide Level berührt -> Stop-Loss
  C(6, 120, 121, 119, 120)
];
var r2 = bt.run(s2, opts);
assert(r2.trades.length === 1 && r2.trades[0].reason === "Stop-Loss", "Szenario 2: Stop schlägt Target (konservativ)");
assert(approx(r2.trades[0].exit, 85) && approx(r2.trades[0].rMultiple, -1), "Szenario 2: Exit 85, rMultiple = -1");
assert(r2.stats.losses === 1 && approx(r2.stats.maxDrawdownR, 1), "Szenario 2: 1 Verlust, maxDrawdownR = 1");

/* Szenario 3: Gegensignal schließt LONG zum Close, Reversal-SHORT endet per Laufzeitende */
var s3 = [
  C(0, 100, 101, 99, 100),
  C(1, 100, 101, 99, 100),
  C(2, 100, 101, 99, 100),
  C(3, 100, 101, 99, 100, "BUY", 10),
  C(4, 100, 106, 96, 104),             // LONG: Entry 100, Stop 85, Target 130
  C(5, 104, 107, 101, 106),
  C(6, 106, 108, 102, 105, "SELL", 10),// Gegensignal -> Exit 105; SHORT-Entry nächste Kerze
  C(7, 104, 108, 98, 100),             // SHORT: Entry 104, Stop 119, Target 74
  C(8, 100, 103, 92, 94)               // letzte Kerze -> Laufzeitende, Exit 94
];
var r3 = bt.run(s3, opts);
assert(r3.trades.length === 2, "Szenario 3: 2 Trades (LONG + Reversal-SHORT)");
var a = r3.trades[0] || {}, b = r3.trades[1] || {};
assert(a.direction === "LONG" && a.reason === "Gegensignal" && approx(a.exit, 105) && a.exitTime === 6, "Szenario 3: LONG-Exit per Gegensignal zum Close (105)");
assert(approx(a.rMultiple, 5 / 15), "Szenario 3: LONG rMultiple = 1/3");
assert(b.direction === "SHORT" && b.entry === 104 && b.reason === "Laufzeitende" && approx(b.exit, 94), "Szenario 3: SHORT endet per Laufzeitende zum Close (94)");
assert(approx(b.rMultiple, 10 / 15), "Szenario 3: SHORT rMultiple = 2/3");

/* Statistik: maxDrawdownR auf handkonstruierter R-Folge */
assert(approx(bt._maxDrawdownR([1, -2, 3, -1, -1, 2]), 2), "maxDrawdownR([1,-2,3,-1,-1,2]) = 2");
assert(bt._maxDrawdownR([]) === 0 && bt._maxDrawdownR([1, 2, 3]) === 0, "maxDrawdownR: leer / nur Gewinne = 0");

/* Ausnahmefälle: nie werfen */
var rEmpty = bt.run([], opts);
assert(rEmpty.trades.length === 0 && rEmpty.stats.n === 0, "Leere Eingabe: leeres Ergebnis ohne Fehler");
var rShort = bt.run(s1.slice(0, 2), opts);
assert(rShort.trades.length === 0, "Zu wenige Kerzen: keine Trades");

/* Rauchtest mit echter Engine: 400 synthetische Kerzen, darf nie werfen */
XAU.engine = realEngine;
var real = [];
var px = 2400;
for (var i = 0; i < 400; i++) {
  var drift = Math.sin(i / 25) * 6 + ((i * 7919) % 13 - 6) * 0.8;
  var o = px, c = px + drift, h = Math.max(o, c) + 3, l = Math.min(o, c) - 3;
  real.push(C(i * 3600000, o, h, l, c));
  px = c;
}
var rReal = bt.run(real, { warmup: 250 });
assert(rReal && Array.isArray(rReal.trades) && rReal.stats && typeof rReal.stats.n === "number", "Echte Engine: Struktur ok, kein Fehler");
assert(rReal.stats.n === rReal.trades.length, "Echte Engine: stats.n == Anzahl Trades");

if (failures === 0) console.log("SELFTEST OK");
else { console.error(failures + " Assertion(s) fehlgeschlagen"); process.exit(1); }

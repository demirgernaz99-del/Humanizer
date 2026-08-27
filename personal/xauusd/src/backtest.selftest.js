/* Selbsttest für XAU.backtest v2 (Node): node backtest.selftest.js
   Handkonstruierte Kerzen + precomputed-Stubs mit vorher bekanntem Ausgang
   für jeden Exit-Pfad. Kein Zufall, keine Uhrzeit – alles deterministisch. */
"use strict";
var bt = require("./backtest.js");
var XAU = globalThis.XAU;

var failures = 0;
function assert(cond, msg) {
  if (cond) { console.log("ok      - " + msg); }
  else { failures++; console.error("FEHLER  - " + msg); }
}
function approx(a, b, eps) { return typeof a === "number" && Math.abs(a - b) <= (eps || 1e-9); }

var H = 3600000; // 1 Stunde in ms

/* Kerzen-Helfer: Score und ATR hängen als Annotation an der Kerze,
   pre() baut daraus den precomputed-Stub im computeSeries-Format. */
function C(t, o, h, l, c, score, atr) {
  return { time: t, open: o, high: h, low: l, close: c, volume: 1000,
           _s: (score === undefined ? 0 : score), _a: (atr === undefined ? 10 : atr) };
}
function pre(cs) {
  return { score: cs.map(function (x) { return x._s; }), atr: cs.map(function (x) { return x._a; }) };
}

var cfgFixed = { threshold: 4, atrMult: 1.5, rr: 2, exitMode: "fixed", sessionFilter: "none", maxHoldBars: 0 };

/* ---------- Szenario A: fixed, Take-Profit exakt bei rr ---------- */
// Signal (Score +4, ATR 10) an Kerze 1 -> Entry am Open von Kerze 2 (100).
// Risiko = 1.5*10 = 15 -> Stop 85, Target 130. Kerze 3 erreicht das Target exakt.
var A = [
  C(0 * H, 100, 101, 99, 100),
  C(1 * H, 100, 101, 99, 100, 4),
  C(2 * H, 100, 110, 96, 108),
  C(3 * H, 108, 130, 105, 125),
  C(4 * H, 125, 126, 124, 125)
];
var rA = bt.run(A, cfgFixed, pre(A));
assert(rA.trades.length === 1, "A: genau 1 Trade");
var tA = rA.trades[0] || {};
assert(tA.direction === "LONG" && tA.entry === 100 && tA.entryTime === 2 * H, "A: LONG-Entry 100 am Open der Folgekerze");
assert(tA.reason === "Take-Profit" && approx(tA.exit, 130), "A: Exit 130 per Take-Profit");
assert(approx(tA.rMultiple, 2), "A: rMultiple exakt rr (2)");
assert(rA.stats.n === 1 && rA.stats.wins === 1 && rA.stats.losses === 0, "A: Statistik n/wins/losses = 1/1/0");
assert(rA.stats.profitFactor === null, "A: profitFactor null bei 0 Verlusten");
assert(approx(rA.stats.winrate, 1) && approx(rA.stats.totalR, 2) && approx(rA.stats.avgR, 2), "A: winrate/totalR/avgR = 1/2/2");

/* ---------- Szenario B: Stop-und-Target-Kerze -> konservativ Stop ---------- */
// Entry 100 (Stop 85 / Target 130); Kerze 3 berührt BEIDE Level -> Stop zählt, r = -1.
var B = [
  C(0 * H, 100, 101, 99, 100),
  C(1 * H, 100, 101, 99, 100, 5),
  C(2 * H, 100, 105, 98, 103),
  C(3 * H, 103, 140, 80, 120),
  C(4 * H, 120, 121, 119, 120)
];
var rB = bt.run(B, cfgFixed, pre(B));
assert(rB.trades.length === 1 && rB.trades[0].reason === "Stop-Loss", "B: Stop schlägt Target (konservativ)");
assert(approx(rB.trades[0].exit, 85) && approx(rB.trades[0].rMultiple, -1), "B: Exit 85, rMultiple = -1");
assert(rB.stats.losses === 1 && approx(rB.stats.maxDrawdownR, 1), "B: 1 Verlust, maxDrawdownR = 1");

/* ---------- Szenario C: Gap-Open jenseits des Stops -> Abrechnung zum Open ---------- */
// Entry 100, Stop 85; Kerze 3 öffnet mit Gap bei 80 -> Exit 80, r = -20/15.
var Cg = [
  C(0 * H, 100, 101, 99, 100),
  C(1 * H, 100, 101, 99, 100, 4),
  C(2 * H, 100, 102, 98, 99),
  C(3 * H, 80, 82, 75, 78),
  C(4 * H, 78, 79, 77, 78)
];
var rC = bt.run(Cg, cfgFixed, pre(Cg));
assert(rC.trades.length === 1 && rC.trades[0].reason === "Stop-Loss", "C: Gap unter den Stop -> Stop-Loss");
assert(approx(rC.trades[0].exit, 80) && approx(rC.trades[0].rMultiple, -20 / 15), "C: Abrechnung zum Open (80), r = -4/3 (schlechter als -1)");

/* ---------- Szenario D: trailing zieht nach und schützt Gewinn ---------- */
// atrMult 1.0, ATR 10 -> Risiko 10; Entry 100, Stop 90, Target 130 (rr 3).
// Close 103 -> Stop 93; Close 114 -> Stop 104 (über Entry!). Kerze 4 fällt auf 100
// -> Exit am nachgezogenen Stop 104: Gewinn trotz Rückfall unter den Entry.
var cfgTrail = { threshold: 4, atrMult: 1.0, rr: 3, exitMode: "trailing", sessionFilter: "none", maxHoldBars: 0 };
var D = [
  C(0 * H, 100, 101, 99, 100),
  C(1 * H, 100, 101, 99, 100, 4),
  C(2 * H, 100, 104, 96, 103),
  C(3 * H, 103, 115, 101, 114),
  C(4 * H, 114, 116, 100, 101),
  C(5 * H, 101, 102, 100, 101)
];
var rD = bt.run(D, cfgTrail, pre(D));
assert(rD.trades.length === 1 && rD.trades[0].reason === "Stop-Loss", "D: Exit am nachgezogenen Stop (Reason Stop-Loss)");
assert(approx(rD.trades[0].exit, 104) && rD.trades[0].exitTime === 4 * H, "D: Trailing-Stop 104 greift erst in der Folgekerze");
assert(approx(rD.trades[0].rMultiple, 0.4), "D: rMultiple = +0.4 relativ zum INITIALEN Risiko (Gewinn geschützt)");
assert(rD.stats.wins === 1 && rD.stats.losses === 0, "D: r > 0 zählt als Gewinn");

/* ---------- Szenario E: breakeven greift erst ab der Folgekerze ---------- */
// Risiko 10; Entry 100, Stop 90. Kerze 2: High 111 >= Entry+Risiko (110) armiert
// Breakeven – dieselbe Kerze fällt intrabar auf 95 (< Entry), wird aber NICHT
// rückwirkend ausgestoppt (Original-Stop 90 unberührt). Kerze 3: Low 99 <= 100 -> Exit 100, r = 0.
var cfgBE = { threshold: 4, atrMult: 1.0, rr: 3, exitMode: "breakeven", sessionFilter: "none", maxHoldBars: 0 };
var E = [
  C(0 * H, 100, 101, 99, 100),
  C(1 * H, 100, 101, 99, 100, 4),
  C(2 * H, 100, 111, 95, 98),
  C(3 * H, 101, 104, 99, 103),
  C(4 * H, 103, 104, 102, 103)
];
var rE = bt.run(E, cfgBE, pre(E));
assert(rE.trades.length === 1 && rE.trades[0].reason === "Stop-Loss", "E: Breakeven-Exit als Stop-Loss am Entry");
assert(rE.trades[0].exitTime === 3 * H, "E: Trigger-Kerze selbst stoppt nicht aus (erst Folgekerze)");
assert(approx(rE.trades[0].exit, 100) && approx(rE.trades[0].rMultiple, 0), "E: Exit am Entry, r = 0");
assert(rE.stats.n === 1 && rE.stats.wins === 0 && rE.stats.losses === 0, "E: Breakeven zählt weder als Gewinn noch als Verlust");

/* ---------- Szenario E2: breakeven gespiegelt für SHORT ---------- */
// SHORT-Entry 100, Risiko 10, Stop 110. Kerze 2: Low 89 <= Entry-Risiko (90) armiert
// Breakeven. Kerze 3: High 100 >= Stop 100 -> Exit 100, r = 0.
var E2 = [
  C(0 * H, 100, 101, 99, 100),
  C(1 * H, 100, 101, 99, 100, -4),
  C(2 * H, 100, 104, 89, 95),
  C(3 * H, 97, 100, 94, 95),
  C(4 * H, 95, 96, 94, 95)
];
var rE2 = bt.run(E2, cfgBE, pre(E2));
assert(rE2.trades.length === 1 && rE2.trades[0].direction === "SHORT", "E2: SELL-Score -> SHORT-Trade");
assert(rE2.trades[0].reason === "Stop-Loss" && approx(rE2.trades[0].exit, 100) && approx(rE2.trades[0].rMultiple, 0),
  "E2: SHORT-Breakeven am Entry (Exit 100, r = 0) erst in der Folgekerze");

/* ---------- Szenario F: sessionFilter blockt Entry außerhalb [7,21) UTC ---------- */
// Signal um 03:00 UTC wird geblockt, Signal um 12:00 UTC erlaubt.
var cfgSess = { threshold: 4, atrMult: 1.5, rr: 2, exitMode: "fixed", sessionFilter: "londonNY", maxHoldBars: 0 };
var F = [
  C(1 * H, 100, 101, 99, 100),
  C(3 * H, 100, 101, 99, 100, 5),
  C(4 * H, 100, 101, 99, 100),
  C(12 * H, 100, 101, 99, 100, 5),
  C(13 * H, 100, 103, 98, 101),
  C(14 * H, 101, 104, 99, 102)
];
var rF = bt.run(F, cfgSess, pre(F));
assert(rF.trades.length === 1 && rF.trades[0].entryTime === 13 * H, "F: 03:00-Signal geblockt, 12:00-Signal handelbar");
var rFnone = bt.run(F, cfgFixed, pre(F));
assert(rFnone.trades.length === 1 && rFnone.trades[0].entryTime === 4 * H, "F: ohne Filter greift bereits das 03:00-Signal");

/* ---------- Szenario F2: Session-Grenzen über precomputed.utcHour ---------- */
// Kerzenzeiten liegen alle bei Stunde 0-2 (würden geblockt) – precomputed.utcHour hat Vorrang.
var G = [
  C(0 * H, 100, 101, 99, 100, 5),
  C(1 * H, 100, 101, 99, 100),
  C(2 * H, 100, 101, 99, 101)
];
// Maßgeblich ist die Stunde der ENTRY-Kerze (Index 1): dort wird tatsächlich gehandelt.
function runHour(h) {
  var p = pre(G);
  p.utcHour = [9, h, 9];
  return bt.run(G, cfgSess, p);
}
assert(runHour(7).trades.length === 1, "F2: Entry-Stunde 7 erlaubt (untere Grenze inklusive)");
assert(runHour(20).trades.length === 1, "F2: Entry-Stunde 20 erlaubt");
assert(runHour(21).trades.length === 0, "F2: Entry-Stunde 21 geblockt (obere Grenze exklusiv)");
assert(runHour(6).trades.length === 0, "F2: Entry-Stunde 6 geblockt");
// Signalkerze außerhalb, Entry-Kerze innerhalb -> handelbar (Entry-Semantik)
(function () {
  var p = pre(G); p.utcHour = [22, 9, 9];
  assert(bt.run(G, cfgSess, p).trades.length === 1, "F2: Signal 22 Uhr, Entry 9 Uhr -> Entry-Kerze entscheidet");
})();

/* ---------- Szenario Z: maxHoldBars -> Zeit-Exit ---------- */
// Entry an Kerze 2 (zählt als Kerze 1 im Trade), maxHoldBars 3 -> Exit zum Close von Kerze 4.
var cfgHold = { threshold: 4, atrMult: 1.5, rr: 2, exitMode: "fixed", sessionFilter: "none", maxHoldBars: 3 };
var Z = [
  C(0 * H, 100, 101, 99, 100),
  C(1 * H, 100, 101, 99, 100, 4),
  C(2 * H, 100, 102, 98, 101),
  C(3 * H, 101, 103, 99, 102),
  C(4 * H, 102, 104, 100, 102),
  C(5 * H, 102, 103, 101, 102)
];
var rZ = bt.run(Z, cfgHold, pre(Z));
assert(rZ.trades.length === 1 && rZ.trades[0].reason === "Zeit-Exit", "Z: Zwangs-Exit per Zeit-Exit");
assert(rZ.trades[0].exitTime === 4 * H && rZ.trades[0].bars === 3, "Z: Exit zum Close nach 3 Kerzen im Trade");
assert(approx(rZ.trades[0].rMultiple, 2 / 15), "Z: r = 2/15 zum Close (102)");

/* ---------- Szenario S: SHORT-Vorzeichen (Take-Profit und Stop-Loss) ---------- */
// SHORT: Entry 100, Risiko 15 -> Stop 115, Target 70. Low 68 -> TP 70, r = +2.
var S1 = [
  C(0 * H, 100, 101, 99, 100),
  C(1 * H, 100, 101, 99, 100, -4),
  C(2 * H, 100, 104, 96, 98),
  C(3 * H, 98, 99, 68, 72),
  C(4 * H, 72, 73, 71, 72)
];
var rS1 = bt.run(S1, cfgFixed, pre(S1));
assert(rS1.trades.length === 1 && rS1.trades[0].direction === "SHORT", "S: Score <= -threshold -> SHORT");
assert(rS1.trades[0].reason === "Take-Profit" && approx(rS1.trades[0].exit, 70) && approx(rS1.trades[0].rMultiple, 2),
  "S: SHORT-Target 70 (Entry - rr*Risiko), r = +2");
// SHORT ausgestoppt: High 116 >= Stop 115 -> r = -1.
var S2 = [
  C(0 * H, 100, 101, 99, 100),
  C(1 * H, 100, 101, 99, 100, -5),
  C(2 * H, 100, 104, 96, 102),
  C(3 * H, 102, 116, 101, 110),
  C(4 * H, 110, 111, 109, 110)
];
var rS2 = bt.run(S2, cfgFixed, pre(S2));
assert(rS2.trades[0] && rS2.trades[0].reason === "Stop-Loss" && approx(rS2.trades[0].exit, 115) && approx(rS2.trades[0].rMultiple, -1),
  "S: SHORT-Stop 115 (Entry + Risiko), r = -1");

/* ---------- Szenario W: Gegensignal + Reversal + Laufzeitende ---------- */
// LONG ab Kerze 2 (Entry 100); Kerze 4 hat Score -6 -> Exit zum Close 103 ('Gegensignal'),
// gleichzeitig SHORT-Signal -> Reversal-Entry Kerze 5 (103); läuft bis zur letzten Kerze.
var W = [
  C(0 * H, 100, 101, 99, 100),
  C(1 * H, 100, 101, 99, 100, 4),
  C(2 * H, 100, 103, 97, 101),
  C(3 * H, 101, 104, 98, 102),
  C(4 * H, 102, 105, 99, 103, -6),
  C(5 * H, 103, 105, 95, 97),
  C(6 * H, 97, 99, 90, 92)
];
var rW = bt.run(W, cfgFixed, pre(W));
assert(rW.trades.length === 2, "W: 2 Trades (LONG + Reversal-SHORT)");
var w1 = rW.trades[0] || {}, w2 = rW.trades[1] || {};
assert(w1.direction === "LONG" && w1.reason === "Gegensignal" && approx(w1.exit, 103) && w1.exitTime === 4 * H,
  "W: LONG-Exit per Gegensignal zum Close (103)");
assert(approx(w1.rMultiple, 3 / 15), "W: LONG r = +0.2");
assert(w2.direction === "SHORT" && w2.entry === 103 && w2.reason === "Laufzeitende" && approx(w2.exit, 92),
  "W: Reversal-SHORT endet per Laufzeitende zum Close (92)");
assert(approx(w2.rMultiple, 11 / 15), "W: SHORT r = 11/15");
assert(approx(rW.stats.totalR, 3 / 15 + 11 / 15) && rW.stats.wins === 2, "W: Statistik summiert beide Trades");

/* ---------- Statistik-Handrechnung (buildStats + _maxDrawdownR) ---------- */
var st = bt.buildStats([{ rMultiple: 2 }, { rMultiple: -1 }, { rMultiple: 0 }, { rMultiple: 3 }, { rMultiple: -2 }]);
assert(st.n === 5 && st.wins === 2 && st.losses === 2, "Stats: n=5, wins=2, losses=2 (Breakeven separat)");
assert(approx(st.winrate, 0.4) && approx(st.totalR, 2) && approx(st.avgR, 0.4), "Stats: winrate 0.4, totalR 2, avgR 0.4");
assert(approx(st.profitFactor, 5 / 3), "Stats: profitFactor = 5/3");
assert(approx(st.maxDrawdownR, 2), "Stats: maxDrawdownR = 2 (Kurve 2,1,1,4,2)");
assert(bt.buildStats([]).n === 0 && bt.buildStats([]).profitFactor === null, "Stats: leere Trade-Liste -> emptyStats");
assert(bt.buildStats([{ rMultiple: 1 }, { rMultiple: 0 }]).profitFactor === null, "Stats: profitFactor null ohne Verluste");
assert(approx(bt._maxDrawdownR([1, -2, 3, -1, -1, 2]), 2), "_maxDrawdownR([1,-2,3,-1,-1,2]) = 2");
assert(bt._maxDrawdownR([]) === 0 && bt._maxDrawdownR([1, 2, 3]) === 0, "_maxDrawdownR: leer / nur Gewinne = 0");

/* ---------- Fallback: ohne precomputed nutzt run XAU.fast.computeSeries ---------- */
var savedFast = XAU.fast;
XAU.fast = { computeSeries: function (cs) { return pre(cs); } };
var rFb = bt.run(A, cfgFixed); // kein precomputed übergeben
assert(rFb.trades.length === 1 && rFb.trades[0].reason === "Take-Profit" && approx(rFb.trades[0].rMultiple, 2),
  "Fallback: run ohne precomputed berechnet Serien via XAU.fast selbst");
XAU.fast = savedFast;

/* ---------- Robustheit: nie werfen ---------- */
assert(bt.run([], cfgFixed, { score: [], atr: [] }).trades.length === 0, "Robust: leere Eingabe -> leeres Ergebnis");
assert(bt.run(null, cfgFixed).stats.n === 0, "Robust: null-Kerzen -> leeres Ergebnis");
assert(bt.run(A, cfgFixed, {}).trades.length === 0, "Robust: precomputed ohne score-Array -> keine Trades");
var rDef = bt.run(A, null, pre(A));
assert(rDef.config.threshold === 4 && rDef.config.exitMode === "fixed" && rDef.config.sessionFilter === "none" && rDef.config.maxHoldBars === 0,
  "Robust: config-Defaults (threshold 4, fixed, none, 0)");
assert(rDef.trades.length === 1 && approx(rDef.trades[0].rMultiple, 2), "Robust: Defaults entsprechen cfgFixed");

/* ---------- Determinismus: identische Eingabe -> identisches Ergebnis ---------- */
assert(JSON.stringify(bt.run(D, cfgTrail, pre(D))) === JSON.stringify(rD), "Determinismus: zwei Läufe, identisches JSON");

if (failures === 0) console.log("SELFTEST OK");
else { console.error(failures + " Assertion(s) fehlgeschlagen"); process.exit(1); }

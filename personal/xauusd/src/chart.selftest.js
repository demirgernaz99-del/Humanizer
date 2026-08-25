/* Selbsttest für XAU.chart._math — Node-Skript, kein Canvas/DOM nötig.
   Erfolg: "SELFTEST OK", sonst Exit 1. */
"use strict";
var chart = require("./chart.js");
var M = chart._math;

var n = 0;
function fail(msg) {
  console.error("FEHLGESCHLAGEN: " + msg);
  process.exit(1);
}
function assert(cond, msg) {
  n++;
  if (!cond) fail(msg);
}
function eq(a, b) {
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/* ---------- alignSeries: rechtsbündig ---------- */
// Fall 1: Serie kürzer als candles -> führende nulls
assert(eq(M.alignSeries(5, [10, 20, 30], 0), [null, null, 10, 20, 30]),
  "alignSeries: kürzere Serie rechtsbündig");
// Fall 2: gleiche Länge -> 1:1
assert(eq(M.alignSeries(3, [1, 2, 3], 0), [1, 2, 3]),
  "alignSeries: gleiche Länge unverändert");
// Fall 3: mit viewStart -> Offsets verschieben sich korrekt
// candles=6, Serie=4 (offset=2), viewStart=3 -> Indizes 3,4,5 -> Serie[1],[2],[3]
assert(eq(M.alignSeries(6, [100, 200, 300, 400], 3), [200, 300, 400]),
  "alignSeries: viewStart-Offset");
// Defensive: fehlende Serie -> nur nulls, wirft nie
assert(eq(M.alignSeries(3, undefined, 1), [null, null]),
  "alignSeries: fehlende Serie -> nulls");

/* ---------- makeScale: min -> unten, max -> oben ---------- */
var s = M.makeScale(0, 100, 10, 210); // top=10, bottom=210
assert(s(0) === 210, "makeScale: min landet unten (bottom)");
assert(s(100) === 10, "makeScale: max landet oben (top)");
assert(s(50) === 110, "makeScale: Mitte linear");
// entartete Spanne (min==max) wirft nicht und liefert endliche Werte
var s2 = M.makeScale(5, 5, 0, 100);
assert(isFinite(s2(5)), "makeScale: min==max bleibt endlich");

/* ---------- viewSlice: letzte N Kerzen ---------- */
var v1 = M.viewSlice(500, 160);
assert(v1.start === 340 && v1.count === 160, "viewSlice: 500 Kerzen -> Start 340, 160 sichtbar");
var v2 = M.viewSlice(90, 160);
assert(v2.start === 0 && v2.count === 90, "viewSlice: weniger Kerzen als View -> alles sichtbar");
var v3 = M.viewSlice(0, 160);
assert(v3.start === 0 && v3.count === 0, "viewSlice: leer -> leer");

/* ---------- Zusammenspiel: View-Slice + Ausrichtung ---------- */
// 300 Kerzen, EMA200-artige Serie der Länge 101 (offset=199), View ab 140:
// Index 140..198 -> null, ab 199 -> Serie[0..]
var candleCount = 300;
var serie = [];
for (var i = 0; i < 101; i++) serie.push(i);
var vs = M.viewSlice(candleCount, 160);
var al = M.alignSeries(candleCount, serie, vs.start);
assert(al.length === vs.count, "Zusammenspiel: ausgerichtete Länge == View-Länge");
assert(al[0] === null && al[58] === null, "Zusammenspiel: Werte vor Serienstart sind null");
assert(al[59] === 0 && al[159] === 100, "Zusammenspiel: erster/letzter Serienwert korrekt platziert");

console.log("Assertions: " + n);
console.log("SELFTEST OK");

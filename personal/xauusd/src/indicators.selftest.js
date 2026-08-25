/* Selbsttest für XAU.ind — Node-Skript.
   Prüft jede Funktion gegen handgerechnete Erwartungswerte.
   Erfolg: "SELFTEST OK", sonst Exit 1. */
"use strict";
var ind = require("./indicators.js");

var n = 0;
function fail(msg) {
  console.error("FEHLGESCHLAGEN: " + msg);
  process.exit(1);
}
function assert(cond, msg) {
  n++;
  if (!cond) fail(msg);
}
function approx(a, b, eps) {
  if (eps === undefined) eps = 1e-9;
  return typeof a === "number" && isFinite(a) && Math.abs(a - b) <= eps;
}
function approxArr(a, b, eps) {
  if (!Array.isArray(a) || a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) if (!approx(a[i], b[i], eps)) return false;
  return true;
}
function mk(low, high, close, i) {
  return { time: i * 60000, open: low, high: high, low: low, close: close, volume: 1 };
}

/* ---------- SMA ---------- */
// Hand: Fenster (1,2)(2,3)(3,4)(4,5) -> 1.5, 2.5, 3.5, 4.5
assert(approxArr(ind.sma([1, 2, 3, 4, 5], 2), [1.5, 2.5, 3.5, 4.5]), "sma Grundfall");
assert(ind.sma([1, 2], 5).length === 0, "sma zu kurz -> []");

/* ---------- EMA ---------- */
// Hand: Start=SMA(1,2,3)=2, k=0.5 -> 2, 4*0.5+2*0.5=3, 5*0.5+3*0.5=4
assert(approxArr(ind.ema([1, 2, 3, 4, 5], 3), [2, 3, 4]), "ema Grundfall");
assert(ind.ema([], 3).length === 0, "ema leer -> []");

/* ---------- RSI ---------- */
// Hand, period=3, Werte 1,2,3,4,3,4: Changes +1,+1,+1,-1,+1
// avgG=1, avgL=0 -> 100; avgG=2/3, avgL=1/3 -> RS=2 -> 66.6667;
// avgG=7/9, avgL=2/9 -> RS=3.5 -> 77.7778
assert(approxArr(ind.rsi([1, 2, 3, 4, 3, 4], 3), [100, 100 - 100 / 3, 100 - 100 / 4.5], 1e-9), "rsi handgerechnet");
assert(ind.rsi([1, 2, 3], 14).length === 0, "rsi zu kurz -> []");

/* ---------- MACD ---------- */
// Hand, fast=2 slow=3 signal=2 auf 1..5:
// emaFast=[1.5,2.5,3.5,4.5], emaSlow=[2,3,4], macdLine=[0.5,0.5,0.5]
// signal=[0.5,0.5], hist=[0,0]
var m = ind.macd([1, 2, 3, 4, 5], 2, 3, 2);
assert(approxArr(m.macdLine, [0.5, 0.5, 0.5]), "macd macdLine");
assert(approxArr(m.signalLine, [0.5, 0.5]) && approxArr(m.hist, [0, 0]), "macd signal/hist");
var mEmpty = ind.macd([1, 2], 12, 26, 9);
assert(mEmpty.macdLine.length === 0 && mEmpty.hist.length === 0, "macd zu kurz -> leere Arrays");

/* ---------- Bollinger ---------- */
// Hand, period=2 numStd=2: Fenster (1,2): mean 1.5, std 0.5 -> [0.5,1.5,2.5] usw.
var bb = ind.bollinger([1, 2, 3, 4], 2, 2);
assert(bb.length === 3
  && approxArr(bb[0], [0.5, 1.5, 2.5])
  && approxArr(bb[1], [1.5, 2.5, 3.5])
  && approxArr(bb[2], [2.5, 3.5, 4.5]), "bollinger handgerechnet");

/* ---------- 20-Kerzen-Trendserie (Hand nachgerechnet) ----------
   Kerze i: low=i, high=i+2, close=i+1.
   TR_i = max(2, |i+2-i|, |i-i|) = 2 fuer alle i -> ATR(14) = 2 ueberall, Laenge 20-14=6.
   Stochastik(14): maxHigh=i+2, minLow=i-13 -> Range 15, close-minLow=14
   -> FastK = 1400/15 = 93.333... konstant -> SlowK und %D ebenso. */
var trend20 = [];
for (var i = 0; i < 20; i++) trend20.push(mk(i, i + 2, i + 1, i));

var a14 = ind.atr(trend20, 14);
assert(a14.length === 6, "atr(20 Kerzen, 14): Laenge 6");
assert(approxArr(a14, [2, 2, 2, 2, 2, 2]), "atr Trendserie: konstant 2");

var st = ind.stochastic(trend20, 14, 3, 3);
// FastK-Laenge 7 -> SlowK 5 -> %D 3
assert(st.k.length === 5 && st.d.length === 3, "stochastic Laengen (5/3)");
assert(approx(st.k[st.k.length - 1], 1400 / 15, 1e-9), "stochastic %K = 93.33 (1400/15)");
assert(approx(st.d[st.d.length - 1], 1400 / 15, 1e-9), "stochastic %D = 93.33 (1400/15)");

/* ---------- ATR handgerechnet, period=3 ----------
   (h,l,c): (10,8,9)(11,9,10)(13,10,12)(12,9,10)(14,10,13)
   TRs: 2, 3, 3, 4 -> Start SMA=8/3, dann (8/3*2+4)/3 = 28/9 */
var c5 = [mk(8, 10, 9, 0), mk(9, 11, 10, 1), mk(10, 13, 12, 2), mk(9, 12, 10, 3), mk(10, 14, 13, 4)];
assert(approxArr(ind.atr(c5, 3), [8 / 3, 28 / 9]), "atr handgerechnet (8/3, 28/9)");
assert(ind.atr([], 14).length === 0 && ind.atr(c5, 14).length === 0, "atr zu kurz -> []");

/* ---------- Stochastik handgerechnet, k=3 smooth=2 d=2 ----------
   (h,l,c): (10,8,9)(11,9,10)(12,9,11)(12,10,10)(13,10,12)(13,11,11)
   FastK: (11-8)/4=75, (10-9)/3=33.33, (12-9)/4=75, (11-10)/3=33.33
   SlowK = SMA(2) = jeweils (75+100/3)/2 = 325/6; %D ebenso */
var c6 = [mk(8, 10, 9, 0), mk(9, 11, 10, 1), mk(9, 12, 11, 2), mk(10, 12, 10, 3), mk(10, 13, 12, 4), mk(11, 13, 11, 5)];
var st2 = ind.stochastic(c6, 3, 2, 2);
assert(approxArr(st2.k, [325 / 6, 325 / 6, 325 / 6]), "stochastic %K handgerechnet (325/6)");
assert(approxArr(st2.d, [325 / 6, 325 / 6]), "stochastic %D handgerechnet (325/6)");

// Division durch 0 -> 50 (flache Kerzen)
var flat = [];
for (var f = 0; f < 6; f++) flat.push(mk(5, 5, 5, f));
var stFlat = ind.stochastic(flat, 3, 1, 1);
assert(approx(stFlat.k[stFlat.k.length - 1], 50), "stochastic flach -> 50");

/* ---------- ADX ----------
   Trendserie (streng steigend): +DM=1, -DM=0, TR=2
   -> +DI = 100*1/2 = 50, -DI = 0, DX = 100, ADX = 100 (exakt). */
var adxT = ind.adx(trend20, 3);
assert(adxT.plusDI.length === 17 && adxT.minusDI.length === 17 && adxT.adx.length === 15, "adx Laengen (17/17/15)");
assert(approx(adxT.plusDI[16], 50) && approx(adxT.minusDI[16], 0), "adx Trend: +DI=50, -DI=0");
assert(approx(adxT.adx[14], 100), "adx Trend: ADX=100");

// Wertebereich 0..100 auf pseudo-zufaelliger Serie
var rnd = [];
var seed = 42;
function rng() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
var base = 2400;
for (var r = 0; r < 60; r++) {
  base += (rng() - 0.5) * 10;
  var lo = base - rng() * 5, hi = base + rng() * 5;
  rnd.push(mk(lo, hi, lo + rng() * (hi - lo), r));
}
var adxR = ind.adx(rnd, 14);
assert(adxR.adx.length > 0, "adx Zufallsserie liefert Werte");
var inRange = true;
for (var q = 0; q < adxR.adx.length; q++) {
  if (!(adxR.adx[q] >= 0 && adxR.adx[q] <= 100)) inRange = false;
}
for (var q2 = 0; q2 < adxR.plusDI.length; q2++) {
  if (adxR.plusDI[q2] < 0 || adxR.minusDI[q2] < 0) inRange = false;
}
assert(inRange, "adx/DI Wertebereich 0..100");
var adxEmpty = ind.adx([], 14);
assert(adxEmpty.adx.length === 0 && adxEmpty.plusDI.length === 0, "adx leer -> leere Arrays");

/* ---------- Pivots (exakt) ----------
   H=2400 L=2380 C=2390: P=2390, R1=2400, S1=2380, R2=2410, S2=2370 */
var pv = ind.pivots({ time: 0, open: 2385, high: 2400, low: 2380, close: 2390, volume: 1 });
assert(approx(pv.p, 2390) && approx(pv.r1, 2400) && approx(pv.s1, 2380), "pivots P/R1/S1 exakt");
assert(approx(pv.r2, 2410) && approx(pv.s2, 2370), "pivots R2/S2 exakt");
assert(ind.pivots(null) === null && ind.pivots({ high: NaN, low: 1, close: 1 }) === null, "pivots ungueltig -> null");

/* ---------- Fibonacci (exakt) ----------
   high=2400 low=2300, diff=100 */
var fb = ind.fib(2400, 2300);
assert(approx(fb.level_0, 2400) && approx(fb.level_100, 2300), "fib Endpunkte");
assert(approx(fb.level_236, 2376.4) && approx(fb.level_382, 2361.8)
  && approx(fb.level_500, 2350) && approx(fb.level_618, 2338.2)
  && approx(fb.level_786, 2321.4), "fib Zwischenlevel exakt");
assert(ind.fib(NaN, 1) === null, "fib ungueltig -> null");

console.log(n + " Assertions gruen");
console.log("SELFTEST OK");

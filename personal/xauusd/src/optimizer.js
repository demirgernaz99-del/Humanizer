/* XAU.opt – Walk-Forward-Optimizer für die XAU/USD-Strategie.
   Testet ein deterministisches Konfigurations-Grid (threshold/atrMult/rr/exitMode/
   sessionFilter/maxHoldBars) per XAU.backtest.run auf 3 anchored Walk-Forward-Folds:
     Fold1: Train [0,50%),   Test [50%,66.7%)
     Fold2: Train [0,66.7%), Test [66.7%,83.3%)
     Fold3: Train [0,83.3%), Test [83.3%,100%)
   Die Indikator-Serien werden EINMAL via XAU.fast.computeSeries berechnet und für
   Teilbereiche einfach mitgeslict (sliceRange): alle Serien sind gleich lang wie
   candles und kausal berechnet – Werte am Slice-Anfang stammen ausschließlich aus
   der Vergangenheit, ihre Nutzung ist also KEIN Look-Ahead. Deshalb werden beim
   Slicen bewusst KEINE führenden Werte genullt.
   Je Fold gewinnt eine Config NUR auf dem Train-Bereich (Objective mit minTrades-Guard).
   outOfSample = klassische Walk-Forward-Verkettung: die Trades des JEWEILIGEN
   Fold-Siegers auf seinem EIGENEN Test-Segment, chronologisch konkateniert – kein
   bewerteter Test-Bar liegt im Train-Fenster der Config, die darauf bewertet wird.
   Die finale Config wird OHNE Testdaten bestimmt: Mehrheit unter den Fold-Siegern,
   sonst der Fold-3-Sieger (meistes Trainingsmaterial). inSample = finale Config auf
   [0,83.3%) – zur Einordnung, nicht zur Auswahl.
   Async: Auswertung in Chunks à 50 Configs mit setTimeout(0)-Yield (UI-freundlich).
   Alles deterministisch – kein Math.random(), kein Date.now(). Nie werfen. */
(function () {
  "use strict";
  var root = (typeof window !== "undefined") ? window : globalThis;
  root.XAU = root.XAU || {};

  // In Node: Abhängigkeiten defensiv laden; im Browser hängen sie am globalen XAU.
  var fastLocal = null, btLocal = null;
  if (typeof module !== "undefined" && typeof require === "function") {
    try { fastLocal = require("./fastengine.js"); } catch (e) { fastLocal = null; }
    try { btLocal = require("./backtest.js"); } catch (e2) { btLocal = null; }
  }
  function getFast() { return root.XAU.fast || fastLocal || null; }
  function getBacktest() { return root.XAU.backtest || btLocal || null; }

  var CHUNK = 50; // Configs pro Chunk zwischen zwei Yields (und Progress-Drosselung)

  var THRESHOLDS = [3, 4, 5, 6];
  var ATR_MULTS = [1.0, 1.5, 2.0, 2.5];
  var RRS = [1.0, 1.5, 2.0, 3.0];
  var EXIT_MODES = ["fixed", "trailing", "breakeven"];
  var HOLD_BARS = [0, 24, 48];

  function num(x) { return typeof x === "number" && isFinite(x); }

  function clone(obj) {
    var out = {};
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
    return out;
  }

  /* Volles deterministisches Grid; sessionFilter 'londonNY' nur für 15m/1h
     (Intraday-Sessions sind auf 4h/1d bedeutungslos). */
  function buildGrid(tf) {
    var sessions = (tf === "15m" || tf === "1h") ? ["none", "londonNY"] : ["none"];
    var grid = [];
    for (var a = 0; a < THRESHOLDS.length; a++)
      for (var b = 0; b < ATR_MULTS.length; b++)
        for (var c = 0; c < RRS.length; c++)
          for (var d = 0; d < EXIT_MODES.length; d++)
            for (var e = 0; e < sessions.length; e++)
              for (var f = 0; f < HOLD_BARS.length; f++)
                grid.push({
                  threshold: THRESHOLDS[a],
                  atrMult: ATR_MULTS[b],
                  rr: RRS[c],
                  exitMode: EXIT_MODES[d],
                  sessionFilter: sessions[e],
                  maxHoldBars: HOLD_BARS[f]
                });
    return grid;
  }

  /* Teilbereich [start,end) aus precomputed: alle Serien-Arrays mit demselben Offset
     mitslicen (sie sind gleich lang wie candles). Führende Werte NICHT nullen –
     die Serien sind kausal, Vorgeschichte-Signale sind kein Look-Ahead. */
  function sliceRange(precomputed, start, end) {
    var out = {};
    if (!precomputed || typeof precomputed !== "object") return out;
    for (var k in precomputed) {
      if (!Object.prototype.hasOwnProperty.call(precomputed, k)) continue;
      out[k] = Array.isArray(precomputed[k]) ? precomputed[k].slice(start, end) : precomputed[k];
    }
    return out;
  }

  function zeroStats() {
    return { n: 0, wins: 0, losses: 0, winrate: 0, totalR: 0, profitFactor: null, maxDrawdownR: 0 };
  }

  /* Stats exakt im Vertragsformat aus einer (chronologischen) Trade-Liste.
     wins = r > 0, losses = r < 0 (r === 0 ist Breakeven), profitFactor null ohne Verluste. */
  function statsFromTrades(trades) {
    var s = zeroStats();
    if (!Array.isArray(trades) || !trades.length) return s;
    var sumPos = 0, sumNeg = 0, cum = 0, peak = 0, dd = 0;
    for (var i = 0; i < trades.length; i++) {
      var r = trades[i] ? trades[i].rMultiple : 0;
      if (!num(r)) r = 0;
      s.totalR += r;
      if (r > 0) { s.wins++; sumPos += r; }
      else if (r < 0) { s.losses++; sumNeg += r; }
      cum += r;
      if (cum > peak) peak = cum;
      if (peak - cum > dd) dd = peak - cum;
    }
    s.n = trades.length;
    s.winrate = s.wins / s.n;
    s.profitFactor = (sumNeg === 0) ? null : sumPos / Math.abs(sumNeg);
    s.maxDrawdownR = dd;
    return s;
  }

  /* Objective -> [Primärwert, Tiebreak] oder null (= unzulässig).
     'winrate': winrate, Tiebreak totalR. 'pf': profitFactor (null wie Infinity, aber
     nur bei wins >= 3, sonst unzulässig), Tiebreak Trades. 'totalR': totalR, Tiebreak winrate.
     Guard: trades < minTrades -> unzulässig. relaxed = totaler Fallback-Schlüssel,
     falls KEINE Config zulässig ist (nie null; pf null mit wins < 3 zählt dann 0). */
  // Wilson-Lower-Bound (95%) der Winrate: bestraft Mini-Stichproben,
  // 8/8 Gewinne (~0.63) schlagen nicht 28/30 (~0.79).
  function wilsonLower(wins, n) {
    if (!n) return 0;
    var z = 1.959963984540054, p = wins / n;
    var denom = 1 + z * z / n;
    var center = p + z * z / (2 * n);
    var margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n);
    return Math.max(0, (center - margin) / denom);
  }

  function objectiveKey(stats, objective, minTrades, relaxed) {
    var decisive = stats.wins + stats.losses; // Breakeven-Trades zählen nicht für den Guard
    if (!relaxed && decisive < minTrades) return null;
    if (objective === "winrate") return [wilsonLower(stats.wins, decisive), stats.totalR];
    if (objective === "pf") {
      var pf = stats.profitFactor;
      if (pf === null) {
        // verlustfrei: nur mit belastbarer Stichprobe als "unendlich" werten
        if (stats.wins >= 5 && decisive >= minTrades) pf = Infinity;
        else if (relaxed) pf = 0;
        else return null;
      }
      return [pf, stats.n];
    }
    return [stats.totalR, stats.winrate]; // 'totalR'
  }

  // Strikt besser? Bei Gleichstand gewinnt der frühere Kandidat (deterministische Grid-Reihenfolge).
  function isBetter(key, bestKey) {
    if (!bestKey) return true;
    if (key[0] !== bestKey[0]) return key[0] > bestKey[0];
    return key[1] > bestKey[1];
  }

  // Backtest auf dem Teilbereich [start,end): Kerzen und precomputed mit gleichem Offset slicen.
  function runRange(bt, candles, precomputed, start, end, config) {
    var res = null;
    try { res = bt.run(candles.slice(start, end), config, sliceRange(precomputed, start, end)); }
    catch (e) { res = null; }
    return (res && Array.isArray(res.trades)) ? res.trades : [];
  }

  function emptyResult(tf) {
    return { tf: tf, config: null, inSample: zeroStats(), outOfSample: zeroStats(), folds: [], evaluated: 0 };
  }

  function yieldNow() { return new Promise(function (r) { setTimeout(r, 0); }); }

  /* optimize(candles, opts) -> Promise<Walk-Forward-Ergebnis>
     opts = { tf, objective: 'winrate'|'pf'|'totalR' (Default 'totalR'),
              minTrades (Default 8), onProgress(done,total) (gedrosselt, ~alle 50 Configs),
              grid (Override für Tests), precomputed (Override für Tests) }.
     evaluated = Anzahl getesteter Konfigurationen (Grid-Größe); onProgress zählt
     Auswertungen (Grid x 3 Folds). */
  async function optimize(candles, opts) {
    opts = opts || {};
    var tf = (typeof opts.tf === "string") ? opts.tf : "";
    var objective = (opts.objective === "winrate" || opts.objective === "pf" || opts.objective === "totalR")
      ? opts.objective : "totalR";
    var defaultMin = { winrate: 30, pf: 20, totalR: 20 };
    var minTrades = (num(opts.minTrades) && opts.minTrades >= 0)
      ? opts.minTrades
      : (defaultMin[opts.objective] || 20);
    var onProgress = (typeof opts.onProgress === "function") ? opts.onProgress : null;
    var grid = Array.isArray(opts.grid) ? opts.grid.map(clone) : buildGrid(tf);

    var bt = getBacktest();
    if (!bt || !Array.isArray(candles) || !grid.length) return emptyResult(tf);

    var n = candles.length;
    var i50 = Math.floor(n / 2);       // 50 %
    var i67 = Math.floor(n * 2 / 3);   // 66.7 %
    var i83 = Math.floor(n * 5 / 6);   // 83.3 %
    if (!(i50 > 0 && i50 < i67 && i67 < i83 && i83 < n)) return emptyResult(tf);

    // Indikator-Serien EINMAL über die volle Historie (oder Test-Override).
    var precomputed = (opts.precomputed && typeof opts.precomputed === "object") ? opts.precomputed : null;
    if (!precomputed) {
      var fast = getFast();
      if (!fast || typeof fast.computeSeries !== "function") return emptyResult(tf);
      try { precomputed = fast.computeSeries(candles); } catch (e) { precomputed = null; }
      if (!precomputed || !Array.isArray(precomputed.score)) return emptyResult(tf);
    }

    var folds = [
      { train: [0, i50], test: [i50, i67] },
      { train: [0, i67], test: [i67, i83] },
      { train: [0, i83], test: [i83, n] }
    ];

    var total = grid.length * folds.length;
    var done = 0, lastReported = -1;
    function report() {
      if (!onProgress) return;
      try { onProgress(done, total); } catch (e) { /* Progress darf nie stören */ }
      lastReported = done;
    }

    var foldOut = [];
    var winnerIdxs = [];
    var guardRelaxed = false;
    var oosTrades = []; // ehrliche WFA-Verkettung: Fold-Sieger auf JE EIGENEM Test-Segment
    for (var f = 0; f < folds.length; f++) {
      var tr = folds[f].train;
      var best = null, bestRelax = null; // {idx, key}
      for (var g = 0; g < grid.length; g++) {
        var st = statsFromTrades(runRange(bt, candles, precomputed, tr[0], tr[1], grid[g]));
        var key = objectiveKey(st, objective, minTrades, false);
        if (key && (!best || isBetter(key, best.key))) best = { idx: g, key: key };
        var rkey = objectiveKey(st, objective, 0, true);
        if (!bestRelax || isBetter(rkey, bestRelax.key)) bestRelax = { idx: g, key: rkey };
        done++;
        if (done % CHUNK === 0) { report(); await yieldNow(); }
      }
      // Fallback ohne zulässige Config: bester relaxter Schlüssel (deterministisch) – markieren!
      if (!best) guardRelaxed = true;
      var winIdx = best ? best.idx : (bestRelax ? bestRelax.idx : 0);
      winnerIdxs.push(winIdx);
      var te = folds[f].test;
      var testTrades = runRange(bt, candles, precomputed, te[0], te[1], grid[winIdx]);
      oosTrades = oosTrades.concat(testTrades);
      foldOut.push({
        trainRange: [tr[0], tr[1]],
        testRange: [te[0], te[1]],
        config: clone(grid[winIdx]),
        testStats: statsFromTrades(testTrades)
      });
    }
    if (lastReported !== total) report();

    // Finale Config OHNE Testdaten: Mehrheit unter den Fold-Siegern,
    // sonst der Fold-3-Sieger (auf dem meisten Trainingsmaterial gewählt).
    var chosenIdx = winnerIdxs[winnerIdxs.length - 1];
    for (var w = 0; w < winnerIdxs.length; w++) {
      var votes = 0;
      for (var v = 0; v < winnerIdxs.length; v++) if (winnerIdxs[v] === winnerIdxs[w]) votes++;
      if (votes >= 2) { chosenIdx = winnerIdxs[w]; break; }
    }

    // outOfSample: verkettete Fold-Test-Trades (kein Test-Bar im Train der bewerteten Config).
    // inSample: finale Config auf [0, 83.3%) – nur zur Einordnung.
    var oosStats = statsFromTrades(oosTrades);
    var inStats = statsFromTrades(runRange(bt, candles, precomputed, 0, i83, grid[chosenIdx]));

    return {
      tf: tf,
      config: clone(grid[chosenIdx]),
      inSample: inStats,
      outOfSample: oosStats,
      oosMethod: "wfa",           // verkettete Fold-Sieger-Tests, Auswahl train-only
      guardRelaxed: guardRelaxed, // true = Mindest-Trades unterschritten, Ergebnis nicht belastbar
      objective: objective,
      folds: foldOut,
      evaluated: grid.length
    };
  }

  root.XAU.opt = {
    CHUNK: CHUNK,
    optimize: optimize,
    buildGrid: buildGrid,
    sliceRange: sliceRange,
    _statsFromTrades: statsFromTrades,
    _objectiveKey: objectiveKey
  };
})();
if (typeof module !== "undefined") module.exports = (typeof window !== "undefined" ? window : globalThis).XAU.opt;

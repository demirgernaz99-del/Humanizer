/* XAU.backtest – Backtest v2 für die XAU/USD-Signal-Engine.
   Signale kommen aus vorberechneten Score-Serien (XAU.fast.computeSeries) – O(n) pro Lauf,
   keine analyzeTF-Aufrufe pro Bar mehr. Trade-Mechanik: Signal an Bar i (Score über/unter
   ±threshold), Entry am Open von Bar i+1 (kein Look-Ahead), nur ein Trade gleichzeitig.
   Je Kerze im Trade in fester Reihenfolge: Gap-Open jenseits Stop/Target -> Exit zum Open;
   Stop (konservativ vor Target); Target; danach exitMode-Update (trailing/breakeven zieht
   den Stop NACH den Checks nach, wirksam ab der Folgekerze); Gegensignal -> Exit zum Close;
   maxHoldBars -> 'Zeit-Exit' zum Close; letzte Kerze -> 'Laufzeitende'. rMultiple immer
   relativ zum INITIALEN Risiko. Nie werfen – im Zweifel leeres Ergebnis. */
(function () {
  "use strict";
  var root = (typeof window !== "undefined") ? window : globalThis;
  root.XAU = root.XAU || {};

  // In Node: Fast-Engine defensiv laden; im Browser hängt XAU.fast am globalen Objekt.
  var fastLocal = null;
  if (typeof module !== "undefined" && typeof require === "function") {
    try { fastLocal = require("./fastengine.js"); } catch (e) { fastLocal = null; }
  }
  function getFast() { return root.XAU.fast || fastLocal || null; }

  function num(x) { return typeof x === "number" && isFinite(x); }

  // Max. Rückgang der kumulierten R-Kurve (Start bei 0)
  function maxDrawdownR(rs) {
    if (!Array.isArray(rs) || !rs.length) return 0;
    var cum = 0, peak = 0, dd = 0;
    for (var i = 0; i < rs.length; i++) {
      if (!num(rs[i])) continue;
      cum += rs[i];
      if (cum > peak) peak = cum;
      if (peak - cum > dd) dd = peak - cum;
    }
    return dd;
  }

  function emptyStats() {
    return { n: 0, wins: 0, losses: 0, winrate: 0, avgR: 0, totalR: 0, profitFactor: null, maxDrawdownR: 0 };
  }

  /* wins = r > 0, losses = r < 0; r === 0 ist Breakeven und zählt weder als Gewinn
     noch als Verlust (wohl aber in n). profitFactor ist null bei 0 Verlusten. */
  function buildStats(trades) {
    var stats = emptyStats();
    if (!Array.isArray(trades) || !trades.length) return stats;
    var rs = [], sumPos = 0, sumNeg = 0, total = 0, wins = 0, losses = 0;
    for (var i = 0; i < trades.length; i++) {
      var r = trades[i] ? trades[i].rMultiple : 0;
      if (!num(r)) r = 0;
      rs.push(r);
      total += r;
      if (r > 0) { wins++; sumPos += r; }
      else if (r < 0) { losses++; sumNeg += r; }
      // r === 0: Breakeven – weder Gewinn noch Verlust
    }
    stats.n = trades.length;
    stats.wins = wins;
    stats.losses = losses;
    stats.winrate = wins / trades.length;
    stats.totalR = total;
    stats.avgR = total / trades.length;
    stats.profitFactor = (sumNeg === 0) ? null : sumPos / Math.abs(sumNeg);
    stats.maxDrawdownR = maxDrawdownR(rs);
    return stats;
  }

  var EXIT_MODES = { fixed: true, trailing: true, breakeven: true };

  function normalizeConfig(config) {
    config = config || {};
    return {
      threshold: (num(config.threshold) && Math.abs(config.threshold) > 0) ? Math.abs(config.threshold) : 4,
      atrMult: (num(config.atrMult) && config.atrMult > 0) ? config.atrMult : 1.5,
      rr: (num(config.rr) && config.rr > 0) ? config.rr : 2,
      exitMode: EXIT_MODES[config.exitMode] ? config.exitMode : "fixed",
      sessionFilter: config.sessionFilter === "londonNY" ? "londonNY" : "none",
      maxHoldBars: (num(config.maxHoldBars) && config.maxHoldBars > 0) ? Math.floor(config.maxHoldBars) : 0
    };
  }

  // UTC-Stunde der Kerze i: bevorzugt aus precomputed.utcHour, sonst aus candle.time (ms).
  function utcHourAt(pre, candles, i) {
    if (pre && Array.isArray(pre.utcHour) && num(pre.utcHour[i])) return pre.utcHour[i];
    var c = candles[i];
    if (c && num(c.time)) return new Date(c.time).getUTCHours();
    return null;
  }

  /* run(candles, config, precomputed)
     config: { threshold, atrMult, rr, exitMode: 'fixed'|'trailing'|'breakeven',
               sessionFilter: 'none'|'londonNY', maxHoldBars } – alles optional.
     precomputed: Ergebnis von XAU.fast.computeSeries(candles) – wird bei Bedarf
     selbst berechnet. Liefert { config, trades, stats }. */
  function run(candles, config, precomputed) {
    var cfg = normalizeConfig(config);
    var out = { config: cfg, trades: [], stats: emptyStats() };
    if (!Array.isArray(candles) || candles.length < 2) return out;

    var pre = (precomputed && typeof precomputed === "object") ? precomputed : null;
    if (!pre) {
      var fast = getFast();
      if (fast && typeof fast.computeSeries === "function") {
        try { pre = fast.computeSeries(candles); } catch (e) { pre = null; }
      }
    }
    var scores = pre ? (Array.isArray(pre.score) ? pre.score : pre.scores) : null;
    var atrs = (pre && Array.isArray(pre.atr)) ? pre.atr : null;
    if (!Array.isArray(scores)) return out;

    var trades = out.trades;
    var open = null;    // {direction, entry, entryTime, entryIndex, stop, target, risk, beDone}
    var pending = null; // {direction, atr} – Entry am Open der nächsten Kerze
    var n = candles.length;

    function closeTrade(exit, exitTime, exitIndex, reason) {
      // rMultiple immer relativ zum INITIALEN Risiko (entry - initialStop)
      var r = (open.direction === "LONG")
        ? (exit - open.entry) / open.risk
        : (open.entry - exit) / open.risk;
      trades.push({
        entryTime: open.entryTime,
        direction: open.direction,
        entry: open.entry,
        exit: exit,
        exitTime: exitTime,
        rMultiple: r,
        reason: reason,
        entryIndex: open.entryIndex,
        exitIndex: exitIndex,
        bars: exitIndex - open.entryIndex + 1
      });
      open = null;
    }

    for (var i = 0; i < n; i++) {
      var c = candles[i];
      if (!c || !num(c.open) || !num(c.high) || !num(c.low) || !num(c.close)) {
        pending = null; // Datenlücke: Signal verfällt, kein Entry mit veraltetem ATR
        continue;
      }

      // Pending-Signal der Vorkerze: Entry am Open dieser Kerze
      if (pending && !open) {
        var risk = cfg.atrMult * pending.atr;
        if (num(risk) && risk > 0) {
          open = {
            direction: pending.direction,
            entry: c.open,
            entryTime: c.time,
            entryIndex: i,
            stop: pending.direction === "LONG" ? c.open - risk : c.open + risk,
            target: pending.direction === "LONG" ? c.open + cfg.rr * risk : c.open - cfg.rr * risk,
            risk: risk,
            beDone: false
          };
        }
      }
      pending = null;

      // (1) Gap-Open jenseits Stop/Target -> Exit zum Open
      // (2) Stop (konservativ: vor Target, wenn beide berührt), (3) Target
      if (open) {
        if (open.direction === "LONG") {
          if (c.open <= open.stop) closeTrade(c.open, c.time, i, "Stop-Loss");
          else if (c.open >= open.target) closeTrade(c.open, c.time, i, "Take-Profit");
          else if (c.low <= open.stop) closeTrade(open.stop, c.time, i, "Stop-Loss");
          else if (c.high >= open.target) closeTrade(open.target, c.time, i, "Take-Profit");
        } else {
          if (c.open >= open.stop) closeTrade(c.open, c.time, i, "Stop-Loss");
          else if (c.open <= open.target) closeTrade(c.open, c.time, i, "Take-Profit");
          else if (c.high >= open.stop) closeTrade(open.stop, c.time, i, "Stop-Loss");
          else if (c.low <= open.target) closeTrade(open.target, c.time, i, "Take-Profit");
        }
      }

      // (4) exitMode: Stop NACH den Checks aktualisieren – wirksam ab der Folgekerze
      if (open) {
        if (cfg.exitMode === "trailing") {
          var aNow = atrs ? atrs[i] : null;
          if (num(aNow) && aNow > 0) {
            if (open.direction === "LONG") open.stop = Math.max(open.stop, c.close - cfg.atrMult * aNow);
            else open.stop = Math.min(open.stop, c.close + cfg.atrMult * aNow);
          }
        } else if (cfg.exitMode === "breakeven" && !open.beDone) {
          var beHit = (open.direction === "LONG")
            ? c.high >= open.entry + open.risk
            : c.low <= open.entry - open.risk;
          if (beHit) { open.stop = open.entry; open.beDone = true; }
        }
      }

      // Signal dieser Kerze aus dem vorberechneten Score
      var s = scores[i];
      var sig = null;
      if (num(s)) {
        if (s >= cfg.threshold) sig = "BUY";
        else if (s <= -cfg.threshold) sig = "SELL";
      }

      // (5) Gegensignal -> Exit zum Close
      if (open && sig && ((open.direction === "LONG" && sig === "SELL") || (open.direction === "SHORT" && sig === "BUY"))) {
        closeTrade(c.close, c.time, i, "Gegensignal");
      }

      // (6) Zeit-Exit: Entry-Kerze zählt als Kerze 1 im Trade
      if (open && cfg.maxHoldBars > 0 && (i - open.entryIndex + 1) >= cfg.maxHoldBars) {
        closeTrade(c.close, c.time, i, "Zeit-Exit");
      }

      // (7) Letzte Kerze -> Laufzeitende
      if (open && i === n - 1) closeTrade(c.close, c.time, i, "Laufzeitende");

      // Neuer Entry: nur ohne offenen Trade, mit Folgekerze, gültigem ATR und (optional) Session
      if (!open && sig && i + 1 < n) {
        var allowed = true;
        if (cfg.sessionFilter === "londonNY") {
          // maßgeblich ist die Entry-Kerze i+1 (dort wird gehandelt), zur Handelszeit bekannt
          var h = utcHourAt(pre, candles, i + 1);
          allowed = num(h) && h >= 7 && h < 21;
        }
        if (allowed) {
          var atrSig = atrs ? atrs[i] : null;
          if (num(atrSig) && atrSig > 0) {
            pending = { direction: sig === "BUY" ? "LONG" : "SHORT", atr: atrSig };
          }
        }
      }
    }

    // Ist die letzte Kerze ungültig, wurde ein offener Trade oben nie geschlossen:
    // zum letzten gültigen Close abrechnen, damit er nicht aus der Statistik fällt.
    if (open) {
      for (var z = n - 1; z >= 0; z--) {
        var cz = candles[z];
        if (cz && num(cz.close) && num(cz.time)) { closeTrade(cz.close, cz.time, z, "Laufzeitende"); break; }
      }
      if (open) open = null; // keine einzige gültige Kerze: Trade verwerfen
    }

    out.stats = buildStats(trades);
    return out;
  }

  root.XAU.backtest = { run: run, buildStats: buildStats, _maxDrawdownR: maxDrawdownR };
})();
if (typeof module !== "undefined") module.exports = (typeof window !== "undefined" ? window : globalThis).XAU.backtest;

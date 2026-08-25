/* XAU.backtest – Walk-forward-Backtest für die Signal-Engine (XAU/USD).
   Bar für Bar: Signal auf Fensterbasis, Entry am Open der Folgekerze (kein Look-Ahead),
   Stop/Target aus ATR zum Signalzeitpunkt. Nie werfen – im Zweifel leeres Ergebnis. */
(function () {
  "use strict";
  var root = (typeof window !== "undefined") ? window : globalThis;
  root.XAU = root.XAU || {};

  // In Node: Engine lokal laden; im Browser hängt XAU.engine am globalen Objekt.
  var engineLocal = null;
  if (typeof module !== "undefined" && typeof require === "function") {
    try { engineLocal = require("./engine.js"); } catch (e) { engineLocal = null; }
  }
  function getEngine() { return root.XAU.engine || engineLocal || null; }

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

  function buildStats(trades) {
    var stats = emptyStats();
    if (!trades.length) return stats;
    var rs = [], sumPos = 0, sumNeg = 0, total = 0, wins = 0;
    for (var i = 0; i < trades.length; i++) {
      var r = trades[i].rMultiple;
      if (!num(r)) r = 0;
      rs.push(r);
      total += r;
      if (r > 0) { wins++; sumPos += r; }
      else if (r < 0) { sumNeg += r; }
    }
    stats.n = trades.length;
    stats.wins = wins;
    stats.losses = trades.length - wins;
    stats.winrate = wins / trades.length;
    stats.totalR = total;
    stats.avgR = total / trades.length;
    stats.profitFactor = (sumNeg === 0) ? null : sumPos / Math.abs(sumNeg);
    stats.maxDrawdownR = maxDrawdownR(rs);
    return stats;
  }

  function run(candles, opts) {
    opts = opts || {};
    var atrMult = num(opts.atrMult) ? opts.atrMult : 1.5;
    var rr = num(opts.rr) ? opts.rr : 2;
    var threshold = num(opts.threshold) ? opts.threshold : 4;
    var warmup = num(opts.warmup) ? opts.warmup : 250;

    var engine = getEngine();
    if (!engine || !Array.isArray(candles) || candles.length <= warmup) {
      return { trades: [], stats: emptyStats() };
    }

    var trades = [];
    var open = null;     // {direction, entry, entryTime, stop, target, risk}
    var pending = null;  // {direction, atr} – Entry am Open der nächsten Kerze
    var n = candles.length;

    function closeTrade(exit, exitTime, reason) {
      var r;
      if (open.direction === "LONG") r = (exit - open.entry) / open.risk;
      else r = (open.entry - exit) / open.risk;
      trades.push({
        entryTime: open.entryTime,
        direction: open.direction,
        entry: open.entry,
        exit: exit,
        exitTime: exitTime,
        rMultiple: r,
        reason: reason
      });
      open = null;
    }

    for (var i = warmup; i < n; i++) {
      var c = candles[i];
      if (!c || !num(c.open) || !num(c.high) || !num(c.low) || !num(c.close)) continue;

      // Pending-Signal der Vorkerze: Entry am Open dieser Kerze
      if (pending && !open) {
        var risk = atrMult * pending.atr;
        if (risk > 0) {
          open = {
            direction: pending.direction,
            entry: c.open,
            entryTime: c.time,
            stop: pending.direction === "LONG" ? c.open - risk : c.open + risk,
            target: pending.direction === "LONG" ? c.open + rr * risk : c.open - rr * risk,
            risk: risk
          };
        }
      }
      pending = null;

      // Offener Trade: erst Stop (konservativ), dann Target – intrabar
      if (open) {
        if (open.direction === "LONG") {
          if (c.low <= open.stop) closeTrade(open.stop, c.time, "Stop-Loss");
          else if (c.high >= open.target) closeTrade(open.target, c.time, "Take-Profit");
        } else {
          if (c.high >= open.stop) closeTrade(open.stop, c.time, "Stop-Loss");
          else if (c.low <= open.target) closeTrade(open.target, c.time, "Take-Profit");
        }
      }

      // Signal zum Kerzenschluss (Fenster auf letzte 300 Kerzen begrenzt)
      var res = null;
      try {
        res = engine.analyzeTF(candles.slice(Math.max(0, i - 299), i + 1));
      } catch (e) { res = null; }
      var sig = null;
      if (res && num(res.score)) {
        if (res.score >= threshold) sig = "BUY";
        else if (res.score <= -threshold) sig = "SELL";
      }

      // Gegensignal: Exit zum Close
      if (open && sig && ((open.direction === "LONG" && sig === "SELL") || (open.direction === "SHORT" && sig === "BUY"))) {
        closeTrade(c.close, c.time, "Gegensignal");
      }

      // Neuer Entry nur ohne offenen Trade und wenn eine Folgekerze existiert
      if (!open && sig && i + 1 < n) {
        var atrNow = res && res.indicators ? res.indicators.atr : null;
        if (num(atrNow) && atrNow > 0) {
          pending = { direction: sig === "BUY" ? "LONG" : "SHORT", atr: atrNow };
        }
      }
    }

    // Laufzeitende: offenen Trade zum Close der letzten Kerze schließen
    if (open) {
      var lastC = candles[n - 1];
      closeTrade(lastC.close, lastC.time, "Laufzeitende");
    }

    return { trades: trades, stats: buildStats(trades) };
  }

  root.XAU.backtest = { run: run, _maxDrawdownR: maxDrawdownR };
})();
if (typeof module !== "undefined") module.exports = (typeof window !== "undefined" ? window : globalThis).XAU.backtest;

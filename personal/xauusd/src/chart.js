/* XAU.chart — Canvas-Profichart ohne Libraries.
   Panes: Haupt (Candles/EMA/BB/Pivots) 60%, RSI 20%, MACD 20%.
   Farben live aus CSS-Variablen; Crosshair + Tooltip. */
"use strict";
var XAU = (typeof window !== "undefined") ? (window.XAU = window.XAU || {}) : {};

XAU.chart = (function () {

  var VIEW_BARS = 160;      // gezeichnete Kerzen
  var HEIGHT = 560;         // CSS-px Gesamthöhe
  var AXIS_RIGHT = 64;      // Preis-Achse
  var AXIS_BOTTOM = 24;     // Zeit-Achse

  /* ---------- reine Geometrie-/Ausrichtungslogik (testbar in Node) ---------- */

  // Rechtsbündige Serie auf den View-Ausschnitt [viewStart, candleCount) abbilden.
  // Ergebnis: Array der Länge candleCount-viewStart, fehlende Werte = null.
  function alignSeries(candleCount, series, viewStart) {
    var start = viewStart || 0;
    var out = [];
    if (!Array.isArray(series) || candleCount <= 0) {
      for (var k = start; k < candleCount; k++) out.push(null);
      return out;
    }
    var offset = candleCount - series.length; // führende Kerzen ohne Wert
    for (var i = start; i < candleCount; i++) {
      var j = i - offset;
      var v = (j >= 0 && j < series.length) ? series[j] : null;
      out.push(v === undefined ? null : v);
    }
    return out;
  }

  // Lineare Skala: min -> bottom (unten), max -> top (oben).
  function makeScale(min, max, top, bottom) {
    var span = max - min;
    if (!isFinite(span) || span <= 0) span = 1;
    return function (v) {
      return bottom - ((v - min) / span) * (bottom - top);
    };
  }

  // View-Ausschnitt: die letzten maxBars Kerzen.
  function viewSlice(candleCount, maxBars) {
    var count = Math.max(0, Math.min(candleCount, maxBars));
    return { start: candleCount - count, count: count };
  }

  /* ---------- Zeichnen (nur im Browser) ---------- */

  function cssVar(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name);
      v = (v || "").trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }

  function fmt2(x) {
    if (typeof x !== "number" || !isFinite(x)) return "–";
    return x.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function fmtTime(ms) {
    var d = new Date(ms);
    if (isNaN(d.getTime())) return "–";
    return pad2(d.getDate()) + "." + pad2(d.getMonth() + 1) + ". " +
      pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  // Linie aus (x[], y[]-mit-null) zeichnen, Lücken überspringen.
  function strokeLine(ctx, xs, vals, scale, color, width, dash) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    var pen = false;
    for (var i = 0; i < vals.length; i++) {
      var v = vals[i];
      if (typeof v !== "number" || !isFinite(v)) { pen = false; continue; }
      var y = scale(v);
      if (pen) ctx.lineTo(xs[i], y);
      else { ctx.moveTo(xs[i], y); pen = true; }
    }
    ctx.stroke();
    ctx.restore();
  }

  // "Schöne" Preis-Ticks
  function niceTicks(min, max, count) {
    var span = max - min;
    if (!isFinite(span) || span <= 0) return [min];
    var raw = span / Math.max(1, count);
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var step = (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
    var out = [];
    for (var t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) out.push(t);
    return out;
  }

  function create(canvasEl, tooltipEl) {
    var lastData = null;
    var hoverIdx = -1; // Index in der candles-Liste (absolut)
    var geom = null;   // Layout des letzten render()

    function colors() {
      return {
        good: cssVar("--good", "#0ca30c"),
        crit: cssVar("--critical", "#d03b3b"),
        accent: cssVar("--accent", "#2563eb"),
        gold: cssVar("--gold", "#c9971c"),
        grid: cssVar("--grid", "rgba(128,128,128,0.15)"),
        muted: cssVar("--text-muted", "#888"),
        text: cssVar("--text-secondary", "#666"),
        surface: cssVar("--surface-1", "#ffffff")
      };
    }

    function draw() {
      if (!canvasEl || typeof document === "undefined") return;
      var ctx = canvasEl.getContext("2d");
      if (!ctx) return;

      var cssW = canvasEl.clientWidth || (canvasEl.parentNode && canvasEl.parentNode.clientWidth) || 600;
      var dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
      if (canvasEl.width !== Math.round(cssW * dpr)) canvasEl.width = Math.round(cssW * dpr);
      if (canvasEl.height !== Math.round(HEIGHT * dpr)) canvasEl.height = Math.round(HEIGHT * dpr);
      canvasEl.style.height = HEIGHT + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, HEIGHT);

      var C = colors();
      var d = lastData;
      if (!d || !Array.isArray(d.candles) || d.candles.length === 0) { geom = null; return; }

      var candles = d.candles;
      var n = candles.length;
      var vs = viewSlice(n, VIEW_BARS);
      if (vs.count === 0) { geom = null; return; }

      // Achsenbreite an die realen Preis-Label anpassen (6-stellige Kurse)
      var axisW = AXIS_RIGHT;
      try {
        ctx.font = "11px system-ui, sans-serif";
        var probeHi = fmt2(Math.max.apply(null, d.candles.map(function (c) { return c.high; })));
        axisW = Math.max(AXIS_RIGHT, ctx.measureText(probeHi).width + 14);
      } catch (e) {}
      var plotW = Math.max(10, cssW - axisW);
      var plotH = HEIGHT - AXIS_BOTTOM;
      var mainTop = 4, mainBot = mainTop + plotH * 0.60 - 8;
      var rsiTop = mainBot + 14, rsiBot = rsiTop + plotH * 0.20 - 14;
      var macdTop = rsiBot + 14, macdBot = plotH - 2;

      var slot = plotW / vs.count;
      var xs = [];
      for (var i = 0; i < vs.count; i++) xs.push((i + 0.5) * slot);

      // Serien auf View ausrichten
      var view = candles.slice(vs.start);
      var ema50 = alignSeries(n, d.ema50, vs.start);
      var ema200 = alignSeries(n, d.ema200, vs.start);
      var bb = alignSeries(n, d.bb, vs.start);
      var rsi = alignSeries(n, d.rsi, vs.start);
      var mHist = alignSeries(n, d.macdHist, vs.start);
      var mLine = alignSeries(n, d.macdLine, vs.start);
      var mSig = alignSeries(n, d.macdSignal, vs.start);

      // Preisspanne des Hauptpanes (Kerzen + sichtbare Overlays)
      var pMin = Infinity, pMax = -Infinity;
      function acc(v) {
        if (typeof v === "number" && isFinite(v)) {
          if (v < pMin) pMin = v;
          if (v > pMax) pMax = v;
        }
      }
      for (i = 0; i < view.length; i++) { acc(view[i].low); acc(view[i].high); }
      for (i = 0; i < vs.count; i++) {
        acc(ema50[i]); acc(ema200[i]);
        if (Array.isArray(bb[i])) { acc(bb[i][0]); acc(bb[i][2]); }
      }
      if (!isFinite(pMin) || !isFinite(pMax)) { geom = null; return; }
      var padPrice = (pMax - pMin) * 0.05 || 1;
      var priceScale = makeScale(pMin - padPrice, pMax + padPrice, mainTop, mainBot);

      /* --- Grid + Preis-Achse --- */
      ctx.font = "11px system-ui, sans-serif";
      ctx.textBaseline = "middle";
      var ticks = niceTicks(pMin - padPrice, pMax + padPrice, 6);
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 1;
      ctx.fillStyle = C.muted;
      ctx.textAlign = "left";
      for (i = 0; i < ticks.length; i++) {
        var ty = priceScale(ticks[i]);
        if (ty < mainTop || ty > mainBot) continue;
        ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(plotW, ty); ctx.stroke();
        ctx.fillText(fmt2(ticks[i]), plotW + 6, ty);
      }

      /* --- vertikale Gridlines + Zeit-Achse (Labels geklemmt) --- */
      var labelEvery = Math.max(1, Math.round(vs.count / 6));
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (i = 0; i < vs.count; i += labelEvery) {
        var gx = xs[i];
        ctx.strokeStyle = C.grid;
        ctx.beginPath(); ctx.moveTo(gx, mainTop); ctx.lineTo(gx, macdBot); ctx.stroke();
        var lbl = fmtTime(view[i].time);
        var half = ctx.measureText(lbl).width / 2;
        var lx = Math.min(Math.max(gx, half + 2), cssW - half - 2); // nie abschneiden
        ctx.fillStyle = C.muted;
        ctx.fillText(lbl, lx, plotH + 6);
      }
      ctx.textBaseline = "middle";

      /* --- Bollinger-Wash + gepunktete Ränder --- */
      var hasBB = false;
      for (i = 0; i < vs.count; i++) if (Array.isArray(bb[i])) { hasBB = true; break; }
      if (hasBB) {
        ctx.save();
        ctx.globalAlpha = 0.07;
        ctx.fillStyle = C.accent;
        ctx.beginPath();
        var pen = false, j;
        for (i = 0; i < vs.count; i++) {
          if (!Array.isArray(bb[i]) || !isFinite(bb[i][2])) { pen = false; continue; }
          var yU = priceScale(bb[i][2]);
          if (pen) ctx.lineTo(xs[i], yU); else { ctx.moveTo(xs[i], yU); pen = true; }
        }
        for (i = vs.count - 1; i >= 0; i--) {
          if (!Array.isArray(bb[i]) || !isFinite(bb[i][0])) continue;
          ctx.lineTo(xs[i], priceScale(bb[i][0]));
        }
        ctx.closePath(); ctx.fill();
        ctx.restore();
        var low = [], up = [];
        for (i = 0; i < vs.count; i++) {
          low.push(Array.isArray(bb[i]) ? bb[i][0] : null);
          up.push(Array.isArray(bb[i]) ? bb[i][2] : null);
        }
        strokeLine(ctx, xs, low, priceScale, C.accent, 1, [2, 3]);
        strokeLine(ctx, xs, up, priceScale, C.accent, 1, [2, 3]);
      }

      /* --- Pivots (Hairlines + Labels rechts) --- */
      var pv = d.pivots;
      if (pv && typeof pv === "object") {
        var pdefs = [
          { k: "r2", col: C.crit, dash: [4, 4], lbl: "R2" },
          { k: "r1", col: C.crit, dash: [4, 4], lbl: "R1" },
          { k: "p", col: C.muted, dash: [], lbl: "P" },
          { k: "s1", col: C.good, dash: [4, 4], lbl: "S1" },
          { k: "s2", col: C.good, dash: [4, 4], lbl: "S2" }
        ];
        ctx.save();
        ctx.font = "10px system-ui, sans-serif";
        var usedLabelYs = [];
        for (i = 0; i < pdefs.length; i++) {
          var val = pv[pdefs[i].k];
          if (typeof val !== "number" || !isFinite(val)) continue;
          var py = priceScale(val);
          if (py < mainTop || py > mainBot) continue;
          ctx.strokeStyle = pdefs[i].col;
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = 1;
          ctx.setLineDash(pdefs[i].dash);
          ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(plotW, py); ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.setLineDash([]);
          var collides = usedLabelYs.some(function (uy) { return Math.abs(uy - py) < 11; });
          if (!collides) {
            usedLabelYs.push(py);
            ctx.fillStyle = C.muted; // Textfarbe immer text-muted
            ctx.textAlign = "right";
            ctx.fillText(pdefs[i].lbl, plotW - 4, py - 6);
          }
        }
        ctx.restore();
        ctx.font = "11px system-ui, sans-serif";
      }

      /* --- Candlesticks --- */
      var bodyW = Math.min(24, Math.max(1, slot - 2)); // 2px Lücke, max 24px
      for (i = 0; i < vs.count; i++) {
        var c = view[i];
        if (!c || !isFinite(c.open) || !isFinite(c.close) || !isFinite(c.high) || !isFinite(c.low)) continue;
        var up2 = c.close >= c.open;
        var col = up2 ? C.good : C.crit;
        var x = xs[i];
        // Docht 1px
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, priceScale(c.high));
        ctx.lineTo(x, priceScale(c.low));
        ctx.stroke();
        // Body
        var y1 = priceScale(Math.max(c.open, c.close));
        var y2 = priceScale(Math.min(c.open, c.close));
        ctx.fillStyle = col;
        ctx.fillRect(x - bodyW / 2, y1, bodyW, Math.max(1, y2 - y1));
      }

      /* --- EMAs --- */
      strokeLine(ctx, xs, ema50, priceScale, C.accent, 2);
      strokeLine(ctx, xs, ema200, priceScale, C.gold, 2);

      /* --- Signal-Marker --- */
      if (Array.isArray(d.markers)) {
        ctx.font = "12px system-ui, sans-serif";
        ctx.textAlign = "center";
        for (i = 0; i < d.markers.length; i++) {
          var mk = d.markers[i];
          if (!mk || typeof mk.index !== "number") continue;
          var vi = mk.index - vs.start;
          if (vi < 0 || vi >= vs.count) continue;
          var cd = view[vi];
          if (!cd || !isFinite(cd.low) || !isFinite(cd.high)) continue;
          if (mk.type === "BUY") {
            ctx.fillStyle = C.good;
            ctx.fillText("▲", xs[vi], Math.min(mainBot - 6, priceScale(cd.low) + 12));
          } else if (mk.type === "SELL") {
            ctx.fillStyle = C.crit;
            ctx.fillText("▼", xs[vi], Math.max(mainTop + 6, priceScale(cd.high) - 12));
          }
        }
        ctx.font = "11px system-ui, sans-serif";
      }

      /* --- RSI-Pane --- */
      var rsiScale = makeScale(0, 100, rsiTop, rsiBot);
      ctx.save();
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = C.accent;
      ctx.fillRect(0, rsiScale(70), plotW, rsiScale(30) - rsiScale(70)); // 30–70-Band getönt
      ctx.restore();
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 1;
      var zones = [30, 70];
      ctx.textAlign = "left";
      for (i = 0; i < zones.length; i++) {
        var zy = rsiScale(zones[i]);
        ctx.beginPath(); ctx.moveTo(0, zy); ctx.lineTo(plotW, zy); ctx.stroke();
        ctx.fillStyle = C.muted;
        ctx.fillText(String(zones[i]), plotW + 6, zy);
      }
      strokeLine(ctx, xs, rsi, rsiScale, C.accent, 2);
      ctx.fillStyle = C.muted;
      ctx.fillText("RSI", 4, rsiTop + 8);

      /* --- MACD-Pane --- */
      var mMin = 0, mMax = 0;
      for (i = 0; i < vs.count; i++) {
        var arrs = [mHist[i], mLine[i], mSig[i]];
        for (var a = 0; a < 3; a++) {
          var mv = arrs[a];
          if (typeof mv === "number" && isFinite(mv)) {
            if (mv < mMin) mMin = mv;
            if (mv > mMax) mMax = mv;
          }
        }
      }
      if (mMin === mMax) { mMin = -1; mMax = 1; }
      var mPad = (mMax - mMin) * 0.1;
      var macdScale = makeScale(mMin - mPad, mMax + mPad, macdTop, macdBot);
      var zeroY = macdScale(0);
      ctx.strokeStyle = C.grid;
      ctx.beginPath(); ctx.moveTo(0, zeroY); ctx.lineTo(plotW, zeroY); ctx.stroke();
      var barW = Math.max(1, Math.min(24, slot - 1)); // 1px Lücke
      for (i = 0; i < vs.count; i++) {
        var hv = mHist[i];
        if (typeof hv !== "number" || !isFinite(hv)) continue;
        ctx.fillStyle = hv >= 0 ? C.good : C.crit;
        var hy = macdScale(hv);
        ctx.fillRect(xs[i] - barW / 2, Math.min(hy, zeroY), barW, Math.max(1, Math.abs(hy - zeroY)));
      }
      strokeLine(ctx, xs, mLine, macdScale, C.accent, 1.5);
      strokeLine(ctx, xs, mSig, macdScale, C.gold, 1.5);
      ctx.fillStyle = C.muted;
      ctx.fillText("MACD", 4, macdTop + 8);

      /* --- Titel-Label des TF --- */
      if (d.tfLabel) {
        ctx.fillStyle = C.text;
        ctx.textAlign = "left";
        ctx.fillText(String(d.tfLabel), 4, mainTop + 8);
      }

      geom = {
        cssW: cssW, slot: slot, plotW: plotW,
        viewStart: vs.start, viewCount: vs.count,
        top: mainTop, bottom: macdBot,
        xs: xs,
        aligned: { ema50: ema50, ema200: ema200, rsi: rsi, mHist: mHist }
      };

      /* --- Crosshair --- */
      if (hoverIdx >= vs.start && hoverIdx < vs.start + vs.count) {
        var cx = xs[hoverIdx - vs.start];
        ctx.save();
        ctx.strokeStyle = C.muted;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(cx, mainTop);
        ctx.lineTo(cx, macdBot);
        ctx.stroke();
        ctx.restore();
      }
    }

    function hideTooltip() {
      if (tooltipEl) tooltipEl.style.display = "none";
    }

    function showTooltip(pointerX) {
      if (!tooltipEl || !geom || !lastData) return;
      var vi = hoverIdx - geom.viewStart;
      var c = lastData.candles[hoverIdx];
      if (!c) { hideTooltip(); return; }

      // Inhalt sicher aufbauen (textContent, nie innerHTML)
      tooltipEl.textContent = "";
      var rows = [
        ["Zeit", fmtTime(c.time)],
        ["O", fmt2(c.open)], ["H", fmt2(c.high)],
        ["L", fmt2(c.low)], ["C", fmt2(c.close)],
        ["EMA50", fmt2(geom.aligned.ema50[vi])],
        ["EMA200", fmt2(geom.aligned.ema200[vi])],
        ["RSI", fmt2(geom.aligned.rsi[vi])],
        ["MACD-Hist", fmt2(geom.aligned.mHist[vi])]
      ];
      for (var i = 0; i < rows.length; i++) {
        var row = document.createElement("div");
        var k = document.createElement("span");
        k.textContent = rows[i][0] + ": ";
        var v = document.createElement("strong");
        v.textContent = rows[i][1];
        row.appendChild(k); row.appendChild(v);
        tooltipEl.appendChild(row);
      }
      tooltipEl.style.display = "block";
      tooltipEl.style.position = "absolute";
      tooltipEl.style.top = "12px";
      // links/rechts flippen am Rand
      var tw = tooltipEl.offsetWidth || 140;
      if (pointerX > geom.cssW / 2) {
        tooltipEl.style.left = Math.max(4, pointerX - tw - 14) + "px";
      } else {
        tooltipEl.style.left = Math.min(geom.cssW - tw - 4, pointerX + 14) + "px";
      }
    }

    function onMove(ev) {
      if (!geom || !lastData) return;
      var rect = canvasEl.getBoundingClientRect();
      var x = ev.clientX - rect.left;
      var idx = Math.floor(x / geom.slot);
      idx = Math.max(0, Math.min(geom.viewCount - 1, idx));
      var abs = geom.viewStart + idx;
      if (abs !== hoverIdx) {
        hoverIdx = abs;
        draw(); // Crosshair snappt auf Kerzenmitte
      }
      showTooltip(x);
    }

    function onLeave() {
      hoverIdx = -1;
      hideTooltip();
      draw();
    }

    if (canvasEl && typeof canvasEl.addEventListener === "function") {
      canvasEl.addEventListener("pointermove", onMove);
      canvasEl.addEventListener("pointerleave", onLeave);
    }

    return {
      render: function (data) {
        lastData = data || null;
        try { draw(); } catch (e) { /* nie werfen */ }
      },
      destroy: function () {
        if (canvasEl && typeof canvasEl.removeEventListener === "function") {
          canvasEl.removeEventListener("pointermove", onMove);
          canvasEl.removeEventListener("pointerleave", onLeave);
        }
        hideTooltip();
        lastData = null;
        geom = null;
      }
    };
  }

  return {
    create: create,
    _math: { alignSeries: alignSeries, makeScale: makeScale, viewSlice: viewSlice, VIEW_BARS: VIEW_BARS }
  };
})();

if (typeof module !== "undefined") module.exports = XAU.chart;

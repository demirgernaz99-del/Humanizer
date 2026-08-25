"use strict";
/* SignalBot Personal Dashboard – läuft komplett im Browser.
   Daten: öffentliche Binance-API (CORS-frei zugänglich). */

const LS = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} },
};

const DEFAULT_PAIRS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];
const BASES = ["https://api.binance.com", "https://data-api.binance.vision"];
let pairs = LS.get("sb_pairs", DEFAULT_PAIRS);
let timeframe = LS.get("sb_tf", "1h");
let selectedPair = LS.get("sb_selected", pairs[0]);
let history = LS.get("sb_history", []);
let lastAction = LS.get("sb_lastaction", {});   // pair|tf -> BUY/SELL
let analyses = {};                              // pair -> Analyse
let candlesCache = {};                          // pair -> Kerzen
let workingBase = null;

const $ = (id) => document.getElementById(id);
const fmtPrice = (p) => p >= 1000 ? p.toLocaleString("de-DE", {maximumFractionDigits: 2})
  : p >= 1 ? p.toFixed(3) : p.toFixed(6);
const fmtTime = (t) => new Date(t).toLocaleString("de-DE", {day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
const ICONS = { BUY: "▲", SELL: "▼", NEUTRAL: "→" };

/* ---------- Daten laden ---------- */
async function fetchKlines(pair, interval, limit = 200) {
  const bases = workingBase ? [workingBase, ...BASES.filter(b => b !== workingBase)] : BASES;
  let lastErr;
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/api/v3/klines?symbol=${encodeURIComponent(pair)}&interval=${interval}&limit=${limit}`);
      if (res.status === 400) throw Object.assign(new Error("bad symbol"), { badSymbol: true });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      workingBase = base;
      const raw = await res.json();
      return raw.map(r => ({ time: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4] }));
    } catch (e) { lastErr = e; if (e.badSymbol) throw e; }
  }
  throw lastErr;
}

/* ---------- Scan ---------- */
async function scan() {
  $("status").textContent = "Aktualisiere…";
  let failed = 0, badPairs = [];
  for (const pair of pairs) {
    try {
      const candles = await fetchKlines(pair, timeframe);
      candlesCache[pair] = candles;
      const result = SignalEngine.analyze(candles.map(c => c.close));
      result.pair = pair; result.updated = Date.now();
      analyses[pair] = result;
      recordSignal(pair, result);
    } catch (e) {
      if (e.badSymbol) badPairs.push(pair); else failed++;
    }
  }
  renderCards(); renderHistory(); drawChart();
  const banner = $("banner");
  if (badPairs.length) {
    banner.style.display = "block";
    banner.textContent = `Unbekannte(s) Paar(e) bei Binance: ${badPairs.join(", ")} – bitte prüfen (Format z.B. DOGEUSDT).`;
  } else if (failed === pairs.length && pairs.length) {
    banner.style.display = "block";
    banner.textContent = "Binance ist gerade nicht erreichbar. Prüfe deine Internetverbindung – in manchen Netzwerken/Ländern ist api.binance.com gesperrt (dann hilft z.B. ein VPN).";
  } else {
    banner.style.display = "none";
  }
  $("status").textContent = failed || badPairs.length
    ? `Stand: ${fmtTime(Date.now())} – ${failed + badPairs.length} Paar(e) fehlgeschlagen`
    : `Stand: ${fmtTime(Date.now())} · Timeframe ${timeframe} · Auto-Refresh alle 60 s`;
}

function recordSignal(pair, result) {
  const key = `${pair}|${timeframe}`;
  if (result.action === "NEUTRAL") { delete lastAction[key]; LS.set("sb_lastaction", lastAction); return; }
  if (lastAction[key] === result.action) return;
  lastAction[key] = result.action;
  LS.set("sb_lastaction", lastAction);
  history.unshift({ time: Date.now(), pair, tf: timeframe, action: result.action,
    score: result.score, price: result.price, reasons: result.reasons });
  history = history.slice(0, 300);
  LS.set("sb_history", history);
}

/* ---------- Karten ---------- */
function renderCards() {
  const grid = $("cards");
  grid.replaceChildren();
  for (const pair of pairs) {
    const a = analyses[pair];
    const card = document.createElement("div");
    card.className = "pair-card card" + (pair === selectedPair ? " selected" : "");

    const rm = document.createElement("button");
    rm.className = "rm"; rm.textContent = "✕"; rm.title = "Paar entfernen";
    rm.addEventListener("click", (ev) => { ev.stopPropagation(); removePair(pair); });
    card.appendChild(rm);

    const head = document.createElement("div"); head.className = "pair-head";
    const name = document.createElement("span"); name.textContent = pair; head.appendChild(name);
    if (a) {
      const badge = document.createElement("span");
      badge.className = `badge badge-${a.action}`;
      badge.textContent = `${ICONS[a.action]} ${a.action === "NEUTRAL" ? "NEUTRAL" : a.action}`;
      head.appendChild(badge);
    }
    card.appendChild(head);

    if (a) {
      const price = document.createElement("div"); price.className = "price";
      price.textContent = "$" + fmtPrice(a.price); card.appendChild(price);

      // Score-Meter: divergierend um die Mitte (−6 … +6)
      const meter = document.createElement("div"); meter.className = "meter";
      const mid = document.createElement("div"); mid.className = "mid"; meter.appendChild(mid);
      if (a.score !== 0) {
        const fill = document.createElement("div"); fill.className = "fill";
        const pct = Math.min(Math.abs(a.score) / 6, 1) * 50;
        fill.style.width = pct + "%";
        fill.style.background = a.score > 0 ? "var(--good)" : "var(--critical)";
        if (a.score > 0) fill.style.left = "50%"; else fill.style.right = "50%";
        meter.appendChild(fill);
      }
      card.appendChild(meter);

      const stats = document.createElement("div"); stats.className = "stats";
      stats.textContent = `Score ${a.score > 0 ? "+" + a.score : a.score} · RSI ${a.indicators.rsi.toFixed(1)} · MACD ${a.indicators.macd_hist > 0 ? "↑" : "↓"}`;
      card.appendChild(stats);

      const det = document.createElement("details");
      const sum = document.createElement("summary"); sum.textContent = "Begründung"; det.appendChild(sum);
      const ul = document.createElement("ul");
      for (const r of a.reasons) { const li = document.createElement("li"); li.textContent = r; ul.appendChild(li); }
      det.appendChild(ul); card.appendChild(det);
    } else {
      const load = document.createElement("div"); load.className = "stats"; load.textContent = "Lade…";
      card.appendChild(load);
    }

    card.addEventListener("click", () => { selectedPair = pair; LS.set("sb_selected", pair); renderCards(); drawChart(); });
    grid.appendChild(card);
  }
}

function removePair(pair) {
  pairs = pairs.filter(p => p !== pair);
  LS.set("sb_pairs", pairs);
  delete analyses[pair]; delete candlesCache[pair];
  if (selectedPair === pair) selectedPair = pairs[0] || null;
  renderCards(); drawChart();
}

/* ---------- Verlauf ---------- */
function renderHistory() {
  const tbody = $("histrows");
  tbody.replaceChildren();
  if (!history.length) {
    const tr = document.createElement("tr"); const td = document.createElement("td");
    td.colSpan = 7; td.textContent = "Noch keine Signalwechsel aufgezeichnet."; td.style.color = "var(--text-muted)";
    tr.appendChild(td); tbody.appendChild(tr); return;
  }
  for (const h of history.slice(0, 60)) {
    const tr = document.createElement("tr");
    const cells = [fmtTime(h.time), h.pair, h.tf, null, (h.score > 0 ? "+" : "") + h.score, "$" + fmtPrice(h.price), h.reasons.join(", ")];
    cells.forEach((c, i) => {
      const td = document.createElement("td");
      if (i === 3) {
        const b = document.createElement("span"); b.className = `badge badge-${h.action}`;
        b.textContent = `${ICONS[h.action]} ${h.action}`; td.appendChild(b);
      } else { td.textContent = c; if (i === 4 || i === 5) td.className = "num"; }
      if (i === 6) td.style.color = "var(--text-secondary)";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
}

/* ---------- Canvas-Chart (Candles + EMA50 + Bollinger + Crosshair) ---------- */
const canvas = $("chart"), ctx = canvas.getContext("2d");
let chartState = null;

function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function drawChart(hoverX = null) {
  const pair = selectedPair;
  $("charttitle").textContent = pair ? `${pair} · ${timeframe}` : "Chart";
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = 360;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const candles = pair && candlesCache[pair];
  if (!candles || candles.length < SignalEngine.MIN_CANDLES) { chartState = null; return; }

  const padL = 8, padR = 64, padT = 10, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const view = candles.slice(-120);
  const closes = candles.map(c => c.close);

  // Overlays rechtsbündig auf die letzten `view.length` Kerzen ausrichten
  const emaAll = SignalEngine.ema(closes, 50);
  const bbAll = SignalEngine.bollinger(closes, 20);
  const emaView = emaAll.slice(-view.length);
  const bbView = bbAll.slice(-view.length);
  const emaOffset = view.length - emaView.length;   // führende Kerzen ohne EMA-Wert
  const bbOffset = view.length - bbView.length;

  let lo = Infinity, hi = -Infinity;
  for (const c of view) { lo = Math.min(lo, c.low); hi = Math.max(hi, c.high); }
  for (const b of bbView) { lo = Math.min(lo, b[0]); hi = Math.max(hi, b[2]); }
  const span = (hi - lo) || 1; lo -= span * 0.04; hi += span * 0.04;

  const x = (i) => padL + (i + 0.5) * (plotW / view.length);
  const y = (v) => padT + (hi - v) / (hi - lo) * plotH;

  // Gridlines (hairline, dezent) + Preis-Ticks rechts
  ctx.strokeStyle = cssVar("--grid"); ctx.lineWidth = 1;
  ctx.fillStyle = cssVar("--text-muted"); ctx.font = "11px system-ui, sans-serif"; ctx.textBaseline = "middle";
  const ticks = 5;
  for (let t = 0; t <= ticks; t++) {
    const v = lo + (hi - lo) * t / ticks, yy = y(v);
    ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
    ctx.fillText(fmtPrice(v), W - padR + 6, yy);
  }
  // Zeit-Ticks unten
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  for (let i = 0; i < view.length; i += Math.ceil(view.length / 6)) {
    // Label horizontal einklemmen, damit es links/rechts nicht abgeschnitten wird
    const half = ctx.measureText(fmtTime(view[i].time)).width / 2;
    const tx = Math.min(Math.max(x(i), padL + half), W - padR - half);
    ctx.fillText(fmtTime(view[i].time), tx, H - padB + 6);
  }
  ctx.textAlign = "left"; ctx.textBaseline = "middle";

  // Bollinger-Band: Wash + gepunktete Ränder
  if (bbView.length > 1) {
    ctx.beginPath();
    bbView.forEach((b, j) => { const px = x(j + bbOffset), py = y(b[2]); j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    for (let j = bbView.length - 1; j >= 0; j--) ctx.lineTo(x(j + bbOffset), y(bbView[j][0]));
    ctx.closePath();
    ctx.globalAlpha = 0.07; ctx.fillStyle = cssVar("--accent"); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = cssVar("--text-muted"); ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
    for (const edge of [0, 2]) {
      ctx.beginPath();
      bbView.forEach((b, j) => { const px = x(j + bbOffset), py = y(b[edge]); j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // Kerzen
  const cw = Math.max(2, plotW / view.length - 2);
  for (let i = 0; i < view.length; i++) {
    const c = view[i], up = c.close >= c.open;
    ctx.strokeStyle = ctx.fillStyle = up ? cssVar("--good") : cssVar("--critical");
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x(i), y(c.high)); ctx.lineTo(x(i), y(c.low)); ctx.stroke();
    const top = y(Math.max(c.open, c.close)), bot = y(Math.min(c.open, c.close));
    ctx.fillRect(x(i) - cw / 2, top, cw, Math.max(bot - top, 1));
  }

  // EMA50-Linie (2px, Akzentfarbe)
  if (emaView.length > 1) {
    ctx.strokeStyle = cssVar("--accent"); ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath();
    emaView.forEach((v, j) => { const px = x(j + emaOffset), py = y(v); j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.stroke();
  }

  chartState = { view, x, y, padL, padR, plotW, W, H, padT, plotH, emaView, emaOffset, bbView, bbOffset };

  // Crosshair
  if (hoverX !== null) {
    const i = Math.min(view.length - 1, Math.max(0, Math.round((hoverX - padL) / (plotW / view.length) - 0.5)));
    const cx = x(i);
    ctx.strokeStyle = cssVar("--text-muted"); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(cx, padT); ctx.lineTo(cx, H - padB); ctx.stroke();
    ctx.setLineDash([]);
    showTooltip(i, cx);
  } else {
    $("tooltip").style.display = "none";
  }
}

function showTooltip(i, cx) {
  const st = chartState; if (!st) return;
  const c = st.view[i];
  const tt = $("tooltip");
  tt.replaceChildren();
  const t = document.createElement("div"); t.className = "tt-time"; t.textContent = fmtTime(c.time); tt.appendChild(t);
  const rows = [["Open", c.open], ["Hoch", c.high], ["Tief", c.low], ["Close", c.close]];
  const emaIdx = i - st.emaOffset;
  if (emaIdx >= 0 && st.emaView[emaIdx] !== undefined) rows.push(["EMA50", st.emaView[emaIdx]]);
  const bbIdx = i - st.bbOffset;
  if (bbIdx >= 0 && st.bbView[bbIdx]) { rows.push(["BB oben", st.bbView[bbIdx][2]], ["BB unten", st.bbView[bbIdx][0]]); }
  for (const [label, val] of rows) {
    const d = document.createElement("div");
    const v = document.createElement("span"); v.className = "v"; v.textContent = "$" + fmtPrice(val);
    d.textContent = label; d.appendChild(v); tt.appendChild(d);
  }
  tt.style.display = "block";
  const wrap = $("chartwrap");
  const left = cx + 14 + tt.offsetWidth > wrap.clientWidth ? cx - tt.offsetWidth - 14 : cx + 14;
  tt.style.left = left + "px"; tt.style.top = "14px";
}

canvas.addEventListener("pointermove", (e) => {
  const rect = canvas.getBoundingClientRect();
  drawChart(e.clientX - rect.left);
});
canvas.addEventListener("pointerleave", () => drawChart());
window.addEventListener("resize", () => drawChart());

/* ---------- Controls ---------- */
$("tf").value = timeframe;
$("tf").addEventListener("change", () => {
  timeframe = $("tf").value; LS.set("sb_tf", timeframe);
  analyses = {}; candlesCache = {}; renderCards(); scan();
});
$("refresh").addEventListener("click", scan);
$("addpair").addEventListener("click", addPair);
$("newpair").addEventListener("keydown", (e) => { if (e.key === "Enter") addPair(); });
function addPair() {
  const p = $("newpair").value.trim().toUpperCase();
  if (!p || pairs.includes(p) || !/^[A-Z0-9]{5,20}$/.test(p)) return;
  pairs.push(p); LS.set("sb_pairs", pairs);
  $("newpair").value = ""; renderCards(); scan();
}
$("clearhist").addEventListener("click", () => {
  history = []; lastAction = {};
  LS.set("sb_history", history); LS.set("sb_lastaction", lastAction);
  renderHistory();
});
$("themetoggle").addEventListener("click", () => {
  const cur = document.documentElement.dataset.theme
    || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  LS.set("sb_theme", next);
  drawChart();
});
const savedTheme = LS.get("sb_theme", null);
if (savedTheme) document.documentElement.dataset.theme = savedTheme;

/* ---------- Start ---------- */
renderCards(); renderHistory();
scan();
setInterval(scan, 60_000);

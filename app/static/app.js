/* Dashboard-Logik: Analyse-Karten, Chart, Signal-Historie. Pollt alle 60s. */
(function () {
  const fmtPrice = (p) => p >= 100 ? p.toFixed(2) : p.toFixed(4);
  const fmtTime = (iso) => new Date(iso).toLocaleString("de-DE");

  let chart, candleSeries, currentPair = null;

  function initChart() {
    const el = document.getElementById("chart");
    chart = LightweightCharts.createChart(el, {
      layout: { background: { color: "transparent" }, textColor: "#8b93a7" },
      grid: { vertLines: { color: "#1a2133" }, horzLines: { color: "#1a2133" } },
      timeScale: { timeVisible: true, borderColor: "#232b3d" },
      rightPriceScale: { borderColor: "#232b3d" },
      autoSize: true,
    });
    candleSeries = chart.addCandlestickSeries({
      upColor: "#22c55e", downColor: "#ef4444",
      wickUpColor: "#22c55e", wickDownColor: "#ef4444",
      borderVisible: false,
    });
  }

  async function loadChart(pair) {
    currentPair = pair;
    const res = await fetch(`/api/klines?pair=${pair}&interval=1h&limit=200`);
    if (!res.ok) return;
    const data = await res.json();
    candleSeries.setData(data.candles);
    chart.timeScale().fitContent();
  }

  async function loadAnalysis() {
    const res = await fetch("/api/analysis");
    if (!res.ok) return;
    const data = await res.json();
    const grid = document.getElementById("pair-cards");
    const select = document.getElementById("chart-pair");

    if (data.pairs.length === 0) return; // erster Scan läuft noch

    grid.innerHTML = "";
    const knownPairs = [];
    for (const a of data.pairs) {
      knownPairs.push(a.pair);
      const card = document.createElement("div");
      card.className = "pair-card";
      card.innerHTML = `
        <div class="pair-name">${a.pair} <span class="action action-${a.action}">${a.action}</span></div>
        <div class="price">$${fmtPrice(a.price)}</div>
        <div class="mini-stats">
          Score ${a.score > 0 ? "+" + a.score : a.score} · Konfidenz ${(a.confidence * 100).toFixed(0)}%<br>
          RSI ${a.indicators.rsi} · MACD ${a.indicators.macd_hist > 0 ? "↑" : "↓"}
        </div>`;
      card.title = a.reasons.join("\n");
      card.addEventListener("click", () => { select.value = a.pair; loadChart(a.pair); });
      grid.appendChild(card);
    }
    for (const p of data.locked_pairs) {
      const card = document.createElement("div");
      card.className = "pair-card locked";
      card.innerHTML = `<div class="pair-name">${p} 🔒</div><div class="mini-stats">Im Pro-Tarif enthalten</div>`;
      grid.appendChild(card);
    }

    if (select.options.length !== knownPairs.length) {
      select.innerHTML = knownPairs.map((p) => `<option value="${p}">${p}</option>`).join("");
    }
    if (!currentPair && knownPairs.length) {
      select.value = knownPairs[0];
      loadChart(knownPairs[0]);
    }
    const upd = data.pairs[0] && data.pairs[0].updated_at;
    if (upd) document.getElementById("updated").textContent = "Stand: " + fmtTime(upd);
  }

  async function loadSignals() {
    const res = await fetch("/api/signals?limit=50");
    if (!res.ok) return;
    const data = await res.json();
    const tbody = document.getElementById("signal-rows");
    if (data.signals.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">Noch keine Signale${data.delay_min ? ` (Free: ${data.delay_min} Min. verzögert)` : ""}.</td></tr>`;
      return;
    }
    tbody.innerHTML = data.signals.map((s) => `
      <tr>
        <td>${fmtTime(s.created_at)}</td>
        <td>${s.pair}</td>
        <td><span class="action action-${s.action}">${s.action}</span></td>
        <td>${s.score > 0 ? "+" + s.score : s.score}</td>
        <td>$${fmtPrice(s.price)}</td>
        <td class="muted">${s.details.reasons.join(", ")}</td>
      </tr>`).join("");
  }

  function refresh() { loadAnalysis(); loadSignals(); }
  document.getElementById("chart-pair").addEventListener("change", (e) => loadChart(e.target.value));
  initChart();
  refresh();
  setInterval(refresh, 60_000);
})();

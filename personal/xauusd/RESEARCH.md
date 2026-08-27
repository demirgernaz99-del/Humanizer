# RESEARCH.md – Evidenzbasis für die XAU/USD-Strategie (v3)

Stand: 2026-08-27. Recherche für die v3-Filter (Session/Killzones, HTF-Alignment, Volumen,
ATR-Spike, Kerzenmuster). Einordnung in **belegt** / **gemischt** / **Folklore**, danach die
Ableitung für die Strategie-Defaults. Alle Zeiten UTC; Achtung: London/NY haben Sommerzeit,
UTC-fixe Fenster verschieben sich relativ zu den Events saisonal um ±1 h.

## A) Session- und Uhrzeiteffekte bei Gold

**Belegt**
- Die LBMA-Auktionen laufen täglich um 10:30 und 15:00 **Londoner Zeit** (Sommer: 09:30/14:00 UTC,
  Winter: 10:30/15:00 UTC) ([LBMA](https://www.lbma.org.uk/prices-and-data/lbma-precious-metal-prices),
  [ICE IBA](https://www.ice.com/iba/lbma-precious-metals)).
- Um den PM-Fix herum sind Volumen und Volatilität in GC-Futures/GLD signifikant erhöht – messbar
  bereits in den ersten Minuten der Auktion, vor Publikation des Ergebnisses
  ([Caminschi & Heaney 2014, J. Futures Markets](https://onlinelibrary.wiley.com/doi/10.1002/fut.21636)).
- Preisfindung ist bipolar London/New York; COMEX dominiert heute die Price Discovery
  ([Hauptfleisch/Putniņš/Lucey](https://acfr.aut.ac.nz/__data/assets/pdf_file/0009/29790/T-Putnis-GoldILS-v4.3.pdf)).
- Liquiditäts-/Volumenspitze: London-Nachmittag + COMEX-Vormittag, ca. 8:20–13:30 ET
  (≈ 12:20–17:30 UTC im Sommer); US-Daten um 8:30 ET treiben die Spitzen; Asien-Session ist dünn
  und eng ([Headway](https://hw.online/faq/best-time-to-trade-gold-futures-peak-liquidity/),
  [EBC](https://www.ebc.com/forex/the-best-gold-trading-hours-for-active-traders)).

**Gemischt**
- Konkrete "Killzones" (London-Open ~7–10 UTC, NY-Open ~12–15 UTC) sind Praktiker-Konvention
  (ICT-Umfeld), keine peer-reviewte Kante – sie überlappen aber die belegten Volumen-/Fix-Fenster
  ([FXNX](https://fxnx.com/en/blog/gold-trading-sessions-master-xauusd-liquidity)).
- Historischer "AM-Fix→PM-Fix-Abwärtsdrift" (Gold fällt intraday während London): dokumentiert vor
  allem in älteren Daten/Goldbug-Quellen, teils Datenartefakt (OHLC vs. echte Ausführung)
  ([Gold Eagle](https://www.gold-eagle.com/article/price-anomalies-gold-market),
  [QuantPedia zu GDX-Overnight-Drift](https://quantpedia.com/dangers-of-relying-on-ohlc-prices-the-case-of-overnight-drift-in-gdx-etf/)).
  Nicht als Richtungs-Signal verwenden.

## B) Evidenz zu den v3-Filtern

**Belegt**
- Trend-/Momentum-Persistenz über höhere Zeitebenen existiert in Gold-Futures (Time-Series-Momentum,
  1–12 Monate; 58 Futures inkl. Gold): [Moskowitz/Ooi/Pedersen 2012](https://www.sciencedirect.com/science/article/pii/S0304405X11002613).
  Das stützt die Idee "nur in Richtung des Higher-TF handeln" dem Grunde nach – direkt intraday
  gemessen ist es dort nicht.
- Volumen korreliert robust mit der **Größe** von Preisbewegungen (Informationsfluss-Proxy):
  [Karpoff 1987, JFQA-Survey](https://www.cambridge.org/core/services/aop-cambridge-core/content/view/DBE2C70FA41E390EB8FA418BBFFD76C8/S0022109000012473a.pdf/div-class-title-the-relation-between-price-changes-and-trading-volume-a-survey-div.pdf).
  Für die **Richtung** ist Volumen aber kaum prädiktiv → Volumen ist Filter, kein Signal.

**Gemischt**
- RSI-Divergenzen: kaum belastbare Studien; eine kleine FX-Studie findet positives Chance-Risiko
  (~1,7), stark timeframe-abhängig ([Springer 2024](https://link.springer.com/chapter/10.1007/978-981-97-7603-0_13)).
  Klassische TA-Regel-Evidenz kippt out-of-sample: [Brock et al. 1992] wirkte gut, verschwand aber
  in den 10 Folgejahren nach Data-Snooping-Korrektur
  ([Sullivan/Timmermann/White 1999](https://onlinelibrary.wiley.com/doi/10.1111/0022-1082.00163)).
  Fazit: Divergenz nur als Zusatz-Confirm, nie als Alleinstellung.
- HTF-Alignment intraday: plausibel (siehe Momentum), aber die Haupt-Gefahr ist methodisch –
  Lookahead über den noch laufenden Higher-TF-Bar zerstört jede Aussagekraft. Strikt kausales
  Mapping (nur abgeschlossene HTF-Bars) ist Pflicht.

**Folklore (als Standalone)**
- Kerzenmuster (Engulfing, Pin/Hammer etc.): auf DJIA-Aktien **kein** Mehrwert nach Bootstrap-Test
  ([Marshall/Young/Rose 2006](https://www.researchgate.net/publication/223853109_Candlestick_technical_trading_strategies_Can_they_create_value_for_investors));
  vereinzelt positive Befunde in Taiwan/China/Thailand
  ([Tharavanij et al. 2017](https://journals.sagepub.com/doi/10.1177/2158244017736799)).
  Netto: als eigenständiges Signal Folklore; als konservativer Zusatzfilter vertretbar, kostet
  aber Trades.
- "Gold fällt immer zum PM-Fix", exakte Killzone-Minuten, magische RSI-Level: keine belastbare Basis.

## C) Realistische Winrate-Bänder

- Trendfolge: typ. **30–50 %** Winrate (meist 35–45 %) bei RR 2–4; Mean-Reversion: **55–70 %** bei
  RR ~1–1,5. Erwartungswert zählt, nicht Winrate
  ([Robot Traders](https://robottraders.io/blog/trend-following-vs-mean-reversion),
  [HorizonAI](https://www.horizontrading.ai/learn/backtesting-metrics-explained)).
- Profit Factor 1,3–2,0 ist im Backtest "gut"; live degradieren Ergebnisse typ. um 10–20 %
  ([Backtrex](https://backtrex.com/en/blog/backtest-metrics-expectancy-profit-factor)).
- Rote Flagge: Werbeversprechen ">70 % Winrate bei RR≥2". Bei unserer Fixed-RR-2-Logik sind
  **~35–50 %** Winrate out-of-sample ein ehrliches, gutes Ergebnis (Break-even bei RR 2 ≈ 33,3 %
  vor Kosten).

## D) Typische Fallstricke

- **News-Spikes**: US-Daten 8:30 ET (NFP/CPI ≈ 12:30 UTC Sommer / 13:30 Winter), FOMC 14:00 ET
  (18:00/19:00 UTC). Überraschungen wirken binnen Minuten auf Gold, Volatilität asymmetrisch
  (stärker nach negativen Makro-Schocks) – Elder/Miao/Ramchander 2012 u. a.
  ([ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S1057521924004186)).
  Riesige Range-Kerzen = schlechte Fill-/Stop-Qualität → ATR-Spike-Filter ist gut begründet.
- **Token-Gold am Wochenende** (PAXG/XAUT, auch Binance-Feeds): CME schließt Fr 22:00 UTC, öffnet
  So 22:00/23:00 UTC; dazwischen dünne On-Chain-Liquidität, typ. 0,5–2,5 % Discount zum Spot,
  Spreads deutlich weiter; Montag-Gaps möglich
  ([CoinGecko](https://www.coingecko.com/learn/tokenized-gold-price-signal),
  [Cointelegraph/TradingView](https://www.tradingview.com/news/cointelegraph:3a9797a9f094b:0-tokenized-gold-drives-weekend-price-signals-while-cme-futures-are-closed/)).
- **Spread-/Kostenfalle**: engste Spreads nur im London/NY-Overlap; in Asien-Session und um News
  ein Mehrfaches. Bei 15m-Targets von ~1×ATR fressen Spread+Slippage schnell den Edge – Backtests
  ohne Kostenannahme überschätzen systematisch.

## E) Was das für die Strategie-Defaults bedeutet

1. **Defaults bleiben 'none'** (Rückwärtskompatibilität); Filter sind Opt-in und werden vom
   Walk-Forward-Optimizer je Timeframe bewertet – nicht pauschal aktiviert.
2. **sessionFilter**: 'londonNY' [7,21) UTC ist die sichere Breitband-Variante (belegtes
   Liquiditätsfenster). 'killzones' [7,10)∪[12,15) UTC bündelt London-Open + NY-Open/PM-Fix –
   evidenznah, aber DST-unscharf (±1 h) und reduziert Trade-Anzahl stark → nur auf 15m/1h sinnvoll.
3. **htfFilter 'aligned'**: bester theoretischer Rückhalt (Momentum-Persistenz). Kritisch ist
   allein die Kausalität: `mapHTFScore` darf nur HTF-Bars verwenden, deren Bar-Ende ≤ Bar-Ende des
   Low-TF-Bars ist – der laufende HTF-Bar ist die klassische Leck-Kante.
4. **spikeFilter 'calm'** (Range ≤ 3×ATR): direkt aus der News-Evidenz motiviert; billig, klar,
   vermeidet die schlechtesten Fills. Guter Kandidat für einen aktiven Default nach WF-Bestätigung.
5. **volFilter 'above'** (volumeRel ≥ 1,0): nur Bestätigungs-Filter (Karpoff), Erwartung: weniger,
   dafür sauberere Trades; kein Richtungs-Edge.
6. **patternFilter 'confirm'**: schwächste Evidenz – standardmäßig aus lassen; nur behalten, wenn
   er im rollierenden Walk-Forward konsistent (Mehrheit der Folds) hilft.
7. **Erwartungsmanagement im UI**: Out-of-sample-Winrate 35–50 % bei RR 2 und Profit Factor
   ~1,1–1,5 sind realistisch; deutlich höhere Backtest-Werte deuten auf Overfitting/Leck.
   Wochenend-Bars (Token-Gold) und News-Kerzen sind Datenqualitäts-, nicht Signal-Ereignisse.

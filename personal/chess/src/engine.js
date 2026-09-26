/* SK.engine – Stockfish im Web Worker + Analyse-Planer.
   Engine-Kandidaten werden der Reihe nach probiert: lokale Dateien (engine/…), dann CDN.
   Der Planer verteilt die eine Engine auf: KI-Zug > aktuelle Stellung (live) > Partie-Review. */
(function () {
  var root = (typeof window !== 'undefined') ? window : globalThis;
  root.SK = root.SK || {};

  var CDN = 'https://cdn.jsdelivr.net/npm/';
  var CANDIDATES = [
    { id: 'sf18', name: 'Stockfish 18', note: 'NNUE', wasm: true,
      local: 'engine/stockfish-18-lite-single.js',
      cdn: CDN + 'stockfish@18.0.8/bin/stockfish-18-lite-single.js',
      cdnWasm: CDN + 'stockfish@18.0.8/bin/stockfish-18-lite-single.wasm' },
    { id: 'sf10', name: 'Stockfish 10', note: 'Kompatibilitätsmodus', wasm: false,
      local: 'engine/stockfish-10-asm.js',
      cdn: CDN + 'stockfish.js@10.0.2/stockfish.js' }
  ];

  function parseInfo(line) {
    if (line.indexOf('info ') !== 0 || line.indexOf(' pv ') < 0) return null;
    if (line.indexOf('lowerbound') >= 0 || line.indexOf('upperbound') >= 0) return null;
    var t = line.split(/\s+/), o = { multipv: 1 };
    for (var i = 1; i < t.length; i++) {
      var k = t[i];
      if (k === 'depth') o.depth = +t[++i];
      else if (k === 'seldepth') o.seldepth = +t[++i];
      else if (k === 'multipv') o.multipv = +t[++i];
      else if (k === 'nodes') o.nodes = +t[++i];
      else if (k === 'nps') o.nps = +t[++i];
      else if (k === 'time') o.time = +t[++i];
      else if (k === 'score') {
        var kind = t[++i], v = +t[++i];
        o.score = kind === 'mate' ? { mate: v } : { cp: v };
      } else if (k === 'pv') { o.pv = t.slice(i + 1); break; }
    }
    if (!o.score || !o.pv || !o.pv.length || !o.depth) return null;
    return o;
  }

  // Schlüssel ohne Zugzähler: gleiche Stellung → gleiche Analyse
  function posKey(fen) { return fen.split(' ').slice(0, 4).join(' '); }
  /* Zughistorie: hist = { hk, start, moves } nur dann, wenn sie die Bewertung ändern kann
     (eine Stellung seit dem letzten Bauernzug/Schlagen kam schon zweimal vor → dritte Wiederholung = Remis).
     Dann bekommt die Stellung einen eigenen Cache-Eintrag (Schlüssel + '#' + hk). */
  function akey(fen, hk) { return posKey(fen) + (hk ? '#' + hk : ''); }

  /* ---------- Low-Level: ein Worker, ein UCI-Strom ---------- */

  function Engine() {
    this.worker = null;
    this.info = null;         // Kandidat, der läuft
    this.options = {};        // von der Engine gemeldete Optionen
    this.state = 'off';       // off | loading | ready | failed
    this.listeners = [];
    this.current = null;      // laufender Job
    this.pending = null;      // wartet auf bestmove des laufenden Jobs
    this.sent = {};           // zuletzt gesetzte Optionswerte
    this.onStatus = null;
    this.log = [];
  }

  Engine.prototype._status = function (s, detail) {
    this.state = s;
    if (this.onStatus) this.onStatus(s, detail || '', this.info);
  };

  // Darf diese Seite WebAssembly kompilieren? (CSP ohne 'wasm-unsafe-eval' verbietet es)
  function wasmAllowed() {
    try { new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])); return true; } catch (e) { return false; }
  }

  Engine.prototype.start = function () {
    var self = this;
    var list = CANDIDATES.slice();
    var hasWasm = typeof WebAssembly === 'object';
    if (!hasWasm) list = list.filter(function (c) { return !c.wasm; });
    var pageWasm = hasWasm && wasmAllowed();
    var httpPage = /^https?:/.test(location.protocol);
    var attempts = [];
    list.forEach(function (c) {
      // Ein Worker aus eigener Datei hat ggf. eine eigene CSP → lokal trotzdem versuchen, aber kürzer warten
      if (httpPage) attempts.push({ c: c, mode: 'local', timeout: c.wasm && !pageWasm ? 15000 : null });
      if (!c.wasm || pageWasm) attempts.push({ c: c, mode: 'cdn' });
    });
    var i = 0;
    function next(err) {
      if (err) self.log.push(err);
      if (i >= attempts.length) { self._status('failed', self.log.join(' · ')); return; }
      var a = attempts[i++];
      self._status('loading', a.c.name + (a.mode === 'cdn' ? ' (CDN)' : ''));
      self._boot(a.c, a.mode, a.timeout, function (ok, why) {
        if (ok) return;
        next(a.c.name + '/' + a.mode + ': ' + why);
      });
    }
    next();
  };

  Engine.prototype._boot = function (c, mode, timeout, cb) {
    var self = this, w, done = false, timer;
    function fail(why) {
      if (done) return; done = true; clearTimeout(timer);
      try { w && w.terminate(); } catch (e) { /* egal */ }
      cb(false, why);
    }
    try {
      if (mode === 'local') {
        w = new Worker(c.local);
      } else {
        // Fehler beim Laden/Kompilieren als Nachricht melden, sonst hinge der Start bis zum Timeout
        var src = 'self.addEventListener("unhandledrejection",function(e){var r=e.reason;' +
                  'postMessage("Aborted(" + (r && r.message ? r.message : r) + ")");});' +
                  'importScripts(' + JSON.stringify(c.cdn) + ');';
        var url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
        w = new Worker(url + (c.cdnWasm ? '#' + encodeURIComponent(c.cdnWasm) : ''));
      }
    } catch (e) { return fail(String(e && e.message || e)); }

    var opts = {};
    timer = setTimeout(function () { fail('Zeitüberschreitung'); }, timeout || (c.wasm ? 60000 : 45000));
    w.onerror = function (e) { if (e && e.preventDefault) e.preventDefault(); fail('Worker-Fehler ' + (e && e.message || '')); };
    w.onmessage = function (e) {
      var line = typeof e.data === 'string' ? e.data : String(e.data);
      if (!done) {
        if (/Aborted\(|CompileError|failed to asynchronously prepare wasm|both async and sync fetching/.test(line)) return fail(line.slice(0, 160));
        var om = /^option name (.+?) type (\w+)(?: default (\S*))?(?: min (\S+))?(?: max (\S+))?/.exec(line);
        if (om) opts[om[1]] = { type: om[2], def: om[3], min: +om[4], max: +om[5] };
        if (line === 'uciok') {
          done = true; clearTimeout(timer);
          self.worker = w; self.info = c; self.options = opts;
          w.onmessage = function (ev) { self._line(typeof ev.data === 'string' ? ev.data : String(ev.data)); };
          w.onerror = function () { self._status('failed', 'Engine abgestürzt'); };
          var mem = (navigator.deviceMemory || 4) >= 4 ? 64 : 32;
          self._opt('Hash', mem);
          self._opt('UCI_LimitStrength', 'false');
          self._send('isready');
          self._status('ready', c.name);
          cb(true);
        }
      }
    };
    w.postMessage('uci');
  };

  Engine.prototype._send = function (cmd) { this.worker.postMessage(cmd); };
  Engine.prototype._opt = function (name, value) {
    if (!this.options[name]) return false;
    var v = String(value);
    if (this.sent[name] === v) return true;
    this.sent[name] = v;
    this._send('setoption name ' + name + ' value ' + v);
    return true;
  };
  Engine.prototype.has = function (name) { return !!this.options[name]; };

  /* job = { fen, hist?, multipv, depth?, movetime?, infinite?, strength?, onInfo(info, job), onDone(bestmove, job) } */
  Engine.prototype.run = function (job) {
    if (this.state !== 'ready') return false;
    if (this.current) {
      this.pending = job;
      if (!this.current.stopping) { this.current.stopping = true; this._send('stop'); }
      return true;
    }
    this.pending = null;
    this._go(job);
    return true;
  };

  Engine.prototype.stop = function () {
    this.pending = null;
    if (this.current && !this.current.stopping) { this.current.stopping = true; this._send('stop'); }
  };

  Engine.prototype._go = function (job) {
    this.current = job;
    var st = job.strength || null;
    this._opt('MultiPV', st ? 1 : (job.multipv || 1));
    if (st && st.elo && this.has('UCI_Elo')) {
      var o = this.options.UCI_Elo;
      this._opt('UCI_LimitStrength', 'true');
      this._opt('UCI_Elo', Math.max(o.min || 0, Math.min(o.max || 4000, st.elo)));
      this._opt('Skill Level', 20);
    } else if (st && (st.skill != null || st.elo)) {
      var sk = st.skill != null ? st.skill : Math.max(0, Math.min(20, Math.round((st.elo - 1350) / 75)));
      this._opt('UCI_LimitStrength', 'false');
      this._opt('Skill Level', sk);
    } else {
      this._opt('UCI_LimitStrength', 'false');
      this._opt('Skill Level', 20);
    }
    // Mit Zughistorie erkennt Stockfish Stellungswiederholungen (und vermeidet sie, wenn es auf Gewinn steht)
    if (job.hist && job.hist.moves && job.hist.moves.length) this._send('position fen ' + job.hist.start + ' moves ' + job.hist.moves.join(' '));
    else this._send('position fen ' + job.fen);
    if (job.movetime) this._send('go movetime ' + job.movetime);
    else if (job.infinite) this._send('go infinite');
    else this._send('go depth ' + (job.depth || 18));
  };

  Engine.prototype._line = function (line) {
    var job = this.current;
    if (line.indexOf('bestmove') === 0) {
      this.current = null;
      var p = this.pending; this.pending = null;
      if (p) this._go(p);
      if (job && job.onDone) job.onDone(line.split(/\s+/)[1], job);
      return;
    }
    if (!job) return;
    var info = parseInfo(line);
    if (info && job.onInfo) job.onInfo(info, job);
  };

  /* ---------- Planer: Cache + Prioritäten ---------- */

  /* Cache-Eintrag: { key, fen, depth, lines:[{uci, score, pv, depth}], nodes, nps, terminal } */
  function Analyzer(engine, opts) {
    this.engine = engine;
    this.cache = new Map();
    this.focus = null;          // { fen, key, legal }
    this.queue = [];            // [{ fen, key, legal }]
    this.play = null;           // { fen, strength, movetime, cb }
    this.threat = null;         // { fen, key } – Stellung mit „Nullzug“: Was würde der Gegner jetzt spielen?
    this.cfg = Object.assign({ liveMin: 16, liveMax: 24, reviewDepth: 16, liveMpv: 3, reviewMpv: 2, threatDepth: 14 }, opts || {});
    this.onUpdate = null;       // (key, entry)
    this.onActivity = null;     // (text)
    this.job = null;
    this.paused = false;
  }

  Analyzer.prototype.entry = function (fen, hk) { return this.cache.get(akey(fen, hk)) || null; };

  Analyzer.prototype.setFocus = function (fen, legal, hist) {
    var key = akey(fen, hist && hist.hk);
    if (this.focus && this.focus.key === key) return;
    this.focus = { fen: fen, key: key, legal: legal, hist: hist || null };
    this.schedule(true);
  };

  Analyzer.prototype.setQueue = function (items) {
    // depth: Zieltiefe je Eintrag (Standard: Review-Tiefe); batch: gehört zur Serien-Analyse
    this.queue = items.map(function (x) {
      return { fen: x.fen, key: akey(x.fen, x.hist && x.hist.hk), hist: x.hist || null, legal: x.legal, depth: x.depth || 0,
               batch: !!x.batch, extra: !!x.extra };
    });
    this.schedule(false);
  };

  Analyzer.prototype.markTerminal = function (fen, kind, hk) {
    var key = akey(fen, hk);
    if (!this.cache.has(key)) this.cache.set(key, { key: key, fen: fen, depth: 99, lines: [], terminal: kind });
  };

  // Drohung: dieselbe Stellung, aber der Gegner ist am Zug (null = aus)
  Analyzer.prototype.setThreat = function (fen) {
    var key = fen ? akey(fen) : null;
    if ((this.threat && this.threat.key) === key) return;
    this.threat = fen ? { fen: fen, key: key } : null;
    this.schedule(true);
  };

  Analyzer.prototype.requestMove = function (fen, strength, movetime, cb, hist) {
    this.play = { fen: fen, strength: strength, movetime: movetime, cb: cb, hist: hist || null };
    this.schedule(true);
  };
  Analyzer.prototype.cancelMove = function () {
    if (this.play) { this.play = null; this.schedule(true); }
  };

  Analyzer.prototype.configure = function (cfg) {
    Object.assign(this.cfg, cfg);
    this.schedule(true);
  };

  Analyzer.prototype._depth = function (key) {
    var e = this.cache.get(key);
    return e ? e.depth : 0;
  };

  Analyzer.prototype._reviewTodo = function () {
    for (var i = 0; i < this.queue.length; i++) {
      var q = this.queue[i];
      var e = this.cache.get(q.key);
      if (e && e.terminal) continue;
      if (!e || e.depth < (q.depth || this.cfg.reviewDepth) || (e.lines.length < Math.min(this.cfg.reviewMpv, q.legal || 9))) return q;
    }
    return null;
  };

  // Genug analysiert für die Bewertung?
  Analyzer.prototype.ready = function (fen, depth, hk) {
    var e = this.cache.get(akey(fen, hk));
    return !!e && (!!e.terminal || e.depth >= depth);
  };

  Analyzer.prototype.reviewProgress = function () {
    var done = 0, self = this;
    // Zusatz-Analysen (z. B. Drohungen vor Fehlern) zählen nicht zum sichtbaren Review-Fortschritt
    var items = this.queue.filter(function (q) { return !q.batch && !q.extra; });
    items.forEach(function (q) {
      var e = self.cache.get(q.key);
      if (e && (e.terminal || e.depth >= (q.depth || self.cfg.reviewDepth))) done++;
    });
    return { done: done, total: items.length };
  };

  // Was soll die Engine als Nächstes tun?
  Analyzer.prototype._pick = function () {
    if (this.play) return { kind: 'play' };
    var th = this.threat, te = th ? this.cache.get(th.key) : null;
    if (th && !(te && (te.terminal || te.depth >= this.cfg.threatDepth))) return { kind: 'threat' };
    var f = this.focus, fe = f ? this.cache.get(f.key) : null;
    var focusDepth = fe ? fe.depth : 0;
    var focusTodo = f && !(fe && fe.terminal) && f.legal !== 0;
    if (focusTodo && focusDepth < this.cfg.liveMin) return { kind: 'focus' };
    var r = this._reviewTodo();
    if (r) return { kind: 'review', item: r };
    if (focusTodo && focusDepth < this.cfg.liveMax) return { kind: 'focus' };
    return null;
  };

  Analyzer.prototype.schedule = function (force) {
    if (this.engine.state !== 'ready' || this.paused) return;
    var want = this._pick();
    var job = this.job;
    if (job && !job.finished && want) {
      var same = (want.kind === 'play' && job.kind === 'play' && job.playRef === this.play) ||
                 (want.kind === 'focus' && job.kind === 'focus' && this.focus && job.key === this.focus.key) ||
                 (want.kind === 'threat' && job.kind === 'threat' && this.threat && job.key === this.threat.key) ||
                 (want.kind === 'review' && job.kind === 'review' && job.key === want.item.key);
      if (same) return;
    }
    if (job && !job.finished && !want) {
      // nichts mehr zu tun → laufenden Fokus weiterlaufen lassen, falls er noch aktuell ist
      if (job.kind === 'focus' && this.focus && job.key === this.focus.key) return;
    }
    if (!want) { if (job && !job.finished) this.engine.stop(); return; }
    this._start(want);
  };

  Analyzer.prototype._start = function (want) {
    var self = this, fen, key, mpv, depth, legal, hist;
    if (want.kind === 'play') {
      var p = this.play;
      var job = { kind: 'play', playRef: p, fen: p.fen, hist: p.hist, key: akey(p.fen, p.hist && p.hist.hk), strength: p.strength, movetime: p.movetime,
                  onInfo: function () {}, onDone: function (bm, j) {
                    j.finished = true;
                    if (self.job === j) self.job = null;
                    if (self.play === p && !j.stopping) { self.play = null; p.cb(bm); }
                    self.schedule(false);
                  } };
      this.job = job;
      this.engine.run(job);
      if (this.onActivity) this.onActivity('play');
      return;
    }
    if (want.kind === 'focus') {
      fen = this.focus.fen; key = this.focus.key; legal = this.focus.legal; hist = this.focus.hist;
      mpv = Math.min(this.cfg.liveMpv, legal || 9); depth = this.cfg.liveMax;
    } else if (want.kind === 'threat') {
      fen = this.threat.fen; key = this.threat.key; legal = 9; hist = null; mpv = 1; depth = this.cfg.threatDepth;
    } else {
      fen = want.item.fen; key = want.item.key; legal = want.item.legal; hist = want.item.hist;
      mpv = Math.min(this.cfg.reviewMpv, legal || 9); depth = want.item.depth || this.cfg.reviewDepth;
    }
    var j2 = { kind: want.kind, fen: fen, hist: hist, key: key, multipv: mpv, depth: depth, lines: [],
               onInfo: function (info, j) { self._info(info, j); },
               onDone: function (bm, j) {
                 j.finished = true;
                 if (self.job === j) self.job = null;
                 self.schedule(false);
               } };
    this.job = j2;
    this.engine.run(j2);
    if (this.onActivity) this.onActivity(want.kind);
  };

  Analyzer.prototype._info = function (info, job) {
    var idx = info.multipv - 1;
    if (idx >= job.multipv) return;
    job.lines[idx] = { uci: info.pv[0], score: info.score, pv: info.pv, depth: info.depth };
    job.nodes = info.nodes; job.nps = info.nps;
    // Tiefe gilt als abgeschlossen, wenn die letzte MultiPV-Zeile dieser Tiefe da ist
    if (info.multipv !== job.multipv) return;
    var d = info.depth;
    for (var i = 0; i < job.multipv; i++) if (!job.lines[i] || job.lines[i].depth < d) return;
    var e = this.cache.get(job.key);
    if (!e) {
      e = { key: job.key, fen: job.fen, depth: 0, lines: [] };
      this.cache.set(job.key, e);
      // Speicher begrenzen: älteste Einträge verwerfen (Map behält die Einfügereihenfolge)
      if (this.cache.size > 20000) {
        var drop = this.cache.size - 16000, it = this.cache.keys();
        while (drop-- > 0) this.cache.delete(it.next().value);
      }
    }
    // Nur überschreiben, wenn die neue Suche mindestens so tief ist (und genug Zeilen hat)
    if (d > e.depth || (d === e.depth && job.multipv >= e.lines.length)) {
      e.depth = d;
      e.lines = job.lines.slice(0, job.multipv).map(function (l) { return { uci: l.uci, score: l.score, pv: l.pv, depth: l.depth }; });
      e.nodes = job.nodes; e.nps = job.nps;
      if (this.onUpdate) this.onUpdate(job.key, e);
    }
    // Live-Stellung tief genug → Engine für das Review freigeben
    if (job.kind === 'focus' && d >= this.cfg.liveMin && this._reviewTodo() && !job.stopping) this.schedule(false);
  };

  root.SK.engine = { Engine: Engine, Analyzer: Analyzer, parseInfo: parseInfo, posKey: posKey, akey: akey, CANDIDATES: CANDIDATES };
})();
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SK.engine;

/* SK.Board – Schachbrett: Figuren, Ziehen per Klick oder Drag, Umwandlungsauswahl,
   Pfeile (Engine-Züge), Markierungen und Bewertungs-Badge auf dem Zielfeld. */
(function () {
  var root = (typeof window !== 'undefined') ? window : globalThis;
  root.SK = root.SK || {};

  var FILES = 'abcdefgh';
  var SVGNS = 'http://www.w3.org/2000/svg';

  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }
  function sqToFR(sq) { return { f: FILES.indexOf(sq[0]), r: +sq[1] - 1 }; }
  function parseFen(fen) {
    var out = {}, rows = fen.split(' ')[0].split('/');
    for (var i = 0; i < 8; i++) {
      var f = 0;
      for (var j = 0; j < rows[i].length; j++) {
        var ch = rows[i][j];
        if (/\d/.test(ch)) { f += +ch; continue; }
        var color = ch === ch.toUpperCase() ? 'w' : 'b';
        out[FILES[f] + (8 - i)] = color + ch.toLowerCase();
        f++;
      }
    }
    return out;
  }

  /* opts: { legalFrom(sq) → [{to, promotion?, captured?}], canPick(color) → bool,
             onMove({from, to, promotion}) } */
  function Board(host, opts) {
    this.host = host;
    this.opts = opts;
    this.orientation = 'w';
    this.pos = {};
    this.fen = null;
    this.sel = null;
    this.targets = [];
    this.drag = null;
    this.view = {};
    host.classList.add('board');
    host.setAttribute('role', 'grid');
    host.setAttribute('aria-label', 'Schachbrett');
    this.sqLayer = el('div', 'b-squares', host);
    this.pcLayer = el('div', 'b-pieces', host);
    this.svg = document.createElementNS(SVGNS, 'svg');
    this.svg.setAttribute('class', 'b-arrows');
    this.svg.setAttribute('viewBox', '0 0 800 800');
    this.svg.setAttribute('aria-hidden', 'true');
    host.appendChild(this.svg);
    this.badgeLayer = el('div', 'b-badges', host);
    this.promo = el('div', 'b-promo', host);
    this.promo.hidden = true;
    this.squares = {};
    for (var i = 0; i < 64; i++) {
      var s = el('div', 'sq', this.sqLayer);
      this.squares[i] = s;
    }
    this._bind();
  }

  Board.prototype._colRow = function (sq) {
    var p = sqToFR(sq);
    return this.orientation === 'w' ? { c: p.f, r: 7 - p.r } : { c: 7 - p.f, r: p.r };
  };
  Board.prototype._sqAt = function (c, r) {
    if (c < 0 || c > 7 || r < 0 || r > 7) return null;
    return this.orientation === 'w' ? FILES[c] + (8 - r) : FILES[7 - c] + (r + 1);
  };
  Board.prototype._sqFromPoint = function (x, y) {
    var b = this.host.getBoundingClientRect();
    var c = Math.floor((x - b.left) / (b.width / 8));
    var r = Math.floor((y - b.top) / (b.height / 8));
    return this._sqAt(c, r);
  };

  /* view = { fen, orientation, lastMove:{from,to}, check, arrows:[{from,to,kind}], badge:{square,key,sym},
              tint:{key}, animate:{from,to}, interactive } */
  Board.prototype.render = function (view) {
    var self = this;
    var fenChanged = view.fen !== this.fen;
    var orientChanged = view.orientation !== this.orientation;
    this.view = view;
    this.orientation = view.orientation || 'w';
    if (fenChanged) { this.sel = null; this.targets = []; this._closePromo(); }
    this.fen = view.fen;
    this.pos = parseFen(view.fen);

    // Felder
    for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
      var sq = this._sqAt(c, r);
      var d = this.squares[r * 8 + c];
      var fr = sqToFR(sq);
      var light = (fr.f + fr.r) % 2 === 1;
      var cls = 'sq ' + (light ? 'l' : 'd');
      if (view.lastMove && (view.lastMove.from === sq || view.lastMove.to === sq)) cls += ' last';
      if (view.check === sq) cls += ' check';
      if (this.sel === sq) cls += ' sel';
      var t = this.targets.filter(function (x) { return x.to === sq; })[0];
      if (t) cls += t.captured ? ' cap' : ' dot';
      d.className = cls;
      d.dataset.sq = sq;
      var lbl = '';
      if (c === 0) lbl += '<i class="rk">' + sq[1] + '</i>';
      if (r === 7) lbl += '<i class="fl">' + sq[0] + '</i>';
      if (d._lbl !== lbl) { d.innerHTML = lbl; d._lbl = lbl; }
    }
    if (view.tint) this.host.dataset.tint = view.tint; else delete this.host.dataset.tint;

    // Figuren
    if (fenChanged || orientChanged || this._pcDirty) {
      this._pcDirty = false;
      this.pcLayer.textContent = '';
      this.pieceEls = {};
      Object.keys(this.pos).forEach(function (sq) {
        var p = el('div', 'pc ' + self.pos[sq], self.pcLayer);
        var cr = self._colRow(sq);
        p.style.transform = 'translate(' + cr.c * 100 + '%,' + cr.r * 100 + '%)';
        self.pieceEls[sq] = p;
      });
      var a = view.animate;
      if (a && fenChanged && !orientChanged && this.pieceEls[a.to] && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        var pe = this.pieceEls[a.to], from = this._colRow(a.from), to = this._colRow(a.to);
        pe.style.transition = 'none';
        pe.style.transform = 'translate(' + from.c * 100 + '%,' + from.r * 100 + '%)';
        void pe.offsetWidth;
        pe.style.transition = '';
        pe.style.transform = 'translate(' + to.c * 100 + '%,' + to.r * 100 + '%)';
      }
    }

    this._arrows(view.arrows || []);
    this._badge(view.badge);
  };

  Board.prototype._arrows = function (list) {
    var svg = this.svg, self = this;
    svg.textContent = '';
    list.forEach(function (a) {
      var f = self._colRow(a.from), t = self._colRow(a.to);
      var x1 = f.c * 100 + 50, y1 = f.r * 100 + 50, x2 = t.c * 100 + 50, y2 = t.r * 100 + 50;
      var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
      if (!len) return;
      var ux = dx / len, uy = dy / len, px = -uy, py = ux;
      var w = a.width || 16, hw = w * 1.9, hl = w * 2.3;
      var sx = x1 + ux * 18, sy = y1 + uy * 18; // etwas vom Mittelpunkt weg starten
      var bx = x2 - ux * hl, by = y2 - uy * hl;
      var pts = [
        [sx + px * w / 2, sy + py * w / 2], [bx + px * w / 2, by + py * w / 2],
        [bx + px * hw, by + py * hw], [x2, y2], [bx - px * hw, by - py * hw],
        [bx - px * w / 2, by - py * w / 2], [sx - px * w / 2, sy - py * w / 2]
      ].map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
      var poly = document.createElementNS(SVGNS, 'polygon');
      poly.setAttribute('points', pts);
      poly.setAttribute('class', 'arrow ' + (a.kind || 'best'));
      svg.appendChild(poly);
    });
  };

  Board.prototype._badge = function (b) {
    this.badgeLayer.textContent = '';
    if (!b || !b.square) return;
    var cr = this._colRow(b.square);
    var d = el('div', 'badge c-' + b.key + (b.pop ? ' pop' : ''), this.badgeLayer);
    d.textContent = b.sym;
    d.title = b.label || '';
    d.style.left = ((cr.c + 1) * 12.5) + '%';
    d.style.top = (cr.r * 12.5) + '%';
  };

  /* ---------- Eingabe ---------- */

  Board.prototype._select = function (sq) {
    var p = this.pos[sq];
    if (!p || !this.view.interactive || !this.opts.canPick(p[0])) { this.sel = null; this.targets = []; }
    else { this.sel = sq; this.targets = this.opts.legalFrom(sq); }
    this.render(this.view);
  };

  Board.prototype._tryMove = function (from, to) {
    var cands = this.targets.filter(function (t) { return t.to === to; });
    if (!cands.length) return false;
    var self = this;
    if (cands.some(function (t) { return t.promotion; })) {
      this._openPromo(from, to, function (pc) {
        self.sel = null; self.targets = [];
        self.opts.onMove({ from: from, to: to, promotion: pc });
      });
      return true;
    }
    this.sel = null; this.targets = [];
    this.opts.onMove({ from: from, to: to });
    return true;
  };

  Board.prototype._openPromo = function (from, to, cb) {
    var self = this, color = this.pos[from][0];
    var cr = this._colRow(to);
    var down = cr.r === 0;
    this.promo.textContent = '';
    this.promo.hidden = false;
    this.promo.style.left = (cr.c * 12.5) + '%';
    this.promo.style.top = down ? '0' : 'auto';
    this.promo.style.bottom = down ? 'auto' : '0';
    ['q', 'n', 'r', 'b'].forEach(function (t) {
      var b = el('button', 'pc ' + color + t, self.promo);
      b.type = 'button';
      b.setAttribute('aria-label', { q: 'Dame', n: 'Springer', r: 'Turm', b: 'Läufer' }[t]);
      b.addEventListener('click', function (e) { e.stopPropagation(); self._closePromo(); cb(t); });
    });
    this._promoOpen = true;
  };
  Board.prototype._closePromo = function () {
    if (!this.promo) return;
    this.promo.hidden = true; this._promoOpen = false;
  };

  Board.prototype._bind = function () {
    var self = this;
    this.host.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    this.host.addEventListener('pointerdown', function (e) {
      if (self._promoOpen) {
        if (!self.promo.contains(e.target)) { self._closePromo(); self.sel = null; self.targets = []; self.render(self.view); }
        return;
      }
      if (e.button !== 0) return;
      var sq = self._sqFromPoint(e.clientX, e.clientY);
      if (!sq) return;
      // Zug per Klick auf ein Zielfeld
      if (self.sel && sq !== self.sel && self.targets.some(function (t) { return t.to === sq; })) {
        self._tryMove(self.sel, sq);
        return;
      }
      var p = self.pos[sq];
      if (p && self.view.interactive && self.opts.canPick(p[0])) {
        var again = self.sel === sq;
        self._select(sq);
        var pe = self.pieceEls && self.pieceEls[sq];
        if (pe) {
          e.preventDefault();
          self.host.setPointerCapture && self.host.setPointerCapture(e.pointerId);
          self.drag = { from: sq, el: pe, moved: false, x0: e.clientX, y0: e.clientY, again: again, id: e.pointerId };
        }
      } else {
        self.sel = null; self.targets = [];
        self.render(self.view);
      }
    });
    this.host.addEventListener('pointermove', function (e) {
      var d = self.drag;
      if (!d || e.pointerId !== d.id) return;
      if (!d.moved && Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) < 4) return;
      d.moved = true;
      var b = self.host.getBoundingClientRect(), s = b.width / 8;
      d.el.classList.add('dragging');
      d.el.style.transform = 'translate(' + (e.clientX - b.left - s / 2) + 'px,' + (e.clientY - b.top - s / 2) + 'px)';
    });
    function end(e) {
      var d = self.drag;
      if (!d || e.pointerId !== d.id) return;
      self.drag = null;
      d.el.classList.remove('dragging');
      var sq = self._sqFromPoint(e.clientX, e.clientY);
      if (d.moved) {
        if (sq && sq !== d.from && self._tryMove(d.from, sq)) return;
        self._pcDirty = true;
        self.render(self.view);
      } else if (d.again) {
        // zweiter Klick auf dieselbe Figur hebt die Auswahl auf
        self.sel = null; self.targets = [];
        self.render(self.view);
      }
    }
    this.host.addEventListener('pointerup', end);
    this.host.addEventListener('pointercancel', function (e) {
      var d = self.drag; if (!d) return;
      self.drag = null; d.el.classList.remove('dragging'); self._pcDirty = true; self.render(self.view);
    });
  };

  root.SK.Board = Board;
  root.SK.parseFen = parseFen;
})();

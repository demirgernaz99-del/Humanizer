/* SK.share – erzeugt Bilder zum Teilen (1080×1350, Instagram/WhatsApp-tauglich):
   moveCard: Stellung mit Symbol, z. B. „Brillanter Zug!!“; reviewCard: Genauigkeit + Bilanz.
   In der kostenlosen Version mit Wasserzeichen. Reines Canvas, keine Bibliothek. */
(function () {
  var root = (typeof window !== 'undefined') ? window : globalThis;
  root.SK = root.SK || {};

  var W = 1080, H = 1350;
  var FILES = 'abcdefgh';
  var imgCache = {};
  function css(name, fb) {
    try { var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fb; } catch (e) { return fb; }
  }
  function loadImg(src) {
    if (imgCache[src]) return imgCache[src];
    imgCache[src] = new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = src; });
    return imgCache[src];
  }
  function parseFen(fen) {
    var out = {}, rows = fen.split(' ')[0].split('/');
    for (var r = 0; r < 8; r++) {
      var f = 0;
      for (var j = 0; j < rows[r].length; j++) {
        var ch = rows[r][j];
        if (/\d/.test(ch)) { f += +ch; continue; }
        out[FILES[f] + (8 - r)] = (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toLowerCase();
        f++;
      }
    }
    return out;
  }
  function font(weight, size, fam) { return weight + ' ' + size + 'px ' + (fam || '"Bricolage Grotesque", "IBM Plex Sans", system-ui, sans-serif'); }
  function rounded(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function base(opts) {
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#16191b'; ctx.fillRect(0, 0, W, H);
    // Kopfzeile: Marke
    ctx.fillStyle = '#e6e9e4'; ctx.font = font(800, 44); ctx.textBaseline = 'alphabetic';
    ctx.fillText(opts.brand || 'Zugradar', 60, 96);
    ctx.fillStyle = '#d9a646'; ctx.font = font(600, 22, '"IBM Plex Mono", monospace');
    var r = opts.tagline || 'Stockfish 18';
    ctx.fillText(r, W - 60 - ctx.measureText(r).width, 94);
    return { canvas: c, ctx: ctx };
  }
  function footer(ctx, opts) {
    ctx.fillStyle = '#858e88'; ctx.font = font(500, 24, '"IBM Plex Sans", system-ui, sans-serif');
    var t = opts.footer || '';
    ctx.fillText(t, 60, H - 48);
    if (opts.watermark) {
      ctx.save();
      ctx.globalAlpha = 0.16; ctx.fillStyle = '#ffffff'; ctx.font = font(800, 120);
      ctx.translate(W / 2, H / 2); ctx.rotate(-0.5);
      var wm = opts.brand || 'Zugradar';
      ctx.fillText(wm, -ctx.measureText(wm).width / 2, 40);
      ctx.restore();
    }
  }
  function toBlob(canvas) { return new Promise(function (res) { canvas.toBlob(function (b) { res(b); }, 'image/png'); }); }

  /* opts: { fen, orientation, lastMove:{from,to}, badge:{key, sym}, title, subtitle, footer, brand, watermark, pieces } */
  function moveCard(opts) {
    var b = base(opts), ctx = b.ctx;
    var size = 900, x0 = (W - size) / 2, y0 = 250, sq = size / 8;
    var light = css('--sq-l', '#ece7d1'), dark = css('--sq-d', '#7b936b');
    var pos = parseFen(opts.fen), orient = opts.orientation || 'w';
    function xy(s) { var f = FILES.indexOf(s[0]), r = +s[1] - 1; var c = orient === 'w' ? f : 7 - f, rr = orient === 'w' ? 7 - r : r; return { x: x0 + c * sq, y: y0 + rr * sq }; }
    var keyColor = opts.badge ? css('--c-' + opts.badge.key, '#13a598') : '#13a598';
    // Titel
    ctx.fillStyle = keyColor; ctx.font = font(800, 64);
    ctx.fillText(opts.title || '', 60, 178);
    ctx.fillStyle = '#b4bbb5'; ctx.font = font(500, 30, '"IBM Plex Mono", monospace');
    ctx.fillText(opts.subtitle || '', 60, 222);
    // Brett
    for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
      ctx.fillStyle = (r + f) % 2 === 0 ? light : dark;
      ctx.fillRect(x0 + f * sq, y0 + r * sq, sq, sq);
    }
    if (opts.lastMove) {
      [opts.lastMove.from, opts.lastMove.to].forEach(function (s) {
        var p = xy(s); ctx.fillStyle = keyColor; ctx.globalAlpha = 0.45; ctx.fillRect(p.x, p.y, sq, sq); ctx.globalAlpha = 1;
      });
    }
    var pieces = opts.pieces || root.SK.PIECES || {};
    var loads = Object.keys(pos).map(function (s) {
      var src = pieces[pos[s]];
      return src ? loadImg(src).then(function (img) { var p = xy(s); ctx.drawImage(img, p.x, p.y, sq, sq); }) : Promise.resolve();
    });
    return Promise.all(loads).then(function () {
      if (opts.badge && opts.lastMove) {
        var p = xy(opts.lastMove.to), cx = p.x + sq - 14, cy = p.y + 14, rad = 36;
        ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fillStyle = keyColor; ctx.fill();
        ctx.lineWidth = 6; ctx.strokeStyle = '#ffffff'; ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.font = font(800, 34, '"IBM Plex Sans", system-ui, sans-serif');
        var s = opts.badge.sym; ctx.fillText(s, cx - ctx.measureText(s).width / 2, cy + 12);
      }
      footer(ctx, opts);
      return toBlob(b.canvas);
    });
  }

  /* opts: { white, black, accW, accB, result, opening, rows:[{label, sym, key, w, b}], footer, brand, watermark } */
  function reviewCard(opts) {
    var b = base(opts), ctx = b.ctx;
    ctx.fillStyle = '#e6e9e4'; ctx.font = font(800, 60);
    ctx.fillText(opts.title || 'Game Review', 60, 190);
    ctx.fillStyle = '#b4bbb5'; ctx.font = font(500, 28, '"IBM Plex Sans", system-ui, sans-serif');
    ctx.fillText(opts.subtitle || '', 60, 236);
    function box(x, name, acc, colorFill) {
      rounded(ctx, x, 290, 450, 220, 24); ctx.fillStyle = '#22272a'; ctx.fill();
      ctx.fillStyle = colorFill; ctx.fillRect(x + 32, 330, 26, 26);
      ctx.lineWidth = 2; ctx.strokeStyle = '#858e88'; ctx.strokeRect(x + 32, 330, 26, 26);
      ctx.fillStyle = '#b4bbb5'; ctx.font = font(500, 28, '"IBM Plex Sans", system-ui, sans-serif');
      ctx.fillText(name.slice(0, 22), x + 72, 352);
      ctx.fillStyle = '#e6e9e4'; ctx.font = font(800, 104);
      ctx.fillText(acc == null ? '–' : acc.toFixed(1), x + 32, 470);
    }
    box(60, opts.white || 'White', opts.accW, '#f7f6f1');
    box(570, opts.black || 'Black', opts.accB, '#25282a');
    var y = 590;
    (opts.rows || []).forEach(function (row) {
      // Zeile: Anzahl Weiß | Symbol + Kategorie | Anzahl Schwarz
      rounded(ctx, 60, y - 8, W - 120, 60, 14); ctx.fillStyle = '#1c2023'; ctx.fill();
      ctx.fillStyle = '#e6e9e4'; ctx.font = font(600, 38, '"IBM Plex Mono", monospace');
      var ws = String(row.w); ctx.fillText(ws, 190 - ctx.measureText(ws).width, y + 36);
      var bs = String(row.b); ctx.fillText(bs, W - 150 - ctx.measureText(bs).width, y + 36);
      ctx.fillStyle = css('--c-' + row.key, '#888');
      ctx.beginPath(); ctx.arc(360, y + 22, 24, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.font = font(800, 22, '"IBM Plex Sans", system-ui, sans-serif');
      ctx.fillText(row.sym, 360 - ctx.measureText(row.sym).width / 2, y + 30);
      ctx.fillStyle = '#b4bbb5'; ctx.font = font(500, 28, '"IBM Plex Sans", system-ui, sans-serif');
      ctx.fillText(row.label, 404, y + 32);
      y += 74;
    });
    footer(ctx, opts);
    return Promise.resolve(toBlob(b.canvas));
  }

  // Teilen (Handy) oder herunterladen (Desktop). In der claude.ai-Vorschau über deren Download-Schnittstelle.
  function deliver(blob, filename, text) {
    var cl = root.claude;
    if (cl && typeof cl.use === 'function') {
      return cl.use('downloads').then(function (dl) {
        if (!dl) return deliverPlain(blob, filename, text);
        return dl.save({ filename: filename, data: blob }).then(function () { return 'saved'; }, function (e) {
          return e && e.code === 'declined' ? 'cancelled' : deliverPlain(blob, filename, text);
        });
      }, function () { return deliverPlain(blob, filename, text); });
    }
    return deliverPlain(blob, filename, text);
  }
  function deliverPlain(blob, filename, text) {
    var file = null;
    try { file = new File([blob], filename, { type: 'image/png' }); } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], text: text || '' }).then(function () { return 'shared'; }, function () { return 'cancelled'; });
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    return Promise.resolve('downloaded');
  }

  root.SK.share = { moveCard: moveCard, reviewCard: reviewCard, deliver: deliver };
})();

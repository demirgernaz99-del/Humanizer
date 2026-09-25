/* SK.connect – holt deine BEENDETEN Partien von chess.com und lichess (öffentliche APIs,
   kein Login). Laufende Partien werden bewusst nie abgefragt: Engine-Hilfe während einer
   Partie gegen Menschen ist Betrug. Auch die „aktuelle Partie“-Endpunkte beider Seiten
   (lichess /current-game, chess.com /games bzw. /to-move) werden nicht verwendet. */
(function () {
  var root = (typeof window !== 'undefined') ? window : globalThis;
  root.SK = root.SK || {};

  var blockedHosts = {};
  if (typeof document !== 'undefined') {
    // Seiten mit strenger CSP (z. B. gehostete Vorschau) blockieren fremde APIs → erkennbar machen
    document.addEventListener('securitypolicyviolation', function (e) {
      try { blockedHosts[new URL(e.blockedURI).host] = true; } catch (x) { /* egal */ }
    });
  }

  function ConnectError(code, message) { var e = new Error(message); e.code = code; return e; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // fetch mit Wiederholung. chess.com antwortet unter Last gelegentlich ohne CORS-Header
  // (der Browser meldet dann einen Netzfehler); nach ein paar Versuchen klappt es meist.
  var RETRIES = 5;
  function getText(url, opts, fetchImpl) {
    var f = fetchImpl || root.fetch.bind(root);
    var host = new URL(url).host, tries = 0;
    function attempt() {
      tries++;
      return f(url, opts || {}).then(function (res) {
        if (res.status === 404) throw ConnectError('notfound', 'Benutzer nicht gefunden.');
        if (res.status === 429) throw ConnectError('ratelimit', 'Zu viele Anfragen – bitte eine Minute warten.');
        if (res.status >= 500) throw ConnectError('network', 'Server antwortet mit ' + res.status + '.');
        if (!res.ok) throw ConnectError('http', 'Server antwortet mit ' + res.status + '.');
        return res.text();
      }, function () {
        if (blockedHosts[host]) throw ConnectError('blocked', 'Diese Seite darf ' + host + ' nicht abfragen.');
        throw ConnectError('network', 'Keine Verbindung zu ' + host + '.');
      }).catch(function (err) {
        if (err.code === 'network' && tries < RETRIES && !blockedHosts[host]) return sleep((root.SK.connect._retryMs || 400) * tries).then(attempt);
        throw err;
      });
    }
    return attempt();
  }

  // Letzte Stufe für chess.com: JSONP über ein <script> (braucht kein CORS, laut PubAPI-Doku unterstützt)
  var jsonpN = 0;
  function jsonp(url) {
    return new Promise(function (resolve, reject) {
      if (typeof document === 'undefined') return reject(ConnectError('network', 'Keine Verbindung zu api.chess.com.'));
      var name = '__zugradarJsonp' + (++jsonpN), s = document.createElement('script'), done = false;
      function finish() { done = true; clearTimeout(timer); try { delete root[name]; } catch (e) { root[name] = undefined; } s.remove(); }
      var timer = setTimeout(function () { if (!done) { finish(); reject(ConnectError('network', 'Keine Verbindung zu api.chess.com.')); } }, 15000);
      root[name] = function (data) { if (done) return; finish(); resolve(JSON.stringify(data)); };
      s.onerror = function () { if (done) return; finish(); reject(ConnectError(blockedHosts['api.chess.com'] ? 'blocked' : 'network', 'Keine Verbindung zu api.chess.com.')); };
      s.src = url + (url.indexOf('?') < 0 ? '?' : '&') + 'callback=' + name;
      document.head.appendChild(s);
    });
  }
  function chesscomText(url, fetchImpl) {
    return getText(url, {}, fetchImpl).catch(function (err) {
      if (err.code !== 'network' || fetchImpl) throw err; // Tests mit nachgebildetem fetch: kein JSONP
      return jsonp(url);
    });
  }

  /* Benutzername aus Eingabe lesen: erlaubt auch „@name“ und Profil-Links wie
     https://www.chess.com/member/name, chess.com/de/member/name oder https://lichess.org/@/name */
  function normalizeUser(site, input) {
    var u = String(input || '').trim();
    var m = u.match(/chess\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:member|members|player|players|profile|stats\/[a-z]+\/[a-z]+)\/([^\/?#\s]+)/i) ||
            u.match(/lichess\.org\/@\/([^\/?#\s]+)/i);
    if (m) u = decodeURIComponent(m[1]);
    u = u.replace(/^@+/, '').trim();
    return u;
  }
  function validUser(u) { return /^[A-Za-z0-9_-]{2,30}$/.test(u); }

  function resultOf(w, b) {
    if (w === 'win') return '1-0';
    if (b === 'win') return '0-1';
    return '1/2-1/2';
  }
  function userSide(game, user) {
    var u = user.toLowerCase();
    if (game.white.name.toLowerCase() === u) return 'w';
    if (game.black.name.toLowerCase() === u) return 'b';
    return null;
  }
  function withUser(g, user) {
    g.userColor = userSide(g, user);
    if (g.userColor) {
      var r = g.result;
      g.userResult = r === '1/2-1/2' ? 'draw' : ((r === '1-0') === (g.userColor === 'w') ? 'win' : 'loss');
    }
    return g;
  }

  /* chess.com: Monatsarchive (nur beendete Partien), neueste zuerst.
     Es wird Monat für Monat zurückgegangen, bis genug Partien da sind (höchstens opts.months Monate). */
  function chesscom(user, opts, fetchImpl) {
    opts = opts || {};
    var limit = opts.limit || 20, name = encodeURIComponent(user.trim().toLowerCase());
    var base = 'https://api.chess.com/pub/player/' + name + '/games/archives';
    return chesscomText(base, fetchImpl).then(function (t) {
      var archives = (JSON.parse(t).archives || []).slice().reverse();
      var games = [];
      function next(i) {
        if (i >= archives.length || i >= (opts.months || 6) || games.length >= limit) return Promise.resolve(games);
        return chesscomText(archives[i], fetchImpl).then(function (t2) {
          (JSON.parse(t2).games || []).forEach(function (g) {
            if (g.rules && g.rules !== 'chess') return;
            if (!g.pgn || !g.end_time) return; // Archive enthalten nur beendete Partien; sicherheitshalber prüfen
            games.push(withUser({
              site: 'chesscom', id: g.uuid || g.url, url: g.url, pgn: g.pgn,
              white: { name: g.white.username, rating: g.white.rating },
              black: { name: g.black.username, rating: g.black.rating },
              result: resultOf(g.white.result, g.black.result),
              end: g.end_time * 1000, timeControl: g.time_control, speed: g.time_class, rated: !!g.rated
            }, user));
          });
          return next(i + 1);
        });
      }
      return next(0);
    }).then(function (games) {
      games.sort(function (a, b) { return b.end - a.end; });
      return games.slice(0, limit);
    });
  }

  /* lichess: /api/games/user mit finished=true, ongoing=false */
  function lichess(user, opts, fetchImpl) {
    opts = opts || {};
    var limit = opts.limit || 20;
    var url = 'https://lichess.org/api/games/user/' + encodeURIComponent(user.trim()) +
              '?max=' + limit + '&finished=true&ongoing=false&pgnInJson=true&clocks=true&opening=true&moves=true';
    return getText(url, { headers: { Accept: 'application/x-ndjson' } }, fetchImpl).then(function (t) {
      return t.split('\n').filter(function (l) { return l.trim(); }).map(function (l) { return JSON.parse(l); })
        .filter(function (g) { return (g.variant === 'standard' || g.variant === 'fromPosition') && g.pgn && g.status !== 'started' && g.status !== 'created'; })
        .map(function (g) {
          var pw = g.players.white || {}, pb = g.players.black || {};
          var name = function (p) { return (p.user && p.user.name) || (p.aiLevel ? 'Stockfish Stufe ' + p.aiLevel : 'Anonym'); };
          var tc = g.clock ? g.clock.initial + '+' + g.clock.increment : null;
          return withUser({
            site: 'lichess', id: g.id, url: 'https://lichess.org/' + g.id, pgn: g.pgn,
            white: { name: name(pw), rating: pw.rating }, black: { name: name(pb), rating: pb.rating },
            result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '1/2-1/2',
            end: g.lastMoveAt || g.createdAt, timeControl: tc, speed: g.speed, rated: !!g.rated
          }, user);
        });
    });
  }

  function fetchGames(site, user, opts, fetchImpl) {
    user = normalizeUser(site, user);
    if (!user) return Promise.reject(ConnectError('input', 'Bitte einen Benutzernamen eingeben.'));
    if (!validUser(user)) return Promise.reject(ConnectError('badname', 'Das sieht nicht wie ein Benutzername aus.'));
    return site === 'lichess' ? lichess(user, opts, fetchImpl) : chesscom(user, opts, fetchImpl);
  }

  var SPEED = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Schnellschach', classical: 'Klassisch', daily: 'Fernschach', correspondence: 'Fernschach', ultraBullet: 'Bullet' };

  root.SK.connect = { fetchGames: fetchGames, chesscom: chesscom, lichess: lichess, normalizeUser: normalizeUser, SPEED: SPEED,
                      _blocked: blockedHosts, _retryMs: 400 };
})();
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SK.connect;

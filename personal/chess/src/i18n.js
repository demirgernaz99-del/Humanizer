/* SK.i18n – Deutsch/Englisch. Der deutsche Text ist zugleich der Schlüssel (wie gettext):
   t('Bester Zug') → 'Best move' auf Englisch. Platzhalter: t('Tiefe {d}', {d: 22}).
   Statische Texte im HTML: data-t (Text), data-t-title, data-t-placeholder, data-t-aria. */
(function () {
  var root = (typeof window !== 'undefined') ? window : globalThis;
  root.SK = root.SK || {};

  var KEY = 'zugradar.lang';
  var current = null;
  var EN = {}; // wird unten aus SK.i18nEN gefüllt (eigene Datei)

  function detect() {
    try { var s = root.localStorage && root.localStorage.getItem(KEY); if (s === 'de' || s === 'en') return s; } catch (e) { /* egal */ }
    var nav = (root.navigator && (root.navigator.language || (root.navigator.languages || [])[0])) || 'de';
    return /^de\b/i.test(nav) ? 'de' : 'en';
  }
  function lang() { if (!current) current = detect(); return current; }
  function setLang(l) {
    current = l === 'en' ? 'en' : 'de';
    try { root.localStorage && root.localStorage.setItem(KEY, current); } catch (e) { /* egal */ }
    if (root.document) root.document.documentElement.lang = current;
  }
  function fill(s, p) {
    if (!p) return s;
    return s.replace(/\{(\w+)\}/g, function (m, k) { return p[k] != null ? p[k] : m; });
  }
  function t(s, p) {
    if (lang() === 'en') {
      var dict = root.SK.i18nEN || EN;
      var v = dict[s];
      if (v == null && root.SK.i18n && root.SK.i18n.missing) root.SK.i18n.missing[s] = true;
      return fill(v != null ? v : s, p);
    }
    return fill(s, p);
  }
  // Statische Texte einer Seite übersetzen (Original bleibt in data-t-src erhalten)
  function apply(el) {
    var d = el || root.document;
    if (!d || !d.querySelectorAll) return;
    d.querySelectorAll('[data-t]').forEach(function (n) {
      if (!n.dataset.tSrc) n.dataset.tSrc = n.dataset.t || n.textContent.trim();
      n.textContent = t(n.dataset.tSrc);
    });
    d.querySelectorAll('[data-t-html]').forEach(function (n) {
      if (!n.dataset.tSrcHtml) n.dataset.tSrcHtml = n.innerHTML.trim();
      n.innerHTML = t(n.dataset.tSrcHtml);
    });
    ['title', 'placeholder', 'aria-label'].forEach(function (attr) {
      var a = attr === 'aria-label' ? 'aria' : attr;
      d.querySelectorAll('[data-t-' + a + ']').forEach(function (n) {
        var src = n.getAttribute('data-t-' + a) || n.getAttribute(attr);
        n.setAttribute('data-t-' + a, src);
        n.setAttribute(attr, t(src));
      });
    });
    if (root.document) root.document.documentElement.lang = lang();
  }
  // Zahlen/Datum im Stil der Sprache
  function num(x, digits) {
    return Number(x).toLocaleString(lang() === 'en' ? 'en-US' : 'de-DE', { minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0 });
  }
  function date(ms, withTime) {
    var d = new Date(ms), loc = lang() === 'en' ? 'en-GB' : 'de-DE';
    return d.toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: withTime ? undefined : '2-digit' }) +
      (withTime ? ' ' + d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' }) : '');
  }

  root.SK.i18n = { lang: lang, setLang: setLang, t: t, apply: apply, num: num, date: date, missing: {} };
})();
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SK.i18n;

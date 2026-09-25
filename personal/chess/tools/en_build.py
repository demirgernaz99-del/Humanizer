#!/usr/bin/env python3
"""Erzeugt src/i18n-en.js aus tools/en.py und prüft, ob alle Texte übersetzt sind.
   python3 tools/en_build.py   (build.py ruft das automatisch auf)"""
import json, os, sys, importlib.util
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.dirname(HERE)
def load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, name + '.py'))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
EN = load('en').EN
keys = load('i18n_keys').keys
missing = [k for k in keys if k not in EN]
js = ("/* Englische Texte – automatisch erzeugt aus tools/en.py (dort bearbeiten). */\n(function () {\n"
      "  var r = typeof window !== 'undefined' ? window : globalThis;\n  r.SK = r.SK || {};\n  r.SK.i18nEN = "
      + json.dumps(EN, ensure_ascii=False, indent=2) + ";\n})();\n")
open(os.path.join(BASE, 'src', 'i18n-en.js'), 'w', encoding='utf-8').write(js)
if missing:
    print('WARNUNG: %d Texte ohne englische Übersetzung:' % len(missing))
    for k in missing: print('   ', k)
else:
    print('Englisch: %d Texte, alle übersetzt' % len(keys))

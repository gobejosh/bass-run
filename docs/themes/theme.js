/* Basse Run — choix du thème
   À charger dans <head>, sans defer ni async, juste après <link rel="stylesheet" href="themes.css">,
   pour que le bon thème soit posé avant le premier affichage (pas de flash).

   API :
     BasseRunTheme.list        → [{ id, label, color, scheme }]
     BasseRunTheme.get()       → identifiant du thème enregistré ('neon' par défaut)
     BasseRunTheme.set(id)     → applique et enregistre ; déclenche l'événement 'basse-run:theme' sur document
*/
(function () {
  'use strict';

  var THEMES = [
    { id: 'neon',      label: 'Pupitre néon',              color: '#120f24', scheme: 'dark' },
    { id: 'phosphore', label: 'Terminal phosphore',        color: '#040a06', scheme: 'dark' },
    { id: 'signal',    label: 'Signalétique industrielle', color: '#2a2c2e', scheme: 'dark' },
    { id: 'tokyo',     label: 'Éditorial Néo-Tokyo',       color: '#0a0a0a', scheme: 'dark' },
    { id: 'jour',      label: 'Pupitre de jour',           color: '#f3f2ee', scheme: 'light' }
  ];
  var DEFAULT_ID = 'neon';
  var STORAGE_KEY = 'basse-run.theme';

  function find(id) {
    for (var i = 0; i < THEMES.length; i++) {
      if (THEMES[i].id === id) return THEMES[i];
    }
    return null;
  }

  function get() {
    try {
      var saved = window.localStorage.getItem(STORAGE_KEY);
      if (find(saved)) return saved;
    } catch (e) { /* stockage indisponible : thème par défaut */ }
    return DEFAULT_ID;
  }

  function set(id, options) {
    var theme = find(id) || find(DEFAULT_ID);
    var root = document.documentElement;
    root.setAttribute('data-theme', theme.id);

    // Couleur de la barre système de la PWA (Android, Windows)
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta && document.head) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    if (meta) meta.setAttribute('content', theme.color);

    if (!options || options.persist !== false) {
      try { window.localStorage.setItem(STORAGE_KEY, theme.id); } catch (e) { /* rien */ }
    }
    try {
      document.dispatchEvent(new CustomEvent('basse-run:theme', { detail: { id: theme.id, theme: theme } }));
    } catch (e) { /* navigateur ancien : pas d'événement */ }
    return theme.id;
  }

  set(get(), { persist: false });

  window.BasseRunTheme = {
    list: THEMES.slice(),
    get: get,
    set: set
  };
})();

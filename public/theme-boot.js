// Thème posé avant le premier affichage (voir src/ui/theme.ts) : pas d'éclair d'un autre thème.
// Fichier séparé (et non script en ligne) pour que la politique de sécurité du contenu puisse interdire tout script en ligne.
(function () {
  var ids = { neon: "#120f24", phosphore: "#040a06", signal: "#2a2c2e", tokyo: "#0a0a0a", jour: "#f3f2ee" };
  var id = "neon";
  try { var s = localStorage.getItem("basse-run.theme"); if (ids[s]) id = s; } catch (e) {}
  document.documentElement.setAttribute("data-theme", id);
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", ids[id]);
})();

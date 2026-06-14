/**
 * Render : frontend statique + API sur smart-academy-of-congo-api.
 * Local / Vercel / Firebase (rewrite /api) : SAC_API_BASE reste vide.
 */
(function () {
  if (typeof window === "undefined" || window.SAC_API_BASE) return;
  var host = window.location.hostname || "";
  if (host.endsWith(".onrender.com") && host.indexOf("-api") === -1) {
    window.SAC_API_BASE = "https://smart-academy-of-congo-api.onrender.com";
  }
})();

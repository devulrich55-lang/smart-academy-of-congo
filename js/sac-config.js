/**
 * Render frontend :
 * - Web Service Node (server.js) → proxy /api sur même origine (recommandé)
 * - Static Site → repli direct vers API-1 (nécessite CORS sur l'API)
 */
(function () {
  if (typeof window === "undefined" || window.SAC_API_BASE) return;
  var host = window.location.hostname || "";
  var RENDER_API = "https://smart-academy-of-congo-api-1.onrender.com";
  var CUSTOM_DOMAINS = ["evosmartuni.com", "www.evosmartuni.com"];
  function isHostedFrontend(hostname) {
    if (!hostname) return false;
    if (CUSTOM_DOMAINS.indexOf(hostname) !== -1) return true;
    return hostname.endsWith(".onrender.com") && hostname.indexOf("-api") === -1;
  }
  if (isHostedFrontend(host)) {
    window.SAC_API_PROXY_ORIGIN = window.location.origin.replace(/\/+$/, "");
    window.SAC_API_BASE = RENDER_API;
  }
  window.SAC_JS_BUILD = "20260702d";
  window.SAC_PLATFORM_LOGO = "evo-uni.jpeg";
  window.SAC_PLATFORM_LOGO_ALT = "Evo-smartUni";
  if (typeof document !== "undefined" && window.SAC_API_BASE) {
    fetch(window.SAC_API_BASE + "/api/health", { mode: "cors", credentials: "omit" }).catch(function () {});
  }
})();

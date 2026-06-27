/**
 * Render : même origine (proxy /api via server.js) — plus de CORS.
 * Local (start-local.bat) : ne rien définir — API same-origin sur le port 8000.
 */
(function () {
  if (typeof window === "undefined" || window.SAC_API_BASE) return;
  var host = window.location.hostname || "";
  if (host.endsWith(".onrender.com") && host.indexOf("-api") === -1) {
    window.SAC_API_BASE = window.location.origin;
  }
  window.SAC_JS_BUILD = "20260629a";
  if (typeof document !== "undefined" && window.SAC_API_BASE) {
    fetch(window.SAC_API_BASE + "/api/health", { mode: "cors", credentials: "omit" }).catch(function () {});
  }
})();

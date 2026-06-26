/**
 * Render : frontend statique + API sur smart-academy-of-congo-api.
 * Local (start-local.bat) : ne rien définir — API same-origin sur le port 8000.
 */
(function () {
  if (typeof window === "undefined" || window.SAC_API_BASE) return;
  var host = window.location.hostname || "";
  if (host.endsWith(".onrender.com") && host.indexOf("-api") === -1) {
    window.SAC_API_BASE = "https://smart-academy-of-congo-api-1.onrender.com";
  }
  window.SAC_JS_BUILD = "20260628b";
  if (typeof document !== "undefined" && window.SAC_API_BASE) {
    var link = document.createElement("link");
    link.rel = "preconnect";
    link.href = window.SAC_API_BASE;
    document.head.appendChild(link);
    fetch(window.SAC_API_BASE + "/api/health", { mode: "cors", credentials: "omit" }).catch(function () {});
  }
})();

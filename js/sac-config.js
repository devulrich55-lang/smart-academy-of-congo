/**
 * Render frontend :
 * - Web Service Node (congoat) → proxy /api sur même origine
 * - Static Site legacy → repli API directe (CORS)
 */
(function () {
  if (typeof window === "undefined" || window.SAC_API_BASE) return;
  var host = window.location.hostname || "";
  var RENDER_API = "https://smart-academy-of-congo-api-1.onrender.com";
  var RENDER_FRONTEND_CANONICAL = "https://smart-academy-of-congoat.onrender.com";
  var LEGACY_RENDER_HOSTS = [
    "smart-academy-of-congo.onrender.com",
    "smart-academy-of-congo-dbfm.onrender.com",
  ];
  var CUSTOM_DOMAINS = ["evosmartuni.com", "www.evosmartuni.com"];

  if (LEGACY_RENDER_HOSTS.indexOf(host) !== -1) {
    var target =
      RENDER_FRONTEND_CANONICAL +
      window.location.pathname +
      window.location.search +
      window.location.hash;
    window.location.replace(target);
    return;
  }

  function isHostedFrontend(hostname) {
    if (!hostname) return false;
    if (CUSTOM_DOMAINS.indexOf(hostname) !== -1) return true;
    if (hostname === "smart-academy-of-congoat.onrender.com") return true;
    return hostname.endsWith(".onrender.com") && hostname.indexOf("-api") === -1;
  }
  if (isHostedFrontend(host)) {
    var origin = window.location.origin.replace(/\/+$/, "");
    window.SAC_API_PROXY_ORIGIN = origin;
    // resolveApiBase() teste le proxy puis bascule sur l'API directe si besoin
  }
  window.SAC_JS_BUILD = "20260710m";
  window.SAC_RENDER_FRONTEND = RENDER_FRONTEND_CANONICAL;
  window.SAC_PLATFORM_LOGO = "evo-uni.jpeg";
  window.SAC_PLATFORM_LOGO_ALT = "Evo-smartUni";

  function sacGuardScriptSrc() {
    var scripts = document.getElementsByTagName("script");
    for (var i = scripts.length - 1; i >= 0; i--) {
      var src = scripts[i].src || "";
      if (src.indexOf("sac-config.js") !== -1) {
        return src.replace(/sac-config\.js(\?.*)?$/i, "sac-client-guard.js?v=" + window.SAC_JS_BUILD);
      }
    }
    return "js/sac-client-guard.js?v=" + window.SAC_JS_BUILD;
  }

  function sacStorageScriptSrc() {
    var scripts = document.getElementsByTagName("script");
    for (var i = scripts.length - 1; i >= 0; i--) {
      var src = scripts[i].src || "";
      if (src.indexOf("sac-config.js") !== -1) {
        return src.replace(/sac-config\.js(\?.*)?$/i, "sac-storage.js?v=" + window.SAC_JS_BUILD);
      }
    }
    return "js/sac-storage.js?v=" + window.SAC_JS_BUILD;
  }

  if (typeof document !== "undefined") {
    document.write('<script src="' + sacGuardScriptSrc() + '"><\/script>');
    document.write('<script src="' + sacStorageScriptSrc() + '"><\/script>');
  }

  if (typeof document !== "undefined" && window.SAC_API_BASE) {
    fetch(window.SAC_API_BASE + "/api/health", { mode: "cors", credentials: "omit" }).catch(function () {});
  }
})();

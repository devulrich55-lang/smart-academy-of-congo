/**
 * Evo-smartUni PWA — enregistrement service worker + invitation installation
 */
(function () {
  "use strict";

  var INSTALL_KEY = "sac_pwa_install_dismissed";
  var IOS_HINT_KEY = "sac_pwa_ios_hint_dismissed";
  var deferredPrompt = null;

  function assetBase() {
    if (typeof SAC_MOBILE !== "undefined" && SAC_MOBILE.assetBase) {
      return SAC_MOBILE.assetBase();
    }
    var el = document.querySelector('script[src*="sac-pwa.js"]');
    if (el) {
      var src = el.getAttribute("src") || "";
      if (src.indexOf("../js/") === 0) return "../";
    }
    return "";
  }

  function injectHeadLinks() {
    var base = assetBase();
    var head = document.head;
    if (!head) return;

    if (!document.querySelector('link[rel="manifest"]')) {
      var manifest = document.createElement("link");
      manifest.rel = "manifest";
      manifest.href = base + "manifest.webmanifest";
      head.appendChild(manifest);
    }

    if (!document.querySelector('meta[name="mobile-web-app-capable"]')) {
      var capable = document.createElement("meta");
      capable.name = "mobile-web-app-capable";
      capable.content = "yes";
      head.appendChild(capable);
    }

    if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
      var apple = document.createElement("meta");
      apple.name = "apple-mobile-web-app-capable";
      apple.content = "yes";
      head.appendChild(apple);
    }

    if (!document.querySelector('meta[name="apple-mobile-web-app-title"]')) {
      var title = document.createElement("meta");
      title.name = "apple-mobile-web-app-title";
      title.content = "Evo-smartUni";
      head.appendChild(title);
    }

    if (!document.querySelector('link[rel="apple-touch-icon"]')) {
      var icon = document.createElement("link");
      icon.rel = "apple-touch-icon";
      icon.href = base + "evo-uni.jpeg";
      head.appendChild(icon);
    }
  }

  function isStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }

  function isIos() {
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  }

  function removeBanner() {
    var el = document.getElementById("sacInstallBanner");
    if (el) el.remove();
  }

  function showInstallBanner(kind) {
    if (isStandalone() || document.getElementById("sacInstallBanner")) return;
    if (localStorage.getItem(INSTALL_KEY) === "1" && kind === "android") return;
    if (localStorage.getItem(IOS_HINT_KEY) === "1" && kind === "ios") return;

    var bar = document.createElement("div");
    bar.id = "sacInstallBanner";
    bar.className = "sac-install-banner";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Installer l'application");

    if (kind === "ios") {
      bar.innerHTML =
        '<div class="sac-install-banner__text">' +
        "<strong>Installer Evo-smartUni</strong>" +
        "<span>Sur iPhone : partage Safari → « Sur l'écran d'accueil »</span>" +
        "</div>" +
        '<button type="button" class="sac-install-banner__close" aria-label="Fermer">✕</button>';
    } else {
      bar.innerHTML =
        '<div class="sac-install-banner__text">' +
        "<strong>Installez Evo-smartUni</strong>" +
        "<span>Accès rapide depuis l'écran d'accueil de votre téléphone</span>" +
        "</div>" +
        '<button type="button" class="sac-install-banner__btn" id="sacInstallBtn">Installer</button>' +
        '<button type="button" class="sac-install-banner__close" aria-label="Fermer">✕</button>';
    }

    document.body.appendChild(bar);

    bar.querySelector(".sac-install-banner__close").addEventListener("click", function () {
      if (kind === "ios") localStorage.setItem(IOS_HINT_KEY, "1");
      else localStorage.setItem(INSTALL_KEY, "1");
      removeBanner();
    });

    var installBtn = document.getElementById("sacInstallBtn");
    if (installBtn) {
      installBtn.addEventListener("click", function () {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        deferredPrompt.userChoice.finally(function () {
          deferredPrompt = null;
          removeBanner();
        });
      });
    }
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (
      window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === "function" &&
      window.Capacitor.isNativePlatform()
    ) {
      return;
    }
    var base = assetBase();
    window.addEventListener("load", function () {
      navigator.serviceWorker
        .register(base + "sw.js", { scope: base || "/" })
        .catch(function () {
          /* hors ligne ou navigateur incompatible */
        });
    });
  }

  function initInstallPrompt() {
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferredPrompt = e;
      if (window.matchMedia("(max-width: 768px)").matches) {
        showInstallBanner("android");
      }
    });

    if (isIos() && !isStandalone() && window.matchMedia("(max-width: 768px)").matches) {
      setTimeout(function () {
        showInstallBanner("ios");
      }, 2500);
    }
  }

  function init() {
    injectHeadLinks();
    registerServiceWorker();
    initInstallPrompt();
  }

  window.SAC_PWA = {
    init: init,
    isStandalone: isStandalone,
    assetBase: assetBase,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

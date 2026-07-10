/**
 * Evo-smartUni PWA — enregistrement service worker + invitation installation
 */
(function () {
  "use strict";

  var INSTALL_KEY = "sac_pwa_install_dismissed";
  var IOS_HINT_KEY = "sac_pwa_ios_hint_dismissed";
  var DESKTOP_HINT_KEY = "sac_pwa_desktop_hint_dismissed";
  var deferredPrompt = null;

  function siteRoot() {
    return "/";
  }

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

  function isAndroid() {
    return /Android/i.test(navigator.userAgent || "");
  }

  function isMobileViewport() {
    return window.matchMedia("(max-width: 768px)").matches;
  }

  function isDesktopOs() {
    return !isIos() && !isAndroid();
  }

  function removeBanner() {
    var el = document.getElementById("sacInstallBanner");
    if (el) el.remove();
  }

  function showInstallBanner(kind) {
    if (isStandalone() || document.getElementById("sacInstallBanner")) return;
    if (localStorage.getItem(INSTALL_KEY) === "1" && (kind === "android" || kind === "mobile")) return;
    if (localStorage.getItem(IOS_HINT_KEY) === "1" && kind === "ios") return;
    if (localStorage.getItem(DESKTOP_HINT_KEY) === "1" && kind === "desktop") return;

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
    } else if (kind === "desktop") {
      bar.classList.add("sac-install-banner--desktop");
      bar.innerHTML =
        '<div class="sac-install-banner__text">' +
        "<strong>Installer Evo-smartUni sur PC</strong>" +
        "<span>Application bureau — Windows, Mac ou Linux (Chrome / Edge)</span>" +
        "</div>" +
        '<button type="button" class="sac-install-banner__btn" id="sacInstallBtn">Installer</button>' +
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
      else if (kind === "desktop") localStorage.setItem(DESKTOP_HINT_KEY, "1");
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

  function ensureServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      return Promise.resolve(false);
    }
    return navigator.serviceWorker
      .register(siteRoot() + "sw.js", { scope: siteRoot(), updateViaCache: "none" })
      .then(function () {
        return true;
      })
      .catch(function () {
        return false;
      });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (document.readyState === "complete") {
      ensureServiceWorker();
      return;
    }
    window.addEventListener("load", function () {
      ensureServiceWorker();
    });
  }

  function initInstallPrompt() {
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferredPrompt = e;
      window.dispatchEvent(new CustomEvent("sac-pwa-install-ready"));
      if (document.body.dataset.sacInstallPage) return;
      if (isStandalone()) return;
      if (isDesktopOs() && !isMobileViewport()) {
        showInstallBanner("desktop");
      } else if (isMobileViewport()) {
        if (isIos()) showInstallBanner("ios");
        else showInstallBanner("mobile");
      }
    });

    if (isIos() && !isStandalone() && isMobileViewport()) {
      setTimeout(function () {
        showInstallBanner("ios");
      }, 2500);
    }
  }

  function waitForInstallPrompt(timeoutMs) {
    var ms = Number(timeoutMs) || 10000;
    return new Promise(function (resolve) {
      if (deferredPrompt) {
        resolve(deferredPrompt);
        return;
      }
      var settled = false;
      function finish() {
        if (settled) return;
        settled = true;
        resolve(deferredPrompt || null);
      }
      function onReady() {
        finish();
      }
      window.addEventListener("sac-pwa-install-ready", onReady, { once: true });
      setTimeout(function () {
        window.removeEventListener("sac-pwa-install-ready", onReady);
        finish();
      }, ms);
    });
  }

  function promptInstall() {
    if (!deferredPrompt) {
      return Promise.resolve({ outcome: "unavailable" });
    }
    var prompt = deferredPrompt;
    return prompt.prompt().then(function () {
      return prompt.userChoice;
    }).finally(function () {
      deferredPrompt = null;
    });
  }

  function init() {
    injectHeadLinks();
    registerServiceWorker();
    initInstallPrompt();
  }

  window.SAC_PWA = {
    init: init,
    isStandalone: isStandalone,
    isIos: isIos,
    isAndroid: isAndroid,
    isDesktopOs: isDesktopOs,
    isMobileViewport: isMobileViewport,
    assetBase: assetBase,
    ensureServiceWorker: ensureServiceWorker,
    waitForInstallPrompt: waitForInstallPrompt,
    canInstall: function () {
      return !!deferredPrompt;
    },
    promptInstall: promptInstall,
    onInstallReady: function (cb) {
      if (typeof cb !== "function") return;
      if (deferredPrompt) {
        cb();
        return;
      }
      window.addEventListener("sac-pwa-install-ready", cb, { once: true });
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

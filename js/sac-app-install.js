/**
 * Page /app/ — installation PWA Evo-smartUni (PC, Android, iPhone)
 */
(function () {
  "use strict";

  document.body.dataset.sacInstallPage = "1";

  var activePlatform = "auto";

  function toast(msg) {
    var el = document.getElementById("appInstallToast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(function () {
      el.classList.remove("show");
    }, 2800);
  }

  function installUrl() {
    return window.location.origin.replace(/\/+$/, "") + "/app/";
  }

  function detectPlatform() {
    if (activePlatform !== "auto") return activePlatform;
    if (typeof SAC_PWA !== "undefined") {
      if (SAC_PWA.isIos && SAC_PWA.isIos()) return "ios";
      if (SAC_PWA.isAndroid && SAC_PWA.isAndroid()) return "android";
      if (SAC_PWA.isDesktopOs && SAC_PWA.isDesktopOs()) return "desktop";
    }
    return "desktop";
  }

  function detectPlatform() {
    activePlatform = id;
    document.querySelectorAll("[data-app-platform]").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.dataset.appPlatform === id);
    });
    document.querySelectorAll("[data-app-panel]").forEach(function (panel) {
      panel.hidden = panel.dataset.appPanel !== id;
    });
    updateUi();
  }

  function updateUi() {
    var platform = detectPlatform();
    var btn = document.getElementById("btnInstallApp");
    var badge = document.getElementById("installStatusBadge");
    var steps = document.getElementById("installManualSteps");
    var desktopSteps = document.getElementById("installDesktopSteps");
    var iosSteps = document.getElementById("installIosSteps");
    var linkEl = document.getElementById("installShareLink");
    if (linkEl) linkEl.textContent = installUrl();

    if (typeof SAC_PWA !== "undefined" && SAC_PWA.isStandalone && SAC_PWA.isStandalone()) {
      if (btn) {
        btn.disabled = true;
        btn.textContent = "✓ Application déjà installée";
      }
      if (badge) {
        badge.className = "app-install-badge";
        badge.textContent = "✓ Evo-smartUni est installée sur cet appareil";
      }
      if (steps) steps.hidden = true;
      if (desktopSteps) desktopSteps.hidden = true;
      if (iosSteps) iosSteps.hidden = true;
      return;
    }

    var canInstall = typeof SAC_PWA !== "undefined" && SAC_PWA.canInstall && SAC_PWA.canInstall();

    if (platform === "ios") {
      if (btn) btn.style.display = "none";
      if (badge) {
        badge.className = "app-install-badge app-install-badge--warn";
        badge.textContent = "📱 iPhone : Safari → Partager → Sur l'écran d'accueil";
      }
      if (steps) steps.hidden = true;
      if (desktopSteps) desktopSteps.hidden = true;
      if (iosSteps) iosSteps.hidden = false;
      return;
    }

    if (platform === "desktop") {
      if (btn) {
        btn.style.display = "";
        btn.disabled = !canInstall;
        btn.textContent = canInstall
          ? "💻 Installer Evo-smartUni sur PC"
          : "Installation manuelle (voir ci-dessous)";
      }
      if (badge) {
        badge.className = "app-install-badge" + (canInstall ? "" : " app-install-badge--warn");
        badge.textContent = canInstall
          ? "Installation directe disponible — Chrome ou Edge recommandé"
          : "Utilisez Chrome ou Edge sur PC, puis suivez les étapes ci-dessous";
      }
      if (steps) steps.hidden = true;
      if (iosSteps) iosSteps.hidden = true;
      if (desktopSteps) desktopSteps.hidden = canInstall;
      return;
    }

    if (btn) {
      btn.style.display = "";
      btn.disabled = !canInstall;
      btn.textContent = canInstall
        ? "📲 Installer Evo-smartUni (Android)"
        : "Ouvrir dans Chrome pour installer";
    }
    if (badge) {
      badge.className = "app-install-badge" + (canInstall ? "" : " app-install-badge--warn");
      badge.textContent = canInstall
        ? "Installation directe disponible"
        : "Utilisez Chrome sur Android, puis le bouton ci-dessus";
    }
    if (steps) steps.hidden = canInstall;
    if (desktopSteps) desktopSteps.hidden = true;
    if (iosSteps) iosSteps.hidden = true;
  }

  function bindActions() {
    var btn = document.getElementById("btnInstallApp");
    var copyBtn = document.getElementById("btnCopyInstallLink");

    document.querySelectorAll("[data-app-platform]").forEach(function (tab) {
      tab.addEventListener("click", function () {
        setActivePlatform(tab.dataset.appPlatform);
      });
    });

    btn?.addEventListener("click", function () {
      if (typeof SAC_PWA === "undefined" || !SAC_PWA.promptInstall) {
        toast("Ouvrez cette page dans Chrome ou Edge.");
        return;
      }
      SAC_PWA.promptInstall().then(function (choice) {
        if (choice && choice.outcome === "accepted") {
          toast("Application installée — ouvrez-la depuis le bureau ou le menu Démarrer.");
          updateUi();
        } else if (choice && choice.outcome === "unavailable") {
          var platform = detectPlatform();
          if (platform === "desktop") {
            toast("Chrome/Edge : menu ⋮ → Installer Evo-smartUni");
          } else {
            toast("Chrome : Menu ⋮ → Installer l'application");
          }
        }
      });
    });

    copyBtn?.addEventListener("click", function () {
      var url = installUrl();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(
          function () {
            toast("Lien copié — partagez-le pour installer l'application.");
          },
          function () {
            prompt("Copiez ce lien :", url);
          }
        );
      } else {
        prompt("Copiez ce lien :", url);
      }
    });
  }

  function init() {
    var params = new URLSearchParams(window.location.search);
    var forced = params.get("platform");
    if (forced === "desktop" || forced === "android" || forced === "ios") {
      activePlatform = forced;
    }
    var initial = detectPlatform();
    setActivePlatform(initial);
    bindActions();
    if (typeof SAC_PWA !== "undefined" && SAC_PWA.onInstallReady) {
      SAC_PWA.onInstallReady(function () {
        updateUi();
      });
    }
    setTimeout(updateUi, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/**
 * Page /app/ — installation Android (PWA Evo-smartUni)
 */
(function () {
  "use strict";

  document.body.dataset.sacInstallPage = "1";

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

  function isAndroid() {
    return /Android/i.test(navigator.userAgent || "");
  }

  function isIosDevice() {
    return typeof SAC_PWA !== "undefined" && SAC_PWA.isIos && SAC_PWA.isIos();
  }

  function updateUi() {
    var btn = document.getElementById("btnInstallApp");
    var badge = document.getElementById("installStatusBadge");
    var steps = document.getElementById("installManualSteps");
    var linkEl = document.getElementById("installShareLink");
    if (linkEl) linkEl.textContent = installUrl();

    if (typeof SAC_PWA !== "undefined" && SAC_PWA.isStandalone && SAC_PWA.isStandalone()) {
      if (btn) {
        btn.disabled = true;
        btn.textContent = "✓ Application déjà installée";
      }
      if (badge) {
        badge.className = "app-install-badge";
        badge.textContent = "✓ Evo-smartUni est sur votre écran d'accueil";
      }
      return;
    }

    if (isIosDevice()) {
      if (btn) btn.style.display = "none";
      if (badge) {
        badge.className = "app-install-badge app-install-badge--warn";
        badge.textContent = "📱 iPhone : utilisez Safari → Partager → Sur l'écran d'accueil";
      }
      if (steps) steps.hidden = false;
      return;
    }

    var canInstall = typeof SAC_PWA !== "undefined" && SAC_PWA.canInstall && SAC_PWA.canInstall();
    if (btn) {
      btn.disabled = !canInstall;
      btn.textContent = canInstall
        ? "📲 Installer Evo-smartUni (Android)"
        : isAndroid()
          ? "Ouvrir dans Chrome pour installer"
          : "Installer sur Android (Chrome)";
    }
    if (badge) {
      badge.className = "app-install-badge" + (canInstall ? "" : " app-install-badge--warn");
      badge.textContent = canInstall
        ? "Installation directe disponible"
        : "Utilisez Chrome sur Android, puis le bouton ci-dessus";
    }
    if (steps) steps.hidden = canInstall;
  }

  function bindActions() {
    var btn = document.getElementById("btnInstallApp");
    var copyBtn = document.getElementById("btnCopyInstallLink");
    var openBtn = document.getElementById("btnOpenLogin");

    btn?.addEventListener("click", function () {
      if (typeof SAC_PWA === "undefined" || !SAC_PWA.promptInstall) {
        toast("Ouvrez cette page dans Chrome sur Android.");
        return;
      }
      SAC_PWA.promptInstall().then(function (choice) {
        if (choice && choice.outcome === "accepted") {
          toast("Application installée — ouvrez-la depuis l'écran d'accueil.");
          updateUi();
        } else if (choice && choice.outcome === "unavailable") {
          toast("Ouvrez ce lien dans Chrome : Menu ⋮ → Installer l'application");
        }
      });
    });

    copyBtn?.addEventListener("click", function () {
      var url = installUrl();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(
          function () {
            toast("Lien copié — partagez-le aux utilisateurs Android.");
          },
          function () {
            prompt("Copiez ce lien :", url);
          }
        );
      } else {
        prompt("Copiez ce lien :", url);
      }
    });

    openBtn?.addEventListener("click", function () {
      window.location.href = "../connexion.html?source=app";
    });
  }

  function init() {
    updateUi();
    bindActions();
    if (typeof SAC_PWA !== "undefined" && SAC_PWA.onInstallReady) {
      SAC_PWA.onInstallReady(updateUi);
    }
    setTimeout(updateUi, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

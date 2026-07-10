/**
 * Page /app/ — installation PWA en un clic (PC, Android, iPhone)
 */
(function () {
  "use strict";

  document.body.dataset.sacInstallPage = "1";

  var activePlatform = "auto";
  var installing = false;

  function toast(msg) {
    var el = document.getElementById("appInstallToast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(function () {
      el.classList.remove("show");
    }, 3200);
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

  function setActivePlatform(id) {
    activePlatform = id;
    document.querySelectorAll("[data-app-platform]").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.dataset.appPlatform === id);
    });
    document.querySelectorAll("[data-app-panel]").forEach(function (panel) {
      panel.hidden = panel.dataset.appPanel !== id;
    });
    updateUi();
  }

  function showModal(title, html) {
    var modal = document.getElementById("appInstallModal");
    var titleEl = document.getElementById("appInstallModalTitle");
    var bodyEl = document.getElementById("appInstallModalBody");
    if (!modal || !titleEl || !bodyEl) return;
    titleEl.textContent = title;
    bodyEl.innerHTML = html;
    modal.hidden = false;
    document.body.classList.add("app-install-modal-open");
  }

  function hideModal() {
    var modal = document.getElementById("appInstallModal");
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("app-install-modal-open");
  }

  function downloadDesktopShortcut() {
    var target = window.location.origin.replace(/\/+$/, "") + "/connexion.html?source=pwa";
    var content = "[InternetShortcut]\r\nURL=" + target + "\r\nIconIndex=0\r\n";
    var blob = new Blob([content], { type: "application/octet-stream" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Evo-smartUni.url";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 1000);
    toast("Raccourci Evo-smartUni téléchargé — double-cliquez pour ouvrir l'application.");
  }

  function showFallbackModal(platform) {
    if (platform === "ios") {
      showModal(
        "Installation iPhone",
        "<p>Sur cette page, dans <strong>Safari</strong> :</p>" +
          "<ol class='app-install-modal__steps'>" +
          "<li>Appuyez sur <strong>Partager</strong> en bas de l'écran</li>" +
          "<li>Choisissez <strong>Sur l'écran d'accueil</strong></li>" +
          "<li>Validez — l'icône Evo-smartUni apparaît</li>" +
          "</ol>"
      );
      return;
    }

    if (platform === "desktop") {
      showModal(
        "Finaliser sur cette page",
        "<p>L'installation automatique n'est pas encore disponible dans ce navigateur.</p>" +
          "<p><strong>Option 1 — Installation application (recommandé)</strong></p>" +
          "<ol class='app-install-modal__steps'>" +
          "<li>Restez sur cette page dans <strong>Chrome</strong> ou <strong>Edge</strong></li>" +
          "<li>Cliquez l'icône <strong>⊕ Installer</strong> dans la barre d'adresse</li>" +
          "<li>Confirmez — Evo-smartUni s'installe sur le bureau</li>" +
          "</ol>" +
          "<p><strong>Option 2 — Raccourci bureau</strong></p>" +
          "<button type='button' class='app-install-btn app-install-btn--ghost app-install-modal__dl' id='btnDownloadShortcut'>⬇️ Télécharger le raccourci Evo-smartUni</button>"
      );
      document.getElementById("btnDownloadShortcut")?.addEventListener("click", function () {
        downloadDesktopShortcut();
      });
      return;
    }

    showModal(
      "Installation Android",
      "<p>Sur cette page, dans <strong>Chrome</strong> :</p>" +
        "<ol class='app-install-modal__steps'>" +
        "<li>Menu <strong>⋮</strong> en haut à droite</li>" +
        "<li><strong>Installer l'application</strong> ou <strong>Ajouter à l'écran d'accueil</strong></li>" +
        "<li>Confirmez — l'icône apparaît sur votre téléphone</li>" +
        "</ol>"
    );
  }

  function setButtonLoading(btn, loading) {
    if (!btn) return;
    btn.classList.toggle("is-loading", loading);
    btn.disabled = loading;
  }

  function updateUi() {
    var platform = detectPlatform();
    var btn = document.getElementById("btnInstallApp");
    var iosBtn = document.getElementById("btnInstallIos");
    var badge = document.getElementById("installStatusBadge");
    var linkEl = document.getElementById("installShareLink");
    if (linkEl) linkEl.textContent = installUrl();

    if (installing) return;

    if (typeof SAC_PWA !== "undefined" && SAC_PWA.isStandalone && SAC_PWA.isStandalone()) {
      if (btn) {
        btn.disabled = true;
        btn.textContent = "✓ Application installée";
      }
      if (badge) {
        badge.className = "app-install-badge";
        badge.textContent = "✓ Evo-smartUni est prête — ouvrez-la depuis le bureau ou l'écran d'accueil";
      }
      return;
    }

    var canInstall = typeof SAC_PWA !== "undefined" && SAC_PWA.canInstall && SAC_PWA.canInstall();

    if (btn) {
      btn.hidden = platform === "ios";
      btn.style.display = platform === "ios" ? "none" : "";
      btn.disabled = false;
      if (!installing) btn.textContent = "⬇️ Télécharger Evo-smartUni";
    }
    if (iosBtn) {
      iosBtn.hidden = platform !== "ios";
    }

    if (badge) {
      badge.className = "app-install-badge" + (canInstall ? "" : " app-install-badge--warn");
      if (platform === "ios") {
        badge.textContent = "Appuyez sur Télécharger — instructions iPhone sur cette page";
      } else if (canInstall) {
        badge.textContent = "✓ Prêt — un clic lance le téléchargement / l'installation";
      } else {
        badge.textContent = "Cliquez Télécharger — l'installation se lance sur cette page";
      }
    }
  }

  function runInstall() {
    var btn = document.getElementById("btnInstallApp");
    var platform = detectPlatform();

    if (platform === "ios") {
      showFallbackModal("ios");
      return;
    }

    if (installing) return;
    installing = true;
    setButtonLoading(btn, true);
    if (btn) btn.textContent = "⏳ Téléchargement en cours…";

    var pwa = typeof SAC_PWA !== "undefined" ? SAC_PWA : null;

    function finish() {
      installing = false;
      setButtonLoading(btn, false);
      updateUi();
    }

    function tryPrompt() {
      if (!pwa || !pwa.canInstall || !pwa.canInstall()) {
        return Promise.resolve({ outcome: "unavailable" });
      }
      return pwa.promptInstall();
    }

    Promise.resolve()
      .then(function () {
        if (pwa && pwa.ensureServiceWorker) {
          return pwa.ensureServiceWorker();
        }
        return false;
      })
      .then(function () {
        if (pwa && pwa.waitForInstallPrompt) {
          return pwa.waitForInstallPrompt(12000);
        }
        return null;
      })
      .then(function () {
        return tryPrompt();
      })
      .then(function (choice) {
        if (choice && choice.outcome === "accepted") {
          toast("✓ Evo-smartUni installée — ouvrez-la depuis le bureau ou le menu Démarrer.");
          finish();
          return;
        }
        if (platform === "desktop") {
          downloadDesktopShortcut();
        }
        showFallbackModal(platform);
        finish();
      })
      .catch(function () {
        showFallbackModal(platform);
        finish();
      });
  }

  function bindActions() {
    var btn = document.getElementById("btnInstallApp");
    var copyBtn = document.getElementById("btnCopyInstallLink");
    var iosBtn = document.getElementById("btnInstallIos");

    document.querySelectorAll("[data-app-platform]").forEach(function (tab) {
      tab.addEventListener("click", function () {
        setActivePlatform(tab.dataset.appPlatform);
      });
    });

    btn?.addEventListener("click", runInstall);
    iosBtn?.addEventListener("click", function () {
      showFallbackModal("ios");
    });

    document.getElementById("appInstallModalClose")?.addEventListener("click", hideModal);
    document.getElementById("appInstallModalBackdrop")?.addEventListener("click", hideModal);

    window.addEventListener("appinstalled", function () {
      installing = false;
      toast("✓ Evo-smartUni installée avec succès !");
      updateUi();
    });

    copyBtn?.addEventListener("click", function () {
      var url = installUrl();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(
          function () {
            toast("Lien copié.");
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

    if (typeof SAC_PWA !== "undefined" && SAC_PWA.ensureServiceWorker) {
      SAC_PWA.ensureServiceWorker();
    }

    setActivePlatform(detectPlatform());
    bindActions();

    if (typeof SAC_PWA !== "undefined" && SAC_PWA.onInstallReady) {
      SAC_PWA.onInstallReady(updateUi);
    }
    setTimeout(updateUi, 800);
    setTimeout(updateUi, 3000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

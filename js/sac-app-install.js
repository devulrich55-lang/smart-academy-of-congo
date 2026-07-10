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

  function bindRetryButton() {
    document.getElementById("btnRetryInstall")?.addEventListener("click", function () {
      hideModal();
      runInstall();
    });
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
        "Une dernière étape — sur cette page",
        "<p class='app-install-modal__success'>✓ Chrome est prêt à installer Evo-smartUni.</p>" +
          "<p><strong>Cliquez l'icône <span class='app-install-hint__icon'>⊕</span> Installer</strong> en haut à droite de la barre d'adresse (à côté de l'URL).</p>" +
          "<p>Puis confirmez — l'application apparaît sur le <strong>bureau</strong> et dans le menu <strong>Démarrer</strong>.</p>" +
          "<p class='app-install-modal__alt'>Alternative : menu <strong>⋮</strong> → <strong>Installer Evo-smartUni</strong></p>" +
          "<button type='button' class='app-install-btn app-install-btn--primary app-install-modal__dl' id='btnRetryInstall'>↻ Réouvrir la fenêtre d'installation</button>"
      );
      bindRetryButton();
      return;
    }

    showModal(
      "Installation Android",
      "<p>Sur cette page, dans <strong>Chrome</strong> :</p>" +
        "<ol class='app-install-modal__steps'>" +
        "<li>Menu <strong>⋮</strong> en haut à droite</li>" +
        "<li><strong>Installer l'application</strong> ou <strong>Ajouter à l'écran d'accueil</strong></li>" +
        "<li>Confirmez — l'icône apparaît sur votre téléphone</li>" +
        "</ol>" +
        "<button type='button' class='app-install-btn app-install-btn--primary app-install-modal__dl' id='btnRetryInstall'>↻ Réessayer l'installation automatique</button>"
    );
    bindRetryButton();
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
    var hint = document.getElementById("appInstallHint");
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
      if (hint) hint.hidden = true;
      return;
    }

    var canInstall = typeof SAC_PWA !== "undefined" && SAC_PWA.canInstall && SAC_PWA.canInstall();

    if (btn) {
      btn.hidden = platform === "ios";
      btn.style.display = platform === "ios" ? "none" : "";
      btn.disabled = false;
      btn.textContent = "⬇️ Télécharger Evo-smartUni";
    }
    if (iosBtn) {
      iosBtn.hidden = platform !== "ios";
    }

    if (hint) {
      hint.hidden = !(platform === "desktop" && !canInstall);
    }

    if (badge) {
      badge.className = "app-install-badge" + (canInstall ? "" : " app-install-badge--warn");
      if (platform === "ios") {
        badge.textContent = "Appuyez sur Télécharger — instructions iPhone sur cette page";
      } else if (canInstall) {
        badge.textContent = "✓ Prêt — un clic ouvre la fenêtre d'installation";
      } else if (platform === "desktop") {
        badge.textContent = "Cliquez Télécharger, ou utilisez l'icône ⊕ Installer en haut à droite";
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
    hideModal();
    setButtonLoading(btn, true);
    if (btn) btn.textContent = "⏳ Installation en cours…";

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
        return fetch("/connexion.html", { cache: "no-store" }).catch(function () {});
      })
      .then(function () {
        if (pwa && pwa.waitForInstallPrompt) {
          return pwa.waitForInstallPrompt(15000);
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
      hideModal();
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
    setTimeout(updateUi, 8000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

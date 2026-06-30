/**
 * Evo-smartUni — navigation et tableaux mobile (iOS / Android / tablette)
 */
(function () {
  "use strict";

  var MOBILE_MQ = window.matchMedia("(max-width: 768px)");
  var TABLET_MQ = window.matchMedia("(max-width: 1024px)");
  var wrapTimer = null;

  function initDashboardTabs() {
    var nav = document.querySelector(".nav-tabs");
    if (!nav || nav.dataset.mobileReady) return;
    var tabs = nav.querySelectorAll(".nav-tab");
    if (!tabs.length) return;

    nav.dataset.mobileReady = "1";

    var picker = document.createElement("div");
    picker.className = "mobile-section-picker";

    var select = document.createElement("select");
    select.setAttribute("aria-label", nav.getAttribute("aria-label") || "Choisir une section");

    tabs.forEach(function (tab) {
      var opt = document.createElement("option");
      var section = tab.getAttribute("data-section") || tab.textContent.trim();
      opt.value = section;
      opt.textContent = tab.textContent.trim();
      if (tab.classList.contains("active")) opt.selected = true;
      select.appendChild(opt);
    });

    picker.appendChild(select);
    nav.parentNode.insertBefore(picker, nav.nextSibling);

    select.addEventListener("change", function () {
      var val = select.value;
      tabs.forEach(function (tab) {
        if ((tab.getAttribute("data-section") || tab.textContent.trim()) === val) {
          tab.click();
        }
      });
    });

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var sec = tab.getAttribute("data-section") || tab.textContent.trim();
        select.value = sec;
      });
    });
  }

  function wrapTables(root) {
    var scope = root || document;
    scope.querySelectorAll("table:not([data-sac-wrapped])").forEach(function (table) {
      if (table.closest(".table-wrap, .ws-table-wrap")) {
        table.setAttribute("data-sac-wrapped", "1");
        return;
      }
      var parent = table.parentElement;
      if (!parent) return;
      if (parent.tagName === "THEAD" || parent.tagName === "TBODY" || parent.tagName === "TFOOT") return;

      var wrap = document.createElement("div");
      wrap.className = table.classList.contains("ws-table") ? "ws-table-wrap table-wrap" : "table-wrap";
      parent.insertBefore(wrap, table);
      wrap.appendChild(table);
      table.setAttribute("data-sac-wrapped", "1");
    });
  }

  function scheduleWrapTables() {
    if (wrapTimer) window.clearTimeout(wrapTimer);
    wrapTimer = window.setTimeout(function () {
      wrapTables(document);
    }, 80);
  }

  function initTableObserver() {
    if (!window.MutationObserver || document.body.dataset.sacTableObserver) return;
    document.body.dataset.sacTableObserver = "1";
    var observer = new MutationObserver(function () {
      scheduleWrapTables();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function initPlatformSidebar() {
    var sidebar = document.querySelector(".platform-sidebar");
    if (!sidebar || sidebar.dataset.mobileReady) return;
    sidebar.dataset.mobileReady = "1";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "platform-sidebar-toggle btn btn--ghost";
    btn.setAttribute("aria-expanded", "false");
    btn.textContent = "Modules \u25BE";

    sidebar.insertBefore(btn, sidebar.firstChild);

    function setCollapsed(collapsed) {
      sidebar.classList.toggle("is-collapsed", collapsed);
      btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
      btn.textContent = collapsed ? "Modules \u25BE" : "Modules \u25B4";
    }

    if (MOBILE_MQ.matches) setCollapsed(true);

    btn.addEventListener("click", function () {
      setCollapsed(!sidebar.classList.contains("is-collapsed"));
    });

    sidebar.querySelectorAll(".platform-nav-btn").forEach(function (navBtn) {
      navBtn.addEventListener("click", function () {
        if (MOBILE_MQ.matches) setCollapsed(true);
      });
    });

    MOBILE_MQ.addEventListener("change", function (e) {
      if (!e.matches) {
        sidebar.classList.remove("is-collapsed");
        btn.setAttribute("aria-expanded", "true");
      } else {
        setCollapsed(true);
      }
    });
  }

  function initTouchClasses() {
    if (document.documentElement.dataset.sacTouch) return;
    document.documentElement.dataset.sacTouch = "1";
    var coarse = window.matchMedia("(pointer: coarse)").matches;
    var ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (coarse) document.documentElement.classList.add("sac-touch");
    if (ios) document.documentElement.classList.add("sac-ios");
  }

  function assetBase() {
    var el = document.querySelector('script[src*="sac-mobile.js"]');
    if (el) {
      var src = el.getAttribute("src") || "";
      if (src.indexOf("../js/") === 0) return "../";
      if (src.indexOf("js/") === 0) return "";
    }
    if (typeof SAC_PORTAL !== "undefined" && SAC_PORTAL.inPortalFolder && SAC_PORTAL.inPortalFolder()) {
      return "../";
    }
    return "";
  }

  var QUICK_NAV = {
    "dashboard-etudiant.html": [
      { section: "accueil", icon: "🏠", label: "Accueil" },
      { section: "live", icon: "🔴", label: "Live" },
      { section: "notes", icon: "📊", label: "Notes" },
      { section: "frais", icon: "💳", label: "Frais" },
    ],
    "dashboard-professeur.html": [
      { section: "accueil", icon: "🏠", label: "Accueil" },
      { section: "activite", icon: "📋", label: "Activité" },
      { section: "documents", icon: "📄", label: "Publier" },
      { section: "notes", icon: "📊", label: "Notes" },
    ],
    "dashboard-section.html": [
      { section: "accueil", icon: "🏠", label: "Accueil" },
      { section: "live", icon: "🔴", label: "Live" },
      { section: "validations-etudiants", icon: "✅", label: "Valider" },
      { section: "reclamations", icon: "📩", label: "Réclam." },
    ],
    "dashboard-assistant.html": [
      { section: "accueil", icon: "🏠", label: "Accueil" },
      { section: "taches", icon: "💳", label: "Paiements" },
      { section: "documents", icon: "📄", label: "Publier" },
      { section: "correction-ia", icon: "🤖", label: "IA" },
    ],
    "dashboard-universite.html": [
      { section: "accueil", icon: "🏠", label: "Accueil" },
      { section: "administration", icon: "🏛️", label: "Campus" },
      { section: "reunions", icon: "📅", label: "Réunions" },
      { section: "communiquer", icon: "📢", label: "Actus" },
    ],
  };

  function clickNavSection(section) {
    var tabs = document.querySelectorAll(".nav-tabs .nav-tab");
    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i];
      if ((tab.getAttribute("data-section") || "") === section) {
        tab.click();
        return true;
      }
    }
    return false;
  }

  function initMobileQuickNav() {
    if (!MOBILE_MQ.matches) return;
    var nav = document.querySelector(".nav-tabs");
    if (!nav || nav.dataset.quickNavReady) return;

    var page = (location.pathname.split("/").pop() || "").toLowerCase();
    var items = QUICK_NAV[page];
    if (!items || !items.length) return;

    nav.dataset.quickNavReady = "1";
    document.body.classList.add("sac-has-quick-nav");

    var bar = document.createElement("nav");
    bar.className = "sac-mobile-quick-nav";
    bar.setAttribute("aria-label", "Navigation rapide");

    items.forEach(function (item) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sac-mobile-quick-nav__btn";
      btn.dataset.section = item.section;
      btn.innerHTML =
        '<span class="sac-mobile-quick-nav__icon" aria-hidden="true">' +
        item.icon +
        "</span><span>" +
        item.label +
        "</span>";
      btn.addEventListener("click", function () {
        clickNavSection(item.section);
        bar.querySelectorAll(".sac-mobile-quick-nav__btn").forEach(function (b) {
          b.classList.toggle("is-active", b === btn);
        });
      });
      bar.appendChild(btn);
    });

    var more = document.createElement("button");
    more.type = "button";
    more.className = "sac-mobile-quick-nav__btn sac-mobile-quick-nav__btn--more";
    more.innerHTML =
      '<span class="sac-mobile-quick-nav__icon" aria-hidden="true">☰</span><span>Plus</span>';
    more.addEventListener("click", function () {
      var picker = document.querySelector(".mobile-section-picker select");
      if (picker) {
        picker.focus();
        if (typeof picker.showPicker === "function") {
          try {
            picker.showPicker();
          } catch {
            picker.click();
          }
        }
      }
    });
    bar.appendChild(more);

    document.body.appendChild(bar);

    nav.querySelectorAll(".nav-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        var sec = tab.getAttribute("data-section") || "";
        bar.querySelectorAll(".sac-mobile-quick-nav__btn[data-section]").forEach(function (btn) {
          btn.classList.toggle("is-active", btn.getAttribute("data-section") === sec);
        });
      });
    });

    var active = nav.querySelector(".nav-tab.active");
    if (active) {
      var sec = active.getAttribute("data-section") || "";
      var activeBtn = bar.querySelector('[data-section="' + sec + '"]');
      if (activeBtn) activeBtn.classList.add("is-active");
    }

    MOBILE_MQ.addEventListener("change", function (e) {
      if (!e.matches) {
        bar.remove();
        document.body.classList.remove("sac-has-quick-nav");
        delete nav.dataset.quickNavReady;
      }
    });
  }

  function initPwa() {
    if (document.body.dataset.sacPwaReady) return;
    document.body.dataset.sacPwaReady = "1";
    var base = assetBase();
    if (typeof SAC_PWA !== "undefined") {
      SAC_PWA.init();
      return;
    }
    var script = document.createElement("script");
    script.src = base + "js/sac-pwa.js";
    script.defer = true;
    document.body.appendChild(script);
  }

  function initFloatingBack() {
    if (document.body.dataset.sacFloatingBackReady) return;
    document.body.dataset.sacFloatingBackReady = "1";

    var base = assetBase();
    var cssHref = base + "css/floating-back.css";

    if (!document.querySelector('link[href*="floating-back.css"]')) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = cssHref;
      document.head.appendChild(link);
    }

    function mount() {
      if (typeof SAC_FLOATING_BACK !== "undefined") {
        SAC_FLOATING_BACK.init({ base: base });
        return;
      }
      var script = document.createElement("script");
      script.src = base + "js/sac-floating-back.js";
      script.onload = function () {
        if (typeof SAC_FLOATING_BACK !== "undefined") {
          SAC_FLOATING_BACK.init({ base: base });
        }
      };
      document.body.appendChild(script);
    }

    mount();
  }

  function init() {
    initTouchClasses();
    initDashboardTabs();
    wrapTables(document);
    initTableObserver();
    initPlatformSidebar();
    initFloatingBack();
    initMobileQuickNav();
    initPwa();
  }

  window.SAC_MOBILE = {
    init: init,
    wrapTables: wrapTables,
    assetBase: assetBase,
    isMobile: function () {
      return MOBILE_MQ.matches;
    },
    isTablet: function () {
      return TABLET_MQ.matches && !MOBILE_MQ.matches;
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

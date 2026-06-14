/**
 * Smart Academy of Congo — navigation et tableaux mobile
 */
(function () {
  "use strict";

  var MOBILE_MQ = window.matchMedia("(max-width: 768px)");

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
    scope.querySelectorAll("table").forEach(function (table) {
      if (table.closest(".table-wrap")) return;
      var parent = table.parentElement;
      if (!parent) return;
      if (parent.tagName === "THEAD" || parent.tagName === "TBODY" || parent.tagName === "TFOOT") return;

      var wrap = document.createElement("div");
      wrap.className = "table-wrap";
      parent.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
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

  function init() {
    initDashboardTabs();
    wrapTables(document);
    initPlatformSidebar();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  var wrapTimer;
  var observer = new MutationObserver(function () {
    clearTimeout(wrapTimer);
    wrapTimer = setTimeout(function () {
      wrapTables(document);
      initPlatformSidebar();
    }, 120);
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();

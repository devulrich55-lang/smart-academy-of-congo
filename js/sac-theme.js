/**
 * Evo-smartUni — thème clair / nocturne (toute la plateforme)
 */
(function () {
  const STORAGE_KEY = "sac-theme";

  const TOGGLE_HTML =
    '<span class="theme-toggle__icon theme-toggle__icon--light" aria-hidden="true">🌙</span>' +
    '<span class="theme-toggle__icon theme-toggle__icon--dark" aria-hidden="true">☀️</span>';

  function getPreferred() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#0d1117" : "#0c3d6e");
  }

  function toggle() {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    apply(next);
    return next;
  }

  function createToggle(floating) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle" + (floating ? " theme-toggle--floating" : "");
    btn.setAttribute("data-theme-toggle", "");
    btn.title = "Mode clair / nocturne";
    btn.setAttribute("aria-label", "Basculer entre mode clair et mode nocturne");
    btn.innerHTML = TOGGLE_HTML;
    return btn;
  }

  function bindToggle(btn) {
    if (!btn || btn.dataset.themeBound) return;
    if (!btn.querySelector(".theme-toggle__icon")) {
      btn.innerHTML = TOGGLE_HTML;
    }
    btn.dataset.themeBound = "1";
    btn.addEventListener("click", toggle);
  }

  function injectToggle(container, position) {
    if (!container || container.querySelector("[data-theme-toggle]")) return;
    const btn = createToggle(false);
    if (position === "append") container.appendChild(btn);
    else container.insertBefore(btn, container.firstChild);
    bindToggle(btn);
  }

  function injectAllToggles() {
    document.querySelectorAll(".nav__actions").forEach((el) => injectToggle(el, "prepend"));
    document.querySelectorAll(".header__user").forEach((el) => injectToggle(el, "prepend"));
    document.querySelectorAll("#headerActions").forEach((el) => injectToggle(el, "prepend"));
    document.querySelectorAll(".header__top > div:last-child").forEach((el) => {
      if (el.closest(".header__top")) injectToggle(el, "prepend");
    });
    document.querySelectorAll(".header__inner").forEach((el) => {
      if (!el.querySelector("[data-theme-toggle]")) injectToggle(el, "append");
    });

    if (!document.querySelector("[data-theme-toggle]")) {
      const btn = createToggle(true);
      document.body.appendChild(btn);
      bindToggle(btn);
    }

    document.querySelectorAll("[data-theme-toggle]").forEach(bindToggle);
  }

  function observeDynamicHeaders() {
    const headerActions = document.getElementById("headerActions");
    if (!headerActions) return;
    new MutationObserver(() => injectAllToggles()).observe(headerActions, { childList: true });
  }

  const LOGO_FILE =
    (typeof window !== "undefined" && window.SAC_PLATFORM_LOGO) || "evo-uni.jpeg";

  function setupLogos() {
    if (typeof SAC_PORTAL !== "undefined" && SAC_PORTAL.isInstitutionalPortal()) {
      return;
    }

    const imgs = document.querySelectorAll(
      'img[src*="logos"], img[src*="evo-uni"]:not([data-portal-logo])'
    );
    const iconLinks = document.querySelectorAll(
      'link[rel="icon"][href*="logos"]:not([data-portal-favicon]), link[rel="apple-touch-icon"][href*="logos"]:not([data-portal-favicon]), link[rel="icon"][href*="evo-uni"]:not([data-portal-favicon]), link[rel="apple-touch-icon"][href*="evo-uni"]:not([data-portal-favicon])'
    );
    if (!imgs.length && !iconLinks.length) return;

    const alt =
      (typeof window !== "undefined" && window.SAC_PLATFORM_LOGO_ALT) || "Evo-smartUni";

    imgs.forEach((img) => {
      if (img.dataset.logoReady) return;
      img.dataset.logoReady = "1";
      img.src = LOGO_FILE;
      if (!img.getAttribute("alt") || /evo-smartuni|logos/i.test(img.getAttribute("alt") || "")) {
        img.alt = alt;
      }
    });
    iconLinks.forEach((link) => {
      link.href = LOGO_FILE;
      if (link.rel === "icon") link.type = "image/jpeg";
    });
  }

  apply(getPreferred());

  function init() {
    setupLogos();
    injectAllToggles();
    observeDynamicHeaders();
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      if (!localStorage.getItem(STORAGE_KEY)) apply(e.matches ? "dark" : "light");
    });
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY && (e.newValue === "light" || e.newValue === "dark")) {
        apply(e.newValue);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.SAC_THEME = { getPreferred, apply, toggle, reinject: injectAllToggles };
})();

/**
 * Bouton retour flottant — style pro, déplaçable, position mémorisée
 */
const SAC_FLOATING_BACK = (function () {
  "use strict";

  const POS_KEY = "sac_floating_back_pos";
  const DRAG_THRESHOLD = 8;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function readPosition() {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (typeof p.xPct !== "number" || typeof p.yPct !== "number") return null;
      return p;
    } catch {
      return null;
    }
  }

  function savePosition(btn) {
    const rect = btn.getBoundingClientRect();
    const vw = window.innerWidth || 1;
    const vh = window.innerHeight || 1;
    const xPct = rect.left / vw;
    const yPct = rect.top / vh;
    try {
      localStorage.setItem(
        POS_KEY,
        JSON.stringify({
          xPct: Math.round(xPct * 10000) / 10000,
          yPct: Math.round(yPct * 10000) / 10000,
        })
      );
    } catch {
      /* ignore */
    }
  }

  function applyPosition(btn, pos) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = btn.getBoundingClientRect();
    const w = rect.width || 120;
    const h = rect.height || 48;

    let left;
    let top;

    if (pos && typeof pos.xPct === "number" && typeof pos.yPct === "number") {
      left = pos.xPct * vw;
      top = pos.yPct * vh;
    } else {
      left = 16;
      top = vh - h - 88;
    }

    left = clamp(left, 8, Math.max(8, vw - w - 8));
    top = clamp(top, 8, Math.max(8, vh - h - 8));

    btn.style.left = left + "px";
    btn.style.top = top + "px";
    btn.style.right = "auto";
    btn.style.bottom = "auto";
  }

  function isHomePage() {
    const path = (window.location.pathname || "").toLowerCase();
    const file = path.split("/").pop() || "";
    return !file || file === "index.html";
  }

  function resolveFallbackUrl(base) {
    const root = base || "";
    try {
      if (typeof SAC_SESSION !== "undefined") {
        const session = SAC_SESSION.getSession();
        if (session?.role) {
          if (typeof SAC_PORTAL !== "undefined") {
            return root + SAC_PORTAL.dashboardUrl(session.role);
          }
          if (typeof SAC_SESSION.dashboardUrl === "function") {
            return root + SAC_SESSION.dashboardUrl(session.role);
          }
        }
      }
    } catch {
      /* ignore */
    }
    return root + "index.html";
  }

  function goBack(base) {
    const referrer = document.referrer || "";
    const sameOrigin = referrer && referrer.indexOf(window.location.origin) === 0;
    if (sameOrigin && window.history.length > 1) {
      window.history.back();
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = resolveFallbackUrl(base);
  }

  function shouldMount() {
    if (document.documentElement.dataset.sacFloatingBackOff === "1") return false;
    if (document.body?.dataset?.sacFloatingBackOff === "1") return false;
    if (document.querySelector(".sac-floating-back")) return false;
    return true;
  }

  function enableDrag(btn, base) {
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;

    function onPointerDown(e) {
      if (e.button != null && e.button !== 0) return;
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      originLeft = btn.offsetLeft;
      originTop = btn.offsetTop;
      btn.classList.add("is-dragging");
      btn.setPointerCapture(e.pointerId);
      e.preventDefault();
    }

    function onPointerMove(e) {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      moved = true;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = btn.offsetWidth;
      const h = btn.offsetHeight;
      const left = clamp(originLeft + dx, 8, Math.max(8, vw - w - 8));
      const top = clamp(originTop + dy, 8, Math.max(8, vh - h - 8));

      btn.style.left = left + "px";
      btn.style.top = top + "px";
    }

    function onPointerUp(e) {
      if (!dragging) return;
      dragging = false;
      btn.classList.remove("is-dragging");
      try {
        btn.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (moved) {
        savePosition(btn);
      } else {
        goBack(base);
      }
    }

    btn.addEventListener("pointerdown", onPointerDown);
    btn.addEventListener("pointermove", onPointerMove);
    btn.addEventListener("pointerup", onPointerUp);
    btn.addEventListener("pointercancel", onPointerUp);
  }

  function createButton(base) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sac-floating-back";
    btn.setAttribute("aria-label", "Retour — maintenir et glisser pour déplacer");
    btn.title = "Cliquer : retour · Glisser : déplacer";
    btn.innerHTML =
      '<span class="sac-floating-back__icon" aria-hidden="true">←</span>' +
      '<span class="sac-floating-back__label">Retour</span>' +
      '<span class="sac-floating-back__grip" aria-hidden="true">⋮</span>';
    return btn;
  }

  function init(options) {
    if (!shouldMount()) return null;

    const opts = options || {};
    const base = opts.base != null ? opts.base : "";
    const hideOnHome = opts.hideOnHome !== false;

    if (hideOnHome && isHomePage()) return null;

    const btn = createButton(base);
    document.body.appendChild(btn);
    applyPosition(btn, readPosition());
    enableDrag(btn, base);

    window.addEventListener("resize", function () {
      applyPosition(btn, readPosition());
    });

    return btn;
  }

  return {
    init,
    POS_KEY,
  };
})();

/**
 * EvoDigitalBooks — accès réservé auteurs (portail inscription / connexion).
 * Les visiteurs (auditeurs) voient le catalogue public sans lien vers l'espace auteur.
 */
const SAC_EDB_ACCESS = (function () {
  const STORAGE_KEY = "sac_edb_author_gate";
  const PARAM_KEYS = ["edb", "access", "edb_access"];

  function gateCode() {
    return String(window.SAC_EDB_AUTHOR_GATE || "evobooks2026").trim();
  }

  function unlock(persist) {
    if (persist !== false) {
      try {
        sessionStorage.setItem(STORAGE_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    window.dispatchEvent(new CustomEvent("sac-edb-access-unlock"));
    return true;
  }

  function checkUrlUnlock() {
    try {
      const params = new URLSearchParams(location.search);
      let matched = false;
      PARAM_KEYS.forEach((key) => {
        const token = String(params.get(key) || "").trim();
        if (!token) return;
        if (token === gateCode() || token === "1" || token === "unlock") matched = true;
      });
      if (!matched) return false;
      unlock(true);
      PARAM_KEYS.forEach((key) => params.delete(key));
      const qs = params.toString();
      const next = location.pathname + (qs ? "?" + qs : "") + location.hash;
      if (history.replaceState) history.replaceState({}, "", next);
      return true;
    } catch {
      return false;
    }
  }

  function hasStoredUnlock() {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  function hasAccess(session) {
    if (session?.role === "auteur" || session?.role === "superadmin") return true;
    return hasStoredUnlock();
  }

  function tryUnlockWithCode(code) {
    const entered = String(code || "").trim();
    if (!entered || entered !== gateCode()) return false;
    return unlock(true);
  }

  function promptUnlock() {
    const code = window.prompt(
      "Accès réservé aux auteurs EvoDigitalBooks.\n\nEntrez le code d'accès :"
    );
    if (code === null) return false;
    if (tryUnlockWithCode(code)) {
      alert("Accès auteur débloqué pour cette session.");
      return true;
    }
    alert("Code incorrect.");
    return false;
  }

  function enforceAuthorPortal(session, fallbackUrl) {
    checkUrlUnlock();
    if (hasAccess(session)) return true;
    location.replace(fallbackUrl || "evodigitalbooks.html");
    return false;
  }

  function bindSecretTrigger(el, options) {
    if (!el) return;
    const clicksNeeded = (options && options.clicks) || 3;
    const windowMs = (options && options.windowMs) || 2500;
    let count = 0;
    let timer = null;

    el.style.cursor = "default";
    el.addEventListener("click", () => {
      count += 1;
      clearTimeout(timer);
      timer = setTimeout(() => {
        count = 0;
      }, windowMs);
      if (count >= clicksNeeded) {
        count = 0;
        clearTimeout(timer);
        unlock(true);
        if (typeof options?.onUnlock === "function") options.onUnlock();
      }
    });
  }

  function mountSecretLink(container, href) {
    if (!container || !hasStoredUnlock()) return null;
    let link = container.querySelector(".lib-topbar-edb");
    if (link) return link;
    link = document.createElement("a");
    link.href = href || "evodigitalbooks/";
    link.className = "lib-topbar-edb";
    link.title = "Espace auteurs EvoDigitalBooks";
    link.setAttribute("aria-label", "Espace auteurs EvoDigitalBooks");
    link.textContent = "📖";
    container.insertBefore(link, container.querySelector("#headerActions") || null);
    return link;
  }

  function refreshAuthorNav(session, root) {
    const host = root || document;
    const allowed = hasAccess(session);
    host.querySelectorAll("[data-edb-author-only]").forEach((el) => {
      el.hidden = !allowed;
    });
    host.querySelectorAll("[data-edb-public-only]").forEach((el) => {
      el.hidden = allowed && session?.role === "auteur";
    });
  }

  checkUrlUnlock();

  return {
    gateCode,
    unlock,
    checkUrlUnlock,
    hasAccess,
    tryUnlockWithCode,
    promptUnlock,
    enforceAuthorPortal,
    bindSecretTrigger,
    mountSecretLink,
    refreshAuthorNav,
  };
})();

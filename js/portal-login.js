/**
 * Connexion partagée pour les portails institutionnels (ministere / superadmin / admin-uni)
 */
(function () {
  async function init() {
    const def = SAC_PORTAL.current();
    if (!def) return;

    SAC_PORTAL.applyTheme(def);
    SAC_PORTAL.applyBranding(def);
    document.title = def.title + " — Evo-smartUni";

    if (typeof SAC_THEME !== "undefined" && SAC_THEME.reinject) {
      SAC_THEME.reinject();
    }

    const roleParam = new URLSearchParams(window.location.search).get("role");
    if (await SAC_SESSION.redirectIfAuthenticated(roleParam || def.role)) return;

    if (typeof SAC_API !== "undefined" && SAC_API.wakeServer) {
      SAC_API.wakeServer({ attempts: 3, timeoutMs: 30000, delayMs: 4000 });
    }

    const form = document.getElementById("portalLoginForm");
    const emailInput = document.getElementById("portalEmail");
    const passwordInput = document.getElementById("portalPassword");
    const codeUniWrap = document.getElementById("portalCodeUniWrap");
    const codeUniInput = document.getElementById("portalCodeUni");
    const submitBtn = document.getElementById("portalSubmit");

    if (emailInput) emailInput.placeholder = def.emailPlaceholder || "";
    if (submitBtn) submitBtn.textContent = def.btnLabel || "Se connecter";

    if (def.showCodeUni && codeUniInput) {
      if (codeUniWrap) codeUniWrap.hidden = false;
      codeUniInput.required = true;
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (!email || password.length < 8) {
        alert("E-mail et mot de passe requis (8 caractères minimum).");
        return;
      }

      submitBtn.disabled = true;
      const prevLabel = submitBtn.textContent;
      submitBtn.textContent = "Connexion…";

      try {
        if (typeof SAC_API === "undefined") throw new Error("API indisponible");
        await SAC_API.wakeServer();
        if (!SAC_API.isOnline()) throw new Error("Serveur injoignable. Réessayez dans quelques instants.");

        const extra = { adminPortal: !!def.adminPortal };
        if (def.showCodeUni && codeUniInput) {
          extra.codeUni = codeUniInput.value.trim();
          if (!extra.codeUni) {
            alert("Code établissement requis.");
            return;
          }
        }

        const session = await SAC_API.login(email, password, def.role, extra);
        SAC_SESSION.saveSession(session);
        window.location.replace(SAC_PORTAL.dashboardUrl(session.role));
      } catch (err) {
        alert(err.message || "Identifiant ou mot de passe incorrect.");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = prevLabel;
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

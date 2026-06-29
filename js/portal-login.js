/**
 * Connexion partagée pour les portails institutionnels (ministere / superadmin / admin-uni)
 */
(function () {
  function resolveSessionCountry(session) {
    if (!session) return "";
    if (session.countryCode) return String(session.countryCode).toUpperCase();
    if (session.role === "universite" && session.universite) {
      if (typeof SAC_UNIVERSITIES !== "undefined" && SAC_UNIVERSITIES.getCountryCode) {
        return SAC_UNIVERSITIES.getCountryCode(session.universite);
      }
    }
    return "";
  }

  function assertPortalCountry(session, selectedCountry) {
    const expected = String(selectedCountry || "").toUpperCase();
    const actual = resolveSessionCountry(session) || expected;
    if (actual && expected && actual !== expected) {
      const label =
        typeof SAC_AFRICA_COUNTRIES !== "undefined"
          ? SAC_AFRICA_COUNTRIES.label(expected)
          : expected;
      throw new Error(
        "Ce compte n'est pas rattaché au pays sélectionné (" + label + "). Vérifiez le pays puis réessayez."
      );
    }
    session.countryCode = actual || expected;
    return session;
  }

  function initCountryField(def) {
    const wrap = document.getElementById("portalCountryWrap");
    const select = document.getElementById("portalCountry");
    if (!def.requiresCountry || !wrap || !select) return null;
    wrap.hidden = false;
    select.required = true;
    if (typeof SAC_AFRICA_COUNTRIES !== "undefined") {
      const saved = SAC_AFRICA_COUNTRIES.getPortalCountry(def.id);
      select.innerHTML = SAC_AFRICA_COUNTRIES.buildInstitutionCountrySelect(saved);
      select.value = saved;
    }
    return select;
  }

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
    const countrySelect = initCountryField(def);

    if (emailInput) emailInput.placeholder = def.emailPlaceholder || "";
    if (submitBtn) submitBtn.textContent = def.btnLabel || "Se connecter";

    if (def.showCodeUni && codeUniInput) {
      if (codeUniWrap) codeUniWrap.hidden = false;
      codeUniInput.required = true;
    }

    countrySelect?.addEventListener("change", () => {
      if (typeof SAC_AFRICA_COUNTRIES !== "undefined") {
        SAC_AFRICA_COUNTRIES.setPortalCountry(def.id, countrySelect.value);
      }
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (!email || password.length < 8) {
        alert("E-mail et mot de passe requis (8 caractères minimum).");
        return;
      }

      const countryCode = countrySelect?.value?.trim() || "";
      if (def.requiresCountry && !countryCode) {
        alert("Choisissez le pays de votre institution avant de vous connecter.");
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
        if (countryCode) extra.countryCode = countryCode;
        if (def.showCodeUni && codeUniInput) {
          extra.codeUni = codeUniInput.value.trim();
          if (!extra.codeUni) {
            alert("Code établissement requis.");
            return;
          }
        }

        let session = await SAC_API.login(email, password, def.role, extra);
        if (def.requiresCountry) {
          session = assertPortalCountry(session, countryCode);
        }
        if (countryCode && typeof SAC_AFRICA_COUNTRIES !== "undefined") {
          SAC_AFRICA_COUNTRIES.setPortalCountry(def.id, countryCode);
        }
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

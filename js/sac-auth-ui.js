/**
 * Interface d'authentification — session persistante sur les pages publiques
 */
const SAC_AUTH_UI = (function () {
  const ROLE_ICONS = {
    etudiant: "🎓",
    professeur: "📚",
    assistant: "📋",
    universite: "🏛️",
    section: "🏫",
  };

  let lastMountOptions = null;

  function tx(key, fallback) {
    return typeof SAC_I18N !== "undefined" ? SAC_I18N.t(key) : fallback;
  }

  function initials(session) {
    const name =
      (typeof SAC_IDENTITY !== "undefined" && SAC_IDENTITY.getDisplayName(session)) ||
      session.displayName ||
      session.identifiant ||
      "?";
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return String(name).slice(0, 2).toUpperCase();
  }

  function roleLabel(role) {
    if (typeof SAC_IDENTITY !== "undefined" && typeof SAC_IDENTITY.roleLabelText === "function") {
      return SAC_IDENTITY.roleLabelText(role);
    }
    return role || "utilisateur";
  }

  function guestHtml() {
    return (
      '<a href="connexion.html" class="btn btn--ghost">' + tx("nav.login", "Connexion") + "</a>" +
      '<a href="inscription.html" class="btn btn--primary">' + tx("nav.signup", "S'inscrire") + "</a>"
    );
  }

  function loggedInHtml(session, compact) {
    const name =
      (typeof SAC_IDENTITY !== "undefined" && SAC_IDENTITY.getDisplayName(session)) ||
      session.displayName ||
      session.identifiant;
    const dash = SAC_SESSION.dashboardUrl(session.role);
    const icon = ROLE_ICONS[session.role] || "👤";

    if (compact) {
      return (
        '<div class="auth-user">' +
        '<div class="auth-user__chip">' +
        '<span class="auth-user__avatar" aria-hidden="true">' + initials(session) + "</span>" +
        '<span class="auth-user__meta">' +
        '<span class="auth-user__name">' + escapeHtml(name) + "</span>" +
        '<span class="auth-user__role">' + icon + " " + escapeHtml(roleLabel(session.role)) + "</span>" +
        "</span></div>" +
        '<a href="' + dash + '" class="btn btn--primary btn--sm">' + tx("nav.myspace", "Mon espace") + "</a>" +
        '<button type="button" class="btn btn--ghost btn--sm" data-sac-logout>' + tx("nav.logout", "Déconnexion") + "</button>" +
        "</div>"
      );
    }

    return (
      '<div class="auth-shell auth-user">' +
      '<span class="auth-user__status">' + tx("auth.connected", "Connecté") + "</span>" +
      '<div class="auth-user__chip">' +
      '<span class="auth-user__avatar" aria-hidden="true">' + initials(session) + "</span>" +
      '<span class="auth-user__meta">' +
      '<span class="auth-user__name">' + escapeHtml(name) + "</span>" +
      '<span class="auth-user__role">' + icon + " " + escapeHtml(roleLabel(session.role)) + "</span>" +
      "</span></div>" +
      '<a href="' + dash + '" class="btn btn--primary btn--sm">' + tx("nav.myspace", "Mon espace") + "</a>" +
      '<button type="button" class="btn btn--ghost btn--sm" data-sac-logout>' + tx("nav.logout", "Déconnexion") + "</button>" +
      "</div>"
    );
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderContainer(el, session, options) {
    if (!el) return;
    const compact = options.compact || el.dataset.authCompact === "true";
    const mobile = options.mobile || el.dataset.authMobile === "true";

    if (session) {
      el.innerHTML = loggedInHtml(session, compact);
      if (mobile) el.classList.add("auth-shell--mobile");
    } else {
      el.innerHTML = guestHtml();
      el.classList.remove("auth-shell--mobile");
    }
  }

  function renderCtaBand(session, ctaEl) {
    if (!ctaEl) return;
    const primary = ctaEl.querySelector("#ctaPrimaryBtn");
    const authBtn = ctaEl.querySelector("#ctaAuthBtn");

    if (session) {
      const dash = SAC_SESSION.dashboardUrl(session.role);
      if (primary) {
        primary.href = dash;
        primary.textContent = tx("nav.myspace", "Mon espace");
        primary.classList.remove("btn--accent");
        primary.classList.add("btn--accent");
      }
      if (authBtn) {
        authBtn.outerHTML =
          '<button type="button" class="btn btn--logout-light btn--lg" data-sac-logout id="ctaAuthBtn">' +
          tx("nav.logout", "Déconnexion") +
          "</button>";
      }
    } else {
      if (primary) {
        primary.href = "inscription.html";
        primary.textContent = tx("nav.signup", "S'inscrire");
      }
      if (authBtn && authBtn.tagName === "BUTTON") {
        authBtn.outerHTML =
          '<a href="connexion.html" class="btn btn--outline-light btn--lg" id="ctaAuthBtn">' +
          tx("hero.connect", "Se connecter") +
          "</a>";
      } else if (authBtn) {
        authBtn.href = "connexion.html";
        authBtn.textContent = tx("hero.connect", "Se connecter");
        authBtn.className = "btn btn--outline-light btn--lg";
      }
    }
  }

  function renderHero(session, heroCtaEl, welcomeEl) {
    if (!session) return;

    const name =
      (typeof SAC_IDENTITY !== "undefined" && SAC_IDENTITY.getDisplayName(session)) ||
      session.displayName ||
      "utilisateur";
    const dash = SAC_SESSION.dashboardUrl(session.role);

    if (welcomeEl) {
      welcomeEl.hidden = false;
      welcomeEl.innerHTML = tx("auth.welcome.back", "Bon retour, <strong>{name}</strong> — session active").replace(
        "{name}",
        escapeHtml(name.split(" ")[0] || name)
      );
    }

    if (heroCtaEl) {
      const loginBtn = heroCtaEl.querySelector('a[href="connexion.html"]');
      if (loginBtn) {
        loginBtn.outerHTML =
          '<button type="button" class="btn btn--ghost btn--lg" data-sac-logout>' +
          tx("auth.logout.action", "Se déconnecter") +
          "</button>";
      }
      const createBtn = heroCtaEl.querySelector('a[href="inscription.html"]');
      if (createBtn) {
        createBtn.href = dash;
        createBtn.textContent = tx("nav.myspace", "Mon espace");
      }
    }
  }

  function bindLogout() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-sac-logout]");
      if (!btn) return;
      e.preventDefault();
      btn.disabled = true;
      SAC_SESSION.logout("index.html");
    });
  }

  /**
   * @param {object} options
   * @param {string} [options.desktopId] — conteneur nav desktop
   * @param {string} [options.mobileId] — conteneur nav mobile
   * @param {string} [options.heroCtaId] — zone CTA hero
   * @param {string} [options.welcomeId] — badge bienvenue hero
   * @param {string} [options.ctaId] — bandeau « Rejoignez »
   */
  async function mount(options) {
    lastMountOptions = options || {};
    bindLogout();

    const desktop = document.getElementById(options.desktopId || "navAuthDesktop");
    const mobile = document.getElementById(options.mobileId || "navAuthMobile");
    const heroCta = document.getElementById(options.heroCtaId || "heroAuthCta");
    const welcome = document.getElementById(options.welcomeId || "heroWelcome");
    const ctaBand = document.getElementById(options.ctaId || "ctaAuthActions");

    let session = SAC_SESSION.getActiveSession();
    renderContainer(desktop, session, { compact: false });
    renderContainer(mobile, session, { compact: true, mobile: true });
    renderHero(session, heroCta, welcome);
    renderCtaBand(session, ctaBand);
    document.documentElement.dataset.sacAuth = session ? "in" : "out";

    if (!session && typeof SAC_SESSION.restoreSession === "function") {
      session = await SAC_SESSION.restoreSession();
      if (session) {
        renderContainer(desktop, session, { compact: false });
        renderContainer(mobile, session, { compact: true, mobile: true });
        renderHero(session, heroCta, welcome);
        renderCtaBand(session, ctaBand);
        document.documentElement.dataset.sacAuth = "in";
      }
    }

    return session;
  }

  window.addEventListener("sac:lang-change", () => {
    if (lastMountOptions) mount(lastMountOptions);
  });

  return { mount, renderContainer, renderHero, renderCtaBand };
})();

/**
 * Portails institutionnels SAC — détection domaine/chemin, URLs et assets.
 * ministere/ · superadmin/ · admin-uni/ (+ domaines personnalisés plus tard)
 */
const SAC_PORTAL = (function () {
  const DEFS = {
    ministere: {
      id: "ministere",
      role: "ministere",
      slug: "ministere",
      title: "Portail Ministère",
      orgName: "Ministère de l'Enseignement Supérieur et Universitaire",
      hostHints: ["ministere."],
      pathPrefix: "/ministere",
      accent: "#1e40af",
      accentDark: "#1e3a8a",
      themeColor: "#1e40af",
      icon: "🏛️",
      emailPlaceholder: "admin@ministere.cd",
      btnLabel: "Accéder au portail Ministère",
      lead:
        "Espace sécurisé de supervision nationale : consultez les administrateurs institutionnels et les établissements connectés à SAC.",
      notice: "Accès réservé aux agents habilités du Ministère. Compte créé par le Super Admin SAC.",
      dashboard: "dashboard-admin.html",
      adminPortal: true,
      logoFile: "logos.png",
    },
    superadmin: {
      id: "superadmin",
      role: "superadmin",
      slug: "superadmin",
      title: "Portail Super Admin",
      orgName: "Smart Academy of Congo — Administration centrale",
      hostHints: ["superadmin."],
      pathPrefix: "/superadmin",
      accent: "#5b21b6",
      accentDark: "#4c1d95",
      themeColor: "#5b21b6",
      icon: "🛡️",
      emailPlaceholder: "admin@superadmin.cd",
      btnLabel: "Accéder au Super Admin",
      lead:
        "Gestion centrale de la plateforme : création des comptes Ministère, Admin université et Super Admin.",
      notice: "Accès ultra-restreint. Toute action est journalisée.",
      dashboard: "dashboard-admin.html",
      adminPortal: true,
      logoFile: "logos.png",
    },
    "admin-uni": {
      id: "admin-uni",
      role: "universite",
      slug: "admin-uni",
      title: "Portail Admin Université",
      orgName: "Administration de campus — SAC",
      hostHints: ["admin.", "admin-uni."],
      pathPrefix: "/admin-uni",
      accent: "#0d7a4a",
      accentDark: "#065f46",
      themeColor: "#0d7a4a",
      icon: "🎓",
      emailPlaceholder: "admin@universite.cd",
      btnLabel: "Accéder à mon campus",
      lead:
        "Gérez votre établissement : sections, professeurs, étudiants, tarifs et communication officielle.",
      notice: "Compte campus créé par le Super Admin SAC. Utilisez votre code établissement.",
      dashboard: "dashboard-universite.html",
      adminPortal: false,
      showCodeUni: true,
      logoFile: "logos.png",
    },
  };

  function normPath(path) {
    let p = (path || "/").toLowerCase();
    if (p.endsWith("/index.html")) p = p.slice(0, -"/index.html".length) || "/";
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    return p;
  }

  function detectPortalId() {
    const host = (window.location.hostname || "").toLowerCase();
    const path = normPath(window.location.pathname);

    for (const id of Object.keys(DEFS)) {
      const def = DEFS[id];
      if (def.hostHints.some((hint) => host.startsWith(hint) || host === hint.replace(/\.$/, ""))) {
        return id;
      }
      if (path === def.pathPrefix || path.startsWith(def.pathPrefix + "/")) {
        return id;
      }
    }
    return null;
  }

  const activeId = detectPortalId();

  function current() {
    return activeId ? DEFS[activeId] : null;
  }

  function inPortalFolder() {
    return !!activeId;
  }

  function prefix() {
    return inPortalFolder() ? ".." : ".";
  }

  function asset(relativePath) {
    const rel = String(relativePath || "").replace(/^\//, "");
    const p = prefix();
    return p === "." ? rel : p + "/" + rel;
  }

  function siteUrl(relativePath) {
    const rel = String(relativePath || "");
    if (/^https?:\/\//i.test(rel)) return rel;
    if (rel.startsWith("/")) return rel;
    return asset(rel);
  }

  function loginUrlForRole(role) {
    if (role === "ministere") return siteUrl("ministere/");
    if (role === "superadmin") return siteUrl("superadmin/");
    if (role === "universite") return siteUrl("admin-uni/");
    return siteUrl("connexion.html?role=" + encodeURIComponent(role || "etudiant"));
  }

  function logoutUrl(role) {
    return loginUrlForRole(role);
  }

  function dashboardUrl(role) {
    const map = {
      etudiant: "dashboard-etudiant.html",
      professeur: "dashboard-professeur.html",
      assistant: "dashboard-assistant.html",
      universite: "dashboard-universite.html",
      section: "dashboard-section.html",
      ministere: "dashboard-admin.html",
      superadmin: "dashboard-admin.html",
    };
    return siteUrl(map[role] || "index.html");
  }

  function applyTheme(def) {
    if (!def || typeof document === "undefined") return;
    document.documentElement.style.setProperty("--portal-accent", def.accent);
    document.documentElement.style.setProperty("--portal-accent-dark", def.accentDark);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", def.themeColor);
  }

  function logoUrlForRole(role) {
    const slugByRole = {
      ministere: "ministere",
      superadmin: "superadmin",
      universite: "admin-uni",
    };
    const slug = slugByRole[role];
    if (slug && DEFS[slug] && DEFS[slug].logoFile) {
      return siteUrl(slug + "/" + DEFS[slug].logoFile);
    }
    return siteUrl("logos.svg");
  }

  function localLogoUrl() {
    const def = current();
    if (def && def.logoFile) return def.logoFile;
    return null;
  }

  function applyBranding(roleOrDef) {
    const def = current();
    let logoSrc;

    if (def && def.logoFile) {
      const role =
        typeof roleOrDef === "string"
          ? roleOrDef
          : roleOrDef && roleOrDef.role
            ? roleOrDef.role
            : null;
      if (!role || role === def.role) {
        logoSrc = def.logoFile;
      }
    }

    if (!logoSrc) {
      const role =
        typeof roleOrDef === "string"
          ? roleOrDef
          : roleOrDef && roleOrDef.role
            ? roleOrDef.role
            : def
              ? def.role
              : null;
      logoSrc = role ? logoUrlForRole(role) : siteUrl("logos.svg");
    }

    document.querySelectorAll("[data-portal-logo]").forEach((img) => {
      img.src = logoSrc;
      img.dataset.logoReady = "portal";
    });
    const fav = document.querySelector('link[rel="icon"]');
    if (fav && logoSrc) {
      fav.href = logoSrc;
      fav.type = logoSrc.endsWith(".png") ? "image/png" : "image/svg+xml";
      fav.setAttribute("data-portal-favicon", "");
    }
    const apple = document.querySelector('link[rel="apple-touch-icon"]');
    if (apple && logoSrc) {
      apple.href = logoSrc;
      apple.setAttribute("data-portal-favicon", "");
    }
  }

  function redirectIfWrongRole(session) {
    const def = current();
    if (!def || !session || !session.role) return false;
    if (session.role === def.role) return false;
    window.location.replace(dashboardUrl(session.role));
    return true;
  }

  return {
    DEFS,
    current,
    detectPortalId: () => activeId,
    inPortalFolder,
    asset,
    siteUrl,
    loginUrlForRole,
    logoutUrl,
    dashboardUrl,
    applyTheme,
    redirectIfWrongRole,
    logoUrlForRole,
    localLogoUrl,
    applyBranding,
    isInstitutionalPortal: () => !!activeId,
  };
})();

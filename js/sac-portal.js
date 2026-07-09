/**
 * Portails institutionnels EvoSU — détection domaine/chemin, URLs et assets.
 * ministere/ · superadmin/ · admin-uni/ (+ domaines personnalisés plus tard)
 */
const SAC_PORTAL = (function () {
  const PLATFORM_LOGO =
    (typeof window !== "undefined" && window.SAC_PLATFORM_LOGO) || "evo-uni.jpeg";
  const PLATFORM_LOGO_ALT =
    (typeof window !== "undefined" && window.SAC_PLATFORM_LOGO_ALT) || "Evo-smartUni";

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
        "Espace sécurisé de supervision nationale : consultez les administrateurs institutionnels et les établissements connectés à EvoSU.",
      notice: "Accès réservé aux agents habilités du Ministère. Compte créé par le Super Admin EvoSU.",
      dashboard: "dashboard-admin.html",
      adminPortal: true,
      requiresCountry: true,
      logoFile: "../" + PLATFORM_LOGO,
    },
    superadmin: {
      id: "superadmin",
      role: "superadmin",
      slug: "superadmin",
      title: "Portail Super Admin",
      orgName: "Evo-smartUni — Administration centrale",
      hostHints: ["superadmin."],
      pathPrefix: "/superadmin",
      accent: "#5b21b6",
      accentDark: "#4c1d95",
      themeColor: "#5b21b6",
      icon: "🛡️",
      emailPlaceholder: "djemcibamba@gmail.com",
      btnLabel: "Accéder au Super Admin",
      lead:
        "Gestion centrale de la plateforme : création des comptes Ministère, Admin université et Super Admin.",
      notice: "Accès ultra-restreint. Toute action est journalisée.",
      dashboard: "dashboard-admin.html",
      adminPortal: true,
      logoFile: "../" + PLATFORM_LOGO,
    },
    "admin-uni": {
      id: "admin-uni",
      role: "universite",
      slug: "admin-uni",
      title: "Portail Admin Université",
      orgName: "Administration de campus — EvoSU",
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
      notice: "Compte campus créé par le Super Admin EvoSU. Utilisez votre code établissement.",
      dashboard: "dashboard-universite.html",
      adminPortal: false,
      showCodeUni: true,
      requiresCountry: true,
      logoFile: "../" + PLATFORM_LOGO,
    },
    evomonitor: {
      id: "evomonitor",
      role: "superadmin",
      slug: "evomonitor",
      title: "EvoMonitor",
      orgName: "Centre de supervision — Evo-smartUni",
      hostHints: ["monitor.", "evomonitor."],
      pathPrefix: "/evomonitor",
      accent: "#0e7490",
      accentDark: "#0c4a6e",
      themeColor: "#0e7490",
      icon: "📡",
      emailPlaceholder: "admin@evosmartuni.com",
      btnLabel: "Accéder à EvoMonitor",
      lead:
        "Surveillez la santé de la plateforme : performance, base de données, réseau et alertes intelligentes.",
      notice: "Accès réservé aux comptes Super Admin. Toute consultation est journalisée.",
      dashboard: "dashboard-evomonitor.html",
      adminPortal: true,
      logoFile: "../" + PLATFORM_LOGO,
    },
    devcenter: {
      id: "devcenter",
      role: "developpeur",
      slug: "devcenter",
      title: "Dev Center",
      orgName: "Espace développeurs — Evo-smartUni",
      hostHints: ["dev.", "devcenter."],
      pathPrefix: "/devcenter",
      accent: "#4338ca",
      accentDark: "#312e81",
      themeColor: "#4338ca",
      icon: "👨‍💻",
      emailPlaceholder: "dev@evosmartuni.com",
      btnLabel: "Accéder au Dev Center",
      lead: "Tickets AI Ops, corrections et suivi des incidents techniques.",
      notice: "Accès réservé aux comptes développeur.",
      dashboard: "dashboard-devcenter.html",
      adminPortal: true,
      logoFile: "../" + PLATFORM_LOGO,
    },
    techmanager: {
      id: "techmanager",
      role: "techmanager",
      slug: "techmanager",
      title: "Tech Manager",
      orgName: "Responsable technique — Evo-smartUni",
      hostHints: ["tech.", "techmanager."],
      pathPrefix: "/techmanager",
      accent: "#a855f7",
      accentDark: "#9333ea",
      themeColor: "#a855f7",
      icon: "🎯",
      emailPlaceholder: "tech@evosmartuni.com",
      btnLabel: "Accéder au Tech Manager",
      lead: "Gestion équipe dev, priorités et validation pré-production.",
      notice: "Accès réservé au responsable technique.",
      dashboard: "dashboard-techmanager.html",
      adminPortal: true,
      logoFile: "../" + PLATFORM_LOGO,
    },
    evodigitalbooks: {
      id: "evodigitalbooks",
      role: "auteur",
      slug: "evodigitalbooks",
      title: "EvoDigitalBooks",
      orgName: "EvoDigitalBooks — Espace auteurs",
      hostHints: ["edb.", "evodigitalbooks."],
      pathPrefix: "/evodigitalbooks",
      accent: "#7c3aed",
      accentDark: "#5b21b6",
      themeColor: "#7c3aed",
      icon: "📖",
      emailPlaceholder: "auteur@exemple.cd",
      btnLabel: "Accéder à mon espace auteur",
      lead:
        "Publiez et vendez vos livres numériques. Validation Super Admin, paiements Mobile Money (75 % auteur / 25 % plateforme).",
      notice: "Créez un compte auteur si vous n'en avez pas encore. Limite : 3 appareils par compte.",
      dashboard: "dashboard-evodigitalbooks.html",
      adminPortal: false,
      logoFile: "../" + PLATFORM_LOGO,
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
    if (role === "evomonitor") return siteUrl("evomonitor/");
    if (role === "developpeur") return siteUrl("devcenter/");
    if (role === "techmanager") return siteUrl("techmanager/");
    if (role === "auteur") return siteUrl("evodigitalbooks/");
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
      evomonitor: "dashboard-evomonitor.html",
      developpeur: "dashboard-devcenter.html",
      techmanager: "dashboard-techmanager.html",
      auteur: "dashboard-evodigitalbooks.html",
    };
    return siteUrl(map[role] || "index.html");
  }

  function portalDashboardUrl(def) {
    if (def && def.dashboard) return siteUrl(def.dashboard);
    return dashboardUrl(def ? def.role : "");
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
      evomonitor: "evomonitor",
      devcenter: "devcenter",
      techmanager: "techmanager",
    };
    const slug = slugByRole[role];
    if (slug && DEFS[slug] && DEFS[slug].logoFile) {
      return siteUrl(slug + "/" + DEFS[slug].logoFile);
    }
    return siteUrl(PLATFORM_LOGO);
  }

  function faviconMimeFor(src) {
    const s = String(src || "").toLowerCase();
    if (s.endsWith(".png")) return "image/png";
    if (s.endsWith(".jpg") || s.endsWith(".jpeg")) return "image/jpeg";
    if (s.endsWith(".webp")) return "image/webp";
    if (s.endsWith(".svg")) return "image/svg+xml";
    return "image/jpeg";
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
      logoSrc = role ? logoUrlForRole(role) : siteUrl(PLATFORM_LOGO);
    }

    document.querySelectorAll("[data-portal-logo]").forEach((img) => {
      img.src = logoSrc;
      img.dataset.logoReady = "portal";
      if (!img.getAttribute("alt") || /evo-smartuni/i.test(img.getAttribute("alt") || "")) {
        img.alt = PLATFORM_LOGO_ALT;
      }
    });
    const fav = document.querySelector('link[rel="icon"]');
    if (fav && logoSrc) {
      fav.href = logoSrc;
      fav.type = faviconMimeFor(logoSrc);
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
    if (def.id === "evomonitor" && session.role === "superadmin") return false;
    if (def.id === "devcenter" && (session.role === "developpeur" || session.role === "superadmin"))
      return false;
    if (def.id === "techmanager" && (session.role === "techmanager" || session.role === "superadmin"))
      return false;
    window.location.replace(dashboardUrl(session.role));
    return true;
  }

  function loginUrlFromPortalQuery(portalId) {
    if (portalId === "ministere") return siteUrl("ministere/");
    if (portalId === "superadmin") return siteUrl("superadmin/");
    if (portalId === "admin-uni") return siteUrl("admin-uni/");
    if (portalId === "evomonitor") return siteUrl("evomonitor/");
    if (portalId === "devcenter") return siteUrl("devcenter/");
    if (portalId === "techmanager") return siteUrl("techmanager/");
    return siteUrl("connexion.html");
  }

  function forgotPasswordUrl(portalId) {
    const q = portalId ? "?portal=" + encodeURIComponent(portalId) : "";
    return siteUrl("mot-de-passe-oublie.html" + q);
  }

  return {
    DEFS,
    current,
    detectPortalId: () => activeId,
    inPortalFolder,
    asset,
    siteUrl,
    loginUrlForRole,
    loginUrlFromPortalQuery,
    forgotPasswordUrl,
    logoutUrl,
    dashboardUrl,
    portalDashboardUrl,
    applyTheme,
    redirectIfWrongRole,
    logoUrlForRole,
    localLogoUrl,
    applyBranding,
    isInstitutionalPortal: () => !!activeId,
  };
})();

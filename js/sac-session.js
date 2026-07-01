/**
 * Session — cookies JWT (API) + cache local ; repli localStorage réservé au dev localhost
 */
const EVOSU_SESSION = (function () {
  const DASHBOARDS = {
    etudiant: "dashboard-etudiant.html",
    professeur: "dashboard-professeur.html",
    assistant: "dashboard-assistant.html",
    universite: "dashboard-universite.html",
    section: "dashboard-section.html",
    ministere: "dashboard-admin.html",
    superadmin: "dashboard-admin.html",
  };

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem("EVOSU_session") || "null");
    } catch {
      return null;
    }
  }

  function saveSession(session) {
    localStorage.setItem("EVOSU_session", JSON.stringify(session));
    if (
      session?.logoUrl &&
      session.role === "universite" &&
      typeof EVOSU_UNIVERSITY_LOGO !== "undefined"
    ) {
      EVOSU_UNIVERSITY_LOGO.registerForUniversity(session);
    }
  }

  function clearSession() {
    localStorage.removeItem("EVOSU_session");
  }

  function loginUrl(role) {
    const r = role || "etudiant";
    if (typeof EVOSU_PORTAL !== "undefined") {
      return EVOSU_PORTAL.loginUrlForRole(r);
    }
    if (r === "ministere") return "ministere/";
    if (r === "superadmin") return "superadmin/";
    if (r === "universite") return "admin-uni/";
    return "connexion.html?role=" + encodeURIComponent(r);
  }

  function dashboardUrl(role) {
    if (typeof EVOSU_PORTAL !== "undefined") {
      return EVOSU_PORTAL.dashboardUrl(role);
    }
    return DASHBOARDS[role] || "index.html";
  }

  function isLoggedIn() {
    const session = getSession();
    return !!(session && session.role && session.identifiant);
  }

  function allowLocalAuth() {
    if (typeof EVOSU_API !== "undefined" && typeof EVOSU_API.allowOfflineAuth === "function") {
      return EVOSU_API.allowOfflineAuth();
    }
    const h = window.location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  }

  const POST_REGISTER_KEY = "EVOSU_post_register";

  function markPostRegistration(role) {
    try {
      sessionStorage.setItem(POST_REGISTER_KEY, String(role || ""));
    } catch {
      /* ignore */
    }
  }

  function hasPostRegistration(role) {
    try {
      const v = sessionStorage.getItem(POST_REGISTER_KEY);
      if (!v) return false;
      return !role || v === role;
    } catch {
      return false;
    }
  }

  function clearPostRegistration() {
    try {
      sessionStorage.removeItem(POST_REGISTER_KEY);
    } catch {
      /* ignore */
    }
  }

  function isFreshApiRegistration(session, requiredRole) {
    if (!session || session.authSource !== "api") return false;
    if (requiredRole && session.role !== requiredRole) return false;
    if (!session.newAccount && !hasPostRegistration(session.role)) return false;
    if (typeof EVOSU_API !== "undefined" && typeof EVOSU_API.hasAuthTokens === "function") {
      return EVOSU_API.hasAuthTokens();
    }
    return true;
  }

  function scheduleSessionSync(local) {
    if (typeof EVOSU_API === "undefined" || typeof EVOSU_API.me !== "function") return;
    EVOSU_API.me()
      .then((serverSession) => {
        saveSession({
          ...serverSession,
          payment: local.payment || serverSession.payment,
        });
        clearPostRegistration();
      })
      .catch(() => {});
  }

  function isServerSession(session) {
    if (!session) return false;
    if (session.authSource === "api") return true;
    return !!(session.userId && session.userId !== session.identifiant);
  }

  /** Session locale valide (recteur / section sans JWT) — à conserver si l'API renvoie 401. */
  function canKeepLocalSession(session, requiredRole) {
    if (!session?.identifiant) return false;
    if (requiredRole && session.role !== requiredRole) return false;
    if (session.authSource === "local") return true;
    if (
      typeof EVOSU_API !== "undefined" &&
      typeof EVOSU_API.hasAuthTokens === "function" &&
      EVOSU_API.hasAuthTokens()
    ) {
      return false;
    }
    if (typeof EVOSU_IDENTITY === "undefined") return allowLocalAuth();
    const user = EVOSU_IDENTITY.findUserByLoginId(
      EVOSU_IDENTITY.getLocalUsers(),
      session.identifiant
    );
    return !!user;
  }

  /** Session active pour les pages publiques (sans effacer si rôle différent) */
  function getActiveSession() {
    const session = getSession();
    if (!session || !session.role || !session.identifiant) return null;
    if (isServerSession(session)) return session;
    if (typeof EVOSU_IDENTITY === "undefined") return session;

    const users = EVOSU_IDENTITY.getLocalUsers();
    const user = EVOSU_IDENTITY.findUserByLoginId(users, session.identifiant);
    if (!user) return allowLocalAuth() ? session : null;

    const canonical = EVOSU_IDENTITY.buildSessionFromUser(user);
    const merged = {
      ...session,
      ...canonical,
      authSource: session.authSource || "local",
      displayName: canonical.displayName || session.displayName,
      connectedAt: session.connectedAt || canonical.connectedAt,
      newAccount: session.newAccount,
      payment: session.payment || user.payment,
    };

    if (
      session.universite &&
      canonical.universite &&
      session.universite !== canonical.universite
    ) {
      merged.universite = canonical.universite;
      merged.universiteLocked = canonical.universiteLocked;
    }

    saveSession(merged);
    return merged;
  }

  /** Tente de restaurer la session via cookies API (httpOnly) */
  async function restoreSession() {
    const local = getSession();
    if (typeof EVOSU_API !== "undefined" && (await EVOSU_API.ensureOnline())) {
      try {
        const server = await EVOSU_API.me({ soft: true });
        if (server) return server;
      } catch {
        /* fall through */
      }
      if (canKeepLocalSession(local)) {
        return syncSessionWithAccount(local?.role) || getActiveSession() || local;
      }
      clearSession();
      return null;
    }
    return getActiveSession();
  }

  /** Réaligne la session sur le compte enregistré (anti-modification localStorage) */
  function syncSessionWithAccount(requiredRole) {
    const session = getSession();
    if (!session || !session.identifiant) return null;

    if (requiredRole && session.role !== requiredRole) {
      clearSession();
      return null;
    }

    if (isServerSession(session)) return session;

    if (typeof EVOSU_IDENTITY === "undefined") {
      return allowLocalAuth() ? session : null;
    }

    const users = EVOSU_IDENTITY.getLocalUsers();
    const user = EVOSU_IDENTITY.findUserByLoginId(users, session.identifiant);
    if (!user) {
      if (canKeepLocalSession(session, requiredRole)) return session;
      if (!allowLocalAuth()) {
        clearSession();
        return null;
      }
      return session;
    }

    const canonical = EVOSU_IDENTITY.buildSessionFromUser(user);
    const merged = {
      ...session,
      ...canonical,
      authSource: "local",
      displayName: canonical.displayName || session.displayName,
      connectedAt: session.connectedAt || canonical.connectedAt,
      newAccount: session.newAccount,
      payment: session.payment || user.payment,
    };

    if (
      session.universite &&
      canonical.universite &&
      session.universite !== canonical.universite
    ) {
      merged.universite = canonical.universite;
      merged.universiteLocked = canonical.universiteLocked;
    }

    saveSession(merged);
    return merged;
  }

  /**
   * Session pour navigation interne (dashboard ↔ écosystème) —
   * conserve la connexion même si l'API est lente ou indisponible.
   */
  async function resolveNavigationSession(requiredRole) {
    const local = getActiveSession() || getSession();
    if (requiredRole && local && local.role !== requiredRole) return null;
    if (!local?.identifiant) return null;

    const synced = syncSessionWithAccount(requiredRole) || local;

    if (typeof EVOSU_API !== "undefined") {
      try {
        const online = await EVOSU_API.ensureOnline();
        if (online && typeof EVOSU_API.me === "function") {
          const serverSession = await EVOSU_API.me({ soft: true });
          if (serverSession) {
            if (requiredRole && serverSession.role !== requiredRole) return null;
            saveSession(serverSession);
            clearPostRegistration();
            return serverSession;
          }
        }
      } catch {
        /* conserver la session locale */
      }
    }

    return synced;
  }

  /**
   * Vérifie la session : JWT serveur obligatoire si l'API est joignable.
   */
  async function verifySession(requiredRole) {
    const local = getSession();

    if (requiredRole && local && local.role !== requiredRole) {
      clearSession();
      return null;
    }

    const apiOnline =
      typeof EVOSU_API !== "undefined" && (await EVOSU_API.ensureOnline());

    if (apiOnline) {
      if (local && isFreshApiRegistration(local, requiredRole)) {
        saveSession(local);
        scheduleSessionSync(local);
        return local;
      }

      try {
        const serverSession = await EVOSU_API.me();
        if (requiredRole && serverSession.role !== requiredRole) {
          clearSession();
          return null;
        }
        saveSession(serverSession);
        clearPostRegistration();
        return serverSession;
      } catch {
        let recovered = false;
        if (typeof EVOSU_API.refresh === "function") {
          recovered = await EVOSU_API.refresh();
        }
        if (recovered) {
          try {
            const serverSession = await EVOSU_API.me();
            if (requiredRole && serverSession.role !== requiredRole) {
              clearSession();
              return null;
            }
            saveSession(serverSession);
            clearPostRegistration();
            return serverSession;
          } catch {
            /* fall through */
          }
        }

        if (local && isFreshApiRegistration(local, requiredRole)) {
          saveSession(local);
          scheduleSessionSync(local);
          return local;
        }

        if (
          local &&
          isServerSession(local) &&
          typeof EVOSU_API.hasAuthTokens === "function" &&
          EVOSU_API.hasAuthTokens()
        ) {
          return local;
        }

        if (canKeepLocalSession(local, requiredRole)) {
          return syncSessionWithAccount(requiredRole) || local;
        }

        clearSession();
        if (typeof EVOSU_API !== "undefined" && typeof EVOSU_API.clearClientSession === "function") {
          EVOSU_API.clearClientSession();
        }
        return null;
      }
    }

    if (!allowLocalAuth()) {
      if (local && canKeepLocalSession(local, requiredRole)) {
        return syncSessionWithAccount(requiredRole) || local;
      }
      if (local) clearSession();
      return null;
    }

    if (!local?.identifiant) return null;
    return syncSessionWithAccount(requiredRole);
  }

  /**
   * Garde d'entrée dashboard — vérifie le rôle et l'authentification serveur.
   */
  async function guard(requiredRole) {
    const session = await verifySession(requiredRole);
    if (!session) {
      window.location.replace(loginUrl(requiredRole));
      return null;
    }
    if (typeof EVOSU_PORTAL !== "undefined" && EVOSU_PORTAL.redirectIfWrongRole(session)) {
      return null;
    }
    if (typeof EVOSU_SECTION_APPROVAL !== "undefined") {
      const enriched = EVOSU_SECTION_APPROVAL.enrichSession(session);
      if (EVOSU_SECTION_APPROVAL.shouldBlockDashboard(enriched)) {
        EVOSU_SECTION_APPROVAL.redirectPending(enriched);
        return null;
      }
      return enriched;
    }
    return session;
  }

  /** Déconnexion unique — seul moyen d'effacer la session */
  async function logout(redirectTo) {
    if (typeof EVOSU_API !== "undefined") {
      try {
        await EVOSU_API.logout();
      } catch {
        clearSession();
      }
    } else {
      clearSession();
    }
    window.location.href = redirectTo || "index.html";
  }

  async function redirectIfAuthenticated(preferredRole) {
    const wanted = preferredRole ? String(preferredRole).trim() : "";
    const session = await verifySession(wanted || null);
    if (!session || !DASHBOARDS[session.role]) return false;
    if (wanted && wanted !== session.role) return false;
    if (
      typeof EVOSU_SECTION_APPROVAL !== "undefined" &&
      EVOSU_SECTION_APPROVAL.shouldBlockDashboard(session)
    ) {
      EVOSU_SECTION_APPROVAL.redirectPending(session);
      return true;
    }
    window.location.replace(dashboardUrl(session.role));
    return true;
  }

  return {
    DASHBOARDS,
    getSession,
    saveSession,
    clearSession,
    markPostRegistration,
    clearPostRegistration,
    loginUrl,
    dashboardUrl,
    isLoggedIn,
    allowLocalAuth,
    getActiveSession,
    restoreSession,
    resolveNavigationSession,
    verifySession,
    syncSessionWithAccount,
    guard,
    logout,
    redirectIfAuthenticated,
  };
})();

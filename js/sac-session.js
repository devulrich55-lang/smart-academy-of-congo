/**
 * Session — cookies JWT (API) + cache local ; repli localStorage réservé au dev localhost
 */
const SAC_SESSION = (function () {
  const DASHBOARDS = {
    etudiant: "dashboard-etudiant.html",
    professeur: "dashboard-professeur.html",
    assistant: "dashboard-assistant.html",
    universite: "dashboard-universite.html",
    section: "dashboard-section.html",
  };

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem("sac_session") || "null");
    } catch {
      return null;
    }
  }

  function saveSession(session) {
    localStorage.setItem("sac_session", JSON.stringify(session));
  }

  function clearSession() {
    localStorage.removeItem("sac_session");
  }

  function loginUrl(role) {
    const r = role || "etudiant";
    return "connexion.html?role=" + encodeURIComponent(r);
  }

  function dashboardUrl(role) {
    return DASHBOARDS[role] || "index.html";
  }

  function isLoggedIn() {
    const session = getSession();
    return !!(session && session.role && session.identifiant);
  }

  function allowLocalAuth() {
    if (typeof SAC_API !== "undefined" && typeof SAC_API.allowOfflineAuth === "function") {
      return SAC_API.allowOfflineAuth();
    }
    const h = window.location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  }

  function isServerSession(session) {
    if (!session) return false;
    if (session.authSource === "api") return true;
    return !!(session.userId && session.userId !== session.identifiant);
  }

  /** Session active pour les pages publiques (sans effacer si rôle différent) */
  function getActiveSession() {
    const session = getSession();
    if (!session || !session.role || !session.identifiant) return null;
    if (isServerSession(session)) return session;
    if (typeof SAC_IDENTITY === "undefined") return session;

    const users = SAC_IDENTITY.getLocalUsers();
    const user = SAC_IDENTITY.findUserByLoginId(users, session.identifiant);
    if (!user) return allowLocalAuth() ? session : null;

    const canonical = SAC_IDENTITY.buildSessionFromUser(user);
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
    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
      try {
        return await SAC_API.me();
      } catch {
        clearSession();
        return null;
      }
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

    if (typeof SAC_IDENTITY === "undefined") {
      return allowLocalAuth() ? session : null;
    }

    const users = SAC_IDENTITY.getLocalUsers();
    const user = SAC_IDENTITY.findUserByLoginId(users, session.identifiant);
    if (!user) {
      if (!allowLocalAuth()) {
        clearSession();
        return null;
      }
      return session;
    }

    const canonical = SAC_IDENTITY.buildSessionFromUser(user);
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
   * Vérifie la session : JWT serveur obligatoire si l'API est joignable.
   */
  async function verifySession(requiredRole) {
    const local = getSession();

    if (requiredRole && local && local.role !== requiredRole) {
      clearSession();
      return null;
    }

    const apiOnline =
      typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline());

    if (apiOnline) {
      try {
        const serverSession = await SAC_API.me();
        if (requiredRole && serverSession.role !== requiredRole) {
          clearSession();
          return null;
        }
        saveSession(serverSession);
        return serverSession;
      } catch {
        clearSession();
        return null;
      }
    }

    if (!allowLocalAuth()) {
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
      window.location.href = loginUrl(requiredRole);
      return null;
    }
    return session;
  }

  /** Déconnexion unique — seul moyen d'effacer la session */
  async function logout(redirectTo) {
    if (typeof SAC_API !== "undefined") {
      try {
        await SAC_API.logout();
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
    window.location.replace(dashboardUrl(session.role));
    return true;
  }

  return {
    DASHBOARDS,
    getSession,
    saveSession,
    clearSession,
    loginUrl,
    dashboardUrl,
    isLoggedIn,
    allowLocalAuth,
    getActiveSession,
    restoreSession,
    verifySession,
    syncSessionWithAccount,
    guard,
    logout,
    redirectIfAuthenticated,
  };
})();

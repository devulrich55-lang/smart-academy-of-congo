/**
 * Registre serveur SAC — migration des comptes locaux vers l'API.
 * Tous les comptes campus (étudiant, professeur, assistant, section) doivent
 * exister sur le serveur ; les anciens comptes localStorage sont provisionnés
 * automatiquement à la connexion avec le mot de passe saisi.
 */
const SAC_ACCOUNT_REGISTRY = (function () {
  const CAMPUS_ROLES = ["etudiant", "professeur", "assistant", "section"];

  function normalizeEmail(email) {
    if (typeof SAC_IDENTITY !== "undefined" && SAC_IDENTITY.normalizeEmail) {
      return SAC_IDENTITY.normalizeEmail(email);
    }
    return String(email || "").trim().toLowerCase();
  }

  function buildPayload(user, password) {
    const src = { ...user, password };
    delete src.passwordHash;
    if (typeof SAC_UNIVERSITIES !== "undefined" && SAC_UNIVERSITIES.normalizeProfileCampus) {
      SAC_UNIVERSITIES.normalizeProfileCampus(src);
    }
    if (typeof SAC_API !== "undefined" && SAC_API.buildRegisterPayload) {
      return SAC_API.buildRegisterPayload(src);
    }
    return src;
  }

  function loginExtra(user) {
    return {
      universite:
        user.universite ||
        user.universiteLocked ||
        user.sigle ||
        user.codeUni ||
        null,
      codeUni: user.codeUni || null,
    };
  }

  function markSynced(email) {
    if (!email || typeof SAC_IDENTITY === "undefined") return;
    const key = normalizeEmail(email);
    const users = SAC_IDENTITY.getLocalUsers();
    let changed = false;
    users.forEach((u, i) => {
      if (normalizeEmail(u.email) === key) {
        users[i] = {
          ...u,
          serverSynced: true,
          authSource: "api",
          syncedAt: new Date().toISOString(),
        };
        changed = true;
      }
    });
    if (changed) {
      localStorage.setItem("sac_users", JSON.stringify(users));
    }
  }

  function listUnsyncedLocalUsers() {
    if (typeof SAC_IDENTITY === "undefined") return [];
    return SAC_IDENTITY.getLocalUsers().filter(
      (u) => CAMPUS_ROLES.includes(u.role) && !u.serverSynced
    );
  }

  async function isOnline() {
    return typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline());
  }

  async function provisionOnServer(user, password) {
    if (!(await isOnline())) {
      throw new Error(
        "Connexion au serveur obligatoire. Les comptes doivent être enregistrés sur le serveur SAC."
      );
    }
    const payload = buildPayload(user, password);
    if (!payload.telephone) {
      throw new Error(
        "Numéro de téléphone manquant sur ce compte local. Contactez l'administration pour compléter le profil."
      );
    }
    if (typeof SAC_API.provisionAccount === "function") {
      return SAC_API.provisionAccount(payload);
    }
    return SAC_API.register(payload);
  }

  async function ensureServerAccount(user, password, extra) {
    if (!user?.email || !password) {
      throw new Error("E-mail et mot de passe requis.");
    }
    const extraLogin = {
      ...loginExtra(user),
      ...(extra || {}),
    };
    try {
      const session = await SAC_API.login(user.email, password, user.role, extraLogin);
      markSynced(user.email);
      return { action: "login", session };
    } catch (loginErr) {
      const code = loginErr.code || "";
      if (code !== "INVALID_CREDENTIALS" && code !== "USER_NOT_FOUND" && loginErr.status !== 401) {
        if (SAC_API.isDuplicateRegistrationError && SAC_API.isDuplicateRegistrationError(loginErr)) {
          throw loginErr;
        }
        if (code && code !== "ROLE_MISMATCH" && code !== "UNIVERSITY_MISMATCH") {
          throw loginErr;
        }
      }
    }

    try {
      await provisionOnServer(user, password);
      markSynced(user.email);
      const session = await SAC_API.login(user.email, password, user.role, extraLogin);
      return { action: "provisioned", session };
    } catch (provErr) {
      if (SAC_API.isDuplicateRegistrationError && SAC_API.isDuplicateRegistrationError(provErr)) {
        const session = await SAC_API.login(user.email, password, user.role, extraLogin);
        markSynced(user.email);
        return { action: "login", session };
      }
      throw provErr;
    }
  }

  async function migrateLocalUserAtLogin(identifier, password, role, extra) {
    if (!(await isOnline()) || typeof SAC_IDENTITY === "undefined") {
      return null;
    }
    const found = SAC_IDENTITY.findUserByLoginId(SAC_IDENTITY.getLocalUsers(), identifier);
    if (!found || found.role !== role) {
      return null;
    }
    if (found.serverSynced) {
      return null;
    }
    const cred = await SAC_IDENTITY.verifyLoginCredentials(found, password);
    if (!cred.ok) {
      return null;
    }
    return ensureServerAccount(found, password, extra);
  }

  return {
    markSynced,
    listUnsyncedLocalUsers,
    provisionOnServer,
    ensureServerAccount,
    migrateLocalUserAtLogin,
  };
})();

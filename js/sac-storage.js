/**
 * Couche stockage client — audit, migration legacy, API centralisée sac_users / sac_session.
 * Complète sac-client-guard (sanitisation) sans casser le repli local localhost.
 */
const SAC_STORAGE = (function () {
  "use strict";

  var USERS_KEY = "sac_users";
  var LEGACY_USERS_KEY = "EVOSU_users";
  var SESSION_KEY = "sac_session";
  var LEGACY_SESSION_KEYS = ["EVOSU_session", "SAC_session"];

  var TIERS = {
    critical: [
      USERS_KEY,
      LEGACY_USERS_KEY,
      SESSION_KEY,
      "sac_api_access",
      "sac_api_refresh",
    ],
    preference: [
      "sac_theme",
      "sac_lang",
      "sac_i18n_lang",
      "evosu_remember_devcenter",
      "evosu_remember_techmanager",
      "evosu_remember_evomonitor",
      "sac_africa_country",
      "sac_portal_prefs",
    ],
    cache: [
      "sac_home_news",
      "sac_home_stats_cache",
      "sac_platform_grades",
      "sac_grade_sheets",
      "sac_grade_bulletins",
      "sac_library_items",
      "sac_library_purchases",
      "sac_documents",
      "sac_pwa_installed",
      "sac_pwa_ios_hint",
    ],
  };

  function isLocalDev() {
    var h = (window.location && window.location.hostname) || "";
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  }

  function scrubSession(session) {
    if (typeof SAC_CLIENT_GUARD !== "undefined" && SAC_CLIENT_GUARD.scrubSession) {
      return SAC_CLIENT_GUARD.scrubSession(session).session;
    }
    if (!session || typeof session !== "object") return session;
    var copy = Object.assign({}, session);
    ["password", "_pwd", "accessToken", "refreshToken", "token", "jwt"].forEach(function (f) {
      delete copy[f];
    });
    return copy;
  }

  function scrubUserForPersist(user) {
    if (!user || typeof user !== "object") return user;
    if (typeof SAC_CLIENT_GUARD !== "undefined" && SAC_CLIENT_GUARD.scrubUser) {
      return SAC_CLIENT_GUARD.scrubUser(user).user;
    }
    var copy = Object.assign({}, user);
    if (!isLocalDev()) {
      delete copy.password;
      delete copy._pwd;
      delete copy.pwd;
    }
    return copy;
  }

  function shouldKeepLocalUser(user) {
    if (isLocalDev()) return true;
    if (!user || typeof user !== "object") return false;
    if (user.serverSynced || user.authSource === "api") return false;
    return true;
  }

  function normalizeUsersList(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter(shouldKeepLocalUser)
      .map(scrubUserForPersist);
  }

  function getLocalUsers() {
    try {
      return JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
    } catch (_) {
      return [];
    }
  }

  function persistLocalUsers(users) {
    var normalized = normalizeUsersList(Array.isArray(users) ? users : []);
    localStorage.setItem(USERS_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function getSessionMeta() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch (_) {
      return null;
    }
  }

  function saveSessionMeta(session) {
    if (!session) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    var safe = scrubSession(session);
    localStorage.setItem(SESSION_KEY, JSON.stringify(safe));
    return safe;
  }

  function migrateLegacySessions() {
    if (localStorage.getItem(SESSION_KEY)) return false;
    var i;
    for (i = 0; i < LEGACY_SESSION_KEYS.length; i++) {
      var raw = localStorage.getItem(LEGACY_SESSION_KEYS[i]);
      if (!raw) continue;
      try {
        saveSessionMeta(JSON.parse(raw));
        localStorage.removeItem(LEGACY_SESSION_KEYS[i]);
        return true;
      } catch (_) {}
    }
    return false;
  }

  function purgeLegacyUserStore() {
    if (isLocalDev()) return;
    try {
      var legacy = localStorage.getItem(LEGACY_USERS_KEY);
      if (!legacy) return;
      var list = JSON.parse(legacy);
      if (!Array.isArray(list) || !list.length) {
        localStorage.removeItem(LEGACY_USERS_KEY);
        return;
      }
      var current = getLocalUsers();
      var merged = current.slice();
      var seen = {};
      merged.forEach(function (u) {
        if (u && u.email) seen[String(u.email).toLowerCase()] = true;
      });
      list.forEach(function (u) {
        if (!u || !u.email) return;
        var k = String(u.email).toLowerCase();
        if (!seen[k] && shouldKeepLocalUser(u)) {
          merged.push(u);
          seen[k] = true;
        }
      });
      persistLocalUsers(merged);
      localStorage.removeItem(LEGACY_USERS_KEY);
    } catch (_) {}
  }

  function classifyKey(key) {
    if (TIERS.critical.indexOf(key) !== -1) return "critical";
    if (TIERS.preference.indexOf(key) !== -1) return "preference";
    if (TIERS.cache.indexOf(key) !== -1) return "cache";
    if (/^sac_|^EVOSU_|^evosu_/.test(key)) return "cache";
    return "other";
  }

  function audit() {
    var report = {
      at: new Date().toISOString(),
      hostname: window.location.hostname,
      isLocalDev: isLocalDev(),
      totalKeys: localStorage.length,
      byTier: { critical: [], preference: [], cache: [], other: [] },
      risks: [],
      stats: {
        localUsers: 0,
        syncedUsersLocal: 0,
        legacyUsersKey: !!localStorage.getItem(LEGACY_USERS_KEY),
      },
    };

    var i;
    for (i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (!key) continue;
      var tier = classifyKey(key);
      var raw = localStorage.getItem(key) || "";
      report.byTier[tier].push({
        key: key,
        bytes: raw.length,
      });
    }

    try {
      var users = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
      if (Array.isArray(users)) {
        report.stats.localUsers = users.length;
        users.forEach(function (u) {
          if (u && (u.serverSynced || u.authSource === "api")) {
            report.stats.syncedUsersLocal++;
          }
          if (u && (u.password || u._pwd)) {
            report.risks.push("Mot de passe en clair dans sac_users (" + (u.email || "?") + ")");
          }
          if (u && u.passwordHash && !isLocalDev()) {
            report.risks.push("Hash mot de passe local restant (" + (u.email || "?") + ")");
          }
        });
      }
    } catch (_) {}

    try {
      var sess = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (sess && (sess.password || sess.accessToken || sess.refreshToken || sess.token)) {
        report.risks.push("Données sensibles dans sac_session");
      }
    } catch (_) {}

    if (report.stats.syncedUsersLocal > 0 && !isLocalDev()) {
      report.risks.push(
        report.stats.syncedUsersLocal + " compte(s) API encore présents dans sac_users"
      );
    }

    return report;
  }

  function runMaintenance() {
    migrateLegacySessions();
    purgeLegacyUserStore();
    persistLocalUsers(getLocalUsers());
    if (typeof SAC_CLIENT_GUARD !== "undefined" && SAC_CLIENT_GUARD.sanitizeExistingStorage) {
      SAC_CLIENT_GUARD.sanitizeExistingStorage();
    }
  }

  runMaintenance();

  if (isLocalDev()) {
    try {
      var summary = audit();
      if (summary.risks.length) {
        console.info("[EvoSU Storage] Audit local — risques:", summary.risks);
      }
    } catch (_) {}
  }

  return {
    USERS_KEY: USERS_KEY,
    SESSION_KEY: SESSION_KEY,
    getLocalUsers: getLocalUsers,
    persistLocalUsers: persistLocalUsers,
    getSessionMeta: getSessionMeta,
    saveSessionMeta: saveSessionMeta,
    audit: audit,
    runMaintenance: runMaintenance,
    isLocalDev: isLocalDev,
  };
})();

if (typeof window !== "undefined") {
  window.SAC_STORAGE = SAC_STORAGE;
}

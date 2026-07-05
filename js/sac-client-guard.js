/**
 * Garde client défensive — réduit le vol localStorage (stealStorage).
 * N'altère pas auth API (JWT en sessionStorage / cookies httpOnly).
 */
const SAC_CLIENT_GUARD = (function () {
  "use strict";

  var USER_KEYS = ["sac_users", "EVOSU_users"];
  var SESSION_KEYS = ["sac_session", "EVOSU_session", "SAC_session"];
  var SENSITIVE_USER_FIELDS = ["password", "_pwd", "pwd", "motDePasse"];
  var SENSITIVE_SESSION_FIELDS = [
    "password",
    "_pwd",
    "accessToken",
    "refreshToken",
    "token",
    "jwt",
  ];

  var installed = false;
  var stats = { usersScrubbed: 0, sessionsScrubbed: 0, writesBlocked: 0 };

  function isLocalDev() {
    var h = (window.location && window.location.hostname) || "";
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  }

  function shouldScrubPasswords() {
    return !isLocalDev();
  }

  function isPlainObject(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
  }

  function scrubUser(user) {
    if (!isPlainObject(user)) return { user: user, changed: false };
    var copy = Object.assign({}, user);
    var changed = false;
    if (shouldScrubPasswords()) {
      for (var i = 0; i < SENSITIVE_USER_FIELDS.length; i++) {
        var f = SENSITIVE_USER_FIELDS[i];
        if (copy[f] !== undefined) {
          delete copy[f];
          changed = true;
        }
      }
    }
    return { user: copy, changed: changed };
  }

  function scrubUsersList(list) {
    if (!Array.isArray(list)) return { list: list, changed: false, count: 0 };
    var changed = false;
    var count = 0;
    var next = list.map(function (u) {
      var r = scrubUser(u);
      if (r.changed) {
        changed = true;
        count++;
      }
      return r.user;
    });
    return { list: next, changed: changed, count: count };
  }

  function scrubSession(session) {
    if (!isPlainObject(session)) return { session: session, changed: false };
    var copy = Object.assign({}, session);
    var changed = false;
    for (var i = 0; i < SENSITIVE_SESSION_FIELDS.length; i++) {
      var f = SENSITIVE_SESSION_FIELDS[i];
      if (copy[f] !== undefined) {
        delete copy[f];
        changed = true;
      }
    }
    return { session: copy, changed: changed };
  }

  function sanitizeValueForKey(key, raw) {
    if (typeof raw !== "string") return raw;
    try {
      if (USER_KEYS.indexOf(key) !== -1) {
        var users = JSON.parse(raw);
        var ur = scrubUsersList(users);
        if (ur.changed) {
          stats.usersScrubbed += ur.count;
          stats.writesBlocked++;
          return JSON.stringify(ur.list);
        }
        return raw;
      }
      if (SESSION_KEYS.indexOf(key) !== -1) {
        var sess = JSON.parse(raw);
        var sr = scrubSession(sess);
        if (sr.changed) {
          stats.sessionsScrubbed++;
          stats.writesBlocked++;
          return JSON.stringify(sr.session);
        }
        return raw;
      }
    } catch (_) {
      return raw;
    }
    return raw;
  }

  function sanitizeExistingStorage() {
    var i;
    for (i = 0; i < USER_KEYS.length; i++) {
      var uk = USER_KEYS[i];
      try {
        var rawUsers = localStorage.getItem(uk);
        if (!rawUsers) continue;
        var parsed = JSON.parse(rawUsers);
        var res = scrubUsersList(parsed);
        if (res.changed) {
          localStorage.setItem(uk, JSON.stringify(res.list));
          stats.usersScrubbed += res.count;
        }
      } catch (_) {}
    }
    for (i = 0; i < SESSION_KEYS.length; i++) {
      var sk = SESSION_KEYS[i];
      try {
        var rawSess = localStorage.getItem(sk);
        if (!rawSess) continue;
        var parsedS = JSON.parse(rawSess);
        var sres = scrubSession(parsedS);
        if (sres.changed) {
          localStorage.setItem(sk, JSON.stringify(sres.session));
          stats.sessionsScrubbed++;
        }
      } catch (_) {}
    }
  }

  function installStorageGuard() {
    if (installed || typeof Storage === "undefined") return;
    installed = true;

    var nativeSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage) {
        value = sanitizeValueForKey(key, String(value));
      }
      return nativeSet.call(this, key, value);
    };
  }

  /** Détecte un remplacement suspect du presse-papiers (crypto hijacking). */
  function watchClipboardIntegrity() {
    if (!navigator.clipboard || typeof document.addEventListener !== "function") return;

    var CRYPTO_RE =
      /^(0x[a-fA-F0-9]{40}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{25,90}|T[A-Za-z1-9]{33})$/;

    document.addEventListener(
      "copy",
      function () {
        var sel = "";
        try {
          sel = (window.getSelection && window.getSelection().toString()) || "";
        } catch (_) {}
        sel = sel.trim();
        if (!sel || !CRYPTO_RE.test(sel)) return;

        setTimeout(function () {
          if (!navigator.clipboard || !navigator.clipboard.readText) return;
          navigator.clipboard
            .readText()
            .then(function (clip) {
              clip = (clip || "").trim();
              if (!clip || clip === sel || !CRYPTO_RE.test(clip)) return;
              console.warn(
                "[EvoSU Sécurité] Adresse crypto modifiée après copie — vérifiez le presse-papiers."
              );
            })
            .catch(function () {});
        }, 200);
      },
      true
    );
  }

  function init() {
    sanitizeExistingStorage();
    installStorageGuard();
    watchClipboardIntegrity();
  }

  init();

  return {
    sanitizeExistingStorage: sanitizeExistingStorage,
    scrubUser: scrubUser,
    scrubSession: scrubSession,
    stats: stats,
  };
})();

if (typeof window !== "undefined") {
  window.SAC_CLIENT_GUARD = SAC_CLIENT_GUARD;
}

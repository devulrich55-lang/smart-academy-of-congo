/**
 * Client API sécurisé — Evo-smartUni
 * Cross-origin Render : jetons Bearer (CROSS_ORIGIN_AUTH) — pas de cookies tiers.
 */
const SAC_API = (function () {
  const RENDER_API_DIRECT = "https://smart-academy-of-congo-api-1.onrender.com";
  let baseResolved = false;

  let BASE = (function () {
    if (typeof window === "undefined") return "";

    const normalize = (value) => String(value || "").trim().replace(/\/+$/, "");

    const fromGlobal = normalize(window.SAC_API_BASE);
    if (fromGlobal) return fromGlobal;

    if (typeof window !== "undefined" && window.SAC_NATIVE_APP) {
      return RENDER_API_DIRECT;
    }

    const meta = document.querySelector('meta[name="sac-api-base"]');
    const fromMeta = normalize(meta && meta.getAttribute("content"));
    if (fromMeta) return fromMeta;

    const { protocol, hostname, port } = window.location;

    // Render : sac-config.js définit l'URL ; resolveApiBase() choisit proxy ou direct
    if (hostname.endsWith(".onrender.com") && hostname.indexOf("-api") === -1) {
      return RENDER_API_DIRECT;
    }
    const isLocalHost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]";

    const BACKEND_PORT = "8000";

    // Autres domaines sans SAC_API_BASE : repli same-origin /api (local via FastAPI).
    if (!isLocalHost) return "";

    // Frontend servi par FastAPI sur le port 8000 → API same-origin.
    if (!port || port === BACKEND_PORT) return "";

    // Live Server (5500), Vite, etc. → backend uvicorn sur 8000.
    return `${protocol}//${hostname}:${BACKEND_PORT}`;
  })();

  if (typeof window !== "undefined" && window.location.protocol === "file:") {
    console.warn(
      "[EvoSU] Ouvrez le site via http://localhost:8000 (double-clic sur start-local.bat), pas en ouvrant le fichier HTML directement."
    );
  }

  function isLocalDevHost() {
    if (typeof window === "undefined") return false;
    const { hostname, protocol } = window.location;
    if (protocol === "file:") return false;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  }

  /** Repli auth localStorage — uniquement en dev local hors ligne */
  function allowOfflineAuth() {
    return isLocalDevHost();
  }

  function tagApiSession(session) {
    if (!session) return null;
    const tagged = {
      ...session,
      authSource: "api",
      connectedAt: session.connectedAt || new Date().toISOString(),
    };
    if (tagged.countryCode) {
      tagged.countryCode = String(tagged.countryCode).toUpperCase();
    } else if (
      tagged.role === "universite" &&
      tagged.universite &&
      typeof SAC_UNIVERSITIES !== "undefined" &&
      SAC_UNIVERSITIES.getCountryCode
    ) {
      tagged.countryCode = SAC_UNIVERSITIES.getCountryCode(tagged.universite);
    }
    if (
      tagged.logoUrl &&
      tagged.role === "universite" &&
      typeof SAC_UNIVERSITY_LOGO !== "undefined"
    ) {
      SAC_UNIVERSITY_LOGO.registerForUniversity(tagged);
    } else if (
      tagged.universite &&
      typeof SAC_UNIVERSITY_LOGO !== "undefined" &&
      typeof SAC_UNIVERSITY_LOGO.ensureCampusLogo === "function"
    ) {
      SAC_UNIVERSITY_LOGO.ensureCampusLogo(tagged.universite).catch(() => {});
    }
    return tagged;
  }

  const TOKEN_ACCESS = "sac_access_token";
  const TOKEN_REFRESH = "sac_refresh_token";

  const ERROR_MESSAGES = {
    USER_NOT_FOUND:
      "Votre session n'est plus valide (serveur redémarré ou compte supprimé). Déconnectez-vous puis reconnectez-vous.",
    AUTH_REQUIRED: "Connexion requise — veuillez vous reconnecter.",
    TOKEN_EXPIRED: "Session expirée — veuillez vous reconnecter.",
    FORBIDDEN: "Action non autorisée.",
    NOT_FOUND: "Publication introuvable ou accès refusé.",
    STUDENT_NOT_FOUND:
      "Étudiant introuvable sur le serveur — il doit d'abord terminer son inscription en ligne.",
    CORS_BLOCKED: "Origine non autorisée — contactez l'administrateur (CORS).",
    NETWORK_ERROR: "Connexion au serveur impossible — l'API se réveille, réessayez dans 1 minute.",
  };

  function apiErrorMessage(data, status) {
    if (typeof data?.detail === "string" && data.detail.trim()) {
      return data.detail.trim();
    }
    const payload =
      data && data.detail && typeof data.detail === "object" && !Array.isArray(data.detail)
        ? data.detail
        : data;
    const code = payload && payload.error;
    const msg =
      (payload && payload.message) || ERROR_MESSAGES[code] || code || "";
    if (msg) return msg;
    if (status === 500) {
      return "Erreur serveur API — vérifiez les Logs de API-1 sur Render (réseau social).";
    }
    if (status === 404) {
      if (code === "STUDENT_NOT_FOUND") return msg;
      if (typeof data?.detail === "string" && /^not found$/i.test(data.detail.trim())) {
        return "Fonction API absente — redéployez API-1 sur Render (route sections/approval).";
      }
      return msg || "Fonction indisponible sur l'API — redéployez backend-python (API-1).";
    }
    if (status === 405) {
      return "Méthode refusée par l'API — redéployez API-1 et congoat, puis reconnectez-vous.";
    }
    return "Erreur serveur";
  }

  function isCrossOriginApi() {
    if (!BASE || typeof window === "undefined") return false;
    try {
      return new URL(BASE).origin !== window.location.origin;
    } catch {
      return false;
    }
  }

  /** Render (proxy /api) : même origine mais JWT Bearer (CROSS_ORIGIN_AUTH côté API). */
  function isRenderFrontend() {
    if (typeof window === "undefined") return false;
    const host = window.location.hostname || "";
    if (host === "evosmartuni.com" || host === "www.evosmartuni.com") return true;
    return host.endsWith(".onrender.com") && host.indexOf("-api") === -1;
  }

  function useBearerAuth() {
    return isCrossOriginApi() || isRenderFrontend() || !!(typeof window !== "undefined" && window.SAC_NATIVE_APP);
  }

  /** Node (proxy /api) si dispo, sinon API directe (Static Site + CORS). */
  async function resolveApiBase(force) {
    if (!isRenderFrontend()) return BASE;
    const proxyOrigin =
      (typeof window !== "undefined" && window.SAC_API_PROXY_ORIGIN) ||
      (typeof window !== "undefined" ? window.location.origin.replace(/\/+$/, "") : "");

    async function tryHealth(baseUrl, attempts, timeoutMs) {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          const res = await fetchWithTimeout(
            baseUrl + "/api/health",
            { method: "GET", credentials: "omit", mode: "cors" },
            attempt === 0 ? timeoutMs : Math.max(timeoutMs, 45000)
          );
          const ct = (res.headers.get("content-type") || "").toLowerCase();
          if (ct && !ct.includes("json") && !ct.includes("javascript")) continue;
          let data = {};
          try {
            data = await res.json();
          } catch {
            continue;
          }
          if (
            res.ok ||
            (data && typeof data === "object" && ("ok" in data || "database" in data))
          ) {
            return true;
          }
        } catch {
          if (attempt < attempts - 1) {
            await new Promise((r) => setTimeout(r, force ? 4000 : 3000));
          }
        }
      }
      return false;
    }

    if (proxyOrigin && (force || !baseResolved)) {
      const proxyOk = await tryHealth(proxyOrigin, force ? 4 : 2, force ? 55000 : 25000);
      if (proxyOk) {
        BASE = proxyOrigin;
        if (typeof window !== "undefined") window.SAC_API_BASE = proxyOrigin;
        baseResolved = true;
        return BASE;
      }
    }

    if (!force && baseResolved && BASE === proxyOrigin) {
      return BASE;
    }

    const directOk = await tryHealth(RENDER_API_DIRECT, force ? 6 : 2, force ? 60000 : 30000);
    if (directOk) {
      BASE = RENDER_API_DIRECT;
      if (typeof window !== "undefined") window.SAC_API_BASE = RENDER_API_DIRECT;
      baseResolved = true;
      return BASE;
    }

    if (proxyOrigin) {
      BASE = proxyOrigin;
      if (typeof window !== "undefined") window.SAC_API_BASE = proxyOrigin;
    }
    baseResolved = true;
    return BASE;
  }

  function isMobileClient() {
    if (typeof navigator === "undefined") return false;
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "");
  }

  function networkErrorMessage(netErr) {
    const msg = String(netErr?.message || netErr || "");
    if (useBearerAuth() && !hasAuthTokens() && getStoredSession()?.identifiant) {
      return "Session expirée — déconnectez-vous puis reconnectez-vous.";
    }
    if (msg === "Load failed" || msg === "Failed to fetch" || netErr?.name === "AbortError") {
      return "Connexion au serveur impossible — vérifiez le réseau ou réessayez.";
    }
    return msg || "Erreur réseau";
  }

  function wakeDefaults(force) {
    const mobile = isMobileClient();
    if (force) {
      return mobile
        ? { attempts: 4, timeoutMs: 18000, delayMs: 3000 }
        : { attempts: 8, timeoutMs: 55000, delayMs: 5000 };
    }
    return mobile
      ? { attempts: 3, timeoutMs: 15000, delayMs: 2500 }
      : { attempts: 5, timeoutMs: 45000, delayMs: 4000 };
  }

  function saveApiTokens(accessToken, refreshToken) {
    if (!useBearerAuth()) return;
    if (accessToken) sessionStorage.setItem(TOKEN_ACCESS, accessToken);
    if (refreshToken) sessionStorage.setItem(TOKEN_REFRESH, refreshToken);
  }

  function hasAuthTokens() {
    if (!useBearerAuth()) return true;
    return !!(
      sessionStorage.getItem(TOKEN_ACCESS) || sessionStorage.getItem(TOKEN_REFRESH)
    );
  }

  /** Connexion de secours si l'inscription n'a pas renvoyé de jetons (cross-origin). */
  async function ensureAuthTokens(credentials) {
    if (!useBearerAuth() || hasAuthTokens() || !credentials) return hasAuthTokens();
    const { identifier, password, role, extra = {} } = credentials;
    if (!identifier || !password) return false;
    try {
      await login(identifier, password, role, extra);
      return hasAuthTokens();
    } catch {
      return false;
    }
  }

  /** Restaure les JWT (sessionStorage) si sac_session existe encore — indispensable sur Render. */
  async function ensureApiSession(opts) {
    if (!useBearerAuth()) return true;
    if (hasAuthTokens()) return true;
    const sess = getStoredSession();
    if (!sess?.identifiant || sess.authSource === "local") return false;
    if (!sessionStorage.getItem(TOKEN_REFRESH)) return false;
    return refresh({ soft: !!(opts && opts.soft) });
  }

  function apiCredentials() {
    return useBearerAuth() ? "omit" : "include";
  }

  function apiJsonHeaders(extra) {
    const headers = Object.assign({}, extra || {});
    if (!useBearerAuth()) {
      headers.Accept = "application/json";
    }
    return headers;
  }

  function getAuthHeaders() {
    if (!useBearerAuth()) return {};
    const token = sessionStorage.getItem(TOKEN_ACCESS);
    return token ? { Authorization: "Bearer " + token } : {};
  }

  function getAccessToken() {
    if (!useBearerAuth()) return null;
    return sessionStorage.getItem(TOKEN_ACCESS) || null;
  }

  function buildWebSocketUrl(path) {
    const apiBase = BASE || (typeof window !== "undefined" ? window.location.origin : "");
    if (!apiBase) return "";
    const u = new URL(apiBase);
    const protocol = u.protocol === "https:" ? "wss:" : "ws:";
    const cleanPath = path.startsWith("/") ? path : "/" + path;
    let wsUrl = `${protocol}//${u.host}/api${cleanPath}`;
    const token = getAccessToken();
    if (token) {
      wsUrl += "?token=" + encodeURIComponent(token);
    }
    return wsUrl;
  }

  async function postLiveSignal(payload) {
    return request("/webrtc/signal", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function getLiveSignals() {
    const data = await request("/webrtc/signals");
    return data.signals || [];
  }

  async function clearLiveSignal(sessionId) {
    return request("/webrtc/signal/" + encodeURIComponent(sessionId), { method: "DELETE" });
  }

  function clearClientSession(opts) {
    sessionCache = null;
    sessionStorage.removeItem(TOKEN_ACCESS);
    sessionStorage.removeItem(TOKEN_REFRESH);
    if (opts && opts.force) {
      localStorage.removeItem("sac_session");
      return;
    }
    if (isLocalOnlySession()) return;
    localStorage.removeItem("sac_session");
  }

  function getStoredSession() {
    try {
      return JSON.parse(localStorage.getItem("sac_session") || "null");
    } catch {
      return null;
    }
  }

  function persistSessionCache() {
    if (!sessionCache) return null;
    if (typeof SAC_STORAGE !== "undefined" && SAC_STORAGE.saveSessionMeta) {
      return SAC_STORAGE.saveSessionMeta(sessionCache);
    }
    localStorage.setItem("sac_session", JSON.stringify(sessionCache));
    return sessionCache;
  }

  /** Compte connecté sans JWT (recteur / section locale) — ne pas effacer sac_session sur 401. */
  function isLocalOnlySession() {
    if (hasAuthTokens()) return false;
    const s = getStoredSession();
    if (!s?.identifiant) return false;
    if (s.authSource === "local") return true;
    if (s.userId && s.userId !== s.identifiant) return false;
    if (typeof SAC_IDENTITY !== "undefined") {
      const user = SAC_IDENTITY.findUserByLoginId(
        SAC_IDENTITY.getLocalUsers(),
        s.identifiant
      );
      return !!user;
    }
    return false;
  }

  let online = null;
  let ensureOnlineInFlight = null;
  let sessionCache = null;

  function fetchWithTimeout(url, options, ms) {
    var timeout = ms || 45000;
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = controller
      ? setTimeout(function () { controller.abort(); }, timeout)
      : null;
    var opts = Object.assign({}, options || {});
    if (controller) opts.signal = controller.signal;
    return fetch(url, opts).finally(function () {
      if (timer) clearTimeout(timer);
    });
  }

  async function request(path, options = {}) {
    if (isRenderFrontend() && !baseResolved) await resolveApiBase();
    const timeoutMs = options.timeoutMs || 45000;
    const fetchOpts = { ...options };
    delete fetchOpts.timeoutMs;
    let res;
    try {
      res = await fetchWithTimeout(`${BASE}/api${path}`, {
        ...fetchOpts,
        credentials: apiCredentials(),
        headers: apiJsonHeaders({
          ...getAuthHeaders(),
          ...(fetchOpts.body && !(fetchOpts.body instanceof FormData)
            ? { "Content-Type": "application/json" }
            : {}),
          ...fetchOpts.headers,
        }),
      }, timeoutMs);
    } catch (netErr) {
      const err = new Error(networkErrorMessage(netErr));
      err.code = "NETWORK_ERROR";
      throw err;
    }

    let data = {};
    try {
      data = await res.json();
    } catch {
      /* non-json */
    }

    if (res.status === 401 && path !== "/auth/login" && path !== "/auth/refresh" && path !== "/auth/forgot-password" && path !== "/auth/reset-password") {
      const refreshed = await refresh({ soft: options.softAuth });
      if (refreshed) {
        return request(path, options);
      }
      if (!options.softAuth) {
        clearClientSession();
      }
      const authErr = new Error(apiErrorMessage(data, 401) || ERROR_MESSAGES.AUTH_REQUIRED);
      authErr.code = data.error || "AUTH_REQUIRED";
      authErr.status = 401;
      authErr.sessionInvalid = !options.softAuth;
      throw authErr;
    }

    if (!res.ok) {
      const payload =
        data && data.detail && typeof data.detail === "object" && !Array.isArray(data.detail)
          ? data.detail
          : data;
      const err = new Error(apiErrorMessage(data, res.status));
      err.code = payload.error || data.error;
      err.status = res.status;
      if (payload.error === "USER_NOT_FOUND" || payload.error === "TOKEN_EXPIRED") {
        err.sessionInvalid = true;
        if (!options.softAuth) {
          clearClientSession();
        }
      }
      throw err;
    }
    return data;
  }

  async function ping(options) {
    if (typeof window !== "undefined" && window.location.protocol === "file:") {
      online = false;
      return false;
    }
    if (isRenderFrontend() && !baseResolved) await resolveApiBase();
    if (!BASE) {
      online = false;
      return false;
    }

    const opts = options || {};
    const maxAttempts = opts.attempts || 5;
    const timeoutMs = opts.timeoutMs || 45000;
    const delayMs = opts.delayMs || 5000;
    const onAttempt = typeof opts.onAttempt === "function" ? opts.onAttempt : null;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (onAttempt) onAttempt(attempt + 1, maxAttempts);
      try {
        const res = await fetchWithTimeout(
          `${BASE}/api/health`,
          {
            method: "GET",
            credentials: "omit",
            mode: "cors",
          },
          timeoutMs
        );
        let data = {};
        try {
          data = await res.json();
        } catch {
          /* non-json */
        }
        online =
          res.ok ||
          (data &&
            typeof data === "object" &&
            ("ok" in data || "database" in data));
        return online;
      } catch {
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }
    online = false;
    return false;
  }

  async function probeCors() {
    if (!BASE) return { ok: false, error: "NO_API_BASE" };
    try {
      const res = await fetchWithTimeout(
        `${BASE}/api/health`,
        { method: "GET", mode: "cors", credentials: "omit" },
        30000
      );
      const data = await res.json().catch(() => ({}));
      return {
        ok: res.ok && data.ok !== false,
        status: res.status,
        cors: data.cors || null,
        data,
      };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : "NETWORK" };
    }
  }

  /** Distingue API down vs API live mais CORS bloqué (cas fréquent sur Render). */
  async function probeApiReachability() {
    if (!BASE) {
      return { ok: false, scenario: "NO_API", message: "URL API non configurée." };
    }
    const origin =
      typeof window !== "undefined" ? window.location.origin || "" : "";
    try {
      const res = await fetchWithTimeout(
        `${BASE}/api/health`,
        { method: "GET", mode: "cors", credentials: "omit" },
        25000
      );
      const data = await res.json().catch(() => ({}));
      const corsInfo = data.cors || null;
      if (corsInfo && corsInfo.originAllowed === false) {
        return {
          ok: false,
          scenario: "CORS_DENIED",
          message:
            "L'API répond mais refuse votre site.\n→ ALLOWED_ORIGINS=" + origin,
          cors: corsInfo,
          data,
        };
      }
      const healthy =
        res.ok ||
        (data && typeof data === "object" && ("ok" in data || "database" in data));
      if (healthy) {
        online = true;
        return { ok: true, scenario: "OK", data, cors: corsInfo };
      }
      return {
        ok: false,
        scenario: "API_ERROR",
        message: "L'API répond mais signale une erreur (base de données ?).",
        data,
      };
    } catch {
      try {
        await fetchWithTimeout(
          `${BASE}/api/health`,
          { method: "GET", mode: "no-cors", credentials: "omit" },
          20000
        );
        return {
          ok: false,
          scenario: "CORS_BLOCKED",
          message:
            "L'API est EN LIGNE (health OK dans Safari) mais le navigateur bloque les appels.\n\n" +
            "→ Render API-1 → Environment :\n" +
            "ALLOWED_ORIGINS=" +
            origin +
            "\nCROSS_ORIGIN_AUTH=true\n\n" +
            "Puis Manual Deploy API.",
        };
      } catch {
        return {
          ok: false,
          scenario: "UNREACHABLE",
          message:
            "L'API ne répond pas du tout.\n→ Render API-1 → onglet Logs (erreur au démarrage).",
        };
      }
    }
  }

  /** Réveille l'API Render (cold start ~30–90 s) avant connexion / inscription. */
  async function wakeServer(options) {
    return ping(Object.assign({}, wakeDefaults(true), options || {}));
  }

  async function ensureOnline(force, options = {}) {
    const maxWaitMs = options && options.maxWaitMs;

    const run = async () => {
      if (isRenderFrontend()) await resolveApiBase(!!force);
      if (isCrossOriginApi() || force) {
        return wakeServer(Object.assign({}, wakeDefaults(!!force), options || {}));
      }
      if (online === null) await ping(undefined);
      return online;
    };

    let pending;
    if (force) {
      pending = run();
    } else if (ensureOnlineInFlight) {
      pending = ensureOnlineInFlight;
    } else {
      ensureOnlineInFlight = run().finally(() => {
        ensureOnlineInFlight = null;
      });
      pending = ensureOnlineInFlight;
    }

    if (!maxWaitMs) return pending;

    return Promise.race([
      pending,
      new Promise((resolve) => {
        setTimeout(() => resolve(online === true), maxWaitMs);
      }),
    ]);
  }

  const REGISTER_FIELDS = [
    "email",
    "password",
    "telephone",
    "role",
    "nom",
    "prenom",
    "universite",
    "codeUni",
    "filiere",
    "niveau",
    "matricule",
    "classe",
    "coursClasses",
    "departement",
    "service",
    "nomUniversite",
    "sigle",
    "siteWeb",
    "nbEtudiants",
    "responsable",
    "facultySections",
    "inscriptionFee",
    "universityFees",
    "campusAcademicFees",
    "campusTariffs",
    "grade",
    "fonction",
    "sectionApproval",
    "sectionApprovalRequestedAt",
    "sectionKind",
    "sectionName",
    "sectionId",
    "isRector",
    "dateNaissance",
    "paymentStatus",
    "registrationSource",
    "nomination",
    "logoUrl",
  ];

  function buildRegisterPayload(profile) {
    const src = { ...profile };
    if (typeof SAC_UNIVERSITIES !== "undefined" && SAC_UNIVERSITIES.normalizeProfileCampus) {
      SAC_UNIVERSITIES.normalizeProfileCampus(src);
    }
    const out = {};
    REGISTER_FIELDS.forEach((key) => {
      const val = src[key];
      if (val !== undefined && val !== null && val !== "") out[key] = val;
    });
    if (src.password) out.password = src.password;
    if (src.email) out.email = src.email;
    if (src.role) out.role = src.role;
    if (src.numEmploye) out.numEmploye = src.numEmploye;
    if (src.numAssist) out.numAssist = src.numAssist;
    if (src.payment && typeof src.payment === "object") {
      out.payment = src.payment;
      if (!out.paymentStatus) {
        out.paymentStatus = src.payment.status || "pending_verification";
      }
    }
    if (src.role === "etudiant" && !out.registrationSource) {
      out.registrationSource = "public_inscription";
    }
    if (
      (src.role === "professeur" || src.role === "assistant") &&
      !out.registrationSource
    ) {
      out.registrationSource = src.registrationSource || "public_inscription";
    }
    return out;
  }

  /** Même structure que l'inscription professeur — rattachement section pour validation. */
  function buildSectionStudentPayload(profile, password) {
    const src = { ...profile };
    if (typeof SAC_UNIVERSITIES !== "undefined" && SAC_UNIVERSITIES.normalizeProfileCampus) {
      SAC_UNIVERSITIES.normalizeProfileCampus(src);
    }
    if (
      src.role === "etudiant" &&
      (!src.coursClasses || !src.coursClasses.length) &&
      src.filiere
    ) {
      src.coursClasses = [
        {
          courseCode: "INSCRIPTION",
          courseName: "Parcours " + src.filiere,
          filiere: src.filiere,
          niveau: src.niveau || "l1",
          classe: src.classe || "",
          universite: src.universite || "",
        },
      ];
    }
    const payload = {
      email: src.email,
      telephone: src.telephone,
      prenom: src.prenom,
      nom: src.nom,
      role: "etudiant",
      matricule: src.matricule || null,
      niveau: src.niveau || "l1",
      classe: src.classe || null,
      dateNaissance: src.dateNaissance || null,
      universite: src.universite,
      universiteLocked: src.universiteLocked || src.universite,
      filiere: src.filiere,
      sectionId: src.sectionId || null,
      sectionName: src.sectionName || null,
      coursClasses: src.coursClasses || [],
      sectionApproval: src.sectionApproval || "pending",
      sectionApprovalRequestedAt:
        src.sectionApprovalRequestedAt || src.createdAt || new Date().toISOString(),
      registrationSource: src.registrationSource || "public_inscription",
      paymentStatus:
        src.paymentStatus || (src.payment && src.payment.status) || "pending_verification",
    };
    const pwd = password || src.password;
    if (pwd) payload.password = pwd;
    return payload;
  }

  function isDuplicateRegistrationError(err) {
    if (!err) return false;
    if (err.code === "EMAIL_EXISTS" || err.status === 409) return true;
    const msg = String(err.message || "");
    return /déjà|existe|already/i.test(msg);
  }

  async function registerOrLogin(profile) {
    const pwd = profile.password || profile._pwd || "";
    const payload = buildRegisterPayload({ ...profile, password: pwd });
    if (!payload.password) {
      throw new Error(
        "Mot de passe manquant pour finaliser l'inscription. Recommencez le formulaire."
      );
    }
    const loginExtra = {
      universite: payload.universite || profile.universite || null,
      codeUni: payload.codeUni || profile.codeUni || null,
    };
    try {
      return await register(payload);
    } catch (regErr) {
      if (!pwd || !isDuplicateRegistrationError(regErr)) throw regErr;
      try {
        return await login(profile.email, pwd, profile.role, loginExtra);
      } catch (loginErr) {
        const code = loginErr.code || "";
        if (code === "INVALID_CREDENTIALS") {
          throw new Error(
            "Cet e-mail est déjà inscrit avec un autre mot de passe. " +
              "Connectez-vous depuis la page Connexion, utilisez « Mot de passe oublié », " +
              "ou choisissez un autre e-mail."
          );
        }
        if (code === "ROLE_MISMATCH") {
          throw new Error(
            "Cet e-mail est déjà utilisé pour un autre type de compte. " +
              "Connectez-vous avec le bon profil ou utilisez un autre e-mail."
          );
        }
        if (code === "UNIVERSITY_MISMATCH") {
          throw new Error(
            "Cet e-mail est déjà lié à une autre université. " +
              "Sélectionnez le même établissement qu'à l'inscription."
          );
        }
        throw loginErr;
      }
    }
  }

  async function login(identifier, password, role, extra = {}) {
    const data = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        identifier,
        password,
        role,
        universite: extra.universite || null,
        codeUni: extra.codeUni || null,
        countryCode: extra.countryCode || null,
        adminPortal: !!extra.adminPortal,
      }),
    });
    if (data.mfaRequired && data.mfaChallenge) {
      return {
        mfaRequired: true,
        mfaChallenge: data.mfaChallenge,
        emailHint: data.emailHint || identifier,
      };
    }
    sessionCache = tagApiSession(data.session);
    saveApiTokens(data.accessToken, data.refreshToken);
    persistSessionCache();
    if (typeof SAC_ACCOUNT_REGISTRY !== "undefined" && SAC_ACCOUNT_REGISTRY.markSynced) {
      SAC_ACCOUNT_REGISTRY.markSynced(sessionCache.email);
    }
    return sessionCache;
  }

  async function verifyStaffMfa(challenge, code) {
    const data = await request("/auth/staff-mfa/verify", {
      method: "POST",
      body: JSON.stringify({ mfaChallenge: challenge, code: String(code || "").trim() }),
    });
    sessionCache = tagApiSession(data.session);
    saveApiTokens(data.accessToken, data.refreshToken);
    persistSessionCache();
    if (typeof SAC_ACCOUNT_REGISTRY !== "undefined" && SAC_ACCOUNT_REGISTRY.markSynced) {
      SAC_ACCOUNT_REGISTRY.markSynced(sessionCache.email);
    }
    return sessionCache;
  }

  async function provisionAccount(profile) {
    const data = await request("/auth/provision", {
      method: "POST",
      body: JSON.stringify(profile),
    });
    sessionCache = tagApiSession(data.session);
    saveApiTokens(data.accessToken, data.refreshToken);
    persistSessionCache();
    if (typeof SAC_ACCOUNT_REGISTRY !== "undefined" && SAC_ACCOUNT_REGISTRY.markSynced) {
      SAC_ACCOUNT_REGISTRY.markSynced(sessionCache.email);
    }
    return sessionCache;
  }

  async function register(profile) {
    const data = await request("/auth/register", {
      method: "POST",
      body: JSON.stringify(profile),
    });
    sessionCache = tagApiSession(data.session);
    saveApiTokens(data.accessToken, data.refreshToken);
    persistSessionCache();

    if (typeof SAC_ACCOUNT_REGISTRY !== "undefined" && SAC_ACCOUNT_REGISTRY.markSynced) {
      SAC_ACCOUNT_REGISTRY.markSynced(sessionCache.email);
    }

    if (!hasAuthTokens() && profile.password) {
      const loggedIn = await ensureAuthTokens({
        identifier: profile.email,
        password: profile.password,
        role: profile.role,
        extra: {
          universite: profile.universite || null,
          codeUni: profile.codeUni || null,
        },
      });
      if (!loggedIn && sessionCache) {
        return sessionCache;
      }
      if (!loggedIn) {
        return (
          sessionCache || {
            ok: true,
            email: profile.email,
            role: profile.role,
            authSource: "api",
          }
        );
      }
      return sessionCache;
    }

    return sessionCache;
  }

  function isTransientApiError(err) {
    const code = err && err.code;
    const status = err && err.status;
    return (
      code === "NETWORK_ERROR" ||
      status === 429 ||
      status === 502 ||
      status === 503 ||
      status === 504
    );
  }

  async function refresh(opts) {
    try {
      const refreshToken = useBearerAuth()
        ? sessionStorage.getItem(TOKEN_REFRESH)
        : null;
      const data = await request("/auth/refresh", {
        method: "POST",
        body: refreshToken ? JSON.stringify({ refreshToken }) : undefined,
        softAuth: !!(opts && opts.soft),
        timeoutMs: opts && opts.timeoutMs ? opts.timeoutMs : 20000,
      });
      sessionCache = tagApiSession(data.session);
      saveApiTokens(data.accessToken, data.refreshToken);
      persistSessionCache();
      return true;
    } catch (err) {
      if (!opts || !opts.soft) {
        if (!isTransientApiError(err)) {
          clearClientSession();
        }
      }
      return false;
    }
  }

  async function logout() {
    try {
      const refreshToken = useBearerAuth()
        ? sessionStorage.getItem(TOKEN_REFRESH)
        : null;
      await request("/auth/logout", {
        method: "POST",
        body: refreshToken ? JSON.stringify({ refreshToken }) : undefined,
        timeoutMs: 3000,
        softAuth: true,
      });
    } catch {
      /* ignore */
    }
    clearClientSession({ force: true });
  }

  async function me(opts) {
    if (opts && opts.soft) {
      try {
        const data = await request("/auth/me", { softAuth: true });
        sessionCache = tagApiSession(data.session);
        persistSessionCache();
        return sessionCache;
      } catch {
        return null;
      }
    }
    const data = await request("/auth/me");
    sessionCache = tagApiSession(data.session);
    persistSessionCache();
    return sessionCache;
  }

  async function requestPasswordReset(email) {
    return request("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  async function resetPassword(token, password) {
    return request("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    });
  }

  async function resetPasswordWithCode(email, code, password) {
    return request("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ email, code, password }),
    });
  }

  async function createSectionStudent(payload) {
    return request("/sections/students", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function createSectionHeadAccount(payload) {
    return request("/sections/head-account", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function listSectionStudents() {
    const data = await request("/sections/students");
    return data.students || [];
  }

  async function listPendingSectionStudents() {
    const data = await request("/sections/students/pending");
    return data.students || [];
  }

  async function linkSectionStudent(email, payload) {
    const em = String(
      email || payload?.email || payload?.identifiant || ""
    ).trim();
    if (!em) {
      const err = new Error("E-mail étudiant requis");
      err.code = "INVALID_INPUT";
      err.status = 400;
      throw err;
    }
    const body = { ...(payload || {}), email: em, identifiant: em };
    const attempts = [
      () =>
        request("/sections/students/link", {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
      () =>
        request("/sections/students/link", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      () =>
        request("/sections/students/" + encodeURIComponent(em) + "/link", {
          method: "PATCH",
          body: JSON.stringify(payload || {}),
        }),
    ];
    let lastErr;
    for (const fn of attempts) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (err.status === 401 || err.status === 403 || err.status === 404 && err.code === "STUDENT_NOT_FOUND") {
          throw err;
        }
      }
    }
    throw lastErr || new Error("Lien section impossible.");
  }

  async function approveSectionStudent(email, payload) {
    const em = String(
      email || payload?.email || payload?.identifiant || ""
    ).trim();
    if (!em) {
      const err = new Error("E-mail étudiant requis");
      err.code = "INVALID_INPUT";
      err.status = 400;
      throw err;
    }
    const body = {
      ...(payload || { status: "approved" }),
      email: em,
      identifiant: em,
    };
    const patchBody = payload || { status: "approved" };
    const attempts = [
      () =>
        request("/sections/students/approval", {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
      () =>
        request("/sections/students/approval", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      () =>
        request("/sections/students/" + encodeURIComponent(em) + "/approval", {
          method: "PATCH",
          body: JSON.stringify(patchBody),
        }),
    ];
    let lastErr;
    for (const fn of attempts) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (
          err.status === 401 ||
          err.status === 403 ||
          (err.status === 404 && err.code === "STUDENT_NOT_FOUND")
        ) {
          throw err;
        }
      }
    }
    throw lastErr || new Error("Validation serveur impossible.");
  }

  async function approveSectionStaff(email, payload) {
    const em = String(
      email || payload?.email || payload?.identifiant || ""
    ).trim();
    if (!em) {
      const err = new Error("E-mail professeur ou assistant requis");
      err.code = "INVALID_INPUT";
      err.status = 400;
      throw err;
    }
    const body = {
      ...(payload || { status: "approved" }),
      email: em,
      identifiant: em,
    };
    const patchBody = payload || { status: "approved" };
    const attempts = [
      () =>
        request("/sections/staff/approval", {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
      () =>
        request("/sections/staff/approval", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      () =>
        request("/sections/staff/" + encodeURIComponent(em) + "/approval", {
          method: "PATCH",
          body: JSON.stringify(patchBody),
        }),
    ];
    let lastErr;
    for (const fn of attempts) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (
          err.status === 401 ||
          err.status === 403 ||
          (err.status === 404 && err.code === "STAFF_NOT_FOUND")
        ) {
          throw err;
        }
      }
    }
    throw lastErr || new Error("Validation personnel serveur impossible.");
  }

  async function listPendingSectionStaff() {
    const data = await request("/sections/staff/pending");
    return data.staff || [];
  }

  /** Recteur : tente plusieurs routes pour lister tous les étudiants du campus. */
  async function listCampusSectionStudents(universite) {
    const uni = universite ? String(universite).trim() : "";
    const paths = [
      uni ? "/sections/students?scope=campus&universite=" + encodeURIComponent(uni) : null,
      uni ? "/sections/students?universite=" + encodeURIComponent(uni) : null,
      "/sections/students?scope=campus",
      "/sections/students",
    ].filter(Boolean);
    let last = [];
    for (const path of paths) {
      try {
        const data = await request(path);
        const list = data.students || data.accounts || [];
        if (list.length) return list;
        last = list;
      } catch {
        /* essai suivant */
      }
    }
    return last;
  }

  async function listCampusProfessors() {
    const data = await request("/nominations/professors");
    return data.professors || [];
  }

  async function nominateProfessor(payload) {
    return request("/nominations/professor", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function revokeProfessorNomination(email) {
    return request("/nominations/professor", {
      method: "DELETE",
      body: JSON.stringify({ email }),
    });
  }

  async function getDocuments() {
    const data = await request("/documents");
    return data.documents || [];
  }

  async function createDocument(payload, fileOrFiles) {
    const files = fileOrFiles
      ? Array.isArray(fileOrFiles)
        ? fileOrFiles
        : [fileOrFiles]
      : [];
    if (files.length) {
      const fd = new FormData();
      Object.entries(payload).forEach(([k, v]) => {
        if (v !== undefined && v !== null) fd.append(k, String(v));
      });
      files.forEach((f) => fd.append("files", f));
      const data = await uploadFormData("/documents", fd);
      return data.document;
    }
    const data = await request("/documents", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return data.document;
  }

  async function updateDocument(id, payload) {
    const data = await request(`/documents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return data.document;
  }

  async function deleteDocument(id) {
    await request(`/documents/${id}`, { method: "DELETE" });
    return true;
  }

  async function addReaction(docId, type) {
    const data = await request(`/documents/${docId}/reactions`, {
      method: "POST",
      body: JSON.stringify({ type }),
    });
    return data.document;
  }

  async function recordDocumentView(docId, viewerKey) {
    return request("/documents/" + encodeURIComponent(String(docId || "").trim()) + "/view", {
      method: "POST",
      body: JSON.stringify({ viewerKey: viewerKey || "" }),
    });
  }

  async function getTariff(universite, role) {
    const q = new URLSearchParams({ universite, role });
    return request("/tariffs?" + q.toString());
  }

  async function getCampusTariffs(universite) {
    const q = new URLSearchParams({ universite });
    return request("/tariffs?" + q.toString());
  }

  async function updateCampusTariffs(payload) {
    const body =
      payload && (payload.academicFees || payload.tariffs)
        ? {
            academicFees: payload.academicFees,
            tariffs: payload.tariffs || payload.academicFees,
          }
        : { tariffs: payload };
    return request("/tariffs/campus", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  async function getPlatformTariffs() {
    return request("/tariffs/platform", { softAuth: true });
  }

  async function updatePlatformTariffs(payload) {
    return request("/tariffs/platform", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  async function getCampusPartnerBank(universite) {
    const code = encodeURIComponent(String(universite || "").trim());
    return request("/payments/campus-bank?universite=" + code);
  }

  async function updateCampusPartnerBank(payload) {
    return request("/payments/campus-bank", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  async function requestCampusBankChange(payload) {
    return request("/payments/campus-bank/change-request", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function approveCampusBankChange(payload) {
    return request("/payments/campus-bank/approve", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function listMyPayments() {
    return request("/payments/me");
  }

  async function createAcademicPayment(payload) {
    return request("/payments/academic", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function initiateMobilePayment(payload) {
    const data = await request("/payments/mobile/initiate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return data;
  }

  async function getMobilePaymentStatus(txId) {
    return request("/payments/mobile/" + encodeURIComponent(txId));
  }

  async function confirmMobilePaymentPin(txId, pin) {
    return request("/payments/mobile/" + encodeURIComponent(txId) + "/confirm", {
      method: "POST",
      body: JSON.stringify({ pin: pin }),
    });
  }

  async function listCampusPayments() {
    return request("/payments/campus");
  }

  async function updatePaymentStatus(paymentId, payload) {
    return request("/payments/" + encodeURIComponent(paymentId), {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  async function listSections() {
    return request("/sections");
  }

  async function upsertSection(section) {
    return request("/sections", {
      method: "POST",
      body: JSON.stringify(section),
    });
  }

  async function patchSection(sectionId, data) {
    return request("/sections/" + encodeURIComponent(sectionId), {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async function listReclamations() {
    return request("/reclamations/me");
  }

  async function createReclamation(payload) {
    return request("/reclamations", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function patchReclamation(recId, data) {
    return request("/reclamations/" + encodeURIComponent(recId), {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async function listProfessorStudents() {
    const data = await request("/platform/students/teaching");
    return data.students || [];
  }

  async function getAdminAccountsSummary() {
    return request("/admin/accounts/summary");
  }

  async function listAdminAccounts(role) {
    const q = role ? "?role=" + encodeURIComponent(role) : "";
    const data = await request("/admin/accounts" + q);
    return data.accounts || [];
  }

  async function deleteAdminAccount(email) {
    return request("/admin/accounts/" + encodeURIComponent(email), { method: "DELETE" });
  }

  async function getPlatformAccountsSummary() {
    return request("/admin/platform/accounts/summary");
  }

  async function listPlatformAccounts(opts = {}) {
    const params = new URLSearchParams();
    if (opts.role) params.set("role", opts.role);
    if (opts.q) params.set("q", opts.q);
    if (opts.universite) params.set("universite", opts.universite);
    if (opts.limit) params.set("limit", String(opts.limit));
    const q = params.toString() ? "?" + params.toString() : "";
    const data = await request("/admin/platform/accounts" + q);
    return data.accounts || [];
  }

  async function deletePlatformAccount(email) {
    return request("/admin/platform/accounts/" + encodeURIComponent(email), {
      method: "DELETE",
    });
  }

  async function listPlatformPendingStudents(opts = {}) {
    const params = new URLSearchParams();
    if (opts.status) params.set("status", opts.status);
    if (opts.universite) params.set("universite", opts.universite);
    const q = params.toString() ? "?" + params.toString() : "";
    const data = await request("/admin/students/pending" + q);
    return data.students || [];
  }

  async function approvePlatformStudent(email, payload) {
    return request("/admin/students/" + encodeURIComponent(String(email || "").trim()) + "/approval", {
      method: "PATCH",
      body: JSON.stringify(payload || { status: "approved" }),
    });
  }

  async function getInstitutionalSummary() {
    return request("/admin/institutional/summary");
  }

  async function listInstitutionalAdmins() {
    const data = await request("/admin/institutional");
    return data.admins || [];
  }

  async function createInstitutionalAdmin(payload) {
    const data = await request("/admin/institutional", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return data.admin || data;
  }

  async function seedInstitutionalFacultySections(payload) {
    const data = await request("/admin/institutional/faculty-sections", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return data.sections || [];
  }

  async function deleteInstitutionalAdmin(email) {
    return request("/admin/institutional/" + encodeURIComponent(email), { method: "DELETE" });
  }

  async function getAdminActivitiesSummary() {
    return request("/admin/activities/summary");
  }

  async function listAdminActivities(limit) {
    const q = limit ? "?limit=" + encodeURIComponent(limit) : "";
    const data = await request("/admin/activities" + q);
    return data.activities || [];
  }

  async function getAdminPresenceSummary() {
    return request("/admin/presence/summary");
  }

  async function deleteAdminActivities(payload) {
    return request("/admin/activities", {
      method: "DELETE",
      body: JSON.stringify(payload || {}),
    });
  }

  async function getBackupStatus() {
    return request("/admin/backups/status");
  }

  async function listBackups() {
    return request("/admin/backups");
  }

  async function createBackupNow() {
    const start = await request("/admin/backups/create", {
      method: "POST",
      body: JSON.stringify({}),
      timeoutMs: 60000,
    });
    const jobId = start.jobId;
    if (!jobId) {
      return start;
    }
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      await new Promise(function (r) {
        setTimeout(r, 2000);
      });
      const data = await request("/admin/backups/jobs/" + encodeURIComponent(jobId), {
        timeoutMs: 45000,
      });
      const job = data.job || {};
      if (job.status === "done") {
        return { ok: true, backup: job.backup, status: await getBackupStatus() };
      }
      if (job.status === "error") {
        throw new Error(job.message || "Échec de la sauvegarde");
      }
    }
    throw new Error("Délai dépassé — vérifiez la liste des archives dans un instant.");
  }

  async function purgeOldBackups() {
    return request("/admin/backups/purge", { method: "POST", body: JSON.stringify({}) });
  }

  async function restoreBackup(backupId, confirm) {
    return request("/admin/backups/" + encodeURIComponent(backupId) + "/restore", {
      method: "POST",
      body: JSON.stringify({ confirm: confirm }),
    });
  }

  async function downloadBackup(backupId) {
    if (isRenderFrontend() && !baseResolved) await resolveApiBase();
    const url = `${BASE}/api/admin/backups/${encodeURIComponent(backupId)}/download`;
    const res = await fetchWithTimeout(
      url,
      { method: "GET", credentials: apiCredentials(), headers: getAuthHeaders() },
      120000
    );
    if (!res.ok) {
      let data = {};
      try {
        data = await res.json();
      } catch (_) {}
      throw new Error(apiErrorMessage(data, res.status) || "Téléchargement impossible");
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "evosu-backup-" + backupId + ".zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  async function listHomeNews() {
    const data = await platformRequest("/platform/home-news", { auth: false });
    return data.items || [];
  }

  async function listDigitalLibrary(countryCode) {
    const cc = countryCode ? String(countryCode).toUpperCase() : "";
    const q = cc ? "?country=" + encodeURIComponent(cc) : "";
    return platformRequest("/platform/library" + q, { auth: false });
  }

  async function lookupDictionary(word, lang) {
    const params = new URLSearchParams();
    params.set("q", String(word || "").trim());
    params.set("lang", lang || "fr");
    return platformRequest("/platform/dictionary/lookup?" + params.toString(), { auth: false });
  }

  async function translateDictionary(word, opts = {}) {
    const params = new URLSearchParams();
    params.set("q", String(word || "").trim());
    params.set("source", opts.sourceLang && opts.sourceLang !== "auto" ? opts.sourceLang : opts.lang || "fr");
    return platformRequest("/platform/dictionary/translate?" + params.toString(), { auth: false });
  }

  async function listDictionaryLanguages() {
    const data = await platformRequest("/platform/dictionary/languages", { auth: false });
    return data.languages || [];
  }

  async function listDigitalLibraryManage(countryCode) {
    const cc = countryCode ? String(countryCode).toUpperCase() : "";
    const q = cc ? "?country=" + encodeURIComponent(cc) : "";
    return request("/platform/library/manage" + q);
  }

  async function createDigitalLibraryBook(payload) {
    const data = await request("/platform/library", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return data;
  }

  async function updateDigitalLibraryBook(id, payload) {
    const data = await request("/platform/library/" + encodeURIComponent(id), {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return data;
  }

  async function deleteDigitalLibraryBook(id) {
    return request("/platform/library/" + encodeURIComponent(id), {
      method: "DELETE",
    });
  }

  async function uploadDigitalLibraryFile(formData) {
    return uploadFormData("/platform/library/upload", formData);
  }

  async function listCampusDiplomasManage() {
    const data = await request("/platform/diplomas/manage");
    return data?.diplomas || [];
  }

  async function listMyDiplomas() {
    const data = await request("/platform/diplomas/me");
    return data?.diplomas || [];
  }

  async function issueDiploma(payload) {
    const data = await request("/platform/diplomas/issue", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return data?.diploma || data;
  }

  async function revokeDiploma(diplomaId) {
    const data = await request("/platform/diplomas/" + encodeURIComponent(diplomaId), {
      method: "PATCH",
      body: JSON.stringify({ status: "revoque" }),
    });
    return data?.diploma || data;
  }

  async function verifyDiplomaPublic(verificationCode, diplomaNumber) {
    return platformRequest("/platform/diplomas/verify", {
      method: "POST",
      auth: false,
      body: JSON.stringify({
        verificationCode: verificationCode,
        diplomaNumber: diplomaNumber,
      }),
    });
  }

  async function listCoursesForStudent() {
    const data = await request("/platform/courses/for-student");
    return data?.courses || [];
  }

  async function listCoursesManage() {
    const data = await request("/platform/courses/manage");
    return data?.items || [];
  }

  async function listMyCourseEnrollments() {
    const data = await request("/platform/courses/enrollments/me");
    return data?.enrollments || [];
  }

  async function listCoursesPublic(universite) {
    const q = universite ? "?universite=" + encodeURIComponent(universite) : "";
    const data = await platformRequest("/platform/courses" + q, { auth: false });
    return data?.items || [];
  }

  async function createCourse(payload) {
    const data = await request("/platform/courses", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return data?.item || data;
  }

  async function updateCourse(courseId, payload) {
    const data = await request("/platform/courses/" + encodeURIComponent(courseId), {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return data?.item || data;
  }

  async function deleteCourse(courseId) {
    return request("/platform/courses/" + encodeURIComponent(courseId), { method: "DELETE" });
  }

  async function enrollCourse(courseId) {
    const data = await request("/platform/courses/" + encodeURIComponent(courseId) + "/enroll", {
      method: "POST",
      body: JSON.stringify({}),
    });
    return data?.enrollment || data;
  }

  async function listCareersForStudent() {
    const data = await request("/platform/careers/for-student");
    return data?.items || [];
  }

  async function listCareersManage() {
    const data = await request("/platform/careers/manage");
    return data?.items || [];
  }

  async function listMyCareerApplications() {
    const data = await request("/platform/careers/applications/me");
    return data?.applications || [];
  }

  async function listCareersPublic(scope, universite) {
    const params = new URLSearchParams();
    if (scope) params.set("scope", scope);
    if (universite) params.set("universite", universite);
    const q = params.toString() ? "?" + params.toString() : "";
    const data = await platformRequest("/platform/careers" + q, { auth: false });
    return data?.items || [];
  }

  async function createCareer(payload) {
    const data = await request("/platform/careers", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return data?.item || data;
  }

  async function updateCareer(offerId, payload) {
    const data = await request("/platform/careers/" + encodeURIComponent(offerId), {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return data?.item || data;
  }

  async function deleteCareer(offerId) {
    return request("/platform/careers/" + encodeURIComponent(offerId), { method: "DELETE" });
  }

  async function applyCareer(offerId, message) {
    const data = await request("/platform/careers/" + encodeURIComponent(offerId) + "/apply", {
      method: "POST",
      body: JSON.stringify({ message: message || "" }),
    });
    return data?.application || data;
  }

  async function listCareerApplications(offerId) {
    const data = await request("/platform/careers/" + encodeURIComponent(offerId) + "/applications");
    return data?.applications || [];
  }

  async function updateCareerApplication(appId, status) {
    const data = await request("/platform/careers/applications/" + encodeURIComponent(appId), {
      method: "PATCH",
      body: JSON.stringify({ status: status }),
    });
    return data?.application || data;
  }

  async function listSocialPosts(filters) {
    const f = filters || {};
    const params = new URLSearchParams();
    if (f.q) params.set("q", f.q);
    if (f.hashtag) params.set("hashtag", f.hashtag);
    if (f.group) params.set("group", f.group);
    if (f.feed) params.set("feed", f.feed);
    const q = params.toString();
    const data = await request("/platform/social" + (q ? "?" + q : ""));
    return data?.posts || [];
  }

  async function createSocialPost(payload) {
    const body =
      typeof payload === "string"
        ? { content: payload, audience: arguments[1] || "campus" }
        : payload || {};
    const data = await request("/platform/social", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return data?.post || data;
  }

  async function uploadSocialMedia(file, kind) {
    const fd = new FormData();
    fd.append("file", file);
    const k = encodeURIComponent(kind || "photo");
    return uploadFormData("/platform/social/upload?kind=" + k, fd);
  }

  async function toggleSocialReaction(postId, reaction) {
    const data = await request("/platform/social/" + encodeURIComponent(postId) + "/reaction", {
      method: "POST",
      body: JSON.stringify({ reaction: reaction || "like" }),
    });
    return data?.post || data;
  }

  async function deleteSocialPost(postId) {
    return request("/platform/social/" + encodeURIComponent(postId), { method: "DELETE" });
  }

  async function moderateSocialPost(postId, patch) {
    const body = typeof patch === "boolean" ? { hidden: patch } : patch || {};
    const data = await request("/platform/social/" + encodeURIComponent(postId), {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    return data?.post || data;
  }

  async function listSocialComments(postId) {
    const data = await request("/platform/social/" + encodeURIComponent(postId) + "/comments");
    return data?.comments || [];
  }

  async function addSocialComment(postId, content) {
    const data = await request("/platform/social/" + encodeURIComponent(postId) + "/comments", {
      method: "POST",
      body: JSON.stringify({ content: content }),
    });
    return data?.comment || data;
  }

  async function listSocialEvents() {
    const data = await request("/platform/social/events");
    return data?.events || [];
  }

  async function listSocialHashtags() {
    const data = await request("/platform/social/hashtags");
    return data?.hashtags || [];
  }

  async function listSocialStudyGroups() {
    const data = await request("/platform/social/study-groups");
    return data?.groups || [];
  }

  async function createSocialStudyGroup(payload) {
    const data = await request("/platform/social/study-groups", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
    return data?.group || data;
  }

  async function joinSocialStudyGroup(groupId) {
    const data = await request(
      "/platform/social/study-groups/" + encodeURIComponent(groupId) + "/join",
      { method: "POST", body: JSON.stringify({}) }
    );
    return data?.group || data;
  }

  async function getMonitorOverview(options) {
    const opts = options || {};
    const q = opts.notify ? "?notify=true" : "";
    return request("/admin/monitor/overview" + q, { softAuth: true });
  }

  async function getMonitorSecurityPulse() {
    return request("/admin/monitor/security-pulse", { softAuth: true });
  }

  async function getMonitorShieldOverview() {
    return request("/admin/monitor/shield/overview", { softAuth: true });
  }

  async function getMonitorShieldTrends(hours) {
    const q = hours ? "?hours=" + encodeURIComponent(hours) : "";
    return request("/admin/monitor/shield/trends" + q, { softAuth: true });
  }

  async function getMonitorShieldPulse(since) {
    const q = since ? "?since=" + encodeURIComponent(since) : "";
    return request("/admin/monitor/shield/pulse" + q, { softAuth: true });
  }

  async function listMonitorIncidents(limit) {
    const params = limit ? "?limit=" + encodeURIComponent(String(limit)) : "";
    const data = await request("/admin/monitor/incidents" + params);
    return data?.incidents || [];
  }

  async function resolveMonitorIncident(incidentId, status) {
    const data = await request("/admin/monitor/incidents/" + encodeURIComponent(incidentId), {
      method: "PATCH",
      body: JSON.stringify({ status: status || "resolved" }),
    });
    return data?.incident || data;
  }

  async function updateMonitorIncident(incidentId, patch) {
    const data = await request("/admin/monitor/incidents/" + encodeURIComponent(incidentId), {
      method: "PATCH",
      body: JSON.stringify(patch || {}),
    });
    return data?.incident || data;
  }

  async function listMonitorLogs(options) {
    const opts = options || {};
    const params = new URLSearchParams();
    if (opts.limit) params.set("limit", String(opts.limit));
    if (opts.q) params.set("q", String(opts.q));
    if (opts.category) params.set("category", String(opts.category));
    const q = params.toString() ? "?" + params.toString() : "";
    return request("/admin/monitor/logs" + q);
  }

  async function triggerMonitorHeal(action) {
    return request("/admin/monitor/heal", {
      method: "POST",
      body: JSON.stringify({ action: action || "ping_api" }),
    });
  }

  async function sendMonitorAlert(payload) {
    return request("/admin/monitor/alerts/dispatch", {
      method: "POST",
      body: JSON.stringify(payload || {}),
      softAuth: true,
    });
  }

  async function testMonitorAlerts(payload) {
    return request("/admin/monitor/alerts/test", {
      method: "POST",
      body: JSON.stringify(payload || {}),
      softAuth: true,
    });
  }

  async function getMonitorAlertsStatus() {
    return request("/admin/monitor/alerts/status", { softAuth: true });
  }

  async function runMonitorSimulation(scenario) {
    return request("/admin/monitor/simulate", {
      method: "POST",
      body: JSON.stringify({ scenario: scenario || "traffic" }),
    });
  }

  async function getAiOpsStatus() {
    return request("/admin/monitor/ai-ops/status");
  }

  async function analyzeAiOpsError(context) {
    return request("/admin/monitor/ai-ops/analyze", {
      method: "POST",
      body: JSON.stringify(context || {}),
    });
  }

  async function getAiOpsPredictions() {
    return request("/admin/monitor/ai-ops/predictions");
  }

  async function listAiOpsTickets(limit) {
    const params = limit ? "?limit=" + encodeURIComponent(String(limit)) : "";
    return request("/admin/monitor/ai-ops/tickets" + params);
  }

  async function createAiOpsTicket(payload) {
    return request("/admin/monitor/ai-ops/tickets", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  }

  async function updateAiOpsTicket(ticketId, patch) {
    return request("/admin/monitor/ai-ops/tickets/" + encodeURIComponent(ticketId), {
      method: "PATCH",
      body: JSON.stringify(patch || {}),
    });
  }

  async function getDevCenterProfile() {
    return request("/admin/dev-center/profile");
  }

  async function updateDevCenterProfile(patch) {
    return request("/admin/dev-center/profile", {
      method: "PATCH",
      body: JSON.stringify(patch || {}),
    });
  }

  async function getDevCenterStats() {
    return request("/admin/dev-center/stats");
  }

  async function listDevCenterTickets(filter, limit) {
    const params = new URLSearchParams();
    if (filter) params.set("filter", String(filter));
    if (limit) params.set("limit", String(limit));
    const q = params.toString() ? "?" + params.toString() : "";
    return request("/admin/dev-center/tickets" + q);
  }

  async function getDevCenterTicket(ticketId) {
    return request("/admin/dev-center/tickets/" + encodeURIComponent(ticketId));
  }

  async function assignDevCenterTicket(ticketId, assignee) {
    return request("/admin/dev-center/tickets/" + encodeURIComponent(ticketId) + "/assign", {
      method: "POST",
      body: JSON.stringify({ assignee: assignee || null }),
    });
  }

  async function updateDevCenterTicket(ticketId, patch) {
    return request("/admin/dev-center/tickets/" + encodeURIComponent(ticketId), {
      method: "PATCH",
      body: JSON.stringify(patch || {}),
    });
  }

  async function listDevCenterDevelopers() {
    return request("/admin/dev-center/developers");
  }

  async function getDevCenterPerformance() {
    return request("/admin/dev-center/performance");
  }

  async function getDevCenterProjects() {
    return request("/admin/dev-center/projects");
  }

  async function getDevCenterWorkflow() {
    return request("/admin/dev-center/workflow");
  }

  async function listDevCenterComments(ticketId) {
    return request("/admin/dev-center/tickets/" + encodeURIComponent(ticketId) + "/comments");
  }

  async function addDevCenterComment(ticketId, body) {
    return request("/admin/dev-center/tickets/" + encodeURIComponent(ticketId) + "/comments", {
      method: "POST",
      body: JSON.stringify({ body: body }),
    });
  }

  async function listDevCenterHistory(ticketId) {
    return request("/admin/dev-center/tickets/" + encodeURIComponent(ticketId) + "/history");
  }

  async function logDevCenterTime(ticketId, payload) {
    return request("/admin/dev-center/tickets/" + encodeURIComponent(ticketId) + "/time", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  }

  async function getTechManagerOverview() {
    return request("/admin/tech-manager/overview");
  }

  async function listTechManagerTickets(filter, limit) {
    const params = new URLSearchParams();
    if (filter) params.set("filter", filter);
    if (limit) params.set("limit", String(limit));
    const q = params.toString() ? "?" + params.toString() : "";
    return request("/admin/tech-manager/tickets" + q);
  }

  async function assignTechManagerTicket(ticketId, payload) {
    return request("/admin/tech-manager/tickets/" + encodeURIComponent(ticketId) + "/assign", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  }

  async function setTechManagerPriority(ticketId, priority) {
    return request("/admin/tech-manager/tickets/" + encodeURIComponent(ticketId) + "/priority", {
      method: "PATCH",
      body: JSON.stringify({ priority: priority }),
    });
  }

  async function validateTechManagerTicket(ticketId, payload) {
    return request("/admin/tech-manager/tickets/" + encodeURIComponent(ticketId) + "/validate", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  }

  async function approveTechManagerProduction(ticketId) {
    return request("/admin/tech-manager/tickets/" + encodeURIComponent(ticketId) + "/production", {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  async function resolveTechManagerTicket(ticketId) {
    return request("/admin/tech-manager/tickets/" + encodeURIComponent(ticketId) + "/resolve", {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  async function listTechManagerTeam() {
    return request("/admin/tech-manager/team");
  }

  async function getTechManagerStats() {
    return request("/admin/tech-manager/stats");
  }

  async function getTechManagerShieldOverview() {
    return request("/admin/tech-manager/shield/overview");
  }

  async function listTechManagerShieldEvents(limit) {
    const q = limit ? "?limit=" + encodeURIComponent(String(limit)) : "";
    return request("/admin/tech-manager/shield/events" + q);
  }

  async function listTechManagerShieldBlocked() {
    return request("/admin/tech-manager/shield/blocked");
  }

  async function listTechManagerShieldHoneypot(limit) {
    const q = limit ? "?limit=" + encodeURIComponent(String(limit)) : "";
    return request("/admin/tech-manager/shield/honeypot" + q);
  }

  async function unblockTechManagerShieldIp(ipHash) {
    return request(
      "/admin/tech-manager/shield/unblock/" + encodeURIComponent(ipHash),
      { method: "POST", body: JSON.stringify({}) }
    );
  }

  async function getTechManagerShieldPulse(since) {
    const q = since ? "?since=" + encodeURIComponent(String(since)) : "";
    return request("/admin/tech-manager/shield/pulse" + q);
  }

  async function getTechManagerShieldTrends(hours) {
    const q = hours ? "?hours=" + encodeURIComponent(String(hours)) : "";
    return request("/admin/tech-manager/shield/trends" + q);
  }

  async function getTechManagerShieldAlertsStatus() {
    return request("/admin/tech-manager/shield/alerts/status");
  }

  async function testTechManagerShieldAlert() {
    return request("/admin/tech-manager/shield/alerts/test", {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  async function blockTechManagerShieldIp(payload) {
    return request("/admin/tech-manager/shield/block", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  }

  async function listSocialNotifications() {
    const data = await request("/platform/social/notifications");
    return data?.notifications || [];
  }

  async function markSocialNotificationRead(notifId) {
    return request("/platform/social/notifications/" + encodeURIComponent(notifId) + "/read", {
      method: "PATCH",
      body: JSON.stringify({}),
    });
  }

  async function getSocialSettings() {
    return request("/platform/social/settings");
  }

  async function updateSocialSettings(patch) {
    return request("/platform/social/settings", {
      method: "PATCH",
      body: JSON.stringify(patch || {}),
    });
  }

  async function listSocialConversations() {
    const data = await request("/platform/social/messages/conversations");
    return data?.conversations || [];
  }

  async function listSocialMessages(peerEmail) {
    const data = await request(
      "/platform/social/messages/with/" + encodeURIComponent(peerEmail || "")
    );
    return data?.messages || [];
  }

  async function sendSocialMessage(toEmail, body) {
    const data = await request("/platform/social/messages", {
      method: "POST",
      body: JSON.stringify({ toEmail: toEmail, body: body }),
    });
    return data?.message || data;
  }

  async function toggleSocialLike(postId) {
    return toggleSocialReaction(postId, "like");
  }

  async function getOrientationAdvice(interests) {
    const data = await request("/platform/orientation", {
      method: "POST",
      body: JSON.stringify({ interests: interests || "" }),
    });
    return data?.advice || data;
  }

  async function getOrientationStatus() {
    return request("/platform/orientation/status");
  }

  async function recordHomeNewsView(itemId, viewerKey) {
    return platformRequest("/platform/home-news/" + encodeURIComponent(String(itemId || "").trim()) + "/view", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ viewerKey: viewerKey || "" }),
    });
  }

  async function getCampusBranding(universite) {
    const code = encodeURIComponent(String(universite || "").trim());
    if (!code) return { logoUrl: null };
    return platformRequest("/platform/campus-branding?universite=" + code, { auth: false });
  }

  async function getCampusCatalog() {
    return platformRequest("/platform/campus-catalog", { auth: false });
  }

  async function getPublicPlatformStats() {
    return platformRequest("/platform/public-stats", { auth: false });
  }

  async function resolveCampusCatalog(q) {
    const code = encodeURIComponent(String(q || "").trim());
    if (!code) return { id: null, item: null };
    return platformRequest("/platform/campus-catalog/resolve?q=" + code, { auth: false });
  }

  async function listCampusSectionsPublic(universite) {
    const code = encodeURIComponent(String(universite || "").trim());
    if (!code) return { sections: [] };
    return platformRequest("/platform/campus-sections?universite=" + code, { auth: false });
  }

  async function createHomeNews(payload) {
    const data = await request("/platform/home-news", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return data.item || data;
  }

  async function updateHomeNews(id, payload) {
    const data = await request("/platform/home-news/" + encodeURIComponent(id), {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return data.item || data;
  }

  async function deleteHomeNews(id) {
    return request("/platform/home-news/" + encodeURIComponent(id), {
      method: "DELETE",
    });
  }

  async function uploadHomeNewsMedia(files) {
    const fd = new FormData();
    (files || []).forEach((f) => fd.append("files", f));
    return uploadFormData("/platform/home-news/upload", fd);
  }

  async function uploadLiveRecording(sessionId, formData) {
    const sid = encodeURIComponent(String(sessionId || "").trim());
    return uploadFormData("/platform/live/sessions/" + sid + "/recording", formData, undefined, 300000);
  }

  async function pingPresence(payload = {}) {
    return request("/platform/presence/ping", {
      method: "POST",
      body: JSON.stringify(payload || {}),
      softAuth: true,
    });
  }

  async function getSectionPresence() {
    return request("/platform/presence/section");
  }

  async function getProfessorPresence() {
    return request("/platform/presence/classes");
  }

  async function platformRequest(path, options = {}) {
    const useAuth = options.auth !== false;
    const opts = { ...options };
    delete opts.auth;
    if (isRenderFrontend() && !baseResolved) await resolveApiBase();
    if (!BASE) {
      const err = new Error("API indisponible — réessayez dans un instant.");
      err.code = "NO_API_BASE";
      throw err;
    }
    if (!useAuth) {
      const res = await fetchWithTimeout(
        `${BASE}/api${path}`,
        {
          ...opts,
          credentials: apiCredentials(),
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...opts.headers,
          },
        },
        opts.timeoutMs || 18000
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.message || data.error || "API_ERROR");
        err.code = data.error;
        throw err;
      }
      return data;
    }
    return request(path, opts);
  }

  async function uploadFormData(path, formData, method, timeoutMs) {
    const doUpload = async () =>
      fetchWithTimeout(`${BASE}/api${path}`, {
        method: method || "POST",
        credentials: apiCredentials(),
        headers: {
          ...getAuthHeaders(),
        },
        body: formData,
      }, timeoutMs || 60000);

    let res = await doUpload();
    let data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      const refreshed = await refresh();
      if (refreshed) {
        res = await doUpload();
        data = await res.json().catch(() => ({}));
      } else {
        clearClientSession();
      }
    }

    if (!res.ok) {
      const err = new Error(apiErrorMessage(data, res.status));
      err.code = data.error;
      err.status = res.status;
      if (data.error === "USER_NOT_FOUND" || data.error === "TOKEN_EXPIRED") {
        err.sessionInvalid = true;
        clearClientSession();
      }
      throw err;
    }
    return data;
  }

  /** Diagnostic live — token JWT + route WebRTC sur l'API Render. */
  async function probeLiveApi() {
    if (!BASE) {
      return { ok: false, reason: "NO_API", message: "URL API non configurée." };
    }
    if (useBearerAuth() && !getAccessToken()) {
      try {
        await refresh();
      } catch {
        /* ignore */
      }
    }
    if (useBearerAuth() && !getAccessToken()) {
      return {
        ok: false,
        reason: "NO_TOKEN",
        message: "Session expirée — déconnectez-vous et reconnectez-vous pour le live.",
      };
    }
    try {
      await request("/webrtc/signals");
      return { ok: true, reason: "OK" };
    } catch (err) {
      if (err.status === 404) {
        return {
          ok: false,
          reason: "WEBRTC_MISSING",
          message:
            "WebRTC absent sur l'API Render — poussez backend-python vers le dépôt smart-academy-of-congo-API puis redéployez l'API.",
        };
      }
      if (err.status === 401 || err.sessionInvalid) {
        return {
          ok: false,
          reason: "AUTH",
          message: "Accès refusé — reconnectez-vous puis réessayez le live.",
        };
      }
      return {
        ok: false,
        reason: "NETWORK",
        message: err.message || "API live inaccessible (serveur Render en veille ?).",
      };
    }
  }

  function getBase() {
    return BASE;
  }

  function getFrontendOrigin() {
    if (typeof window === "undefined") return "";
    return window.location.origin || "";
  }

  function isOnline() {
    return online === true;
  }

  return {
    ping,
    wakeServer,
    probeLiveApi,
    probeCors,
    probeApiReachability,
    resolveApiBase,
    ensureOnline,
    ensureApiSession,
    isOnline,
    isCrossOriginApi,
    isRenderFrontend,
    useBearerAuth,
    isMobileClient,
    isLocalDevHost,
    allowOfflineAuth,
    login,
    verifyStaffMfa,
    register,
    provisionAccount,
    registerOrLogin,
    buildRegisterPayload,
    buildSectionStudentPayload,
    isDuplicateRegistrationError,
    refresh,
    logout,
    me,
    requestPasswordReset,
    resetPassword,
    resetPasswordWithCode,
    createSectionStudent,
    createSectionHeadAccount,
    listSectionStudents,
    listPendingSectionStudents,
    approveSectionStudent,
    approveSectionStaff,
    listPendingSectionStaff,
    linkSectionStudent,
    listCampusSectionStudents,
    listCampusProfessors,
    nominateProfessor,
    revokeProfessorNomination,
    getDocuments,
    createDocument,
    updateDocument,
    deleteDocument,
    addReaction,
    recordDocumentView,
    getTariff,
    getCampusTariffs,
    updateCampusTariffs,
    getPlatformTariffs,
    updatePlatformTariffs,
    getCampusPartnerBank,
    updateCampusPartnerBank,
    requestCampusBankChange,
    approveCampusBankChange,
    listMyPayments,
    createAcademicPayment,
    initiateMobilePayment,
    getMobilePaymentStatus,
    confirmMobilePaymentPin,
    listCampusPayments,
    updatePaymentStatus,
    listSections,
    upsertSection,
    patchSection,
    listReclamations,
    createReclamation,
    patchReclamation,
    pingPresence,
    getSectionPresence,
    getProfessorPresence,
    listHomeNews,
    listDigitalLibrary,
    lookupDictionary,
    translateDictionary,
    listDictionaryLanguages,
    listDigitalLibraryManage,
    createDigitalLibraryBook,
    updateDigitalLibraryBook,
    deleteDigitalLibraryBook,
    uploadDigitalLibraryFile,
    listCampusDiplomasManage,
    listMyDiplomas,
    issueDiploma,
    revokeDiploma,
    verifyDiplomaPublic,
    listCoursesForStudent,
    listCoursesManage,
    listMyCourseEnrollments,
    listCoursesPublic,
    createCourse,
    updateCourse,
    deleteCourse,
    enrollCourse,
    listCareersForStudent,
    listCareersManage,
    listMyCareerApplications,
    listCareersPublic,
    createCareer,
    updateCareer,
    deleteCareer,
    applyCareer,
    listCareerApplications,
    updateCareerApplication,
    listSocialPosts,
    createSocialPost,
    uploadSocialMedia,
    toggleSocialLike,
    toggleSocialReaction,
    deleteSocialPost,
    moderateSocialPost,
    listSocialComments,
    addSocialComment,
    listSocialEvents,
    listSocialHashtags,
    listSocialStudyGroups,
    createSocialStudyGroup,
    joinSocialStudyGroup,
    getMonitorOverview,
    getMonitorSecurityPulse,
    getMonitorShieldOverview,
    getMonitorShieldTrends,
    getMonitorShieldPulse,
    listMonitorIncidents,
    resolveMonitorIncident,
    updateMonitorIncident,
    listMonitorLogs,
    triggerMonitorHeal,
    sendMonitorAlert,
    testMonitorAlerts,
    getMonitorAlertsStatus,
    runMonitorSimulation,
    getAiOpsStatus,
    analyzeAiOpsError,
    getAiOpsPredictions,
    listAiOpsTickets,
    createAiOpsTicket,
    updateAiOpsTicket,
    getDevCenterProfile,
    updateDevCenterProfile,
    getDevCenterStats,
    listDevCenterTickets,
    getDevCenterTicket,
    assignDevCenterTicket,
    updateDevCenterTicket,
    listDevCenterDevelopers,
    getDevCenterPerformance,
    getDevCenterProjects,
    getDevCenterWorkflow,
    listDevCenterComments,
    addDevCenterComment,
    listDevCenterHistory,
    logDevCenterTime,
    getTechManagerOverview,
    listTechManagerTickets,
    assignTechManagerTicket,
    setTechManagerPriority,
    validateTechManagerTicket,
    approveTechManagerProduction,
    resolveTechManagerTicket,
    listTechManagerTeam,
    getTechManagerStats,
    getTechManagerShieldOverview,
    listTechManagerShieldEvents,
    listTechManagerShieldBlocked,
    listTechManagerShieldHoneypot,
    unblockTechManagerShieldIp,
    getTechManagerShieldPulse,
    getTechManagerShieldTrends,
    getTechManagerShieldAlertsStatus,
    testTechManagerShieldAlert,
    blockTechManagerShieldIp,
    listSocialNotifications,
    markSocialNotificationRead,
    getSocialSettings,
    updateSocialSettings,
    listSocialConversations,
    listSocialMessages,
    sendSocialMessage,
    getOrientationAdvice,
    getOrientationStatus,
    recordHomeNewsView,
    getCampusBranding,
    getCampusCatalog,
    getPublicPlatformStats,
    resolveCampusCatalog,
    listCampusSectionsPublic,
    createHomeNews,
    updateHomeNews,
    deleteHomeNews,
    uploadHomeNewsMedia,
    uploadLiveRecording,
    listProfessorStudents,
    getAdminAccountsSummary,
    listAdminAccounts,
    deleteAdminAccount,
    getPlatformAccountsSummary,
    listPlatformAccounts,
    deletePlatformAccount,
    listPlatformPendingStudents,
    approvePlatformStudent,
    getInstitutionalSummary,
    listInstitutionalAdmins,
    createInstitutionalAdmin,
    seedInstitutionalFacultySections,
    deleteInstitutionalAdmin,
    getAdminActivitiesSummary,
    listAdminActivities,
    deleteAdminActivities,
    getAdminPresenceSummary,
    getBackupStatus,
    listBackups,
    createBackupNow,
    purgeOldBackups,
    restoreBackup,
    downloadBackup,
    platformRequest,
    uploadFormData,
    getBase,
    getAccessToken,
    buildWebSocketUrl,
    postLiveSignal,
    getLiveSignals,
    clearLiveSignal,
    getFrontendOrigin,
    hasAuthTokens,
    ensureAuthTokens,
    isLocalOnlySession,
    clearClientSession,
  };
})();
window.SAC_API = SAC_API;

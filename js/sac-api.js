/**
 * Client API sécurisé — Smart Academy of Congo
 * Cross-origin Render : jetons Bearer (CROSS_ORIGIN_AUTH) — pas de cookies tiers.
 */
const SAC_API = (function () {
  const BASE = (function () {
    if (typeof window === "undefined") return "";

    const normalize = (value) => String(value || "").trim().replace(/\/+$/, "");

    const fromGlobal = normalize(window.SAC_API_BASE);
    if (fromGlobal) return fromGlobal;

    const meta = document.querySelector('meta[name="sac-api-base"]');
    const fromMeta = normalize(meta && meta.getAttribute("content"));
    if (fromMeta) return fromMeta;

    const { protocol, hostname, port } = window.location;

    // Repli Render si sac-config.js absent
    if (hostname.endsWith(".onrender.com") && hostname.indexOf("-api") === -1) {
      return "https://smart-academy-of-congo-api-1.onrender.com";
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
      "[SAC] Ouvrez le site via http://localhost:8000 (double-clic sur start-local.bat), pas en ouvrant le fichier HTML directement."
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
  };

  function apiErrorMessage(data) {
    const code = data && data.error;
    return (data && data.message) || ERROR_MESSAGES[code] || code || "Erreur serveur";
  }

  function isCrossOriginApi() {
    if (!BASE || typeof window === "undefined") return false;
    try {
      return new URL(BASE).origin !== window.location.origin;
    } catch {
      return false;
    }
  }

  function saveApiTokens(accessToken, refreshToken) {
    if (!isCrossOriginApi()) return;
    if (accessToken) sessionStorage.setItem(TOKEN_ACCESS, accessToken);
    if (refreshToken) sessionStorage.setItem(TOKEN_REFRESH, refreshToken);
  }

  function hasAuthTokens() {
    if (!isCrossOriginApi()) return true;
    return !!(
      sessionStorage.getItem(TOKEN_ACCESS) || sessionStorage.getItem(TOKEN_REFRESH)
    );
  }

  /** Connexion de secours si l'inscription n'a pas renvoyé de jetons (cross-origin). */
  async function ensureAuthTokens(credentials) {
    if (!isCrossOriginApi() || hasAuthTokens() || !credentials) return hasAuthTokens();
    const { identifier, password, role, extra = {} } = credentials;
    if (!identifier || !password) return false;
    try {
      await login(identifier, password, role, extra);
      return hasAuthTokens();
    } catch {
      return false;
    }
  }

  function apiCredentials() {
    return isCrossOriginApi() ? "omit" : "include";
  }

  function apiJsonHeaders(extra) {
    const headers = Object.assign({}, extra || {});
    if (!isCrossOriginApi()) {
      headers.Accept = "application/json";
    }
    return headers;
  }

  function getAuthHeaders() {
    if (!isCrossOriginApi()) return {};
    const token = sessionStorage.getItem(TOKEN_ACCESS);
    return token ? { Authorization: "Bearer " + token } : {};
  }

  function getAccessToken() {
    if (!isCrossOriginApi()) return null;
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
    const res = await fetchWithTimeout(`${BASE}/api${path}`, {
      ...options,
      credentials: apiCredentials(),
      headers: apiJsonHeaders({
        ...getAuthHeaders(),
        ...(options.body && !(options.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers,
      }),
    });

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
      const authErr = new Error(apiErrorMessage(data) || ERROR_MESSAGES.AUTH_REQUIRED);
      authErr.code = data.error || "AUTH_REQUIRED";
      authErr.status = 401;
      authErr.sessionInvalid = !options.softAuth;
      throw authErr;
    }

    if (!res.ok) {
      const err = new Error(apiErrorMessage(data));
      err.code = data.error;
      err.status = res.status;
      if (data.error === "USER_NOT_FOUND" || data.error === "TOKEN_EXPIRED") {
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

  /** Réveille l'API Render (cold start ~30–90 s) avant connexion / inscription. */
  async function wakeServer(options) {
    return ping(
      Object.assign(
        {
          attempts: 6,
          timeoutMs: 50000,
          delayMs: 6000,
        },
        options || {}
      )
    );
  }

  async function ensureOnline(force) {
    if (force || online === null) await ping(force ? { attempts: 5, timeoutMs: 45000 } : undefined);
    return online;
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
    "sectionKind",
    "sectionName",
    "sectionId",
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
    return out;
  }

  function isDuplicateRegistrationError(err) {
    if (!err) return false;
    if (err.code === "EMAIL_EXISTS" || err.status === 409) return true;
    const msg = String(err.message || "");
    return /déjà|existe|already/i.test(msg);
  }

  async function registerOrLogin(profile) {
    const payload = buildRegisterPayload(profile);
    const loginExtra = {
      universite: profile.universite || null,
      codeUni: profile.codeUni || null,
    };
    try {
      return await register(payload);
    } catch (regErr) {
      if (!profile.password || !isDuplicateRegistrationError(regErr)) throw regErr;
      return login(profile.email, profile.password, profile.role, loginExtra);
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
        adminPortal: !!extra.adminPortal,
      }),
    });
    sessionCache = tagApiSession(data.session);
    saveApiTokens(data.accessToken, data.refreshToken);
    localStorage.setItem("sac_session", JSON.stringify(sessionCache));
    return sessionCache;
  }

  async function register(profile) {
    const data = await request("/auth/register", {
      method: "POST",
      body: JSON.stringify(profile),
    });
    sessionCache = tagApiSession(data.session);
    saveApiTokens(data.accessToken, data.refreshToken);
    localStorage.setItem("sac_session", JSON.stringify(sessionCache));

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
      if (!loggedIn) {
        throw new Error(
          "Compte créé mais session impossible. Reconnectez-vous avec votre e-mail et mot de passe."
        );
      }
      return sessionCache;
    }

    return sessionCache;
  }

  async function refresh(opts) {
    try {
      const refreshToken = isCrossOriginApi()
        ? sessionStorage.getItem(TOKEN_REFRESH)
        : null;
      const data = await request("/auth/refresh", {
        method: "POST",
        body: refreshToken ? JSON.stringify({ refreshToken }) : undefined,
        softAuth: !!(opts && opts.soft),
      });
      sessionCache = tagApiSession(data.session);
      saveApiTokens(data.accessToken, data.refreshToken);
      localStorage.setItem("sac_session", JSON.stringify(sessionCache));
      return true;
    } catch {
      if (!opts || !opts.soft) {
        clearClientSession();
      }
      return false;
    }
  }

  async function logout() {
    try {
      const refreshToken = isCrossOriginApi()
        ? sessionStorage.getItem(TOKEN_REFRESH)
        : null;
      await request("/auth/logout", {
        method: "POST",
        body: refreshToken ? JSON.stringify({ refreshToken }) : undefined,
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
        localStorage.setItem("sac_session", JSON.stringify(sessionCache));
        return sessionCache;
      } catch {
        return null;
      }
    }
    const data = await request("/auth/me");
    sessionCache = tagApiSession(data.session);
    localStorage.setItem("sac_session", JSON.stringify(sessionCache));
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

  async function getTariff(universite, role) {
    const q = new URLSearchParams({ universite, role });
    return request("/tariffs?" + q.toString());
  }

  async function getCampusTariffs(universite) {
    const q = new URLSearchParams({ universite });
    return request("/tariffs?" + q.toString());
  }

  async function updateCampusTariffs(tariffs) {
    return request("/tariffs/campus", {
      method: "PATCH",
      body: JSON.stringify({ tariffs }),
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

  async function listHomeNews() {
    const data = await platformRequest("/platform/home-news", { auth: false });
    return data.items || [];
  }

  async function getCampusBranding(universite) {
    const code = encodeURIComponent(String(universite || "").trim());
    if (!code) return { logoUrl: null };
    return platformRequest("/platform/campus-branding?universite=" + code, { auth: false });
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

  async function pingPresence(payload = {}) {
    return request("/platform/presence/ping", {
      method: "POST",
      body: JSON.stringify(payload || {}),
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
    if (!useAuth) {
      const res = await fetch(`${BASE}/api${path}`, {
        ...opts,
        credentials: apiCredentials(),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...opts.headers,
        },
      });
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

  async function uploadFormData(path, formData, method) {
    const doUpload = async () =>
      fetchWithTimeout(`${BASE}/api${path}`, {
        method: method || "POST",
        credentials: apiCredentials(),
        headers: {
          ...getAuthHeaders(),
        },
        body: formData,
      }, 60000);

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
      const err = new Error(apiErrorMessage(data));
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
    if (isCrossOriginApi() && !getAccessToken()) {
      try {
        await refresh();
      } catch {
        /* ignore */
      }
    }
    if (isCrossOriginApi() && !getAccessToken()) {
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
    ensureOnline,
    isOnline,
    isLocalDevHost,
    allowOfflineAuth,
    login,
    register,
    registerOrLogin,
    buildRegisterPayload,
    refresh,
    logout,
    me,
    requestPasswordReset,
    resetPassword,
    resetPasswordWithCode,
    createSectionStudent,
    createSectionHeadAccount,
    listSectionStudents,
    listCampusProfessors,
    nominateProfessor,
    revokeProfessorNomination,
    getDocuments,
    createDocument,
    updateDocument,
    deleteDocument,
    addReaction,
    getTariff,
    getCampusTariffs,
    updateCampusTariffs,
    getPlatformTariffs,
    updatePlatformTariffs,
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
    getCampusBranding,
    createHomeNews,
    updateHomeNews,
    deleteHomeNews,
    uploadHomeNewsMedia,
    listProfessorStudents,
    getAdminAccountsSummary,
    listAdminAccounts,
    deleteAdminAccount,
    getPlatformAccountsSummary,
    listPlatformAccounts,
    deletePlatformAccount,
    getInstitutionalSummary,
    listInstitutionalAdmins,
    createInstitutionalAdmin,
    deleteInstitutionalAdmin,
    getAdminActivitiesSummary,
    listAdminActivities,
    deleteAdminActivities,
    getAdminPresenceSummary,
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

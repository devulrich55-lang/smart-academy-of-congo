/**
 * Client API sécurisé — Smart Academy of Congo
 * Cookies httpOnly (sac_access, sac_refresh) — credentials: include
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
      return "https://smart-academy-of-congo-api.onrender.com";
    }
    const isLocalHost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]";

    const BACKEND_PORT = "8000";

    // Prod (Firebase / Vercel): same-origin + rewrites /api vers Cloud Run ou backend.
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
    return {
      ...session,
      authSource: "api",
      connectedAt: session.connectedAt || new Date().toISOString(),
    };
  }

  function clearClientSession() {
    sessionCache = null;
    localStorage.removeItem("sac_session");
  }

  let online = null;
  let sessionCache = null;

  async function request(path, options = {}) {
    const res = await fetch(`${BASE}/api${path}`, {
      ...options,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(options.body && !(options.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers,
      },
    });

    let data = {};
    try {
      data = await res.json();
    } catch {
      /* non-json */
    }

    if (res.status === 401 && path !== "/auth/login" && path !== "/auth/refresh" && path !== "/auth/forgot-password" && path !== "/auth/reset-password") {
      const refreshed = await refresh();
      if (refreshed) {
        return request(path, options);
      }
      clearClientSession();
    }

    if (!res.ok) {
      const err = new Error(data.message || data.error || "API_ERROR");
      err.code = data.error;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function ping() {
    if (typeof window !== "undefined" && window.location.protocol === "file:") {
      online = false;
      return false;
    }
    if (!BASE) {
      online = false;
      return false;
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await fetch(`${BASE}/api/health`, {
          credentials: "include",
          mode: "cors",
        });
        online = res.ok;
        return online;
      } catch {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
    online = false;
    return false;
  }

  async function ensureOnline(force) {
    if (force || online === null) await ping();
    return online;
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
      }),
    });
    sessionCache = tagApiSession(data.session);
    localStorage.setItem("sac_session", JSON.stringify(sessionCache));
    return sessionCache;
  }

  async function register(profile) {
    const data = await request("/auth/register", {
      method: "POST",
      body: JSON.stringify(profile),
    });
    sessionCache = tagApiSession(data.session);
    localStorage.setItem("sac_session", JSON.stringify(sessionCache));
    return sessionCache;
  }

  async function refresh() {
    try {
      const data = await request("/auth/refresh", { method: "POST" });
      sessionCache = tagApiSession(data.session);
      localStorage.setItem("sac_session", JSON.stringify(sessionCache));
      return true;
    } catch {
      clearClientSession();
      return false;
    }
  }

  async function logout() {
    try {
      await request("/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    clearClientSession();
  }

  async function me() {
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

  async function platformRequest(path, options = {}) {
    const useAuth = options.auth !== false;
    const opts = { ...options };
    delete opts.auth;
    if (!useAuth) {
      const res = await fetch(`${BASE}/api${path}`, {
        ...opts,
        credentials: "include",
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
    const res = await fetch(`${BASE}/api${path}`, {
      method: method || "POST",
      credentials: "include",
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || data.error || "UPLOAD_ERROR");
      err.code = data.error;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function getBase() {
    return BASE;
  }

  function isOnline() {
    return online === true;
  }

  return {
    ping,
    ensureOnline,
    isOnline,
    isLocalDevHost,
    allowOfflineAuth,
    login,
    register,
    refresh,
    logout,
    me,
    requestPasswordReset,
    resetPassword,
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
    listSections,
    upsertSection,
    patchSection,
    listReclamations,
    createReclamation,
    patchReclamation,
    platformRequest,
    uploadFormData,
    getBase,
  };
})();

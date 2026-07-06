/**
 * Administration institutionnelle — Ministère / Super Admin (API)
 */
const SAC_INSTITUTIONAL = (function () {
  let summaryCache = null;
  let adminsCache = [];

  function isReady() {
    return typeof SAC_API !== "undefined" && typeof SAC_API.listInstitutionalAdmins === "function";
  }

  async function load(session) {
    if (!session || !isReady()) return { summary: null, admins: [], offline: true };
    if (session.role !== "ministere" && session.role !== "superadmin") {
      return { summary: null, admins: [], offline: true };
    }
    try {
      const online = await SAC_API.ensureOnline(false, { maxWaitMs: 18000 });
      const hasTokens =
        typeof SAC_API.hasAuthTokens === "function" && SAC_API.hasAuthTokens();
      if (!online && !hasTokens) {
        return { summary: summaryCache, admins: adminsCache, offline: true };
      }
      const [summary, admins] = await Promise.all([
        SAC_API.getInstitutionalSummary(),
        SAC_API.listInstitutionalAdmins(),
      ]);
      summaryCache = summary;
      adminsCache = Array.isArray(admins) ? admins : [];
      if (typeof SAC_UNIVERSITY_LOGO !== "undefined") {
        adminsCache.forEach((a) => {
          if (a.role === "universite" && a.logoUrl) SAC_UNIVERSITY_LOGO.registerForUniversity(a);
        });
      }
      return { summary: summaryCache, admins: adminsCache, offline: false };
    } catch (err) {
      console.warn("[SAC_INSTITUTIONAL]", err.message || err);
      return {
        summary: summaryCache,
        admins: adminsCache,
        offline: false,
        error: err.message || String(err),
      };
    }
  }

  async function create(session, payload) {
    if (!session || session.role !== "superadmin") throw new Error("Accès refusé");
    if (typeof SAC_API !== "undefined") {
      if (SAC_API.ensureOnline) await SAC_API.ensureOnline(true);
      if (SAC_API.ensureApiSession) await SAC_API.ensureApiSession();
    }
    const created = await SAC_API.createInstitutionalAdmin(payload);
    if (payload.logoUrl && typeof SAC_UNIVERSITY_LOGO !== "undefined") {
      SAC_UNIVERSITY_LOGO.registerForUniversity({ ...payload, ...created });
    }
    await load(session);
    return created;
  }

  async function remove(session, email) {
    if (!session || session.role !== "superadmin") throw new Error("Accès refusé");
    await SAC_API.deleteInstitutionalAdmin(email);
    adminsCache = adminsCache.filter(
      (a) => String(a.email || "").toLowerCase() !== String(email || "").toLowerCase()
    );
    await load(session);
  }

  function roleBadgeClass(role) {
    if (role === "superadmin") return "badge-super";
    if (role === "ministere") return "badge-min";
    if (role === "developpeur") return "badge-dev";
    if (role === "techmanager") return "badge-tm";
    return "badge-uni";
  }

  return {
    load,
    create,
    remove,
    roleBadgeClass,
    getAdmins: () => adminsCache.slice(),
    getSummary: () => summaryCache,
  };
})();

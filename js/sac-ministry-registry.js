/**
 * Registre ministériel — statuts établissements (partagé hub / portail / session)
 */
const SAC_MINISTRY_REGISTRY = (function () {
  const STORAGE_KEY = "sac_ministry_hub_v1";
  const BLOCK_MSG =
    "Votre établissement est suspendu par le Ministère de l'Enseignement Supérieur. Contactez le MESU pour rétablir l'accès à la plateforme.";

  function readStore() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function writeStore(patch) {
    const all = readStore();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...all, ...patch }));
  }

  function normEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function getStatuses() {
    return readStore().universityStatus || {};
  }

  function getUniversityStatus(email) {
    return getStatuses()[normEmail(email)] || null;
  }

  function setUniversityStatus(email, status) {
    const key = normEmail(email);
    if (!key) return;
    const statuses = { ...getStatuses(), [key]: status };
    writeStore({ universityStatus: statuses });
  }

  function isUniversitySuspended(email) {
    return getUniversityStatus(email) === "suspended";
  }

  function resolveDisplayStatus(admin) {
    const key = normEmail(admin?.email || admin?.id);
    const apiStatus = admin?.ministryStatus || admin?.ministry_status;
    if (apiStatus === "suspended") return "suspended";
    const local = getStatuses()[key];
    if (local === "suspended") return "suspended";
    if (admin?.verified === false || admin?.active === false) return "pending";
    if (local === "pending" || apiStatus === "pending") return "pending";
    return "approved";
  }

  function syncFromAdmins(admins) {
    const statuses = { ...getStatuses() };
    let changed = false;
    (admins || [])
      .filter((a) => a.role === "universite")
      .forEach((a) => {
        const key = normEmail(a.email);
        const apiStatus = a.ministryStatus || a.ministry_status;
        if (apiStatus && statuses[key] !== apiStatus) {
          statuses[key] = apiStatus;
          changed = true;
        }
      });
    if (changed) writeStore({ universityStatus: statuses });
    return statuses;
  }

  function shouldBlockSession(session) {
    if (!session || session.role !== "universite") return false;
    const email = session.email || session.identifiant;
    if (session.ministryStatus === "suspended" || session.ministry_status === "suspended") {
      return true;
    }
    return isUniversitySuspended(email);
  }

  function enforceAccess(session) {
    if (!shouldBlockSession(session)) return true;
    const loginUrl =
      typeof SAC_PORTAL !== "undefined" && SAC_PORTAL.loginUrlForRole
        ? SAC_PORTAL.loginUrlForRole("universite")
        : "admin-uni/";
    alert(BLOCK_MSG);
    if (typeof SAC_SESSION !== "undefined" && SAC_SESSION.logout) {
      SAC_SESSION.logout(loginUrl);
    } else {
      window.location.replace(loginUrl);
    }
    return false;
  }

  async function setUniversityStatusWithApi(email, status) {
    setUniversityStatus(email, status);
    if (typeof SAC_API === "undefined" || !SAC_API.patchInstitutionalAdmin) return;
    try {
      if (SAC_API.ensureWritableApiSession) {
        await SAC_API.ensureWritableApiSession({ soft: true, timeoutMs: 10000 });
      }
      await SAC_API.patchInstitutionalAdmin(email, { ministryStatus: status });
    } catch {
      /* registre local conservé */
    }
  }

  return {
    STORAGE_KEY,
    BLOCK_MSG,
    getStatuses,
    getUniversityStatus,
    setUniversityStatus,
    setUniversityStatusWithApi,
    isUniversitySuspended,
    resolveDisplayStatus,
    syncFromAdmins,
    shouldBlockSession,
    enforceAccess,
  };
})();

if (typeof window !== "undefined") {
  window.SAC_MINISTRY_REGISTRY = SAC_MINISTRY_REGISTRY;
}

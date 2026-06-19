/**
 * Gestion des comptes campus — administration université (API)
 */
const SAC_ADMIN_ACCOUNTS = (function () {
  let summaryCache = null;
  let accountsCache = [];

  function campusCode(session) {
    return session?.universite || session?.codeUni || session?.sigle || "";
  }

  function isReady() {
    return typeof SAC_API !== "undefined" && typeof SAC_API.listAdminAccounts === "function";
  }

  async function load(session, options = {}) {
    if (!session || session.role !== "universite" || !isReady()) {
      return { summary: null, accounts: [] };
    }
    try {
      const online = await SAC_API.ensureOnline();
      if (!online) return { summary: summaryCache, accounts: accountsCache };

      const role = options.role || null;
      const [summary, accounts] = await Promise.all([
        SAC_API.getAdminAccountsSummary(),
        SAC_API.listAdminAccounts(role),
      ]);
      summaryCache = summary;
      accountsCache = Array.isArray(accounts) ? accounts : [];
      return { summary: summaryCache, accounts: accountsCache };
    } catch (err) {
      console.warn("[SAC_ADMIN_ACCOUNTS] load:", err.message || err);
      return { summary: summaryCache, accounts: accountsCache };
    }
  }

  function getSummary() {
    return summaryCache;
  }

  function getAccounts() {
    return accountsCache.slice();
  }

  async function remove(session, email) {
    if (!isReady()) throw new Error("API indisponible");
    const normalized = String(email || "").toLowerCase();
    const removed = accountsCache.find((a) => String(a.email || "").toLowerCase() === normalized);
    await SAC_API.deleteAdminAccount(email);
    accountsCache = accountsCache.filter((a) => String(a.email || "").toLowerCase() !== normalized);
    if (summaryCache && removed) {
      if (summaryCache.byRole && removed.role in summaryCache.byRole) {
        summaryCache.byRole[removed.role] = Math.max(0, summaryCache.byRole[removed.role] - 1);
      }
      summaryCache.total = Math.max(0, (summaryCache.total || 1) - 1);
    }
    await load(session);
    return true;
  }

  function displayName(account) {
    const name = [account?.prenom, account?.nom].filter(Boolean).join(" ").trim();
    return name || account?.email || "—";
  }

  return {
    campusCode,
    load,
    getSummary,
    getAccounts,
    remove,
    displayName,
  };
})();

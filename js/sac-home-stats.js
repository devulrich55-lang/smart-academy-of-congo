/**
 * Compteurs publics page d'accueil — universités partenaires & étudiants inscrits (API live)
 */
const SAC_HOME_STATS = (function () {
  const CACHE_KEY = "sac_home_stats_v1";
  const CACHE_TTL_MS = 5 * 60 * 1000;

  function formatCount(n) {
    const v = Math.max(0, Math.round(Number(n) || 0));
    return v.toLocaleString("fr-FR");
  }

  function readCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || Date.now() - (data.at || 0) > CACHE_TTL_MS) return null;
      return data.stats || null;
    } catch {
      return null;
    }
  }

  function writeCache(stats) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), stats }));
    } catch {
      /* ignore */
    }
  }

  function animateCount(el, target, durationMs) {
    if (!el) return;
    const end = Math.max(0, Math.round(Number(target) || 0));
    if (end === 0) {
      el.textContent = "0";
      return;
    }
    const start = performance.now();
    const dur = durationMs || Math.min(1600, 600 + end * 8);
    function frame(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = formatCount(Math.round(end * eased));
      if (t < 1) requestAnimationFrame(frame);
      else el.textContent = formatCount(end);
    }
    requestAnimationFrame(frame);
  }

  function normalizeStats(data) {
    const d = data || {};
    return {
      partnerUniversities: Number(
        d.partnerUniversities ?? d.partner_universities ?? d.universities ?? 0
      ),
      registeredStudents: Number(
        d.registeredStudents ?? d.registered_students ?? d.students ?? 0
      ),
    };
  }

  async function fetchFromApi() {
    if (typeof SAC_API === "undefined" || !SAC_API.getPublicPlatformStats) {
      return null;
    }
    const online = await SAC_API.ensureOnline();
    if (!online) return null;
    const data = await SAC_API.getPublicPlatformStats();
    return normalizeStats(data);
  }

  async function fetchFallbackUniversities() {
    if (typeof SAC_UNIVERSITIES === "undefined") return 0;
    try {
      await SAC_UNIVERSITIES.hydrateFromApi();
    } catch {
      /* ignore */
    }
    const list = SAC_UNIVERSITIES.UNIVERSITIES || [];
    return Array.isArray(list) ? list.length : 0;
  }

  async function loadStats() {
    const cached = readCache();
    if (cached) return cached;

    try {
      const live = await fetchFromApi();
      if (live) {
        writeCache(live);
        return live;
      }
    } catch (err) {
      console.warn("[SAC_HOME_STATS] API:", err.message || err);
    }

    return {
      partnerUniversities: await fetchFallbackUniversities(),
      registeredStudents: 0,
    };
  }

  async function mount(opts) {
    opts = opts || {};
    const uniEl =
      typeof opts.universitiesEl === "string"
        ? document.getElementById(opts.universitiesEl)
        : opts.universitiesEl || document.getElementById("heroStatUniversities");
    const stuEl =
      typeof opts.studentsEl === "string"
        ? document.getElementById(opts.studentsEl)
        : opts.studentsEl || document.getElementById("heroStatStudents");
    if (!uniEl && !stuEl) return;

    const stats = await loadStats();
    animateCount(uniEl, stats.partnerUniversities);
    animateCount(stuEl, stats.registeredStudents);

    if (!opts.once) {
      fetchFromApi()
        .then((live) => {
          if (!live) return;
          writeCache(live);
          if (uniEl) uniEl.textContent = formatCount(live.partnerUniversities);
          if (stuEl) stuEl.textContent = formatCount(live.registeredStudents);
        })
        .catch(() => {});
    }
  }

  return { mount, loadStats, formatCount };
})();

/**
 * Tarifs d'inscription Evo-smartUni
 * — défauts plateforme (Super Admin) + tarifs campus par université (DG)
 */
const SAC_TARIFFS = (function () {
  const PLATFORM_STORAGE_KEY = "sac_platform_tariffs";
  const PLATFORM_SYNC_INTERVAL_MS = 30000;
  const ROLES = ["etudiant", "assistant", "professeur", "universite"];

  const FALLBACK_CDF_PER_USD = 2300;
  const FALLBACK_FEES = {
    etudiant: { amount: 1, currency: "USD", label: "Étudiant" },
    assistant: { amount: 5, currency: "USD", label: "Assistant" },
    professeur: { amount: 10, currency: "USD", label: "Professeur" },
    universite: { amount: 20, currency: "USD", label: "Université" },
  };

  const CAMPUS_ROLES = ["etudiant", "professeur", "assistant"];
  const FALLBACK_ACADEMIC_TRIMESTRE = 150;
  const FEE_CATEGORY_DEFS = [
    { key: "frais_academiques", label: "Frais académiques", term: "Année académique", icon: "🎓", defaultAmount: 150 },
    { key: "enrolement", label: "Frais d'enrôlement", term: "Année académique", icon: "📋", defaultAmount: 80 },
    { key: "reinscription", label: "Frais de réinscription", term: "Année académique", icon: "🔄", defaultAmount: 60 },
    { key: "minerval", label: "Minerval", term: "Année académique", icon: "📚", defaultAmount: 500 },
    { key: "inscription_univ", label: "Inscription universitaire", term: "Année académique", icon: "📝", defaultAmount: 50 },
    { key: "bibliotheque", label: "Bibliothèque", term: "Année académique", icon: "📖", defaultAmount: 30 },
    { key: "laboratoire", label: "Laboratoire", term: "Année académique", icon: "🔬", defaultAmount: 20 },
  ];
  const cache = new Map();
  let platformCache = null;
  let platformLoadPromise = null;

  function normalizePlatformSettings(raw) {
    const fees = {};
    const srcFees = raw?.fees || raw?.tariffs || {};
    for (const role of ROLES) {
      const fb = FALLBACK_FEES[role];
      const r = srcFees[role] || {};
      const amount = Number(r.amount);
      fees[role] = {
        amount: Number.isFinite(amount) && amount > 0 ? amount : fb.amount,
        currency: r.currency || "USD",
        label: r.label || fb.label,
      };
    }
    const cdf = Number(raw?.cdfPerUsd ?? raw?.CDF_PER_USD);
    return {
      cdfPerUsd: Number.isFinite(cdf) && cdf > 0 ? cdf : FALLBACK_CDF_PER_USD,
      fees,
      updatedAt: raw?.updatedAt || null,
      updatedBy: raw?.updatedBy || null,
    };
  }

  function readStoredPlatformSettings() {
    try {
      const raw = localStorage.getItem(PLATFORM_STORAGE_KEY);
      if (!raw) return null;
      return normalizePlatformSettings(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  function writeStoredPlatformSettings(settings) {
    localStorage.setItem(PLATFORM_STORAGE_KEY, JSON.stringify(settings));
  }

  function getPlatformSettings() {
    if (platformCache) return platformCache;
    platformCache = readStoredPlatformSettings() || normalizePlatformSettings(null);
    return platformCache;
  }

  function getCdfPerUsd() {
    return getPlatformSettings().cdfPerUsd;
  }

  function getDefaultFees() {
    const fees = getPlatformSettings().fees;
    const out = {};
    for (const role of ROLES) {
      out[role] = {
        ...fees[role],
        cdf: toCdf(fees[role].amount),
      };
    }
    return out;
  }

  function toCdf(usd) {
    return Math.round(Number(usd) * getCdfPerUsd());
  }

  function defaultFor(role) {
    const settings = getPlatformSettings();
    const def = settings.fees[role] || settings.fees.etudiant;
    return {
      ...def,
      cdf: toCdf(def.amount),
    };
  }

  async function loadPlatformSettings(force) {
    if (platformLoadPromise && !force) {
      await platformLoadPromise;
      return getPlatformSettings();
    }
    platformLoadPromise = (async () => {
      const localFallback = readStoredPlatformSettings() || normalizePlatformSettings(null);
      if (typeof SAC_API === "undefined") {
        platformCache = localFallback;
        return platformCache;
      }
      try {
        const online = await SAC_API.ensureOnline(false, { maxWaitMs: 8000 });
        if (online) {
          const data = await SAC_API.getPlatformTariffs();
          if (data?.tariffs || data?.fees || data?.cdfPerUsd) {
            platformCache = normalizePlatformSettings(data);
            writeStoredPlatformSettings(platformCache);
            clearCache();
            return platformCache;
          }
        }
      } catch {
        /* repli localStorage */
      }
      platformCache = localFallback;
      return platformCache;
    })();
    await platformLoadPromise;
    platformLoadPromise = null;
    return getPlatformSettings();
  }

  let platformEnsured = false;
  let platformSyncTimer = null;
  let platformSyncFingerprint = null;
  const platformListeners = new Set();

  function platformFingerprint(settings) {
    if (!settings) return "";
    const f = settings.fees || {};
    return [
      settings.updatedAt || "",
      settings.cdfPerUsd,
      ROLES.map((r) => f[r]?.amount).join(","),
    ].join("|");
  }

  function notifyPlatformTariffsChanged() {
    syncPricingTierLabels();
    syncPublicFeeLine("homeFeeLine");
    const detail = getPlatformSettings();
    window.dispatchEvent(
      new CustomEvent("sac-platform-tariffs-updated", { detail })
    );
    platformListeners.forEach((fn) => {
      try {
        fn(detail);
      } catch (err) {
        console.warn("[SAC_TARIFFS] listener:", err);
      }
    });
  }

  function onPlatformTariffsUpdated(fn) {
    if (typeof fn !== "function") return () => {};
    platformListeners.add(fn);
    return () => platformListeners.delete(fn);
  }

  async function refreshPlatformFromServer() {
    const before = platformFingerprint(getPlatformSettings());
    await loadPlatformSettings(true);
    const after = platformFingerprint(getPlatformSettings());
    if (after !== before) {
      platformSyncFingerprint = after;
      notifyPlatformTariffsChanged();
    } else {
      platformSyncFingerprint = after;
    }
    return getPlatformSettings();
  }

  function startPlatformSyncPolling(intervalMs) {
    if (platformSyncTimer) return;
    platformSyncFingerprint = platformFingerprint(getPlatformSettings());
    const ms = intervalMs || PLATFORM_SYNC_INTERVAL_MS;
    platformSyncTimer = setInterval(() => {
      refreshPlatformFromServer().catch(() => {});
    }, ms);
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (e) => {
        if (e.key !== PLATFORM_STORAGE_KEY) return;
        platformCache = readStoredPlatformSettings();
        clearCache();
        const fp = platformFingerprint(platformCache);
        if (fp !== platformSyncFingerprint) {
          platformSyncFingerprint = fp;
          notifyPlatformTariffsChanged();
        }
      });
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
          refreshPlatformFromServer().catch(() => {});
        }
      });
    }
  }

  async function ensurePlatformSettings(force) {
    if (force) return loadPlatformSettings(true);
    if (platformEnsured) {
      if (!platformCache) getPlatformSettings();
      return platformCache;
    }
    platformEnsured = true;
    return loadPlatformSettings(false);
  }

  async function savePlatformSettings(session, patch) {
    if (!session || session.role !== "superadmin") {
      throw new Error("Seul le Super Administrateur peut modifier les tarifs plateforme.");
    }
    const current = getPlatformSettings();
    const nextFees = { ...current.fees };
    if (patch?.fees) {
      for (const role of ROLES) {
        if (patch.fees[role]) {
          const amount = Number(patch.fees[role].amount);
          if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error("Montant invalide pour " + role);
          }
          nextFees[role] = {
            ...nextFees[role],
            amount,
            currency: "USD",
            label: patch.fees[role].label || nextFees[role].label,
          };
        }
      }
    }
    const cdf = patch?.cdfPerUsd != null ? Number(patch.cdfPerUsd) : current.cdfPerUsd;
    if (!Number.isFinite(cdf) || cdf <= 0) {
      throw new Error("Taux USD → FC invalide.");
    }
    const next = normalizePlatformSettings({
      cdfPerUsd: cdf,
      fees: nextFees,
      updatedAt: new Date().toISOString(),
      updatedBy: session.identifiant || session.userId,
    });
    platformCache = next;
    writeStoredPlatformSettings(next);
    clearCache();

    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
      try {
        await SAC_API.updatePlatformTariffs({
          cdfPerUsd: next.cdfPerUsd,
          fees: next.fees,
        });
      } catch (err) {
        console.warn("[SAC_TARIFFS] API plateforme:", err.message || err);
      }
    }
    platformSyncFingerprint = platformFingerprint(next);
    notifyPlatformTariffsChanged();
    return next;
  }

  function normalizeFee(raw, role) {
    if (!raw || typeof raw.amount !== "number") return defaultFor(role);
    return {
      amount: raw.amount,
      currency: raw.currency || "USD",
      cdf: toCdf(raw.amount),
      label: raw.label || defaultFor(role).label,
    };
  }

  function resolveCampusCode(raw) {
    if (!raw) return "";
    if (typeof SAC_UNIVERSITIES !== "undefined" && SAC_UNIVERSITIES.resolveId) {
      return SAC_UNIVERSITIES.resolveId(raw) || String(raw).trim();
    }
    return normUniCode(raw);
  }

  function findLocalUniversity(universiteCode) {
    if (!universiteCode) return null;
    let users = [];
    try {
      users = JSON.parse(localStorage.getItem("sac_users") || "[]");
    } catch {
      return null;
    }
    return users.find((u) => {
      if (u.role !== "universite") return false;
      if (typeof SAC_UNIVERSITIES !== "undefined" && SAC_UNIVERSITIES.sameCampus) {
        const keys = [u.universite, u.universiteLocked, u.sigle, u.codeUni].filter(Boolean);
        return keys.some((k) => SAC_UNIVERSITIES.sameCampus(k, universiteCode));
      }
      const code = normUniCode(universiteCode);
      const keys = [u.universite, u.sigle, u.codeUni]
        .filter(Boolean)
        .map(normUniCode);
      return keys.includes(code);
    });
  }

  function normalizeCategoryAmount(val, fallback) {
    if (val === "" || val == null) return 0;
    const n = Number(val);
    if (n === 0) return 0;
    if (Number.isFinite(n) && n >= 1 && n <= 50000) return Math.round(n * 100) / 100;
    return fallback;
  }

  function normalizeAcademicFees(raw, legacyCampusTariffs) {
    const src = raw || {};
    let legacyAmount = legacyCampusTariffs?.etudiant?.amount;
    if (legacyAmount != null && legacyAmount < 10) {
      legacyAmount = FALLBACK_ACADEMIC_TRIMESTRE;
    }
    const trimVal = Number(src.trimestre?.amount ?? src.t1?.amount ?? legacyAmount);
    const trim =
      Number.isFinite(trimVal) && trimVal > 0 ? trimVal : FALLBACK_ACADEMIC_TRIMESTRE;
    const t1 = Number(src.t1?.amount);
    const t2 = Number(src.t2?.amount);
    const t3 = Number(src.t3?.amount);
    const srcCats = src.categories && typeof src.categories === "object" ? src.categories : {};
    const categories = {};
    FEE_CATEGORY_DEFS.forEach((def) => {
      const entry = srcCats[def.key] || {};
      let amount = normalizeCategoryAmount(entry.amount, def.defaultAmount);
      if (!srcCats[def.key] && def.key === "frais_academiques" && trim > 0 && !src.categories) {
        amount = trim;
      } else if (!srcCats[def.key] && def.key === "minerval" && trim > 0 && !src.categories) {
        amount = trim;
      }
      categories[def.key] = { amount, currency: entry.currency || "USD", label: def.label };
    });
    return {
      trimestre: { amount: trim, currency: "USD" },
      t1: { amount: Number.isFinite(t1) && t1 > 0 ? t1 : trim, currency: "USD" },
      t2: { amount: Number.isFinite(t2) && t2 > 0 ? t2 : trim, currency: "USD" },
      t3: { amount: Number.isFinite(t3) && t3 > 0 ? t3 : trim, currency: "USD" },
      categories,
      useCategories: !!src.categories || !src.t1,
    };
  }

  function getLocalCampusAcademicFees(universiteCode) {
    const uni = findLocalUniversity(universiteCode);
    if (!uni) return null;
    if (uni.campusAcademicFees) {
      return normalizeAcademicFees(uni.campusAcademicFees, uni.campusTariffs);
    }
    if (uni.campusTariffs?.etudiant) {
      return normalizeAcademicFees(null, uni.campusTariffs);
    }
    return null;
  }

  async function fetchCampusAcademicFees(universiteCode) {
    if (!universiteCode) return normalizeAcademicFees(null);
    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
      try {
        const data = await SAC_API.getCampusTariffs(universiteCode);
        if (data?.academicFees) {
          return normalizeAcademicFees(data.academicFees);
        }
        if (data?.tariffs?.etudiant) {
          return normalizeAcademicFees(null, data.tariffs);
        }
      } catch {
        /* repli local */
      }
    }
    return getLocalCampusAcademicFees(universiteCode) || normalizeAcademicFees(null);
  }

  function feeFromLocalCampus(universiteCode, role) {
    const uni = findLocalUniversity(universiteCode);
    const tariffs = uni?.campusTariffs;
    if (!tariffs || !tariffs[role]) return null;
    return normalizeFee(tariffs[role], role);
  }

  async function fetchCampusFee(universiteCode, role) {
    if (!universiteCode || !CAMPUS_ROLES.includes(role)) return defaultFor(role);
    const key = universiteCode + ":" + role;
    if (cache.has(key)) return cache.get(key);

    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
      try {
        const data = await SAC_API.getTariff(universiteCode, role);
        const fee = normalizeFee(data.fee, role);
        cache.set(key, fee);
        return fee;
      } catch {
        /* repli local */
      }
    }

    const local = feeFromLocalCampus(universiteCode, role);
    const fee = local || defaultFor(role);
    cache.set(key, fee);
    return fee;
  }

  async function resolve(role, universiteCode) {
    await ensurePlatformSettings();
    return defaultFor(role);
  }

  function clearCache() {
    cache.clear();
  }

  function normUniCode(code) {
    return String(code || "").trim().toLowerCase();
  }

  function userBelongsToUniversity(user, universiteCode) {
    if (typeof SAC_UNIVERSITIES !== "undefined" && SAC_UNIVERSITIES.sameCampus) {
      const keys = [user?.universite, user?.universiteLocked, user?.sigle].filter(Boolean);
      return keys.some((k) => SAC_UNIVERSITIES.sameCampus(k, universiteCode));
    }
    const code = normUniCode(universiteCode);
    if (!code || !user) return false;
    const keys = [user.universite, user.universiteLocked, user.sigle]
      .filter(Boolean)
      .map(normUniCode);
    return keys.includes(code);
  }

  function buildUniversityFeesForStudent(user, academicFees) {
    const acad = academicFees || normalizeAcademicFees(null);
    const inscFee = user?.inscriptionFee || defaultFor("etudiant");
    const inscAmount = Number(inscFee.amount) || defaultFor("etudiant").amount;
    const paidInscription =
      user?.payment?.status === "verified" ||
      user?.payment?.status === "pending_verification" ||
      !!user?.payment?.paidAt;
    const year = new Date().getFullYear();
    const rows = [
      {
        label: "Frais d'inscription (Evo-smartUni)",
        term: `Année ${year}-${year + 1}`,
        amount: inscAmount,
        amountCdf: inscFee.cdf != null ? inscFee.cdf : toCdf(inscAmount),
        currency: "USD",
        status: paidInscription ? "Payé" : "En attente",
        date: paidInscription ? (user?.payment?.paidAt || "").slice(0, 10) || "—" : "—",
        source: "platform_inscription",
        feeKey: "inscription",
      },
    ];
    if (acad.categories && (acad.useCategories !== false)) {
      FEE_CATEGORY_DEFS.forEach((def) => {
        const cat = acad.categories[def.key] || {};
        const amt = Number(cat.amount);
        if (!Number.isFinite(amt) || amt <= 0) return;
        rows.push({
          label: cat.label || def.label,
          term: def.term,
          amount: amt,
          amountCdf: toCdf(amt),
          currency: cat.currency || "USD",
          status: "En attente",
          date: "—",
          source: "campus_academic",
          feeKey: def.key,
          categoryKey: def.key,
        });
      });
      return rows;
    }
    const trimesters = [
      { key: "t1", label: "Frais académiques T1", term: "Trimestre 1" },
      { key: "t2", label: "Frais académiques T2", term: "Trimestre 2" },
      { key: "t3", label: "Frais académiques T3", term: "Trimestre 3" },
    ];
    for (const t of trimesters) {
      const amt = Number(acad[t.key]?.amount) || acad.trimestre.amount;
      rows.push({
        label: t.label,
        term: t.term,
        amount: amt,
        amountCdf: toCdf(amt),
        currency: "USD",
        status: "En attente",
        date: "—",
        source: "campus_academic",
        feeKey: t.key,
      });
    }
    return rows;
  }

  function applyAcademicFeesToStudent(user, academicFees, universiteCode) {
    if (!user || user.role !== "etudiant") return user;
    const acad = normalizeAcademicFees(academicFees);
    user.campusAcademicFees = acad;
    user.campusAcademicFeesSyncedAt = new Date().toISOString();
    user.campusAcademicFeesUniversite = universiteCode || user.campusAcademicFeesUniversite;
    if (!user.inscriptionFee) {
      user.inscriptionFee = defaultFor("etudiant");
    }
    user.universityFees = buildUniversityFeesForStudent(user, acad);
    return user;
  }

  function applyTariffsToMemberProfile(user, tariffs, universiteCode) {
    if (!user || !tariffs) return user;
    if (user.role === "etudiant") {
      const acad = tariffs.trimestre || tariffs.t1 ? normalizeAcademicFees(tariffs) : normalizeAcademicFees(null, tariffs);
      return applyAcademicFeesToStudent(user, acad, universiteCode);
    }
    return user;
  }

  function persistStudentFeeFields(email, patch) {
    if (!email || !patch) return false;
    const key = String(email).trim().toLowerCase();
    let users = [];
    try {
      users = JSON.parse(localStorage.getItem("sac_users") || "[]");
    } catch {
      return false;
    }
    const idx = users.findIndex(
      (u) => u.role === "etudiant" && String(u.email || "").trim().toLowerCase() === key
    );
    if (idx < 0) return false;
    users[idx] = {
      ...users[idx],
      campusAcademicFees: patch.campusAcademicFees,
      campusAcademicFeesSyncedAt: patch.campusAcademicFeesSyncedAt,
      campusAcademicFeesUniversite: patch.campusAcademicFeesUniversite,
      universityFees: patch.universityFees,
      inscriptionFee: patch.inscriptionFee || users[idx].inscriptionFee,
    };
    localStorage.setItem("sac_users", JSON.stringify(users));
    return true;
  }

  function applyLatestCampusFeesToUser(user, options) {
    if (!user || user.role !== "etudiant") return user;
    const uni = resolveCampusCode(user.universite || user.universiteLocked);
    if (!uni) return user;
    const uniAdmin = findLocalUniversity(uni);
    if (!uniAdmin?.campusAcademicFees && !uniAdmin?.campusTariffs) return user;

    const acad = normalizeAcademicFees(uniAdmin.campusAcademicFees, uniAdmin.campusTariffs);
    const current = normalizeAcademicFees(user.campusAcademicFees);
    const dgAt = uniAdmin.campusAcademicFeesUpdatedAt || "";
    const userAt = user.campusAcademicFeesSyncedAt || "";
    const amountsDiffer = current.trimestre.amount !== acad.trimestre.amount;
    const dgIsNewer = !!dgAt && (!userAt || dgAt > userAt);
    if (!amountsDiffer && !dgIsNewer) return user;

    const updated = applyAcademicFeesToStudent({ ...user }, acad, uni);
    if (!options || options.persist !== false) {
      persistStudentFeeFields(user.email, updated);
    }
    return updated;
  }

  function syncCampusAcademicFeesToStudents(universiteCode, academicFees) {
    const code = resolveCampusCode(universiteCode) || "";
    const acad = normalizeAcademicFees(academicFees);
    if (!code) return { updated: 0 };
    let users = [];
    try {
      users = JSON.parse(localStorage.getItem("sac_users") || "[]");
    } catch {
      return { updated: 0 };
    }
    let updated = 0;
    users = users.map((u) => {
      if (u.role !== "etudiant") return u;
      if (!userBelongsToUniversity(u, code)) return u;
      updated++;
      return applyAcademicFeesToStudent({ ...u }, acad, code);
    });
    localStorage.setItem("sac_users", JSON.stringify(users));
    const sess = JSON.parse(localStorage.getItem("sac_session") || "null");
    if (sess?.role === "etudiant" && userBelongsToUniversity(sess, code)) {
      const me = users.find((u) => u.role === "etudiant" && u.email === sess.identifiant);
      if (me) {
        Object.assign(sess, {
          campusAcademicFees: me.campusAcademicFees,
          universityFees: me.universityFees,
          campusAcademicFeesSyncedAt: me.campusAcademicFeesSyncedAt,
          inscriptionFee: me.inscriptionFee,
        });
        localStorage.setItem("sac_session", JSON.stringify(sess));
      }
    }
    clearCache();
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("sac-campus-academic-fees-updated", {
          detail: { universite: code, academicFees: acad, updated },
        })
      );
    }
    return { updated };
  }

  function syncCampusTariffsToMembers(universiteCode, tariffs) {
    const acad = tariffs?.trimestre || tariffs?.t1 ? normalizeAcademicFees(tariffs) : normalizeAcademicFees(null, tariffs);
    return syncCampusAcademicFeesToStudents(universiteCode, acad);
  }

  function getLocalCampusTariffPack(universiteCode) {
    const uni = findLocalUniversity(universiteCode);
    if (!uni?.campusTariffs) return null;
    const pack = {};
    for (const role of CAMPUS_ROLES) {
      if (uni.campusTariffs[role]) {
        pack[role] = normalizeFee(uni.campusTariffs[role], role);
      }
    }
    return Object.keys(pack).length ? pack : null;
  }

  async function fetchCampusTariffPack(universiteCode) {
    if (!universiteCode) return null;
    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
      try {
        const data = await SAC_API.getCampusTariffs(universiteCode);
        if (!data?.tariffs) return null;
        return { ...data.tariffs };
      } catch {
        /* repli local */
      }
    }
    return getLocalCampusTariffPack(universiteCode);
  }

  async function applyCampusTariffsOnRegister(profile) {
    await ensurePlatformSettings();
    if (!profile) return profile;
    profile.inscriptionFee = profile.inscriptionFee || defaultFor(profile.role);
    if (profile.role !== "etudiant") return profile;
    const uni = profile.universite || profile.universiteLocked || profile.sigle;
    if (!uni) return profile;
    const acad = await fetchCampusAcademicFees(uni);
    return applyAcademicFeesToStudent(profile, acad, uni);
  }

  async function refreshStudentFeesFromCampus(session) {
    if (!session || session.role !== "etudiant") return null;
    await ensurePlatformSettings();
    let users = [];
    try {
      users = JSON.parse(localStorage.getItem("sac_users") || "[]");
    } catch {
      users = [];
    }
    const idx = users.findIndex((u) => u.role === "etudiant" && u.email === session?.identifiant);
    const uni = resolveCampusCode(
      (idx >= 0 ? users[idx].universite || users[idx].universiteLocked : null) ||
        session?.universite ||
        session?.universiteLocked
    );

    let acad = null;
    let apiUniversityFees = null;

    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
      try {
        const me = await SAC_API.me();
        if (me?.campusAcademicFees) {
          acad = normalizeAcademicFees(me.campusAcademicFees);
        }
        if (me?.universityFees?.length) {
          apiUniversityFees = me.universityFees;
        }
      } catch {
        /* repli campus */
      }
    }

    if (!acad) {
      acad = await fetchCampusAcademicFees(uni);
    }

    const userRef = {
      ...(idx >= 0 ? users[idx] : {}),
      payment: (idx >= 0 ? users[idx].payment : null) || session?.payment,
      inscriptionFee:
        (idx >= 0 ? users[idx].inscriptionFee : null) ||
        session?.inscriptionFee ||
        defaultFor("etudiant"),
    };
    const universityFees =
      apiUniversityFees || buildUniversityFeesForStudent(userRef, acad);

    if (idx >= 0) {
      users[idx] = applyAcademicFeesToStudent(users[idx], acad, uni);
      users[idx].universityFees = universityFees;
      if (!users[idx].inscriptionFee) {
        users[idx].inscriptionFee = defaultFor("etudiant");
      }
      localStorage.setItem("sac_users", JSON.stringify(users));
    }

    const sess = JSON.parse(localStorage.getItem("sac_session") || "null");
    if (sess && sess.role === "etudiant" && sess.identifiant === session.identifiant) {
      Object.assign(sess, {
        inscriptionFee: userRef.inscriptionFee || defaultFor("etudiant"),
        universityFees,
        campusAcademicFees: acad,
        campusAcademicFeesSyncedAt: new Date().toISOString(),
      });
      localStorage.setItem("sac_session", JSON.stringify(sess));
    }
    return idx >= 0 ? users[idx] : { universityFees, campusAcademicFees: acad };
  }

  function saveLocalCampusAcademicFees(session, academicFees) {
    const code = resolveCampusCode(
      session.universite || session.universiteLocked || session.sigle || session.codeUni
    );
    if (!code) throw new Error("Code campus manquant");
    const acad = normalizeAcademicFees(academicFees);
    let users = [];
    try {
      users = JSON.parse(localStorage.getItem("sac_users") || "[]");
    } catch {
      users = [];
    }
    const idx = users.findIndex(
      (u) =>
        u.role === "universite" &&
        (u.email === session.identifiant || u.userId === session.userId || u.id === session.userId)
    );
    const entry = {
      ...(idx >= 0 ? users[idx] : {}),
      role: "universite",
      email: session.identifiant,
      universite: code,
      campusAcademicFees: acad,
      campusAcademicFeesUpdatedAt: new Date().toISOString(),
    };
    if (idx >= 0) users[idx] = { ...users[idx], ...entry };
    else users.push(entry);
    localStorage.setItem("sac_users", JSON.stringify(users));
    const sess = JSON.parse(localStorage.getItem("sac_session") || "{}");
    if (sess.role === "universite") {
      sess.campusAcademicFees = acad;
      localStorage.setItem("sac_session", JSON.stringify(sess));
    }
    clearCache();
    const sync = syncCampusAcademicFeesToStudents(code, acad);
    return { campusAcademicFees: acad, membersUpdated: sync.updated };
  }

  function saveLocalCampusTariffs(session, tariffs) {
    const acad = tariffs?.trimestre || tariffs?.t1
      ? normalizeAcademicFees(tariffs)
      : {
          trimestre: {
            amount: Number(tariffs?.etudiant?.amount) || FALLBACK_ACADEMIC_TRIMESTRE,
            currency: "USD",
          },
        };
    const saved = saveLocalCampusAcademicFees(session, acad);
    return { campusTariffs: tariffs, campusAcademicFees: saved.campusAcademicFees, membersUpdated: saved.membersUpdated };
  }

  /** Met à jour l'affichage des paliers sur inscription.html */
  function syncPricingTierLabels() {
    const defs = getDefaultFees();
    const tierLabels = {
      etudiant: { icon: "🎓", key: "auth.role.student", fb: "Étudiant" },
      assistant: { icon: "📋", key: "auth.role.assistant", fb: "Assistant" },
      professeur: { icon: "📚", key: "auth.role.prof", fb: "Professeur" },
    };
    document.querySelectorAll(".pricing-tiers li[data-tier]").forEach((li) => {
      const role = li.dataset.tier;
      const fee = defs[role];
      const tier = tierLabels[role];
      const labelEl = li.querySelector("span:first-child");
      const priceEl = li.querySelector("span:last-child");
      if (tier && labelEl) {
        labelEl.textContent =
          tier.icon + " " + tariffTx(tier.key, tier.fb);
      }
      if (fee && priceEl) priceEl.textContent = fee.amount + " USD";
    });
  }

  function tariffTx(key, fallback, vars) {
    return typeof SAC_I18N !== "undefined" ? SAC_I18N.t(key, vars) : fallback;
  }

  /** Ligne tarifs publique (accueil, etc.) */
  function syncPublicFeeLine(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const defs = getDefaultFees();
    const banks = el.dataset.banksHtml || "";
    el.innerHTML = tariffTx(
      "tariffs.public.line",
      "Étudiant <strong>" +
        defs.etudiant.amount +
        " USD</strong> · Assistant <strong>" +
        defs.assistant.amount +
        " USD</strong> · Professeur <strong>" +
        defs.professeur.amount +
        " USD</strong>" +
        banks,
      {
        student: defs.etudiant.amount + " USD",
        assistant: defs.assistant.amount + " USD",
        prof: defs.professeur.amount + " USD",
        banks: banks,
      }
    );
  }

  function startStudentFeesSyncPolling(intervalMs) {
    const ms = intervalMs || PLATFORM_SYNC_INTERVAL_MS;
    setInterval(() => {
      try {
        const sess =
          typeof SAC_SESSION !== "undefined" ? SAC_SESSION.getSession() : null;
        if (!sess || sess.role !== "etudiant") return;
        refreshStudentFeesFromCampus(sess).then(() => {
          window.dispatchEvent(new CustomEvent("sac-student-fees-updated"));
        });
      } catch {
        /* ignore */
      }
    }, ms);
  }

  return {
    get CDF_PER_USD() {
      return getCdfPerUsd();
    },
    getCdfPerUsd,
    get DEFAULT_FEES() {
      return getDefaultFees();
    },
    ROLES,
    CAMPUS_ROLES,
    getPlatformSettings,
    getDefaultFees,
    loadPlatformSettings,
    ensurePlatformSettings,
    savePlatformSettings,
    defaultFor,
    resolve,
    fetchCampusFee,
    clearCache,
    saveLocalCampusTariffs,
    saveLocalCampusAcademicFees,
    syncCampusTariffsToMembers,
    syncCampusAcademicFeesToStudents,
    getLocalCampusTariffPack,
    getLocalCampusAcademicFees,
    fetchCampusTariffPack,
    fetchCampusAcademicFees,
    normalizeAcademicFees,
    FEE_CATEGORY_DEFS,
    applyCampusTariffsOnRegister,
    refreshStudentFeesFromCampus,
    buildUniversityFeesForStudent,
    applyAcademicFeesToStudent,
    applyTariffsToMemberProfile,
    applyLatestCampusFeesToUser,
    resolveCampusCode,
    userBelongsToUniversity,
    toCdf,
    syncPricingTierLabels,
    syncPublicFeeLine,
    refreshPlatformFromServer,
    startPlatformSyncPolling,
    onPlatformTariffsUpdated,
    startStudentFeesSyncPolling,
  };
})();

if (typeof SAC_TARIFFS !== "undefined") {
  SAC_TARIFFS.startPlatformSyncPolling(30000);
  try {
    const bootSess =
      typeof SAC_SESSION !== "undefined" ? SAC_SESSION.getSession() : null;
    if (bootSess?.role === "etudiant") {
      SAC_TARIFFS.startStudentFeesSyncPolling(30000);
    }
  } catch {
    /* ignore */
  }
  window.addEventListener("sac:lang-change", () => {
    SAC_TARIFFS.syncPricingTierLabels();
    SAC_TARIFFS.syncPublicFeeLine("homeFeeLine");
  });
}

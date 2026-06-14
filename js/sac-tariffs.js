/**

 * Tarifs d'inscription Smart Academy — défauts plateforme + tarifs campus par université

 */

const SAC_TARIFFS = (function () {

  const CDF_PER_USD = 2800;



  const DEFAULT_FEES = {

    etudiant: { amount: 1, currency: "USD", cdf: 2800, label: "Étudiant" },

    assistant: { amount: 5, currency: "USD", cdf: 14000, label: "Assistant" },

    professeur: { amount: 10, currency: "USD", cdf: 28000, label: "Professeur" },

    universite: { amount: 20, currency: "USD", cdf: 56000, label: "Université" },

  };



  const CAMPUS_ROLES = ["etudiant", "professeur", "assistant"];

  const cache = new Map();



  function toCdf(usd) {

    return Math.round(Number(usd) * CDF_PER_USD);

  }



  function defaultFor(role) {

    const def = DEFAULT_FEES[role] || DEFAULT_FEES.etudiant;

    return {

      ...def,

      cdf: toCdf(def.amount),

    };

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



  function findLocalUniversity(universiteCode) {

    if (!universiteCode) return null;

    const code = String(universiteCode).trim().toLowerCase();

    let users = [];

    try {

      users = JSON.parse(localStorage.getItem("sac_users") || "[]");

    } catch {

      return null;

    }

    return users.find((u) => {

      if (u.role !== "universite") return false;

      const keys = [u.universite, u.sigle, u.codeUni]

        .filter(Boolean)

        .map((k) => String(k).trim().toLowerCase());

      return keys.includes(code);

    });

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

    if (role === "universite" || !universiteCode) return defaultFor(role);

    if (!CAMPUS_ROLES.includes(role)) return defaultFor(role);

    return fetchCampusFee(universiteCode, role);

  }



  function clearCache() {

    cache.clear();

  }



  function normUniCode(code) {

    return String(code || "")

      .trim()

      .toLowerCase();

  }



  function userBelongsToUniversity(user, universiteCode) {

    const code = normUniCode(universiteCode);

    if (!code || !user) return false;

    const keys = [user.universite, user.universiteLocked, user.sigle]

      .filter(Boolean)

      .map(normUniCode);

    return keys.includes(code);

  }



  /** Factures affichées sur le profil étudiant, dérivées du tarif campus */

  function buildUniversityFeesForStudent(etudiantFee, user) {

    const base = Number(etudiantFee?.amount) || 1;

    const trimBase = Math.round(base * 75 * 100) / 100;

    const paidInscription =

      user?.payment?.status === "verified" ||

      user?.payment?.status === "pending_verification" ||

      !!user?.payment?.paidAt;

    const year = new Date().getFullYear();

    return [

      {

        label: "Frais d'inscription (Smart Academy)",

        term: `Année ${year}-${year + 1}`,

        amount: base,

        amountCdf: etudiantFee?.cdf != null ? etudiantFee.cdf : toCdf(base),

        currency: "USD",

        status: paidInscription ? "Payé" : "En attente",

        date: paidInscription

          ? (user.payment?.paidAt || "").slice(0, 10) || "—"

          : "—",

        source: "campus_tarif",

      },

      {

        label: "Frais académiques T1",

        term: "Trimestre 1",

        amount: trimBase,

        amountCdf: toCdf(trimBase),

        status: "Payé",

        date: `${year}-10-12`,

        source: "campus_tarif",

      },

      {

        label: "Frais académiques T2",

        term: "Trimestre 2",

        amount: trimBase,

        amountCdf: toCdf(trimBase),

        status: "Payé",

        date: `${year + 1}-01-20`,

        source: "campus_tarif",

      },

      {

        label: "Frais académiques T3",

        term: "Trimestre 3",

        amount: trimBase,

        amountCdf: toCdf(trimBase),

        status: "En attente",

        date: "—",

        source: "campus_tarif",

      },

    ];

  }



  function applyTariffsToMemberProfile(user, tariffs, universiteCode) {

    if (!user || !tariffs) return user;

    const role = user.role;

    if (!CAMPUS_ROLES.includes(role)) return user;

    const fee = normalizeFee(tariffs[role], role);

    user.campusTariffs = { ...tariffs };

    user.campusTariffsSyncedAt = new Date().toISOString();

    user.campusTariffsUniversite = universiteCode;

    user.inscriptionFee = fee;

    if (role === "etudiant") {

      user.universityFees = buildUniversityFeesForStudent(fee, user);

    }

    return user;

  }



  /**

   * Propage les tarifs campus sur tous les comptes liés à cette université (localStorage).

   */

  function syncCampusTariffsToMembers(universiteCode, tariffs) {

    const code = universiteCode || "";

    if (!code || !tariffs) return { updated: 0 };



    let users = [];

    try {

      users = JSON.parse(localStorage.getItem("sac_users") || "[]");

    } catch {

      return { updated: 0 };

    }



    let updated = 0;

    users = users.map((u) => {

      if (u.role === "universite") return u;

      if (!CAMPUS_ROLES.includes(u.role)) return u;

      if (!userBelongsToUniversity(u, code)) return u;

      updated++;

      return applyTariffsToMemberProfile({ ...u }, tariffs, code);

    });

    localStorage.setItem("sac_users", JSON.stringify(users));



    const sess = JSON.parse(localStorage.getItem("sac_session") || "null");

    if (sess && CAMPUS_ROLES.includes(sess.role) && userBelongsToUniversity(sess, code)) {

      const me = users.find(

        (u) =>

          u.email === sess.identifiant ||

          u.role === sess.role

      );

      if (me) {

        Object.assign(sess, {

          campusTariffs: me.campusTariffs,

          inscriptionFee: me.inscriptionFee,

          universityFees: me.universityFees,

          campusTariffsSyncedAt: me.campusTariffsSyncedAt,

        });

        localStorage.setItem("sac_session", JSON.stringify(sess));

      }

    }

    clearCache();

    return { updated };

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



  /** Applique les tarifs campus sur un nouveau compte (inscription) */

  async function applyCampusTariffsOnRegister(profile) {

    if (!profile || !CAMPUS_ROLES.includes(profile.role)) return profile;

    const uni =

      profile.universite ||

      profile.universiteLocked ||

      profile.sigle;

    if (!uni) return profile;

    const tariffs = await fetchCampusTariffPack(uni);

    if (!tariffs) {

      profile.inscriptionFee =

        profile.inscriptionFee || (await resolve(profile.role, uni));

      return profile;

    }

    return applyTariffsToMemberProfile(profile, tariffs, uni);

  }



  /** Met à jour le profil étudiant depuis les tarifs campus actuels de son université */

  async function refreshStudentFeesFromCampus(session) {

    if (!session || session.role !== "etudiant") return null;



    const users = JSON.parse(localStorage.getItem("sac_users") || "[]");

    const idx = users.findIndex(

      (u) => u.role === "etudiant" && u.email === session?.identifiant

    );

    const uni =

      (idx >= 0 ? users[idx].universite : null) || session?.universite;

    const tariffs = await fetchCampusTariffPack(uni);

    if (!tariffs?.etudiant) {

      return idx >= 0 ? users[idx] : null;

    }



    if (idx >= 0) {

      users[idx] = applyTariffsToMemberProfile(users[idx], tariffs, uni);

      localStorage.setItem("sac_users", JSON.stringify(users));

    }



    const me = idx >= 0 ? users[idx] : null;

    const fee = normalizeFee(tariffs.etudiant, "etudiant");

    const universityFees = buildUniversityFeesForStudent(fee, {

      payment: me?.payment || session.payment,

    });

    const sess = JSON.parse(localStorage.getItem("sac_session") || "null");

    if (sess && sess.role === "etudiant" && sess.identifiant === session.identifiant) {

      Object.assign(sess, {

        inscriptionFee: fee,

        universityFees,

        campusTariffs: tariffs,

        campusTariffsSyncedAt: new Date().toISOString(),

      });

      localStorage.setItem("sac_session", JSON.stringify(sess));

    }

    return me;

  }



  function saveLocalCampusTariffs(session, tariffs) {

    const code =

      session.universite || session.codeUni || session.sigle;

    if (!code) throw new Error("Code campus manquant");



    let users = [];

    try {

      users = JSON.parse(localStorage.getItem("sac_users") || "[]");

    } catch {

      users = [];

    }



    const idx = users.findIndex(

      (u) =>

        u.role === "universite" &&

        (u.email === session.identifiant ||

          u.userId === session.userId ||

          u.id === session.userId)

    );

    const campusOnly = {};

    for (const role of CAMPUS_ROLES) {

      if (tariffs[role]) campusOnly[role] = tariffs[role];

    }

    const entry = {

      ...(idx >= 0 ? users[idx] : {}),

      role: "universite",

      email: session.identifiant,

      universite: code,

      campusTariffs: { ...(users[idx]?.campusTariffs || {}), ...campusOnly },

    };

    if (idx >= 0) users[idx] = { ...users[idx], ...entry };

    else users.push(entry);

    localStorage.setItem("sac_users", JSON.stringify(users));



    const sess = JSON.parse(localStorage.getItem("sac_session") || "{}");

    if (sess.role === "universite") {

      sess.campusTariffs = entry.campusTariffs;

      localStorage.setItem("sac_session", JSON.stringify(sess));

    }

    clearCache();

    const sync = syncCampusTariffsToMembers(code, entry.campusTariffs);

    return { campusTariffs: entry.campusTariffs, membersUpdated: sync.updated };

  }



  return {

    CDF_PER_USD,

    DEFAULT_FEES,

    CAMPUS_ROLES,

    defaultFor,

    resolve,

    fetchCampusFee,

    clearCache,

    saveLocalCampusTariffs,

    syncCampusTariffsToMembers,

    getLocalCampusTariffPack,

    fetchCampusTariffPack,

    applyCampusTariffsOnRegister,

    refreshStudentFeesFromCampus,

    buildUniversityFeesForStudent,

    applyTariffsToMemberProfile,

    userBelongsToUniversity,

    toCdf,

  };

})();


/**
 * Tâches administratives — espace assistant (campus)
 * Paiements : API SAC_PAYMENTS en production ; repli localStorage réservé au dev localhost.
 */
const SAC_TASKS = (function () {
  const CAMPUS_ROLES = ["etudiant", "professeur", "assistant"];
  let paymentsCache = [];

  function isLocalDev() {
    return (
      typeof SAC_API !== "undefined" &&
      typeof SAC_API.isLocalDevHost === "function" &&
      SAC_API.isLocalDevHost()
    );
  }

  function campusCode(session) {
    return session?.universite || session?.codeUni || session?.sigle || "";
  }

  function belongsToCampus(user, code) {
    if (!code || !user) return false;
    return String(user.universite || "").trim() === String(code).trim();
  }

  function getCampusUsers(session) {
    if (!isLocalDev()) return [];
    const code = campusCode(session);
    if (!code || typeof SAC_IDENTITY === "undefined") return [];
    return SAC_IDENTITY.getLocalUsers().filter(
      (u) => CAMPUS_ROLES.includes(u.role) && belongsToCampus(u, code)
    );
  }

  function legacyPendingFromUsers(session) {
    return getCampusUsers(session)
      .filter((u) => u.payment?.status === "pending_verification")
      .map((u) => ({
        id: u.email,
        studentEmail: u.email,
        studentNom: displayName(u),
        studentRole: u.role,
        amount: u.payment?.amountUsd,
        currency: "USD",
        amountCdf: u.payment?.amountCdf,
        reference: u.payment?.paymentReference || u.payment?.transactionId || "—",
        method: u.payment?.method,
        paidAt: u.payment?.paidAt,
        status: "pending",
        _legacyUser: true,
      }));
  }

  /** Charge les paiements campus (API ou démo locale). */
  async function refreshPayments(session) {
    if (typeof SAC_PAYMENTS !== "undefined" && SAC_PAYMENTS.listCampusPayments) {
      try {
        paymentsCache = (await SAC_PAYMENTS.listCampusPayments(session)) || [];
        return paymentsCache;
      } catch {
        paymentsCache = [];
      }
    }
    paymentsCache = isLocalDev() ? legacyPendingFromUsers(session) : [];
    return paymentsCache;
  }

  /** Paiements académiques en attente de validation */
  function getPendingPayments() {
    return paymentsCache.filter((p) => p.status === "pending");
  }

  /** Comptes récents sans paiement validé (dev local uniquement) */
  function getRegistrationsToValidate(session, days = 60) {
    const cutoff = Date.now() - days * 86400000;
    return getCampusUsers(session).filter((u) => {
      const created = u.createdAt ? new Date(u.createdAt).getTime() : 0;
      const recent = !created || created >= cutoff;
      const unpaid =
        !u.payment ||
        u.payment.status === "pending_verification" ||
        u.payment.status === "rejected";
      return recent && unpaid;
    });
  }

  function getCampusReclamations(session) {
    const code = campusCode(session);
    if (typeof SAC_SECTIONS === "undefined" || !code) return [];
    return SAC_SECTIONS.getReclamationsForCampus(code);
  }

  function getOpenReclamations(session) {
    return getCampusReclamations(session).filter(
      (r) => r.statut === "ouverte" || r.statut === "en_cours"
    );
  }

  function getAttestationRequests(session) {
    return getOpenReclamations(session).filter(
      (r) =>
        r.categorie === "administration" ||
        r.categorie === "inscription" ||
        r.categorie === "documents" ||
        r.categorie === "scolarite"
    );
  }

  function getSummary(session) {
    const payments = getPendingPayments();
    const renewals = getPendingRenewals();
    const registrations = getRegistrationsToValidate(session);
    const openRecs = getOpenReclamations(session);
    const attestations = getAttestationRequests(session);
    const openOnly = openRecs.filter((r) => r.statut === "ouverte").length;

    return {
      pendingPayments: payments.length + renewals.length,
      pendingRenewals: renewals.length,
      registrationsToValidate: registrations.length,
      openReclamations: openRecs.length,
      attestations: attestations.length,
      totalPending: payments.length + renewals.length + openOnly,
    };
  }

  function displayName(user) {
    if (!user) return "—";
    if (user.studentNom) return user.studentNom;
    if (typeof SAC_IDENTITY !== "undefined") {
      return SAC_IDENTITY.formatFullName(user.prenom, user.nom) || user.email || "—";
    }
    return [user.prenom, user.nom].filter(Boolean).join(" ") || user.email || "—";
  }

  async function verifyPayment(session, paymentId) {
    if (typeof SAC_PAYMENTS !== "undefined" && SAC_PAYMENTS.confirmPayment) {
      return SAC_PAYMENTS.confirmPayment(session, paymentId, "confirmed");
    }
    if (!isLocalDev()) throw new Error("Validation en ligne requise.");
    return legacyVerifyLocal(session, paymentId);
  }

  async function rejectPayment(session, paymentId, reason) {
    if (typeof SAC_PAYMENTS !== "undefined" && SAC_PAYMENTS.confirmPayment) {
      return SAC_PAYMENTS.confirmPayment(session, paymentId, "rejected");
    }
    if (!isLocalDev()) throw new Error("Rejet en ligne requis.");
    return legacyRejectLocal(session, paymentId, reason);
  }

  function legacyVerifyLocal(session, userEmail) {
    const code = campusCode(session);
    const users = SAC_IDENTITY.getLocalUsers();
    const idx = users.findIndex(
      (u) =>
        u.email === userEmail &&
        CAMPUS_ROLES.includes(u.role) &&
        belongsToCampus(u, code)
    );
    if (idx < 0) throw new Error("Compte introuvable sur votre campus.");

    const now = new Date().toISOString();
    users[idx].payment = {
      ...(users[idx].payment || {}),
      status: "verified",
      verifiedAt: now,
      verifiedBy: session.identifiant || session.userId,
    };

    if (users[idx].role === "etudiant" && typeof SAC_TARIFFS !== "undefined") {
      const acad =
        users[idx].campusAcademicFees ||
        SAC_TARIFFS.getLocalCampusAcademicFees(users[idx].universite) ||
        SAC_TARIFFS.normalizeAcademicFees(null);
      users[idx].universityFees = SAC_TARIFFS.buildUniversityFeesForStudent(users[idx], acad);
    }

    localStorage.setItem("sac_users", JSON.stringify(users));

    const sess = JSON.parse(localStorage.getItem("sac_session") || "null");
    if (sess && sess.identifiant === userEmail) {
      sess.payment = users[idx].payment;
      if (users[idx].universityFees) sess.universityFees = users[idx].universityFees;
      localStorage.setItem("sac_session", JSON.stringify(sess));
    }
    return users[idx];
  }

  function legacyRejectLocal(session, userEmail, reason) {
    const code = campusCode(session);
    const users = SAC_IDENTITY.getLocalUsers();
    const idx = users.findIndex(
      (u) =>
        u.email === userEmail &&
        CAMPUS_ROLES.includes(u.role) &&
        belongsToCampus(u, code)
    );
    if (idx < 0) throw new Error("Compte introuvable sur votre campus.");

    users[idx].payment = {
      ...(users[idx].payment || {}),
      status: "rejected",
      rejectedAt: new Date().toISOString(),
      rejectedBy: session.identifiant || session.userId,
      rejectReason: (reason || "").trim(),
    };
    localStorage.setItem("sac_users", JSON.stringify(users));
    return users[idx];
  }

  let renewalsCache = [];

  async function refreshRenewals() {
    if (typeof SAC_API !== "undefined" && typeof SAC_API.listPendingEnrollmentRenewals === "function") {
      try {
        renewalsCache = (await SAC_API.listPendingEnrollmentRenewals()) || [];
      } catch {
        renewalsCache = [];
      }
    } else {
      renewalsCache = [];
    }
    return renewalsCache;
  }

  function getPendingRenewals() {
    return renewalsCache;
  }

  async function verifyRenewal(enrollmentId) {
    if (typeof SAC_API === "undefined" || typeof SAC_API.verifyEnrollmentRenewal !== "function") {
      throw new Error("Validation renouvellement indisponible — API requise.");
    }
    return SAC_API.verifyEnrollmentRenewal(enrollmentId);
  }

  const ROLE_LABELS = {
    etudiant: "Étudiant",
    professeur: "Professeur",
    assistant: "Assistant",
    section: "Chef de section",
  };

  return {
    campusCode,
    refreshPayments,
    refreshRenewals,
    getSummary,
    getPendingPayments,
    getPendingRenewals,
    verifyRenewal,
    getRegistrationsToValidate,
    getOpenReclamations,
    getAttestationRequests,
    getCampusReclamations,
    verifyPayment,
    rejectPayment,
    displayName,
    ROLE_LABELS,
    isLocalDev,
  };
})();

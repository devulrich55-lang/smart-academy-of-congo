/**
 * Tâches administratives — espace assistant (campus)
 */
const SAC_TASKS = (function () {
  const CAMPUS_ROLES = ["etudiant", "professeur", "assistant"];

  function campusCode(session) {
    return session?.universite || session?.codeUni || session?.sigle || "";
  }

  function belongsToCampus(user, code) {
    if (!code || !user) return false;
    return String(user.universite || "").trim() === String(code).trim();
  }

  function getCampusUsers(session) {
    const code = campusCode(session);
    if (!code) return [];
    return SAC_IDENTITY.getLocalUsers().filter(
      (u) => CAMPUS_ROLES.includes(u.role) && belongsToCampus(u, code)
    );
  }

  /** Paiements Mobile Money / virement en attente de validation */
  function getPendingPayments(session) {
    return getCampusUsers(session).filter(
      (u) => u.payment?.status === "pending_verification"
    );
  }

  /** Comptes récents sans paiement validé */
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

  /** Demandes d'attestation / documents administratifs */
  function getAttestationRequests(session) {
    return getOpenReclamations(session).filter(
      (r) => r.categorie === "documents" || r.categorie === "scolarite"
    );
  }

  function getSummary(session) {
    const payments = getPendingPayments(session);
    const registrations = getRegistrationsToValidate(session);
    const openRecs = getOpenReclamations(session);
    const attestations = getAttestationRequests(session);
    const openOnly = openRecs.filter((r) => r.statut === "ouverte").length;

    return {
      pendingPayments: payments.length,
      registrationsToValidate: registrations.length,
      openReclamations: openRecs.length,
      attestations: attestations.length,
      totalPending: payments.length + openOnly,
    };
  }

  function displayName(user) {
    if (typeof SAC_IDENTITY !== "undefined") {
      return SAC_IDENTITY.formatFullName(user.prenom, user.nom) || user.email;
    }
    return [user.prenom, user.nom].filter(Boolean).join(" ") || user.email;
  }

  function verifyPayment(session, userEmail) {
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

    if (
      users[idx].role === "etudiant" &&
      typeof SAC_TARIFFS !== "undefined" &&
      users[idx].inscriptionFee
    ) {
      users[idx].universityFees = SAC_TARIFFS.buildUniversityFeesForStudent(
        users[idx].inscriptionFee,
        users[idx]
      );
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

  function rejectPayment(session, userEmail, reason) {
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

  const ROLE_LABELS = {
    etudiant: "Étudiant",
    professeur: "Professeur",
    assistant: "Assistant",
  };

  return {
    campusCode,
    getSummary,
    getPendingPayments,
    getRegistrationsToValidate,
    getOpenReclamations,
    getAttestationRequests,
    getCampusReclamations,
    verifyPayment,
    rejectPayment,
    displayName,
    ROLE_LABELS,
  };
})();

/**
 * Pilotage campus — espace administration université
 */
const SAC_UNIVERSITY = (function () {
  const CAMPUS_ROLES = ["etudiant", "professeur", "assistant"];

  function campusCode(session) {
    return session?.universite || session?.codeUni || session?.sigle || "";
  }

  function getCampusUsers(session) {
    const code = campusCode(session);
    if (!code) return [];
    return SAC_IDENTITY.getLocalUsers().filter(
      (u) => CAMPUS_ROLES.includes(u.role) && String(u.universite || "") === code
    );
  }

  function getSections(session) {
    return SAC_SECTIONS.getSectionsByUniversity(session);
  }

  function getSummary(session) {
    const code = campusCode(session);
    const sections = getSections(session);
    const users = getCampusUsers(session);
    const recs = SAC_SECTIONS.getReclamationsForCampus(code);
    const c = SAC_SECTIONS.countByStatut(recs);
    const pendingPayments =
      typeof SAC_TASKS !== "undefined"
        ? SAC_TASKS.getPendingPayments(session).length
        : users.filter((u) => u.payment?.status === "pending_verification").length;

    const campusNews =
      typeof SAC_HOME_NEWS !== "undefined"
        ? SAC_HOME_NEWS.getUniversityNewsForStudent(code).length
        : 0;
    const nationalNews =
      typeof SAC_HOME_NEWS !== "undefined"
        ? SAC_HOME_NEWS.getNationalNewsForStudent().length
        : 0;
    const campusDocs = SAC_DATA.getAll().filter(
      (d) => d.source === "administration" && d.universite === code && d.audienceType !== "section"
    ).length;

    const byRole = { etudiant: 0, professeur: 0, assistant: 0 };
    users.forEach((u) => {
      if (byRole[u.role] !== undefined) byRole[u.role]++;
    });

    return {
      sectionsCount: sections.length,
      studentsCount: byRole.etudiant,
      professorsCount: byRole.professeur,
      assistantsCount: byRole.assistant,
      membersCount: users.length,
      openReclamations: c.ouverte,
      inProgressReclamations: c.en_cours,
      resolvedReclamations: c.resolue,
      totalReclamations: recs.length,
      pendingPayments,
      campusAnnouncements: campusNews,
      nationalAnnouncements: nationalNews,
      campusDocuments: campusDocs,
      totalPriority: c.ouverte + pendingPayments,
    };
  }

  function getEstablishmentProfile(session) {
    const users = SAC_IDENTITY.getLocalUsers();
    const found = users.find(
      (u) =>
        u.role === "universite" &&
        (u.email === session?.identifiant ||
          u.universite === campusCode(session) ||
          u.sigle === session?.sigle)
    );
    return {
      nomUniversite:
        found?.nomUniversite || session?.nom || session?.nomUniversite || "Université",
      email: session?.identifiant || found?.email || "—",
      code: campusCode(session),
      sigle: found?.sigle || session?.sigle || "—",
      ville: found?.ville || "—",
      responsable: found?.responsable || "—",
      siteWeb: found?.siteWeb || found?.site_web || "—",
      nbEtudiants: found?.nbEtudiants || found?.nb_etudiants || "—",
      campusTariffs: found?.campusTariffs || session?.campusTariffs || null,
    };
  }

  function displayName(user) {
    if (typeof SAC_IDENTITY !== "undefined") {
      return SAC_IDENTITY.formatFullName(user.prenom, user.nom) || user.email;
    }
    return user.nomUniversite || user.email || "—";
  }

  return {
    campusCode,
    getSummary,
    getEstablishmentProfile,
    getCampusUsers,
    getSections,
    displayName,
  };
})();

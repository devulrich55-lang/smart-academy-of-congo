/**
 * Pilotage campus — espace administration université
 */
const SAC_UNIVERSITY = (function () {
  const CAMPUS_ROLES = ["etudiant", "professeur", "assistant", "section"];

  function campusCode(session) {
    const raw = session?.universite || session?.universiteLocked || session?.codeUni || session?.sigle || "";
    if (typeof SAC_UNIVERSITIES !== "undefined" && SAC_UNIVERSITIES.resolveId) {
      return SAC_UNIVERSITIES.resolveId(raw) || raw;
    }
    return raw;
  }

  function getCampusUsers(session) {
    const code = campusCode(session);
    if (!code) return [];

    if (typeof SAC_ADMIN_ACCOUNTS !== "undefined") {
      const apiAccounts = SAC_ADMIN_ACCOUNTS.getAccounts();
      if (apiAccounts.length) {
        return apiAccounts.map((a) => ({
          ...a,
          payment: a.paymentStatus ? { status: a.paymentStatus } : null,
        }));
      }
    }

    return SAC_IDENTITY.getLocalUsers().filter((u) => {
      if (!CAMPUS_ROLES.includes(u.role)) return false;
      if (typeof SAC_UNIVERSITIES !== "undefined" && SAC_UNIVERSITIES.sameCampus) {
        const keys = [u.universite, u.universiteLocked, u.sigle].filter(Boolean);
        return keys.some((k) => SAC_UNIVERSITIES.sameCampus(k, code));
      }
      return String(u.universite || "") === code;
    });
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

    const docViews = SAC_DATA.sumPublicationViews
      ? SAC_DATA.sumPublicationViews((d) => {
          if (d.universite && code && d.universite !== code) return false;
          return (
            d.source === "administration" ||
            d.source === "professeur" ||
            d.source === "assistant"
          );
        })
      : { people: 0, views: 0 };
    let hnViews = { people: 0, views: 0 };
    if (typeof SAC_HOME_NEWS !== "undefined" && SAC_HOME_NEWS.getAll) {
      const authorId = String(session?.identifiant || "").toLowerCase();
      hnViews = SAC_HOME_NEWS.getAll()
        .filter(
          (n) =>
            (n.scope === "university" && String(n.universite || "").toLowerCase() === String(code).toLowerCase()) ||
            (n.scope === "national" && String(n.authorId || "").toLowerCase() === authorId)
        )
        .reduce(
          (acc, n) => ({
            people: acc.people + Number(n.uniqueViewCount || n.viewCount || 0),
            views: acc.views + Number(n.viewCount || 0),
          }),
          { people: 0, views: 0 }
        );
    }

    const apiSummary =
      typeof SAC_ADMIN_ACCOUNTS !== "undefined" ? SAC_ADMIN_ACCOUNTS.getSummary() : null;

    const byRole = { etudiant: 0, professeur: 0, assistant: 0, section: 0 };
    users.forEach((u) => {
      if (byRole[u.role] !== undefined) byRole[u.role]++;
    });

    return {
      sectionsCount: sections.length,
      studentsCount: apiSummary?.byRole?.etudiant ?? byRole.etudiant,
      professorsCount: apiSummary?.byRole?.professeur ?? byRole.professeur,
      assistantsCount: apiSummary?.byRole?.assistant ?? byRole.assistant,
      sectionHeadsCount: apiSummary?.byRole?.section ?? byRole.section,
      membersCount: apiSummary?.total ?? users.length,
      openReclamations: c.ouverte,
      inProgressReclamations: c.en_cours,
      resolvedReclamations: c.resolue,
      totalReclamations: recs.length,
      pendingPayments,
      campusAnnouncements: campusNews,
      nationalAnnouncements: nationalNews,
      campusDocuments: campusDocs,
      publicationViews: {
        people: (docViews.people || 0) + (hnViews.people || 0),
        views: (docViews.views || 0) + (hnViews.views || 0),
      },
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

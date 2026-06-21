/**
 * Nominations institutionnelles — professeurs nommés chefs de section, etc.
 */
const SAC_NOMINATIONS = (function () {
  const GRADE_LABELS = {
    assistant: "Assistant",
    chef: "Chef de travaux",
    chef_travaux: "Chef de travaux",
    maitre: "Maître de conférences",
    professeur: "Professeur ordinaire",
    professeur_ordinaire: "Professeur ordinaire",
    associe: "Professeur associé",
    professeur_associe: "Professeur associé",
    vacataire: "Vacataire",
  };

  const NOMINATION_TYPES = {
    chef_section: {
      id: "chef_section",
      label: "Chef de section",
      shortLabel: "Chef de section",
    },
  };

  function campusCode(session) {
    return session?.universite || session?.codeUni || session?.sigle || "";
  }

  function getCampusProfessors(session) {
    const code = campusCode(session);
    if (!code) return [];
    return SAC_IDENTITY.getLocalUsers().filter(
      (u) => u.role === "professeur" && String(u.universite || "") === code
    );
  }

  async function fetchCampusProfessors(session) {
    const local = getCampusProfessors(session);
    if (typeof SAC_API === "undefined" || !(await SAC_API.ensureOnline())) {
      return local;
    }
    try {
      const remote = await SAC_API.listCampusProfessors();
      if (!Array.isArray(remote) || !remote.length) return local;
      const byEmail = new Map();
      local.forEach((p) => {
        byEmail.set(SAC_IDENTITY.normalizeEmail(p.email), { ...p });
      });
      remote.forEach((p) => {
        const key = SAC_IDENTITY.normalizeEmail(p.email);
        byEmail.set(key, { ...(byEmail.get(key) || {}), ...p, email: p.email || byEmail.get(key)?.email });
      });
      return Array.from(byEmail.values()).sort((a, b) =>
        (a.nom || a.email || "").localeCompare(b.nom || b.email || "", "fr")
      );
    } catch {
      return local;
    }
  }

  function findProfessorByEmail(session, email) {
    const key = SAC_IDENTITY.normalizeEmail(email);
    return getCampusProfessors(session).find(
      (p) => SAC_IDENTITY.normalizeEmail(p.email) === key
    );
  }

  function findHeadForSection(session, sectionId) {
    const sec = SAC_SECTIONS.getSectionById(sectionId);
    if (!sec) return null;
    const headEmail = sec.headProfessorEmail;
    if (headEmail) {
      const prof = findProfessorByEmail(session, headEmail);
      if (prof) return prof;
    }
    return getCampusProfessors(session).find(
      (p) => p.nomination === "chef_section" && p.sectionId === sectionId
    );
  }

  function professorSelectOptions(session, professors, selectedEmail, emptyLabel) {
    const opts = [
      `<option value="">${emptyLabel || "— Choisir un professeur —"}</option>`,
    ];
    (professors || getCampusProfessors(session)).forEach((p) => {
      const name =
        typeof SAC_IDENTITY !== "undefined"
          ? SAC_IDENTITY.formatFullName(p.prenom, p.nom)
          : [p.prenom, p.nom].filter(Boolean).join(" ");
      const label = `${name || p.email} · ${gradeLabel(p)}`;
      const sel =
        selectedEmail &&
        SAC_IDENTITY.normalizeEmail(selectedEmail) === SAC_IDENTITY.normalizeEmail(p.email)
          ? " selected"
          : "";
      opts.push(`<option value="${p.email}"${sel}>${label}</option>`);
    });
    return opts.join("");
  }

  function gradeLabel(user) {
    return GRADE_LABELS[user?.grade] || user?.grade || "—";
  }

  function nominationLabel(user) {
    if (!user?.nomination) return "—";
    return NOMINATION_TYPES[user.nomination]?.label || user.nomination;
  }

  function isSectionHead(userOrSession) {
    if (!userOrSession) return false;
    if (userOrSession.role === "section") return !!userOrSession.sectionId;
    return (
      userOrSession.role === "professeur" &&
      userOrSession.nomination === "chef_section" &&
      !!userOrSession.sectionId
    );
  }

  function buildSectionHeadActor(sessionOrUser) {
    if (!isSectionHead(sessionOrUser)) return null;
    const section = SAC_SECTIONS.getSectionById(sessionOrUser.sectionId);
    return {
      role: sessionOrUser.role === "section" ? "section" : "professeur",
      identifiant: sessionOrUser.identifiant || sessionOrUser.email,
      userId: sessionOrUser.userId || sessionOrUser.email,
      email: sessionOrUser.identifiant || sessionOrUser.email,
      nom: sessionOrUser.nom,
      prenom: sessionOrUser.prenom,
      displayName:
        typeof SAC_IDENTITY !== "undefined"
          ? SAC_IDENTITY.getDisplayName(sessionOrUser)
          : sessionOrUser.displayName,
      universite: sessionOrUser.universite,
      filiere: section?.filiere || sessionOrUser.filiere,
      sectionId: sessionOrUser.sectionId,
      sectionName: sessionOrUser.sectionName || section?.name,
      nomination: sessionOrUser.nomination || "chef_section",
    };
  }

  function _saveUser(updated) {
    const users = SAC_IDENTITY.getLocalUsers();
    const idx = users.findIndex(
      (u) => u.role === updated.role && SAC_IDENTITY.normalizeEmail(u.email) === SAC_IDENTITY.normalizeEmail(updated.email)
    );
    if (idx < 0) throw new Error("Professeur introuvable sur ce campus.");
    users[idx] = { ...users[idx], ...updated, updatedAt: new Date().toISOString() };
    localStorage.setItem("sac_users", JSON.stringify(users));
    return users[idx];
  }

  function _clearSectionHead(sectionId, exceptEmail) {
    if (!sectionId) return;
    const users = SAC_IDENTITY.getLocalUsers();
    let changed = false;
    users.forEach((u, i) => {
      if (
        u.nomination === "chef_section" &&
        u.sectionId === sectionId &&
        SAC_IDENTITY.normalizeEmail(u.email) !== SAC_IDENTITY.normalizeEmail(exceptEmail || "")
      ) {
        users[i] = {
          ...u,
          nomination: null,
          sectionId: null,
          sectionName: null,
          updatedAt: new Date().toISOString(),
        };
        changed = true;
      }
    });
    if (changed) localStorage.setItem("sac_users", JSON.stringify(users));
  }

  async function nominateSectionHead(uniSession, professorEmail, sectionId) {
    const section = SAC_SECTIONS.getSectionById(sectionId);
    if (!section || !SAC_SECTIONS.universityOwnsSection(uniSession, sectionId)) {
      throw new Error("Section invalide pour votre établissement.");
    }

    const professors = getCampusProfessors(uniSession);
    const prof = professors.find(
      (p) => SAC_IDENTITY.normalizeEmail(p.email) === SAC_IDENTITY.normalizeEmail(professorEmail)
    );
    if (!prof) throw new Error("Professeur introuvable sur votre campus.");

    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
      await SAC_API.nominateProfessor({
        email: prof.email,
        nomination: "chef_section",
        sectionId,
      });
    }

    _clearSectionHead(sectionId, prof.email);

    const displayName =
      typeof SAC_IDENTITY !== "undefined"
        ? SAC_IDENTITY.formatFullName(prof.prenom, prof.nom)
        : [prof.prenom, prof.nom].filter(Boolean).join(" ");

    SAC_SECTIONS.updateSection(sectionId, {
      responsableNom: displayName || prof.email,
      headProfessorEmail: prof.email,
    });

    return _saveUser({
      ...prof,
      nomination: "chef_section",
      sectionId,
      sectionName: section.name,
      filiere: section.filiere,
    });
  }

  async function revokeNomination(uniSession, professorEmail) {
    const professors = getCampusProfessors(uniSession);
    const prof = professors.find(
      (p) => SAC_IDENTITY.normalizeEmail(p.email) === SAC_IDENTITY.normalizeEmail(professorEmail)
    );
    if (!prof) throw new Error("Professeur introuvable.");

    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
      await SAC_API.revokeProfessorNomination(prof.email);
    }

    if (prof.sectionId) {
      const sec = SAC_SECTIONS.getSectionById(prof.sectionId);
      if (
        sec &&
        sec.headProfessorEmail &&
        SAC_IDENTITY.normalizeEmail(sec.headProfessorEmail) === SAC_IDENTITY.normalizeEmail(prof.email)
      ) {
        SAC_SECTIONS.updateSection(prof.sectionId, { headProfessorEmail: "" });
      }
    }

    return _saveUser({
      ...prof,
      nomination: null,
      sectionId: null,
      sectionName: null,
    });
  }

  function paymentStatusLabel(payment) {
    const s = payment?.status;
    if (s === "verified") return "Validé";
    if (s === "pending_verification") return "En attente";
    if (s === "rejected") return "Refusé";
    return "—";
  }

  async function changeSectionHead(uniSession, sectionId, professorEmail) {
    if (!professorEmail) {
      const current = findHeadForSection(uniSession, sectionId);
      if (current) await revokeNomination(uniSession, current.email);
      return null;
    }
    return nominateSectionHead(uniSession, professorEmail, sectionId);
  }

  return {
    GRADE_LABELS,
    NOMINATION_TYPES,
    getCampusProfessors,
    fetchCampusProfessors,
    findProfessorByEmail,
    findHeadForSection,
    professorSelectOptions,
    gradeLabel,
    nominationLabel,
    isSectionHead,
    buildSectionHeadActor,
    nominateSectionHead,
    changeSectionHead,
    revokeNomination,
    paymentStatusLabel,
  };
})();

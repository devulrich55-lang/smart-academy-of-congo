/**
 * Sections faculté & réclamations étudiants
 */
const SAC_SECTIONS = (function () {
  const SECTIONS_KEY = "sac_sections";
  const RECLAMATIONS_KEY = "sac_reclamations";

  const CATEGORIES = [
    { id: "scolarite", label: "Scolarité & inscription" },
    { id: "notes", label: "Notes, cotes & examens" },
    { id: "frais", label: "Frais universitaires & paiements" },
    { id: "documents", label: "Documents administratifs (attestation, relevé…)" },
    { id: "bourse", label: "Bourses & aides financières" },
    { id: "emploi_du_temps", label: "Emploi du temps & organisation des cours" },
    { id: "stage_emploi", label: "Stages, concours & opportunités" },
    { id: "discipline", label: "Discipline, assiduité & conflit" },
    { id: "bibliotheque", label: "Bibliothèque, laboratoire & équipements" },
    { id: "infrastructure", label: "Infrastructure & vie du campus" },
    { id: "enseignement", label: "Qualité de l'enseignement" },
    { id: "autre", label: "Autres (à préciser)" },
  ];

  const STATUTS = [
    { id: "ouverte", label: "Ouverte", color: "#b45309" },
    { id: "en_cours", label: "En cours de traitement", color: "#0c3d6e" },
    { id: "resolue", label: "Résolue", color: "#0d7a4a" },
    { id: "fermee", label: "Fermée", color: "#5a6d7e" },
  ];

  function uid(prefix) {
    return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function norm(s) {
    return (s || "").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  }

  /** Code campus — insensible à la casse et aux caractères spéciaux. */
  function normalizeUniversite(code) {
    return String(code || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function universiteMatches(a, b) {
    const na = normalizeUniversite(a);
    const nb = normalizeUniversite(b);
    if (!na || !nb) return false;
    return na === nb || na.includes(nb) || nb.includes(na);
  }

  /** Filière / faculté — ignore accents, casse, tirets et ponctuation. */
  function normalizeFiliere(value) {
    return norm(value).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }

  function filiereTokens(value) {
    return normalizeFiliere(value)
      .split(" ")
      .filter((w) => w.length >= 3);
  }

  function filiereMatches(a, b) {
    const fa = normalizeFiliere(a);
    const fb = normalizeFiliere(b);
    if (!fa || !fb) return false;
    if (fa === fb || fa.includes(fb) || fb.includes(fa)) return true;
    const wordsA = filiereTokens(a);
    const wordsB = new Set(filiereTokens(b));
    if (!wordsA.length || !wordsB.size) return false;
    const shared = wordsA.filter((w) => wordsB.has(w));
    if (shared.some((w) => w.length >= 5)) return true;
    return shared.length >= 2;
  }

  function studentFilieres(student) {
    const out = [];
    if (student?.filiere) out.push(student.filiere);
    if (student?.departement) out.push(student.departement);
    (student?.coursClasses || []).forEach((c) => {
      if (c?.filiere) out.push(c.filiere);
    });
    return [...new Set(out.filter(Boolean))];
  }

  function linkStudentToSection(student) {
    if (!student || student.role !== "etudiant") return student;
    const match = findSectionForStudent(student);
    if (match) {
      student.sectionId = match.id;
      student.sectionName = match.name;
    }
    return student;
  }

  function studentMatchesSection(student, sectionSession) {
    if (!student || student.role !== "etudiant" || !sectionSession) return false;
    if (!universiteMatches(student.universite, sectionSession.universite)) return false;

    const sectionId = sectionSession.sectionId;
    if (sectionId && student.sectionId === sectionId) return true;

    const resolved = findSectionForStudent(student);
    if (sectionId && resolved?.id === sectionId) return true;

    const sectionFiliere =
      sectionSession.filiere || (sectionId ? getSectionById(sectionId)?.filiere : null);
    if (!sectionFiliere) return !!resolved;

    const filieres = studentFilieres(student);
    if (!filieres.length) return false;
    return filieres.some((uf) => filiereMatches(uf, sectionFiliere));
  }

  function repairStudentsForSection(sectionSession) {
    if (!sectionSession || typeof SAC_IDENTITY === "undefined") return 0;
    const users = SAC_IDENTITY.getLocalUsers();
    let updated = 0;
    const next = users.map((u) => {
      if (u.role !== "etudiant" || !studentMatchesSection(u, sectionSession)) return u;
      const linked = linkStudentToSection({ ...u });
      if (linked.sectionId !== u.sectionId || linked.sectionName !== u.sectionName) {
        updated += 1;
        return linked;
      }
      return u;
    });
    if (updated) localStorage.setItem("sac_users", JSON.stringify(next));
    return updated;
  }

  function getSections() {
    return JSON.parse(localStorage.getItem(SECTIONS_KEY) || "[]");
  }

  function saveSections(list) {
    localStorage.setItem(SECTIONS_KEY, JSON.stringify(list));
  }

  function getReclamations() {
    return JSON.parse(localStorage.getItem(RECLAMATIONS_KEY) || "[]");
  }

  function saveReclamations(list) {
    localStorage.setItem(RECLAMATIONS_KEY, JSON.stringify(list));
  }

  function getSession() {
    if (typeof SAC_SESSION !== "undefined") return SAC_SESSION.getSession();
    return null;
  }

  async function isApiOnline() {
    if (typeof SAC_API === "undefined") return false;
    return SAC_API.ensureOnline();
  }

  function mergeSectionsIntoCache(incoming) {
    if (!incoming?.length) return getSections();
    const list = getSections();
    const byId = new Map(list.map((s, i) => [s.id, i]));
    incoming.forEach((raw) => {
      const row = { ...raw, active: raw.active !== false };
      const idx = byId.get(row.id);
      if (idx != null) list[idx] = { ...list[idx], ...row };
      else {
        list.push(row);
        byId.set(row.id, list.length - 1);
      }
    });
    saveSections(list);
    return list;
  }

  function mergeReclamationsIntoCache(incoming) {
    if (!incoming?.length) return getReclamations();
    const list = getReclamations();
    const byId = new Map(list.map((r, i) => [r.id, i]));
    incoming.forEach((raw) => {
      const idx = byId.get(raw.id);
      if (idx != null) {
        const prev = list[idx];
        const prevTs = new Date(prev.updatedAt || prev.createdAt || 0).getTime();
        const nextTs = new Date(raw.updatedAt || raw.createdAt || 0).getTime();
        list[idx] = nextTs >= prevTs ? { ...prev, ...raw } : prev;
      } else {
        list.push(raw);
        byId.set(raw.id, list.length - 1);
      }
    });
    saveReclamations(list);
    return list;
  }

  async function syncSectionsFromServer(session) {
    if (!session || !(await isApiOnline())) return getSections();
    try {
      const data = await SAC_API.listSections();
      if (Array.isArray(data?.sections)) mergeSectionsIntoCache(data.sections);
    } catch (err) {
      console.warn("[SAC_SECTIONS] syncSections:", err.message || err);
    }
    return getSections();
  }

  async function syncReclamationsFromServer(session) {
    if (!session || !(await isApiOnline())) return getReclamations();
    try {
      const data = await SAC_API.listReclamations();
      if (Array.isArray(data?.reclamations)) mergeReclamationsIntoCache(data.reclamations);
    } catch (err) {
      console.warn("[SAC_SECTIONS] syncReclamations:", err.message || err);
    }
    return getReclamations();
  }

  async function migrateLocalSectionsToServer(session) {
    if (session?.role !== "universite" || !(await isApiOnline())) return;
    const campus = session.universite || session.codeUni || session.sigle;
    if (!campus) return;
    for (const s of getSections()) {
      if (s.universite !== campus || s.active === false) continue;
      try {
        const data = await SAC_API.upsertSection(s);
        if (data?.section) mergeSectionsIntoCache([data.section]);
      } catch (err) {
        console.warn("[SAC_SECTIONS] migrateSection:", s.id, err.message || err);
      }
    }
  }

  async function ensureReady(session) {
    session = session || getSession();
    await syncSectionsFromServer(session);
    await migrateLocalSectionsToServer(session);
    await syncReclamationsFromServer(session);
    return {
      sections: getSections(),
      reclamations: getReclamations(),
    };
  }

  async function pushSectionToApi(session, section) {
    if (session?.role !== "universite" || !(await isApiOnline())) return section;
    try {
      const data = await SAC_API.upsertSection(section);
      if (data?.section) {
        mergeSectionsIntoCache([data.section]);
        return data.section;
      }
    } catch (err) {
      console.warn("[SAC_SECTIONS] pushSection:", err.message || err);
    }
    return section;
  }

  function getUniUserId(session) {
    return session?.userId || session?.identifiant;
  }

  function getSectionsByUniversity(uniSession) {
    const uid = getUniUserId(uniSession);
    const code = uniSession?.universite || uniSession?.codeUni || uniSession?.sigle;
    return getSections().filter(
      (s) => s.universityId === uid || s.universite === code
    );
  }

  function getSectionById(id) {
    return getSections().find((s) => s.id === id);
  }

  function findSectionForStudent(student) {
    const sections = getSections().filter((s) => s.active !== false);
    const uni = student.universite;
    const uniSections = sections.filter((s) => universiteMatches(s.universite, uni));
    if (!uniSections.length) return null;

    if (student.sectionId) {
      const direct = uniSections.find((s) => s.id === student.sectionId);
      if (direct) return direct;
    }

    const filieres = studentFilieres(student);
    let match = uniSections.find((s) =>
      filieres.some((uf) => filiereMatches(uf, s.filiere))
    );

    if (!match) {
      match = uniSections.find(
        (s) => normalizeFiliere(s.filiere) === "toutes filieres"
      );
    }

    return match || null;
  }

  function universityOwnsSection(uniSession, sectionId) {
    const sec = getSectionById(sectionId);
    if (!sec) return false;
    const uid = getUniUserId(uniSession);
    const code = uniSession?.universite || uniSession?.codeUni;
    return sec.universityId === uid || sec.universite === code;
  }

  /** Université : créer une section interne (sans compte séparé) */
  function importSectionsForUniversity(profile) {
    const rows = profile?.facultySections || [];
    if (!rows.length) return [];
    const uniCode =
      profile.universite ||
      (profile.sigle || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
    const universityId = profile.userId || profile.email || profile.identifiant;
    const sections = getSections();
    const created = [];

    for (const row of rows) {
      if (!row.name?.trim() || !row.filiere?.trim()) continue;
      const dup = sections.find(
        (s) =>
          s.universite === uniCode &&
          norm(s.name) === norm(row.name) &&
          norm(s.filiere) === norm(row.filiere)
      );
      if (dup) {
        created.push(dup);
        continue;
      }
      const section = {
        id: uid("sec"),
        universityId,
        universite: uniCode,
        name: row.name.trim(),
        filiere: row.filiere.trim(),
        responsableNom: (row.responsableNom || row.responsable || "").trim(),
        email: (row.email || "").trim().toLowerCase(),
        telephone: (row.telephone || "").trim(),
        active: true,
        createdAt: new Date().toISOString(),
      };
      sections.push(section);
      created.push(section);
    }
    if (created.length) saveSections(sections);
    return created;
  }

  function studentInSection(student, sectionId) {
    const sec = getSectionById(sectionId);
    if (!sec || sec.active === false) return false;
    if (student.universite && !universiteMatches(sec.universite, student.universite)) {
      return false;
    }
    if (student.sectionId) return student.sectionId === sectionId;
    const match = findSectionForStudent(student);
    return match?.id === sectionId;
  }

  function createSection(uniSession, data) {
    const sections = getSections();

    if (!data.name || !data.filiere) {
      throw new Error("Nom de la section et filière requis.");
    }
    if (!(data.responsableNom || "").trim() || (data.responsableNom || "").trim().length < 2) {
      throw new Error("Nom du responsable de section requis.");
    }

    const email = (data.email || "").trim().toLowerCase();
    const sectionId = uid("sec");
    const section = {
      id: sectionId,
      universityId: getUniUserId(uniSession),
      universite: data.universite || uniSession.universite || uniSession.codeUni,
      name: data.name.trim(),
      filiere: data.filiere.trim(),
      responsableNom: (data.responsableNom || "").trim(),
      email: email || "",
      telephone: (data.telephone || "").trim(),
      active: true,
      createdAt: new Date().toISOString(),
    };
    sections.push(section);
    saveSections(sections);
    const session = getSession();
    if (session) pushSectionToApi(session, section);
    return section;
  }

  /** Université : créer une section + compte chef de section (optionnel) */
  async function createSectionAccount(uniSession, data, accountOptions) {
    const section = createSection(uniSession, data);
    await pushSectionToApi(uniSession, section);
    if (!accountOptions?.createAccount) {
      return { section, credentials: null };
    }
    return SAC_SECTION_ACCOUNTS.createHeadAccount(uniSession, section, {
      email: accountOptions.email || data.email,
      password: accountOptions.password,
      telephone: accountOptions.telephone || data.telephone,
      responsableNom: data.responsableNom,
      prenom: accountOptions.prenom,
      nom: accountOptions.nom,
    });
  }

  async function updateSection(sectionId, data) {
    const sections = getSections();
    const i = sections.findIndex((s) => s.id === sectionId);
    if (i === -1) return null;
    sections[i] = { ...sections[i], ...data, updatedAt: new Date().toISOString() };
    saveSections(sections);
    const session = getSession();
    if (session?.role === "universite" && (await isApiOnline())) {
      try {
        const remote = await SAC_API.patchSection(sectionId, data);
        if (remote?.section) {
          mergeSectionsIntoCache([remote.section]);
          return remote.section;
        }
      } catch (err) {
        console.warn("[SAC_SECTIONS] updateSection:", err.message || err);
      }
    }
    return sections[i];
  }

  function deactivateSection(sectionId) {
    return updateSection(sectionId, { active: false });
  }

  /** Étudiant : déposer une réclamation → routée vers sa section */
  async function submitReclamation(studentSession, studentProfile, payload) {
    const student = {
      email: studentSession.identifiant,
      universite: studentProfile.universite || studentSession.universite,
      filiere: studentProfile.filiere,
      niveau: studentProfile.niveau,
      matricule: studentProfile.matricule,
      nom:
        typeof SAC_IDENTITY !== "undefined"
          ? SAC_IDENTITY.formatFullName(studentProfile.prenom, studentProfile.nom)
          : [studentProfile.prenom, studentProfile.nom].filter(Boolean).join(" ").trim(),
    };

    if (!payload.sujet?.trim() || !payload.message?.trim()) {
      throw new Error("Sujet et description de la réclamation requis.");
    }

    const body = {
      id: uid("rec"),
      sujet: payload.sujet.trim(),
      message: payload.message.trim(),
      categorie: payload.categorie || "autre",
      categorieDetail:
        payload.categorie === "autre" ? (payload.categorieDetail || "").trim() : "",
      attachments: payload.attachments || [],
    };

    if (await isApiOnline() && typeof SAC_API !== "undefined") {
      try {
        const data = await SAC_API.createReclamation(body);
        if (data?.reclamation) {
          mergeReclamationsIntoCache([data.reclamation]);
          return data.reclamation;
        }
      } catch (err) {
        throw new Error(err.message || "Impossible d'envoyer la réclamation au serveur.");
      }
    }

    const section = findSectionForStudent(student);
    if (!section) {
      throw new Error(
        "Aucune section de votre faculté n'est enregistrée. Contactez l'administration de l'université."
      );
    }

    const rec = {
      ...body,
      sectionId: section.id,
      sectionName: section.name,
      studentId: studentSession.userId || student.email,
      studentEmail: student.email,
      studentNom: student.nom || student.email,
      matricule: student.matricule || "—",
      universite: student.universite,
      filiere: student.filiere,
      niveau: student.niveau,
      statut: "ouverte",
      reponse: "",
      traitePar: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const list = getReclamations();
    list.unshift(rec);
    saveReclamations(list);
    return rec;
  }

  function getReclamationsForSection(sectionId) {
    return getReclamations()
      .filter((r) => r.sectionId === sectionId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function getReclamationsForUniversity(uniSession) {
    const sectionIds = getSectionsByUniversity(uniSession).map((s) => s.id);
    return getReclamations()
      .filter((r) => sectionIds.includes(r.sectionId))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /** Toutes les réclamations d'un code campus (assistant / synthèse) */
  function getReclamationsForCampus(universiteCode) {
    const code = String(universiteCode || "").trim();
    if (!code) return [];
    return getReclamations()
      .filter((r) => r.universite === code)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function getReclamationsForStudent(studentEmail) {
    return getReclamations()
      .filter((r) => r.studentEmail === studentEmail)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async function updateReclamation(recId, actorSession, data) {
    const list = getReclamations();
    const i = list.findIndex((r) => r.id === recId);
    if (i === -1) return null;

    const rec = list[i];

    if (actorSession.role === "section" && rec.sectionId !== actorSession.sectionId) {
      throw new Error("Cette réclamation n'appartient pas à votre section.");
    }
    if (
      actorSession.role === "professeur" &&
      actorSession.nomination === "chef_section" &&
      rec.sectionId !== actorSession.sectionId
    ) {
      throw new Error("Cette réclamation n'appartient pas à votre section.");
    }
    if (actorSession.role === "universite" && !universityOwnsSection(actorSession, rec.sectionId)) {
      throw new Error("Cette réclamation n'appartient pas à votre établissement.");
    }
    if (actorSession.role === "assistant") {
      const campus = actorSession.universite || actorSession.codeUni || "";
      if (!campus || rec.universite !== campus) {
        throw new Error("Cette réclamation n'appartient pas à votre campus.");
      }
    }

    const traitePar =
      data.traitePar ||
      (actorSession.role === "universite"
        ? (actorSession.nom || "Administration université") +
          (data.sectionName ? " — " + data.sectionName : "")
        : actorSession.role === "assistant"
          ? (typeof SAC_IDENTITY !== "undefined"
              ? SAC_IDENTITY.getDisplayName(actorSession)
              : actorSession.displayName || actorSession.identifiant) + " (Assistant)"
          : actorSession.role === "professeur" && actorSession.nomination === "chef_section"
            ? (typeof SAC_IDENTITY !== "undefined"
                ? SAC_IDENTITY.getDisplayName(actorSession)
                : actorSession.displayName || actorSession.identifiant) + " (Chef de section)"
            : actorSession.nom || actorSession.identifiant);

    list[i] = {
      ...rec,
      statut: data.statut ?? rec.statut,
      reponse: data.reponse !== undefined ? data.reponse : rec.reponse,
      traitePar,
      updatedAt: new Date().toISOString(),
    };
    saveReclamations(list);

    if (await isApiOnline() && typeof SAC_API !== "undefined") {
      try {
        const remote = await SAC_API.patchReclamation(recId, {
          statut: list[i].statut,
          reponse: list[i].reponse,
          traitePar: list[i].traitePar,
        });
        if (remote?.reclamation) {
          mergeReclamationsIntoCache([remote.reclamation]);
          return remote.reclamation;
        }
      } catch (err) {
        console.warn("[SAC_SECTIONS] updateReclamation:", err.message || err);
        if (actorSession?.authSource === "api") {
          throw new Error(err.message || "Synchronisation de la réclamation impossible.");
        }
      }
    }

    return list[i];
  }

  function countByStatut(reclamations) {
    const c = { ouverte: 0, en_cours: 0, resolue: 0, fermee: 0 };
    reclamations.forEach((r) => {
      if (c[r.statut] !== undefined) c[r.statut]++;
    });
    return c;
  }

  const MAX_ATTACHMENTS = 3;
  const MAX_FILE_SIZE = 800000;

  async function readAttachmentFiles(fileList) {
    if (!fileList?.length) return [];
    const files = Array.from(fileList).slice(0, MAX_ATTACHMENTS);
    const out = [];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`Fichier trop volumineux : ${file.name} (max ~800 Ko)`);
      }
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      out.push({
        id: uid("att"),
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        dataUrl,
      });
    }
    return out;
  }

  function escHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function attachmentsHtml(attachments, forStudent) {
    if (!attachments?.length) return "";
    const items = attachments
      .map((a) => {
        const size = (a.size / 1024).toFixed(0) + " Ko";
        const name = escHtml(a.name);
        const link = a.dataUrl
          ? `<a href="${a.dataUrl}" download="${name}" target="_blank" rel="noopener">Télécharger</a>`
          : "";
        return `<li class="attach-item"><span>📎 ${name}</span> <small>${size}</small> ${link}</li>`;
      })
      .join("");
    return `<div class="rec-attachments"><strong>${forStudent ? "Vos pièces jointes :" : "Documents joints :"}</strong><ul>${items}</ul></div>`;
  }

  function categoryLabel(id, detail) {
    const base = CATEGORIES.find((c) => c.id === id)?.label || id;
    if (id === "autre" && detail) return base + " — " + detail;
    return base;
  }

  function categoriesOptionsHtml(emptyLabel) {
    const first = emptyLabel
      ? `<option value="">${emptyLabel}</option>`
      : "";
    return (
      first +
      CATEGORIES.map((c) => `<option value="${c.id}">${c.label}</option>`).join("")
    );
  }

  function isAutreCategory(id) {
    return id === "autre";
  }

  function statutLabel(id) {
    return STATUTS.find((s) => s.id === id)?.label || id;
  }

  function statutColor(id) {
    return STATUTS.find((s) => s.id === id)?.color || "#5a6d7e";
  }

  function initDemoSections() {
    if (getSections().length) return;
    const demo = [
      {
        id: "sec-demo-eco",
        universityId: "uni-demo",
        universite: "unkin",
        name: "Section — Sciences économiques & Gestion",
        filiere: "Sciences économiques — Gestion",
        responsableNom: "M. Kabila",
        email: "section.gestion@unikin.cd",
        telephone: "+243 81 000 0001",
        active: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: "sec-demo-info",
        universityId: "uni-demo",
        universite: "unkin",
        name: "Section — Informatique",
        filiere: "Informatique",
        responsableNom: "Mme. Mwamba",
        email: "section.info@unikin.cd",
        telephone: "+243 81 000 0002",
        active: true,
        createdAt: new Date().toISOString(),
      },
    ];
    saveSections(demo);

  }

  initDemoSections();

  return {
    CATEGORIES,
    categoriesOptionsHtml,
    isAutreCategory,
    STATUTS,
    getSections,
    getSectionsByUniversity,
    getSectionById,
    findSectionForStudent,
    studentInSection,
    normalizeUniversite,
    universiteMatches,
    normalizeFiliere,
    filiereMatches,
    studentFilieres,
    studentMatchesSection,
    linkStudentToSection,
    repairStudentsForSection,
    importSectionsForUniversity,
    createSection,
    createSectionAccount,
    universityOwnsSection,
    readAttachmentFiles,
    attachmentsHtml,
    MAX_ATTACHMENTS,
    MAX_FILE_SIZE,
    updateSection,
    deactivateSection,
    submitReclamation,
    getReclamationsForSection,
    getReclamationsForUniversity,
    getReclamationsForCampus,
    getReclamationsForStudent,
    updateReclamation,
    countByStatut,
    categoryLabel,
    statutLabel,
    statutColor,
    ensureReady,
    syncSectionsFromServer,
    syncReclamationsFromServer,
  };
})();

/**
 * Sections faculté & réclamations étudiants
 */
const SAC_SECTIONS = (function () {
  const SECTIONS_KEY = "sac_sections";
  const RECLAMATIONS_KEY = "sac_reclamations";

  /** Grandes catégories Evo-smartUni — réclamations étudiant / section. */
  const RECLAMATION_CATEGORIES = [
    { id: "academique", label: "Réclamation académique", icon: "📚" },
    { id: "finance", label: "Finance", icon: "💳" },
    { id: "administration", label: "Administration", icon: "🏛️" },
    { id: "stage", label: "Réclamation liée au stage", icon: "💼" },
    { id: "horaire", label: "Relative aux horaires", icon: "🕐" },
    { id: "document", label: "Réclamation sur le document", icon: "📄" },
    { id: "stage_memoire", label: "Stage et mémoire", icon: "🎓" },
    { id: "autre", label: "Autres", icon: "📩" },
  ];

  const CATEGORIES = RECLAMATION_CATEGORIES.map(({ id, label }) => ({ id, label }));
  const STUDENT_CATEGORIES = RECLAMATION_CATEGORIES;

  /** Libellés des anciennes catégories (réclamations déjà enregistrées). */
  const LEGACY_CATEGORY_LABELS = {
    scolarite: "Administration",
    notes: "Réclamation académique",
    frais: "Finance",
    documents: "Réclamation sur le document",
    bourse: "Finance",
    emploi_du_temps: "Relative aux horaires",
    stage_emploi: "Réclamation liée au stage",
    discipline: "Administration",
    bibliotheque: "Administration",
    infrastructure: "Administration",
    enseignement: "Réclamation académique",
    inscription: "Administration",
    technique: "Administration",
    infrastructures_services: "Administration",
    autre: "Autres",
  };

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
    if (typeof SAC_UNIVERSITIES !== "undefined" && SAC_UNIVERSITIES.sameCampus) {
      return SAC_UNIVERSITIES.sameCampus(a, b);
    }
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

  const DOMAIN_STOP_WORDS = new Set([
    "faculte",
    "facultes",
    "departement",
    "department",
    "section",
    "des",
    "de",
    "du",
    "la",
    "le",
    "les",
    "et",
    "and",
    "sciences",
    "science",
  ]);

  function domainTokens(value) {
    return filiereTokens(value).filter((w) => !DOMAIN_STOP_WORDS.has(w));
  }

  /** Même domaine académique — ex. « Section Informatique » ↔ « Département Informatique » */
  function domainMatches(a, b) {
    if (!a || !b) return false;
    if (filiereMatches(a, b)) return true;
    const ta = domainTokens(a);
    const tb = new Set(domainTokens(b));
    if (!ta.length || !tb.size) return false;
    const shared = ta.filter((w) => tb.has(w));
    if (shared.some((w) => w.length >= 5)) return true;
    if (shared.length >= 1 && (ta.length <= 2 || tb.size <= 2)) return true;
    return false;
  }

  function canonicalDomain(value) {
    const tokens = domainTokens(value);
    if (tokens.length) {
      return tokens.sort((a, b) => b.length - a.length)[0];
    }
    return normalizeFiliere(value);
  }

  function campusDomainTaken(universiteCode, filiere, excludeSectionId) {
    const key = canonicalDomain(filiere);
    if (!key || !universiteCode) return false;
    return getSections().some(
      (s) =>
        s.active !== false &&
        s.id !== excludeSectionId &&
        universiteMatches(s.universite, universiteCode) &&
        canonicalDomain(s.filiere) === key
    );
  }

  function findCampusSectionByDomain(universiteCode, domainLabel) {
    if (!universiteCode || !domainLabel) return null;
    const list = listCampusSections(universiteCode);
    return (
      list.find(
        (s) =>
          domainMatches(s.filiere, domainLabel) ||
          domainMatches(s.name, domainLabel)
      ) || null
    );
  }

  function dedupeSectionsByDomain(sections) {
    const seen = new Map();
    (sections || []).forEach((s) => {
      const key = canonicalDomain(s.filiere || s.name);
      if (!key) return;
      const prev = seen.get(key);
      if (!prev || (s.source === "registered" && prev.source !== "registered")) {
        seen.set(key, s);
      }
    });
    return [...seen.values()];
  }

  /** Une section par domaine académique et par université */
  function validateUniqueDomains(rows) {
    const items = (rows || []).filter((r) => String(r.filiere || "").trim());
    const seen = new Map();
    for (const row of items) {
      const key = canonicalDomain(row.filiere);
      if (!key) continue;
      if (seen.has(key)) {
        return {
          ok: false,
          message:
            "Chaque domaine académique ne peut avoir qu'une seule section dans la même université " +
            "(ex. Informatique, Gestion, Droit…). Doublon pour le domaine « " +
            row.filiere +
            " ».",
        };
      }
      seen.set(key, row);
    }
    return { ok: true };
  }

  function memberDomainLabels(user) {
    const out = [];
    if (user?.filiere) out.push(user.filiere);
    if (user?.departement) out.push(user.departement);
    if (user?.service) out.push(user.service);
    if (user?.sectionName) out.push(user.sectionName);
    (user?.coursClasses || []).forEach((c) => {
      if (c?.filiere) out.push(c.filiere);
    });
    return [...new Set(out.filter(Boolean))];
  }

  function sectionDomainLabels(sectionSession) {
    const out = [];
    if (sectionSession?.filiere) out.push(sectionSession.filiere);
    if (sectionSession?.sectionName) out.push(sectionSession.sectionName);
    if (sectionSession?.departement) out.push(sectionSession.departement);
    const sectionId = sectionSession?.sectionId;
    if (sectionId) {
      const meta = getSectionById(sectionId);
      if (meta?.filiere) out.push(meta.filiere);
      if (meta?.name) out.push(meta.name);
    }
    return [...new Set(out.filter(Boolean))];
  }

  function memberMatchesSectionDomain(member, sectionSession) {
    const sectionDomains = sectionDomainLabels(sectionSession);
    const memberDomains = memberDomainLabels(member);
    if (!sectionDomains.length) {
      if (member?.role === "etudiant") return !!findSectionForStudent(member);
      return !memberDomains.length;
    }
    if (!memberDomains.length) return false;
    return sectionDomains.some((sd) =>
      memberDomains.some((md) => domainMatches(md, sd))
    );
  }

  function studentFilieres(student) {
    return memberDomainLabels(student);
  }

  function linkStudentToSection(student) {
    if (!student || student.role !== "etudiant") return student;
    if (student.sectionId) {
      const direct = getSectionById(student.sectionId);
      if (direct && universiteMatches(direct.universite, student.universite)) {
        student.sectionName = student.sectionName || direct.name;
        student.filiere = student.filiere || direct.filiere;
        return student;
      }
    }
    const match = findSectionForStudent(student);
    if (match) {
      student.sectionId = match.id;
      student.sectionName = match.name;
      if (!student.filiere) student.filiere = match.filiere;
    }
    return student;
  }

  function studentMatchesSection(student, sectionSession) {
    if (!student || student.role !== "etudiant" || !sectionSession) return false;
    const studentUni =
      student.universite || student.universiteLocked || student.sigle;
    const sectionUni =
      sectionSession.universite ||
      sectionSession.universiteLocked ||
      sectionSession.sigle ||
      sectionSession.codeUni;
    if (
      sectionSession.isRector ||
      sectionSession.sectionKind === "recteur"
    ) {
      return universiteMatches(studentUni, sectionUni);
    }
    if (!universiteMatches(studentUni, sectionUni)) return false;

    const sectionId = sectionSession.sectionId;
    if (sectionId && student.sectionId === sectionId) return true;

    const resolved = findSectionForStudent(student);
    if (sectionId && resolved?.id === sectionId) return true;

    return memberMatchesSectionDomain(student, sectionSession);
  }

  function staffMatchesSection(staff, sectionSession) {
    if (!staff || !sectionSession) return false;
    if (staff.role !== "professeur" && staff.role !== "assistant") return false;

    const staffUni = staff.universite || staff.universiteLocked || staff.sigle;
    const sectionUni =
      sectionSession.universite ||
      sectionSession.universiteLocked ||
      sectionSession.sigle ||
      sectionSession.codeUni;
    if (
      sectionSession.isRector ||
      sectionSession.sectionKind === "recteur"
    ) {
      return universiteMatches(staffUni, sectionUni);
    }
    if (!universiteMatches(staffUni, sectionUni)) return false;

    const sectionId = sectionSession.sectionId;
    if (sectionId && staff.sectionId === sectionId) return true;

    if (staff.role === "assistant") {
      const sectionDomains = sectionDomainLabels(sectionSession);
      const memberDomains = memberDomainLabels(staff);
      if (!sectionDomains.length || !memberDomains.length) return true;
    }

    return memberMatchesSectionDomain(staff, sectionSession);
  }

  function repairStudentsForSection(sectionSession) {
    if (!sectionSession || typeof SAC_IDENTITY === "undefined") return 0;
    const users = SAC_IDENTITY.getLocalUsers();
    const campusWide =
      sectionSession.isRector || sectionSession.sectionKind === "recteur";
    let updated = 0;
    const next = users.map((u) => {
      if (u.role !== "etudiant") return u;
      const belongs = campusWide
        ? universiteMatches(
            u.universite || u.universiteLocked,
            sectionSession.universite || sectionSession.universiteLocked || sectionSession.sigle
          )
        : studentMatchesSection(u, sectionSession);
      if (!belongs) return u;
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
      if (!universiteMatches(s.universite, campus) || s.active === false) continue;
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
    if (session?.role === "section") {
      repairSectionHeadSession(session);
    }
    await migrateLocalSectionsToServer(session);
    await syncReclamationsFromServer(session);
    return {
      sections: getSections(),
      reclamations: getReclamations(),
    };
  }

  /** Aligne sectionId du chef de section sur la section API (même filière / campus). */
  function repairSectionHeadSession(session) {
    if (!session || session.role !== "section") return session;
    if (session.isRector || session.sectionKind === "recteur") return session;
    const campus =
      session.universite || session.universiteLocked || session.sigle || session.codeUni;
    let meta = session.sectionId ? getSectionById(session.sectionId) : null;
    if (!meta && session.filiere && campus) {
      meta = findCampusSectionByDomain(campus, session.filiere);
    }
    if (!meta && session.sectionName && campus) {
      meta = findCampusSectionByDomain(campus, session.sectionName);
    }
    if (meta) {
      if (session.sectionId !== meta.id) session.sectionId = meta.id;
      if (!session.sectionName) session.sectionName = meta.name;
      if (!session.filiere) session.filiere = meta.filiere;
      if (typeof SAC_SESSION !== "undefined" && SAC_SESSION.saveSession) {
        SAC_SESSION.saveSession(session);
      }
    }
    return session;
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
    const code = uniSession?.universite || uniSession?.universiteLocked || uniSession?.codeUni || uniSession?.sigle;
    return getSections().filter((s) => {
      if (uid && s.universityId === uid) return true;
      if (code && universiteMatches(s.universite, code)) return true;
      return false;
    });
  }

  function getFacultySectionsForCampus(universiteCode) {
    if (!universiteCode) return [];
    let users = [];
    try {
      users = JSON.parse(localStorage.getItem("sac_users") || "[]");
    } catch {
      return [];
    }
    const uni = users.find((u) => {
      if (u.role !== "universite") return false;
      const keys = [u.universite, u.universiteLocked, u.sigle, u.codeUni].filter(Boolean);
      return keys.some((k) => universiteMatches(k, universiteCode));
    });
    return (uni?.facultySections || []).filter((r) => r.name?.trim() && r.filiere?.trim());
  }

  /** Sections / filières d'un campus — pour inscription étudiant (liste déroulante) */
  function listCampusSections(universiteCode) {
    if (!universiteCode) return [];
    const code =
      typeof SAC_UNIVERSITIES !== "undefined" && SAC_UNIVERSITIES.resolveId
        ? SAC_UNIVERSITIES.resolveId(universiteCode) || universiteCode
        : universiteCode;

    const fromStore = getSections()
      .filter((s) => s.active !== false && universiteMatches(s.universite, code))
      .map((s) => ({
        id: s.id,
        name: s.name,
        filiere: s.filiere,
        responsableNom: s.responsableNom || "",
        source: "registered",
      }));

    if (fromStore.length) {
      return dedupeSectionsByDomain(fromStore).sort((a, b) =>
        norm(a.filiere || a.name).localeCompare(norm(b.filiere || b.name), "fr", {
          sensitivity: "base",
        })
      );
    }

    return dedupeSectionsByDomain(
      getFacultySectionsForCampus(code).map((row, i) => ({
        id: "fac-" + code + "-" + i,
        name: row.name.trim(),
        filiere: row.filiere.trim(),
        responsableNom: (row.responsableNom || row.responsable || "").trim(),
        source: "catalog",
      }))
    );
  }

  /** Sections d'un campus pour inscription (API publique + cache local) */
  async function fetchCampusSectionsForInscription(universiteCode) {
    if (!universiteCode) return [];
    const code =
      typeof SAC_UNIVERSITIES !== "undefined" && SAC_UNIVERSITIES.resolveId
        ? SAC_UNIVERSITIES.resolveId(universiteCode) || universiteCode
        : universiteCode;

    if (typeof SAC_API !== "undefined" && SAC_API.listCampusSectionsPublic) {
      try {
        const data = await Promise.race([
          SAC_API.listCampusSectionsPublic(code),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
        ]);
        if (Array.isArray(data?.sections) && data.sections.length) {
          mergeSectionsIntoCache(
            data.sections.map((s) => ({
              ...s,
              universite: s.universite || code,
              active: s.active !== false,
            }))
          );
        }
      } catch (err) {
        console.warn("[SAC_SECTIONS] fetchCampusSections:", err.message || err);
      }
    }

    return listCampusSections(code);
  }

  function campusSectionsOptionsHtml(sections, selectedId) {
    const empty =
      '<option value="">' +
      (sections.length
        ? "— Choisir votre section / filière —"
        : "— Aucune section enregistrée pour cette université —") +
      "</option>";
    const opts = (sections || []).map((s) => {
      const sel = s.id === selectedId ? " selected" : "";
      const domain = s.filiere || s.name;
      const label = "Domaine : " + domain + (s.name && s.filiere ? " — " + s.name : "");
      return (
        '<option value="' +
        s.id +
        '"' +
        sel +
        ' data-filiere="' +
        escapeHtml(s.filiere) +
        '" data-name="' +
        escapeHtml(s.name) +
        '">' +
        escapeHtml(label) +
        "</option>"
      );
    });
    return empty + opts.join("");
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
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
      filieres.some((uf) => domainMatches(uf, s.filiere) || domainMatches(uf, s.name))
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

  function repairStoredSectionsCampus() {
    if (typeof SAC_UNIVERSITIES === "undefined" || !SAC_UNIVERSITIES.resolveId) return 0;
    const sections = getSections();
    let updated = 0;
    const next = sections.map((s) => {
      const id = SAC_UNIVERSITIES.resolveId(s.universite);
      if (!id || id === s.universite) return s;
      updated += 1;
      return { ...s, universite: id };
    });
    if (updated) saveSections(next);
    return updated;
  }

  /** Université : créer une section interne (sans compte séparé) */
  function importSectionsForUniversity(profile) {
    const rows = profile?.facultySections || [];
    if (!rows.length) return [];
    const uniCode =
      typeof SAC_UNIVERSITIES !== "undefined" && SAC_UNIVERSITIES.resolveId
        ? SAC_UNIVERSITIES.resolveId(
            profile.universite || profile.universiteLocked || profile.sigle || profile.codeUni
          )
        : profile.universite ||
          (profile.sigle || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
    const universityId = profile.userId || profile.email || profile.identifiant;
    const sections = getSections();
    const created = [];

    for (const row of rows) {
      if (!row.name?.trim() || !row.filiere?.trim()) continue;
      const domainDup = sections.find(
        (s) =>
          universiteMatches(s.universite, uniCode) &&
          domainMatches(s.filiere, row.filiere)
      );
      if (domainDup) {
        created.push(domainDup);
        continue;
      }
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
    const campusCode =
      typeof SAC_UNIVERSITIES !== "undefined"
        ? SAC_UNIVERSITIES.resolveId(data.universite || uniSession.universite || uniSession.codeUni)
        : data.universite || uniSession.universite || uniSession.codeUni;
    if (campusDomainTaken(campusCode, data.filiere)) {
      throw new Error(
        "Ce domaine dispose déjà d'une section dans votre université. Règle SAC : un domaine = une section (ex. Informatique, Gestion…)."
      );
    }
    const section = {
      id: sectionId,
      universityId: getUniUserId(uniSession),
      universite: campusCode,
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
      throw new Error(
        "Un compte chef de section est requis. Créez-le depuis le portail DG — le responsable n'a pas besoin d'être enseignant."
      );
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
      sectionId: studentProfile.sectionId || studentSession.sectionId,
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
      if (typeof SAC_API.ensureApiSession === "function") {
        await SAC_API.ensureApiSession({ soft: true });
      }
      if (typeof SAC_API.hasAuthTokens === "function" && !SAC_API.hasAuthTokens()) {
        throw new Error(
          "Session expirée — déconnectez-vous puis reconnectez-vous pour envoyer une réclamation."
        );
      }
      try {
        const data = await SAC_API.createReclamation(body);
        if (data?.reclamation) {
          mergeReclamationsIntoCache([data.reclamation]);
          return data.reclamation;
        }
      } catch (err) {
        const msg = err.message || "Impossible d'envoyer la réclamation au serveur.";
        if (/NO_SECTION|aucune section/i.test(msg)) {
          throw new Error(
            "Aucune section de votre faculté n'est enregistrée sur le serveur. " +
              "Contactez l'administration de votre université pour créer votre section, puis réessayez."
          );
        }
        throw new Error(msg);
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

  /** Réclamations visibles par le chef de section (ID section ou même filière / campus). */
  function getReclamationsForSectionHead(sectionSession) {
    if (!sectionSession) return [];
    if (sectionSession.isRector || sectionSession.sectionKind === "recteur") {
      return getReclamationsForUniversity(sectionSession);
    }
    const campus =
      sectionSession.universite ||
      sectionSession.universiteLocked ||
      sectionSession.sigle ||
      sectionSession.codeUni;
    const sectionId = sectionSession.sectionId;
    const meta = sectionId
      ? getSectionById(sectionId)
      : findCampusSectionByDomain(campus, sectionSession.filiere || sectionSession.sectionName);
    const filiereKeys = [
      sectionSession.filiere,
      sectionSession.sectionName,
      meta?.filiere,
      meta?.name,
    ].filter(Boolean);
    const canonicalId = meta?.id || sectionId;

    return getReclamations()
      .filter((r) => {
        if (canonicalId && r.sectionId === canonicalId) return true;
        if (sectionId && r.sectionId === sectionId) return true;
        if (!campus || !universiteMatches(r.universite, campus)) return false;
        if (!filiereKeys.length) return false;
        return filiereKeys.some((f) => filiereMatches(r.filiere, f));
      })
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
      .filter((r) => universiteMatches(r.universite, code))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function getReclamationsForStudent(studentEmail) {
    const needle = String(studentEmail || "").trim().toLowerCase();
    return getReclamations()
      .filter(
        (r) => String(r.studentEmail || "").trim().toLowerCase() === needle
      )
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async function updateReclamation(recId, actorSession, data) {
    const list = getReclamations();
    const i = list.findIndex((r) => r.id === recId);
    if (i === -1) return null;

    const rec = list[i];

    if (
      actorSession.role === "section" ||
      (actorSession.role === "professeur" && actorSession.nomination === "chef_section")
    ) {
      const allowed = getReclamationsForSectionHead(actorSession).some((r) => r.id === recId);
      if (!allowed) {
        throw new Error("Cette réclamation n'appartient pas à votre section.");
      }
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
    const base =
      CATEGORIES.find((c) => c.id === id)?.label ||
      LEGACY_CATEGORY_LABELS[id] ||
      id;
    if (id === "autre" && detail) return base + " — " + detail;
    return base;
  }

  function categoriesOptionsHtml(emptyLabel, list) {
    const items = list || CATEGORIES;
    const first = emptyLabel
      ? `<option value="">${emptyLabel}</option>`
      : "";
    return (
      first +
      items.map((c) => `<option value="${c.id}">${c.label}</option>`).join("")
    );
  }

  function studentCategoriesOptionsHtml(emptyLabel) {
    return categoriesOptionsHtml(emptyLabel, STUDENT_CATEGORIES);
  }

  function studentCategoryChipsHtml() {
    return STUDENT_CATEGORIES.filter((c) => c.id !== "autre")
      .map(
        (c) =>
          `<button type="button" class="rec-cat-chip" data-cat="${c.id}" title="${c.label}">${c.icon || ""} ${c.label}</button>`
      )
      .join("");
  }

  /** Légende des catégories affichée dans les formulaires section (DG / chef de section). */
  function sectionCategoriesLegendHtml() {
    return STUDENT_CATEGORIES.filter((c) => c.id !== "autre")
      .map(
        (c) =>
          `<span class="rec-cat-chip rec-cat-chip--legend" title="${escapeHtml(c.label)}">${c.icon || ""} ${escapeHtml(c.label)}</span>`
      )
      .join("");
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
  repairStoredSectionsCampus();

  return {
    CATEGORIES,
    STUDENT_CATEGORIES,
    categoriesOptionsHtml,
    studentCategoriesOptionsHtml,
    studentCategoryChipsHtml,
    sectionCategoriesLegendHtml,
    isAutreCategory,
    STATUTS,
    getSections,
    getSectionsByUniversity,
    listCampusSections,
    fetchCampusSectionsForInscription,
    getFacultySectionsForCampus,
    campusSectionsOptionsHtml,
    getSectionById,
    findSectionForStudent,
    studentInSection,
    normalizeUniversite,
    universiteMatches,
    normalizeFiliere,
    filiereMatches,
    domainMatches,
    canonicalDomain,
    campusDomainTaken,
    findCampusSectionByDomain,
    validateUniqueDomains,
    memberDomainLabels,
    sectionDomainLabels,
    memberMatchesSectionDomain,
    studentFilieres,
    studentMatchesSection,
    staffMatchesSection,
    linkStudentToSection,
    repairStudentsForSection,
    repairStoredSectionsCampus,
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
    getReclamationsForSectionHead,
    getReclamationsForUniversity,
    getReclamationsForCampus,
    getReclamationsForStudent,
    updateReclamation,
    countByStatut,
    categoryLabel,
    statutLabel,
    statutColor,
    ensureReady,
    repairSectionHeadSession,
    syncSectionsFromServer,
    syncReclamationsFromServer,
  };
})();

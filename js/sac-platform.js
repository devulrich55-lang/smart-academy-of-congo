/**
 * Plateforme unifiée Smart Academy of Congo
 * 10 piliers · RBAC · sync API + repli localStorage sécurisé par campus
 */
const SAC_PLATFORM = (function () {
  const KEYS = {
    grades: "sac_platform_grades",
    library: "sac_platform_library",
    careers: "sac_platform_careers",
    courses: "sac_platform_courses",
    enrollments: "sac_platform_enrollments",
    social: "sac_platform_social",
    diplomas: "sac_platform_diplomas",
    orientation: "sac_platform_orientation_log",
    audit: "sac_platform_audit",
  };

  const MODULES = [
    { id: "unifie", icon: "🌐", title: "Réseau national unifié", roles: ["etudiant", "professeur", "assistant", "universite", "section"], public: true },
    { id: "inscription", icon: "📝", title: "Inscription en ligne", roles: ["etudiant", "assistant", "universite", "section"], href: "inscription.html" },
    { id: "resultats", icon: "📊", title: "Résultats académiques", roles: ["etudiant", "professeur", "assistant", "universite", "section"] },
    { id: "frais", icon: "💳", title: "Paiement des frais", roles: ["etudiant", "assistant", "universite", "section"], href: "dashboard-etudiant.html#frais" },
    { id: "bibliotheque", icon: "📚", title: "Bibliothèque numérique", roles: ["etudiant", "professeur", "assistant", "universite", "section"] },
    { id: "orientation_ia", icon: "🤖", title: "IA orientation académique", roles: ["etudiant"] },
    { id: "stages_emplois", icon: "💼", title: "Stages & emplois", roles: ["etudiant", "professeur", "assistant", "universite", "section"] },
    { id: "reseau", icon: "👥", title: "Réseau social étudiant", roles: ["etudiant", "professeur", "assistant"] },
    { id: "cours_ligne", icon: "🎓", title: "Cours en ligne & direct", roles: ["etudiant", "professeur", "universite"] },
    { id: "verification_diplome", icon: "🛡️", title: "Vérification officielle des diplômes", roles: ["etudiant", "universite"], publicVerify: "verifier-diplome.html" },
  ];

  function read(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  }

  function write(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  function uid(p) {
    return p + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function getSession() {
    return typeof SAC_SESSION !== "undefined" ? SAC_SESSION.getSession() : null;
  }

  function canAccess(moduleId, role) {
    const m = MODULES.find((x) => x.id === moduleId);
    if (!m) return false;
    return m.roles.includes(role);
  }

  function modulesForRole(role) {
    return MODULES.filter((m) => m.id !== "unifie" && m.roles.includes(role));
  }

  function audit(action, resource, resourceId, meta) {
    const s = getSession();
    const log = read(KEYS.audit);
    log.unshift({
      id: uid("aud"),
      actor: s?.email || "anon",
      role: s?.role || "public",
      action,
      resource,
      resourceId,
      universite: s?.universite,
      meta: meta || {},
      at: new Date().toISOString(),
    });
    write(KEYS.audit, log.slice(0, 200));
  }

  async function api(path, opts) {
    if (typeof SAC_API === "undefined") return null;
    const ok = await SAC_API.ensureOnline();
    if (!ok) return null;
    try {
      return await SAC_API.platformRequest(path, opts);
    } catch {
      return null;
    }
  }

  /* ── Grades ── */
  async function getGrades() {
    const s = getSession();
    if (typeof SAC_GRADES !== "undefined" && s) {
      await SAC_GRADES.ensureGradesReady(s);
      if (s.role === "professeur") {
        return SAC_GRADES.getAll().filter(
          (g) =>
            normEmail(g.professorEmail) === normEmail(s.email || s.identifiant)
        );
      }
      if (s.role === "etudiant") {
        return SAC_GRADES.getForStudent({
          email: s.email || s.identifiant,
          identifiant: s.identifiant,
          matricule: s.matricule,
        }).map((g) => ({ ...g, courseName: g.course }));
      }
      return SAC_GRADES.getAll().filter(
        (g) => !s.universite || g.universite === s.universite
      );
    }
    const data = await api("/platform/grades/me");
    if (data) return Array.isArray(data) ? data : data.grades || data;
    if (!s) return [];
    return read(KEYS.grades).filter(
      (g) =>
        (g.studentEmail && g.studentEmail.toLowerCase() === (s.email || "").toLowerCase()) ||
        (s.role === "professeur" && g.professorEmail === s.email)
    );
  }

  function normEmail(email) {
    return (email || "").trim().toLowerCase();
  }

  function saveGradeLocal(grade) {
    if (typeof SAC_GRADES !== "undefined") {
      SAC_GRADES.mergeIntoCache([grade]);
      audit("upsert_grade", "grade", grade.id);
      return grade;
    }
    const list = read(KEYS.grades);
    const idx = list.findIndex((g) => g.id === grade.id);
    if (idx >= 0) list[idx] = grade;
    else list.push(grade);
    write(KEYS.grades, list);
    audit("upsert_grade", "grade", grade.id);
    return grade;
  }

  /* ── Library ── */
  async function getLibrary() {
    if (typeof SAC_API !== "undefined" && SAC_API.listDigitalLibrary) {
      try {
        const online = await SAC_API.ensureOnline();
        if (online) {
          const data = await SAC_API.listDigitalLibrary();
          if (data?.items?.length) return data.items;
        }
      } catch {
        /* fallback */
      }
    }
    const data = await api("/platform/library");
    if (data?.items) return data.items;
    const s = getSession();
    return read(KEYS.library).filter((i) => !s?.universite || i.universite === s.universite);
  }

  function addLibraryLocal(item) {
    const s = getSession();
    const row = { id: uid("lib"), universite: s?.universite, published: true, createdAt: new Date().toISOString(), ...item };
    const list = read(KEYS.library);
    list.push(row);
    write(KEYS.library, list);
    audit("create_library", "library", row.id);
    return row;
  }

  /* ── Careers ── */
  async function getCareers(scope) {
    const q = scope ? "?scope=" + encodeURIComponent(scope) : "";
    const data = await api("/platform/careers" + q);
    if (data?.items) return data.items;
    const s = getSession();
    return read(KEYS.careers).filter(
      (c) => c.published !== false && (c.scope === "national" || !s?.universite || c.universite === s.universite)
    );
  }

  function addCareerLocal(item) {
    const s = getSession();
    const row = { id: uid("job"), universite: s?.universite, published: true, createdAt: new Date().toISOString(), ...item };
    write(KEYS.careers, read(KEYS.careers).concat(row));
    audit("create_career", "career", row.id);
    return row;
  }

  /* ── Courses ── */
  async function getCourses() {
    const data = await api("/platform/courses");
    if (data?.items) return data.items;
    const s = getSession();
    return read(KEYS.courses).filter((c) => !s?.universite || c.universite === s.universite);
  }

  async function enrollCourse(courseId) {
    const data = await api("/platform/courses/" + courseId + "/enroll", { method: "POST" });
    if (data) return data.enrollment;
    const s = getSession();
    const row = { id: uid("enr"), courseId, studentEmail: s?.email, progress: 0, enrolledAt: new Date().toISOString() };
    write(KEYS.enrollments, read(KEYS.enrollments).concat(row));
    audit("enroll_course", "course", courseId);
    return row;
  }

  /* ── Social ── */
  async function getSocialPosts() {
    const data = await api("/platform/social");
    if (data?.posts) return data.posts;
    const s = getSession();
    return read(KEYS.social)
      .filter((p) => !s?.universite || p.universite === s.universite)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }

  function addSocialLocal(content, audience) {
    const s = getSession();
    const name =
      typeof SAC_IDENTITY !== "undefined"
        ? SAC_IDENTITY.getDisplayName(s)
        : [s?.prenom, s?.nom].filter(Boolean).join(" ");
    const row = {
      id: uid("soc"),
      universite: s?.universite,
      authorEmail: s?.email,
      authorName: name,
      authorRole: s?.role,
      content: String(content).slice(0, 2000),
      audience: audience || "campus",
      filiere: s?.filiere,
      likes: [],
      createdAt: new Date().toISOString(),
    };
    write(KEYS.social, [row].concat(read(KEYS.social)));
    audit("create_social", "social", row.id);
    return row;
  }

  function toggleLikeLocal(postId) {
    const list = read(KEYS.social);
    const s = getSession();
    const p = list.find((x) => x.id === postId);
    if (!p || !s?.email) return [];
    p.likes = p.likes || [];
    const i = p.likes.indexOf(s.email);
    if (i >= 0) p.likes.splice(i, 1);
    else p.likes.push(s.email);
    write(KEYS.social, list);
    return p.likes;
  }

  /* ── Diplomas ── */
  async function getMyDiplomas() {
    if (typeof SAC_API !== "undefined" && SAC_API.listMyDiplomas) {
      try {
        const online = await SAC_API.ensureOnline();
        if (online) return await SAC_API.listMyDiplomas();
      } catch {
        /* fallback */
      }
    }
    const data = await api("/platform/diplomas/me");
    if (data?.diplomas) return data.diplomas;
    const s = getSession();
    return read(KEYS.diplomas).filter(
      (d) => d.studentEmail && d.studentEmail.toLowerCase() === (s?.email || "").toLowerCase()
    );
  }

  async function verifyDiplomaPublic(code, number) {
    if (typeof SAC_API !== "undefined") {
      const ok = await SAC_API.ensureOnline();
      if (ok) {
        try {
          return await SAC_API.verifyDiplomaPublic(code, number);
        } catch (e) {
          return { valid: false, message: e.message || "Erreur de vérification." };
        }
      }
    }
    const row = read(KEYS.diplomas).find(
      (d) =>
        String(d.verificationCode).toUpperCase() === String(code).toUpperCase() &&
        String(d.diplomaNumber).toUpperCase() === String(number).toUpperCase()
    );
    if (!row) return { valid: false, message: "Aucun diplôme correspondant (mode local)." };
    if (row.status !== "actif") return { valid: false, message: "Diplôme " + row.status };
    return {
      valid: true,
      diploma: {
        studentName: row.studentName,
        matricule: row.matricule,
        universite: row.universite,
        filiere: row.filiere,
        niveau: row.niveau,
        diplomaType: row.diplomaType,
        graduationYear: row.graduationYear,
        diplomaNumber: row.diplomaNumber,
        issuedAt: row.issuedAt,
        status: row.status,
      },
    };
  }

  function issueDiplomaLocal(data) {
    const code = Math.random().toString(16).slice(2, 10).toUpperCase() + Math.random().toString(16).slice(2, 10).toUpperCase();
    const num =
      "SAC-" +
      String(data.universite || "UNK")
        .replace(/[^A-Za-z0-9]/g, "")
        .slice(0, 6)
        .toUpperCase() +
      "-" +
      (data.graduationYear || new Date().getFullYear()) +
      "-" +
      Math.random().toString(36).slice(2, 8).toUpperCase();
    const row = {
      id: uid("dip"),
      verificationCode: code,
      diplomaNumber: num,
      status: "actif",
      issuedAt: new Date().toISOString(),
      hashSignature: "local-" + num.slice(-8),
      ...data,
    };
    write(KEYS.diplomas, read(KEYS.diplomas).concat(row));
    audit("issue_diploma", "diploma", row.id);
    return row;
  }

  /* ── IA Orientation ── */
  const ORIENTATION = {
    informatique: {
      filieres: ["Informatique", "Génie logiciel", "Réseaux & télécoms"],
      stages: ["Développeur", "Admin système", "Cybersécurité junior"],
      skills: ["Python/Java", "SQL", "Anglais technique"],
    },
    medecine: {
      filieres: ["Médecine", "Sciences infirmières", "Santé publique"],
      stages: ["Hôpital", "ONG", "Recherche clinique"],
      skills: ["Biologie", "Éthique", "Gestion du stress"],
    },
    droit: {
      filieres: ["Droit", "Sciences politiques"],
      stages: ["Cabinet", "Parquet", "ONG droits humains"],
      skills: ["Argumentation", "Droit OHADA", "Rédaction juridique"],
    },
    commerce: {
      filieres: ["Gestion", "Comptabilité", "Marketing"],
      stages: ["Banque", "Audit", "Entrepreneuriat"],
      skills: ["Excel", "Comptabilité", "Communication"],
    },
  };

  async function getOrientation(interests) {
    const data = await api("/platform/orientation", {
      method: "POST",
      body: JSON.stringify({ interests }),
    });
    if (data?.advice) return data.advice;
    const s = getSession();
    const f = (s?.filiere || interests || "").toLowerCase();
    let key = "commerce";
    if (/info|logiciel|réseau|data|cyber/i.test(f)) key = "informatique";
    else if (/médec|santé|infirm|pharm/i.test(f)) key = "medecine";
    else if (/droit|jurid|polit/i.test(f)) key = "droit";
    const pack = ORIENTATION[key];
    const niveau = s?.niveau || "L1";
    const next = { L1: "L2", L2: "L3", L3: "Master", Master: "Doctorat" }[niveau] || "Poursuite d'études";
    const advice = {
      domain: key,
      recommendedFilieres: pack.filieres,
      suggestedInternships: pack.stages,
      skillsToDevelop: pack.skills,
      academicPath: `Parcours ${niveau} → prochaine étape : ${next}.`,
      message: `Conseil IA pour ${s?.filiere || "votre filière"} (${s?.universite || "campus"}).`,
      disclaimer: "Conseil indicatif — validation par le service orientation de l'université requise.",
    };
    write(KEYS.orientation, [{ at: new Date().toISOString(), advice }].concat(read(KEYS.orientation)).slice(0, 20));
    audit("orientation_ia", "orientation", key);
    return advice;
  }

  function seedDemoIfEmpty() {
    if (typeof SAC_API !== "undefined" && SAC_API.isLocalDevHost && !SAC_API.isLocalDevHost()) return;
    const s = getSession();
    if (!s?.universite) return;
    if (read(KEYS.library).length) return;
    const uni = s.universite;
    write(KEYS.library, [
      { id: uid("lib"), universite: uni, title: "Introduction à l'informatique", author: "SAC Éditions", category: "ouvrage", description: "Manuel L1-L2", published: true },
      { id: uid("lib"), universite: uni, title: "Méthodologie de recherche", author: "Collectif universitaire", category: "mémoire", description: "Guide rédaction mémoire", published: true },
    ]);
    write(KEYS.careers, [
      {
        id: uid("job"),
        universite: uni,
        scope: "national",
        type: "stage",
        title: "Stage développeur web",
        organization: "Tech Kinshasa",
        location: "Kinshasa",
        description: "3 mois — React/Node",
        published: true,
      },
    ]);
  }

  return {
    MODULES,
    KEYS,
    modulesForRole,
    canAccess,
    audit,
    getGrades,
    saveGradeLocal,
    getLibrary,
    addLibraryLocal,
    getCareers,
    addCareerLocal,
    getCourses,
    enrollCourse,
    getSocialPosts,
    addSocialLocal,
    toggleLikeLocal,
    getMyDiplomas,
    verifyDiplomaPublic,
    issueDiplomaLocal,
    getOrientation,
    seedDemoIfEmpty,
    read,
    write,
    uid,
  };
})();

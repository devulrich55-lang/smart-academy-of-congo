/** Cours, classes et visibilité étudiants */
const SAC_COURSES = (function () {
  const NIVEAUX = [
    { id: "l1", label: "Licence 1 (L1)" },
    { id: "l2", label: "Licence 2 (L2)" },
    { id: "l3", label: "Licence 3 (L3)" },
    { id: "master1", label: "Master 1" },
    { id: "master2", label: "Master 2" },
    { id: "doctorat", label: "Doctorat" },
  ];

  const MEDIA_TYPES = [
    { id: "info", label: "Information / Annonce", icon: "📢" },
    { id: "document", label: "Document électronique (PDF, DOC…)", icon: "📄" },
    { id: "image", label: "Image", icon: "🖼️" },
    { id: "audio", label: "Audio", icon: "🔊" },
    { id: "video", label: "Vidéo", icon: "🎬" },
  ];

  function norm(s) {
    return (s || "").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  }

  function getUserByEmail(email) {
    const users = JSON.parse(localStorage.getItem("sac_users") || "[]");
    return users.find((u) => u.email === email);
  }

  function getTeachingClasses(session) {
    const fromSession = session?.coursClasses;
    if (Array.isArray(fromSession) && fromSession.length) return fromSession;
    const u = getUserByEmail(session?.identifiant);
    return u?.coursClasses || [];
  }

  function classLabel(c) {
    return `${c.courseCode} — ${c.courseName} (${c.classe || c.niveau})`;
  }

  function studentProfile(session, usersExtra) {
    const u = getUserByEmail(session?.identifiant) || usersExtra;
    return {
      email: session?.identifiant || u?.email,
      universite: u?.universite || session?.universite || "",
      filiere: u?.filiere || "",
      niveau: u?.niveau || "",
      matricule: u?.matricule || "",
    };
  }

  /** L'étudiant voit les contenus de sa classe (même uni, filière, niveau) */
  function studentSeesDocument(student, doc) {
    if (!student || !doc) return false;

    if (doc.source === "administration") {
      if (doc.universite && doc.universite !== student.universite) return false;
      if (doc.audienceType === "section") {
        if (typeof SAC_SECTIONS === "undefined") return false;
        if (doc.sectionId) return SAC_SECTIONS.studentInSection(student, doc.sectionId);
        const sec = SAC_SECTIONS.findSectionForStudent(student);
        if (!sec || !doc.filiere) return false;
        const sf = norm(student.filiere);
        const df = norm(doc.filiere);
        return (
          norm(sec.filiere) === df ||
          sf === df ||
          sf.includes(df) ||
          df.includes(sf)
        );
      }
      return true;
    }

    if (doc.source !== "professeur" && doc.source !== "assistant") return false;
    if (doc.audienceType && doc.audienceType !== "ma_classe") return false;

    if (doc.universite && doc.universite !== student.universite) return false;
    if (doc.niveau && doc.niveau !== student.niveau) return false;

    const sf = norm(student.filiere);
    const df = norm(doc.filiere);
    if (df && sf && !sf.includes(df) && !df.includes(sf)) return false;

    return true;
  }

  function niveauOptionsHtml(selected) {
    return NIVEAUX.map(
      (n) => `<option value="${n.id}" ${n.id === selected ? "selected" : ""}>${n.label}</option>`
    ).join("");
  }

  function mediaOptionsHtml(selected) {
    return MEDIA_TYPES.map(
      (m) => `<option value="${m.id}" ${m.id === selected ? "selected" : ""}>${m.icon} ${m.label}</option>`
    ).join("");
  }

  return {
    NIVEAUX,
    MEDIA_TYPES,
    norm,
    getUserByEmail,
    getTeachingClasses,
    classLabel,
    studentProfile,
    studentSeesDocument,
    niveauOptionsHtml,
    mediaOptionsHtml,
  };
})();

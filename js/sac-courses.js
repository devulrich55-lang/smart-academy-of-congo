/** Cours, classes et visibilité étudiants */
const EVOSU_COURSES = (function () {
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
    const users = JSON.parse(localStorage.getItem("EVOSU_users") || "[]");
    return users.find((u) => u.email === email);
  }

  function getTeachingClasses(session) {
    const fromSession = session?.coursClasses;
    if (Array.isArray(fromSession) && fromSession.length) return fromSession;
    const u = getUserByEmail(session?.identifiant);
    return u?.coursClasses || [];
  }

  function isTeachingRole(role) {
    const r = norm(role);
    return r === "professeur" || r === "assistant" || r === "universite";
  }

  /** Nom affiché du cours — jamais le code seul. */
  function pickCourseTitle(course) {
    const code = String(course?.courseCode || course?.code || "").trim();
    const candidates = [
      course?.courseName,
      course?.intitule,
      course?.nom,
      course?.name,
      course?.libelle,
      course?.title,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const title = candidates.find((candidate) => !code || norm(candidate) !== norm(code));
    if (title) return title;
    if (course?.filiere && course?.classe) {
      return `${course.filiere} — ${course.classe}`;
    }
    if (course?.classe) return `Cours — ${course.classe}`;
    return candidates[0] || "Cours";
  }

  function addFacultyCourse(list, seen, course, professorEmail, professorName, student) {
    if (!course?.courseCode) return;
    const code = String(course.courseCode).trim();
    if (!code || seen.has(code)) return;
    if (course.filiere && student.filiere && !filiereMatch(student.filiere, course.filiere)) return;
    if (course.niveau && student.niveau && !niveauMatch(student.niveau, course.niveau)) return;
    if (course.classe && student.classe && !classeMatch(student.classe, course.classe)) return;
    seen.add(code);
    list.push({
      courseCode: code,
      courseName: pickCourseTitle(course),
      classe: course.classe || course.niveau || student.classe || "",
      filiere: course.filiere || student.filiere || "",
      niveau: course.niveau || student.niveau || "",
      professorEmail: professorEmail || course.professorEmail || "",
      professorName: professorName || course.professorName || "",
    });
  }

  async function getFacultyCoursesForStudent(session) {
    const student = studentProfile(session);
    const courses = [];
    const seen = new Set();

    const users = JSON.parse(localStorage.getItem("EVOSU_users") || "[]");
    users
      .filter((user) => isTeachingRole(user.role))
      .forEach((prof) => {
        if (!universiteMatch(student.universite, prof.universite)) return;
        (prof.coursClasses || []).forEach((course) => {
          addFacultyCourse(
            courses,
            seen,
            { ...course, universite: prof.universite },
            prof.email || prof.identifiant,
            [prof.prenom, prof.nom].filter(Boolean).join(" "),
            student
          );
        });
      });

    if (typeof EVOSU_GRADES !== "undefined") {
      try {
        await EVOSU_GRADES.syncFromServer?.(session);
      } catch {
        /* ignore */
      }
      (EVOSU_GRADES.getForStudent(student) || []).forEach((grade) => {
        addFacultyCourse(
          courses,
          seen,
          {
            courseCode: grade.courseCode || grade.code,
            courseName: grade.courseName || grade.name,
            classe: grade.classe,
            filiere: student.filiere,
            niveau: student.niveau,
          },
          grade.professorEmail,
          grade.professorName,
          student
        );
      });
    }

    if (typeof EVOSU_API !== "undefined" && (await EVOSU_API.ensureOnline())) {
      try {
        const data = await EVOSU_API.platformRequest("/platform/courses/for-student");
        (data?.courses || []).forEach((course) => {
          addFacultyCourse(courses, seen, course, course.professorEmail, course.professorName, student);
        });
      } catch {
        /* endpoint optionnel */
      }
    }

    if (!courses.length) {
      users
        .filter((user) => isTeachingRole(user.role))
        .forEach((prof) => {
          if (!universiteMatch(student.universite, prof.universite)) return;
          (prof.coursClasses || []).forEach((course) => {
            const code = String(course?.courseCode || "").trim();
            if (!code || seen.has(code)) return;
            seen.add(code);
            courses.push({
              courseCode: code,
              courseName: pickCourseTitle(course),
              classe: course.classe || course.niveau || student.classe || "",
              filiere: course.filiere || prof.filiere || student.filiere || "",
              niveau: course.niveau || student.niveau || "",
              professorEmail: prof.email || prof.identifiant || "",
              professorName: [prof.prenom, prof.nom].filter(Boolean).join(" "),
            });
          });
        });
    }

    return courses.sort((a, b) =>
      pickCourseTitle(a).localeCompare(pickCourseTitle(b), "fr")
    );
  }

  function classLabel(c) {
    return `${c.courseCode} — ${c.courseName} (${c.classe || c.niveau})`;
  }

  function norm(s) {
    return (s || "").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  }

  function normUniversite(code) {
    return norm(code);
  }

  function universiteMatch(studentUni, docUni) {
    const a = normUniversite(studentUni);
    const b = normUniversite(docUni);
    if (!a || !b) return true;
    if (a === b) return true;
    if (typeof EVOSU_UNIVERSITIES !== "undefined") {
      const catalog = EVOSU_UNIVERSITIES.UNIVERSITIES || [];
      const find = (code) =>
        catalog.find(
          (u) => normUniversite(u.id) === code || normUniversite(u.sigle) === code
        );
      const ua = find(a);
      const ub = find(b);
      if (ua && ub && ua.id === ub.id) return true;
    }
    return false;
  }

  function normNiveau(n) {
    const x = norm(String(n || ""));
    if (!x) return "";
    if (x === "l1" || x.includes("licence 1") || x.includes("premiere licence") || x.includes("1ere licence")) {
      return "l1";
    }
    if (x === "l2" || x.includes("licence 2") || x.includes("deuxieme licence")) return "l2";
    if (x === "l3" || x.includes("licence 3") || x.includes("troisieme licence")) return "l3";
    if (x.includes("master 1") || x === "master1" || x === "m1") return "master1";
    if (x.includes("master 2") || x === "master2" || x === "m2") return "master2";
    if (x.includes("doctorat") || x === "phd") return "doctorat";
    return x.replace(/\s+/g, "");
  }

  function niveauMatch(studentNiveau, docNiveau) {
    const a = normNiveau(studentNiveau);
    const b = normNiveau(docNiveau);
    if (!a || !b) return true;
    return a === b;
  }

  function filiereMatch(studentFiliere, docFiliere) {
    const sf = norm(studentFiliere);
    const df = norm(docFiliere);
    if (!df) return true;
    if (!sf) return false;
    if (sf === df) return true;
    if (sf.includes(df) || df.includes(sf)) return true;
    const sfTokens = sf.split(/[\s\-—/]+/).filter((t) => t.length > 3);
    const dfTokens = df.split(/[\s\-—/]+/).filter((t) => t.length > 3);
    return sfTokens.some((t) => df.includes(t)) || dfTokens.some((t) => sf.includes(t));
  }

  function classeMatch(studentClasse, docClasse) {
    const sc = norm(studentClasse);
    const dc = norm(docClasse);
    if (!dc) return true;
    if (!sc) return true;
    return sc === dc || sc.includes(dc) || dc.includes(sc);
  }

  function teachingAudience(doc) {
    const audience = norm(doc.audienceType || "ma_classe");
    return !audience || audience === "ma_classe" || audience === "class" || audience === "classe";
  }

  function normalizeTeachingSource(source) {
    const s = norm(source);
    if (s === "professor" || s === "professeur" || s === "prof") return "professeur";
    if (s === "assistant") return "assistant";
    return source || "";
  }

  function studentProfile(session, usersExtra) {
    const u = getUserByEmail(session?.identifiant) || usersExtra;
    const fromApi = session?.authSource === "api";
    const pick = (localVal, sessionVal) =>
      fromApi ? sessionVal || localVal || "" : localVal || sessionVal || "";
    return {
      email: session?.identifiant || u?.email,
      universite: pick(u?.universite, session?.universite),
      filiere: pick(u?.filiere, session?.filiere),
      niveau: pick(u?.niveau, session?.niveau),
      matricule: pick(u?.matricule, session?.matricule),
      sectionId: pick(u?.sectionId, session?.sectionId),
      classe: pick(u?.classe, session?.classe),
    };
  }

  /** L'étudiant voit uniquement les contenus de son niveau, section et classe */
  function studentSeesDocument(student, doc) {
    if (!student || !doc) return false;

    if (doc.source === "administration") {
      if (doc.universite && !universiteMatch(student.universite, doc.universite)) return false;
      if (doc.audienceType === "section") {
        if (typeof EVOSU_SECTIONS === "undefined") return false;
        if (doc.sectionId) {
          return EVOSU_SECTIONS.studentInSection(student, doc.sectionId);
        }
        if (student.sectionId) {
          const sec = EVOSU_SECTIONS.getSectionById(student.sectionId);
          if (sec && doc.filiere) return filiereMatch(sec.filiere, doc.filiere);
        }
        const sec = EVOSU_SECTIONS.findSectionForStudent(student);
        if (!sec || !doc.filiere) return false;
        return filiereMatch(sec.filiere, doc.filiere);
      }
      return true;
    }

    if (doc.source !== "professeur" && doc.source !== "assistant") {
      const src = normalizeTeachingSource(doc.source);
      if (src !== "professeur" && src !== "assistant") return false;
      doc = { ...doc, source: src };
    }
    if (!teachingAudience(doc)) return false;

    if (!universiteMatch(student.universite, doc.universite)) return false;
    if (!niveauMatch(student.niveau, doc.niveau)) return false;
    if (!filiereMatch(student.filiere, doc.filiere)) return false;
    return classeMatch(student.classe, doc.classe);
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
    getFacultyCoursesForStudent,
    pickCourseTitle,
    classLabel,
    studentProfile,
    studentSeesDocument,
    universiteMatch,
    niveauMatch,
    filiereMatch,
    classeMatch,
    niveauOptionsHtml,
    mediaOptionsHtml,
  };
})();

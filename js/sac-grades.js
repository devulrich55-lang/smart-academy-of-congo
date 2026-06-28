/**
 * Cotes étudiants — saisie professeur, consultation étudiant
 */
const SAC_GRADES = (function () {
  const STORAGE_KEY = "sac_grades";
  const CURRENT_SEMESTER = "s1-2025";
  let apiStudentsCache = [];

  const SEMESTERS = [
    { id: "s1-2025", label: "Semestre 1 — 2024-2025" },
    { id: "s2-2024", label: "Semestre 2 — 2023-2024" },
  ];

  function uid() {
    return "gr-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function norm(s) {
    return (s || "").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  }

  function getAll() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      const deduped = dedupeGradesList(raw);
      if (deduped.length !== raw.length) saveAll(deduped);
      return deduped;
    } catch {
      return [];
    }
  }

  function saveAll(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dedupeGradesList(list)));
  }

  function normEmail(email) {
    return (email || "").trim().toLowerCase();
  }

  async function isApiOnline() {
    if (typeof SAC_API === "undefined") return false;
    return SAC_API.ensureOnline();
  }

  function canPushToApi(session) {
    const role = session?.role;
    return role === "professeur" || role === "universite";
  }

  function normCourseCode(code) {
    return String(code || "").trim().toUpperCase();
  }

  function normCourseName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function gradeKey(g) {
    return [
      normEmail(g.studentEmail),
      normCourseCode(g.courseCode),
      normCourseName(g.courseName),
      g.semester || "",
    ].join("|");
  }

  function dedupeGradesList(list) {
    const byKey = new Map();
    (list || []).forEach((g) => {
      const key = gradeKey(g);
      const prev = byKey.get(key);
      const gTime = String(g.updatedAt || g.syncedAt || "");
      const prevTime = String(prev?.updatedAt || prev?.syncedAt || "");
      if (!prev || gTime >= prevTime) {
        byKey.set(key, prev ? normalizeRow(g, prev) : normalizeRow(g));
      }
    });
    return [...byKey.values()];
  }

  function normalizeRow(g, existing) {
    const email = normEmail(g.studentEmail);
    return {
      id: g.id || existing?.id || uid(),
      semester: g.semester || CURRENT_SEMESTER,
      studentEmail: email,
      studentMatricule: g.studentMatricule || existing?.studentMatricule || "",
      studentPrenom: g.studentPrenom || existing?.studentPrenom || "",
      studentNom: g.studentNom || existing?.studentNom || "",
      universite: g.universite || existing?.universite || "",
      filiere: g.filiere || existing?.filiere || "",
      niveau: g.niveau || existing?.niveau || "",
      courseCode: normCourseCode(g.courseCode),
      courseName: String(g.courseName || existing?.courseName || "").trim(),
      classe: g.classe || existing?.classe || "",
      credits: g.credits || existing?.credits || 3,
      cc: g.cc ?? existing?.cc ?? 0,
      exam: g.exam ?? existing?.exam ?? 0,
      avg: g.avg ?? existing?.avg ?? computeAvg(g.cc ?? 0, g.exam ?? 0),
      status: g.status || existing?.status || computeStatus(g.avg ?? 0),
      professorEmail: normEmail(g.professorEmail || existing?.professorEmail || ""),
      professorName:
        g.professorName ||
        existing?.professorName ||
        g.professorEmail ||
        existing?.professorEmail ||
        "—",
      updatedAt: g.updatedAt || new Date().toISOString(),
      syncedAt: g.syncedAt || new Date().toISOString(),
    };
  }

  function mergeIntoCache(incoming) {
    if (!incoming?.length) return getAll();
    const list = getAll();
    const indexByKey = new Map(list.map((g, i) => [gradeKey(g), i]));
    incoming.forEach((raw) => {
      const key = gradeKey(raw);
      const existingIdx = indexByKey.get(key);
      const existing = existingIdx != null ? list[existingIdx] : null;
      const row = normalizeRow(raw, existing);
      if (existingIdx != null) list[existingIdx] = row;
      else {
        list.push(row);
        indexByKey.set(key, list.length - 1);
      }
    });
    saveAll(list);
    return list;
  }

  function migrateLegacyPlatformGrades() {
    try {
      const legacy = JSON.parse(localStorage.getItem("sac_platform_grades") || "[]");
      if (Array.isArray(legacy) && legacy.length) mergeIntoCache(legacy);
    } catch {
      /* ignore */
    }
  }

  async function syncFromServer(session) {
    migrateLegacyPlatformGrades();
    if (!session) return getAll();
    const online = await isApiOnline();
    if (!online || typeof SAC_API === "undefined") return getAll();
    try {
      const data = await SAC_API.platformRequest("/platform/grades/me");
      const grades = data?.grades || [];
      if (Array.isArray(grades)) mergeIntoCache(grades);
    } catch (err) {
      console.warn("[SAC_GRADES] syncFromServer:", err.message || err);
    }
    return getAll();
  }

  async function pushGradeToApi(session, row) {
    if (!canPushToApi(session)) return row;
    if (!(await isApiOnline()) || typeof SAC_API === "undefined") return row;
    try {
      const data = await SAC_API.platformRequest("/platform/grades", {
        method: "POST",
        body: JSON.stringify({
          id: row.id,
          semester: row.semester,
          studentEmail: row.studentEmail,
          studentMatricule: row.studentMatricule,
          universite: row.universite,
          filiere: row.filiere,
          niveau: row.niveau,
          courseCode: row.courseCode,
          courseName: row.courseName,
          classe: row.classe,
          credits: row.credits,
          cc: row.cc,
          exam: row.exam,
        }),
      });
      if (data?.grade) {
        mergeIntoCache([data.grade]);
        return getAll().find((g) => g.id === data.grade.id) || normalizeRow(data.grade, row);
      }
    } catch (err) {
      console.warn("[SAC_GRADES] pushGradeToApi:", err.message || err);
    }
    return row;
  }

  /** Moyenne /20 : CC (/40) × 40% + Examen (/60) × 60% (échelle alignée démo) */
  function computeAvg(cc, exam) {
    const c = Math.max(0, Math.min(40, Number(cc) || 0));
    const e = Math.max(0, Math.min(60, Number(exam) || 0));
    return Math.round((c * 0.4 + e * 0.6 + Number.EPSILON) * 10) / 10;
  }

  function computeStatus(avg) {
    return avg >= 10 ? "Validé" : "Rattrapage";
  }

  function studentMatchesClass(student, courseClass) {
    if (!student || !courseClass) return false;
    if (
      student.universite &&
      courseClass.universite &&
      student.universite !== courseClass.universite
    )
      return false;
    if (courseClass.niveau && student.niveau && courseClass.niveau !== student.niveau)
      return false;
    const sf = norm(student.filiere);
    const cf = norm(courseClass.filiere);
    if (cf && sf && !sf.includes(cf) && !cf.includes(sf)) return false;
    if (courseClass.classe && student.classe) {
      const sc = norm(student.classe);
      const cc = norm(courseClass.classe);
      if (!(sc === cc || sc.includes(cc) || cc.includes(sc))) return false;
    }
    return true;
  }

  function getStudentPool() {
    const local = JSON.parse(localStorage.getItem("sac_users") || "[]").filter(
      (u) => u.role === "etudiant"
    );
    const merged = [...local];
    const seen = new Set(local.map((u) => normEmail(u.email)));
    apiStudentsCache.forEach((u) => {
      const email = normEmail(u.email);
      if (!email || seen.has(email)) return;
      merged.push({ ...u, role: "etudiant" });
      seen.add(email);
    });
    return merged;
  }

  async function loadStudentsFromApi(session) {
    if (!session || session.role !== "professeur") return [];
    if (typeof SAC_API === "undefined" || typeof SAC_API.listProfessorStudents !== "function") {
      return [];
    }
    try {
      const online = await SAC_API.ensureOnline();
      if (!online) return [];
      const list = await SAC_API.listProfessorStudents();
      apiStudentsCache = Array.isArray(list) ? list : [];
      window.dispatchEvent(
        new CustomEvent("sac:students-loaded", { detail: { count: apiStudentsCache.length } })
      );
      return apiStudentsCache;
    } catch (err) {
      console.warn("[SAC_GRADES] loadStudentsFromApi:", err.message || err);
      return [];
    }
  }

  function getStudentsForClass(courseClass) {
    return getStudentPool()
      .filter((u) => u.role === "etudiant" && studentMatchesClass(u, courseClass))
      .map((u) => ({
        email: u.email,
        matricule: u.matricule || "—",
        prenom: u.prenom || "",
        nom: u.nom || "",
        universite: u.universite,
        filiere: u.filiere,
        niveau: u.niveau,
      }))
      .sort((a, b) => (a.nom + a.prenom).localeCompare(b.nom + b.prenom));
  }

  function gradeMatchesCourse(g, courseClass, semester, profEmail) {
    const prof = normEmail(profEmail);
    const code = normCourseCode(courseClass.courseCode);
    const name = normCourseName(courseClass.courseName);
    return (
      normEmail(g.professorEmail) === prof &&
      normCourseCode(g.courseCode) === code &&
      normCourseName(g.courseName) === name &&
      g.semester === semester
    );
  }

  function findGrade(list, studentEmail, courseClass, semester, professorEmail) {
    const email = normEmail(studentEmail);
    const prof = professorEmail ? normEmail(professorEmail) : null;
    return list.find(
      (g) =>
        normEmail(g.studentEmail) === email &&
        gradeMatchesCourse(g, courseClass, semester, prof || g.professorEmail) &&
        (!prof || normEmail(g.professorEmail) === prof)
    );
  }

  function getForStudent(student) {
    const email = normEmail(student.email || student.identifiant);
    return getAll()
      .filter(
        (g) =>
          normEmail(g.studentEmail) === email ||
          (student.matricule && g.studentMatricule === student.matricule)
      )
      .map((g) => ({
        gradeId: g.id,
        semester: g.semester,
        code: g.courseCode,
        course: g.courseName,
        prof: g.professorName || "—",
        credits: g.credits || 3,
        cc: g.cc,
        exam: g.exam,
        avg: g.avg,
        status: g.status,
      }));
  }

  function getForProfessorCourse(profEmail, courseClass, semester) {
    const prof = normEmail(profEmail);
    return getAll().filter((g) => gradeMatchesCourse(g, courseClass, semester, prof));
  }

  async function upsertGrade(session, payload, options) {
    const opts = options || {};
    const cc = Math.max(0, Math.min(40, Number(payload.cc) || 0));
    const exam = Math.max(0, Math.min(60, Number(payload.exam) || 0));
    const avg = computeAvg(cc, exam);
    const list = getAll();
    const profId = normEmail(session.identifiant || session.email);
    const existing = findGrade(
      list,
      payload.studentEmail,
      {
        courseCode: payload.courseCode,
        courseName: payload.courseName,
      },
      payload.semester || CURRENT_SEMESTER,
      profId
    );

    let row = {
      id: existing?.id || uid(),
      semester: payload.semester || CURRENT_SEMESTER,
      studentEmail: normEmail(payload.studentEmail),
      studentMatricule: payload.studentMatricule || "",
      studentPrenom: payload.studentPrenom || "",
      studentNom: payload.studentNom || "",
      universite: payload.universite || session.universite || "",
      filiere: payload.filiere || "",
      niveau: payload.niveau || "",
      courseCode: normCourseCode(payload.courseCode),
      courseName: String(payload.courseName || "").trim(),
      classe: payload.classe || "",
      credits: payload.credits || 3,
      cc,
      exam,
      avg,
      status: computeStatus(avg),
      professorEmail: profId,
      professorName:
        (typeof SAC_IDENTITY !== "undefined"
          ? SAC_IDENTITY.getDisplayName(session)
          : session.displayName || session.nom) || session.identifiant,
      updatedAt: new Date().toISOString(),
    };

    if (existing) {
      const idx = list.findIndex((g) => g.id === existing.id);
      list[idx] = row;
    } else {
      list.push(row);
    }
    saveAll(list);

    if (!opts.skipApi) {
      row = await pushGradeToApi(session, row);
    }

    if (typeof SAC_GRADE_SHEET !== "undefined") {
      SAC_GRADE_SHEET.syncBulletinAfterGrade(row);
    }

    if (!opts.silent) {
      window.dispatchEvent(
        new CustomEvent("sac:grades-updated", { detail: { grade: row } })
      );
    }
    return row;
  }

  function countStudentsForProfessor(session) {
    const classes = SAC_COURSES.getTeachingClasses(session);
    const seen = new Set();
    classes.forEach((c) => {
      getStudentsForClass(c).forEach((s) => seen.add(s.email));
    });
    return seen.size;
  }

  function countGradesForProfessor(profEmail) {
    const prof = normEmail(profEmail);
    return getAll().filter((g) => normEmail(g.professorEmail) === prof).length;
  }

  function getCourseStats(profEmail, courseClass, semester) {
    const students = getStudentsForClass(courseClass);
    const grades = getForProfessorCourse(profEmail, courseClass, semester);
    const withGrades = grades.filter((g) => g.cc > 0 || g.exam > 0);
    const avgClass = withGrades.length
      ? withGrades.reduce((s, g) => s + g.avg, 0) / withGrades.length
      : null;
    return {
      studentCount: students.length,
      gradedCount: withGrades.length,
      classAverage: avgClass,
    };
  }

  function ensureLocalDemoUsers() {
    let users = JSON.parse(localStorage.getItem("sac_users") || "[]");
    const course = {
      courseCode: "ECO101",
      courseName: "Introduction à l'économie",
      filiere: "Sciences économiques — Gestion",
      niveau: "l2",
      classe: "L2 Gestion — Groupe A",
      universite: "unkin",
    };
    if (!users.some((u) => u.email === "etu.demo@unikin.cd")) {
      users.push({
        role: "etudiant",
        email: "etu.demo@unikin.cd",
        prenom: "Marie",
        nom: "Kabongo",
        universite: "unkin",
        filiere: course.filiere,
        niveau: "l2",
        matricule: "ETU-2024-08452",
      });
    }
    if (!users.some((u) => u.email === "prof.demo@unikin.cd")) {
      users.push({
        role: "professeur",
        email: "prof.demo@unikin.cd",
        prenom: "Jean",
        nom: "Dr. Mukendi",
        universite: "unkin",
        departement: "Sciences économiques",
        coursClasses: [course],
      });
    }
    localStorage.setItem("sac_users", JSON.stringify(users));
  }

  async function initDemoGrades() {
    if (getAll().length) return;
    ensureLocalDemoUsers();
    const prof = {
      identifiant: "prof.demo@unikin.cd",
      role: "professeur",
      universite: "unkin",
      nom: "Dr. Mukendi",
    };
    const course = {
      courseCode: "ECO101",
      courseName: "Introduction à l'économie",
      classe: "L2 Gestion — Groupe A",
      filiere: "Sciences économiques — Gestion",
      niveau: "l2",
      universite: "unkin",
      credits: 4,
    };
    const demoStudents = [
      { email: "etu.demo@unikin.cd", matricule: "ETU-2024-08452", prenom: "Marie", nom: "Kabongo", cc: 14, exam: 13 },
    ];
    for (const s of demoStudents) {
      await upsertGrade(
        prof,
        {
          semester: CURRENT_SEMESTER,
          studentEmail: s.email,
          studentMatricule: s.matricule,
          studentPrenom: s.prenom,
          studentNom: s.nom,
          universite: course.universite,
          filiere: course.filiere,
          niveau: course.niveau,
          courseCode: course.courseCode,
          courseName: course.courseName,
          classe: course.classe,
          credits: course.credits,
          cc: s.cc,
          exam: s.exam,
        },
        { skipApi: true, silent: true }
      );
    }
  }

  async function ensureGradesReady(session) {
    migrateLegacyPlatformGrades();
    const online = await isApiOnline();
    if (online && session) {
      await syncFromServer(session);
      return getAll();
    }
    if (!getAll().length && (typeof SAC_API === "undefined" || !SAC_API.isLocalDevHost || SAC_API.isLocalDevHost())) {
      await initDemoGrades();
    }
    return getAll();
  }

  function semesterOptionsHtml(selected) {
    return SEMESTERS.map(
      (s) => `<option value="${s.id}" ${s.id === selected ? "selected" : ""}>${s.label}</option>`
    ).join("");
  }

  function escHtml(s) {
    const d = document.createElement("div");
    d.textContent = s || "";
    return d.innerHTML;
  }

  /** Interface saisie / modification des cotes (dashboard professeur) */
  function initProfessorGrades(session, options) {
    options = options || {};
    const tableBodyId = options.tableBodyId || "profCoursesTable";
    const semesterSelectId = options.semesterSelectId || "profSemesterFilter";
    const modalId = options.modalId || "gradesModal";

    const profSession = { ...session, role: session.role || "professeur" };
    ensureGradesReady(profSession).then(() => renderCoursesTable());

    let currentSemester = SAC_GRADES.CURRENT_SEMESTER;
    let activeCourse = null;

    const semesterSel = document.getElementById(semesterSelectId);
    if (semesterSel) {
      semesterSel.innerHTML = SAC_GRADES.semesterOptionsHtml(currentSemester);
      semesterSel.addEventListener("change", () => {
        currentSemester = semesterSel.value;
        renderCoursesTable();
      });
    }

    function renderCoursesTable() {
      const tbody = document.getElementById(tableBodyId);
      if (!tbody) return;
      const classes = SAC_COURSES.getTeachingClasses(session);
      if (!classes.length) {
        tbody.innerHTML =
          '<tr><td colspan="5" class="grades-empty">Aucun cours déclaré à l\'inscription. Ajoutez vos classes pour saisir les cotes.</td></tr>';
        return;
      }
      tbody.innerHTML = classes
        .map((c, idx) => {
          const stats = SAC_GRADES.getCourseStats(session.identifiant, c, currentSemester);
          const avgTxt =
            stats.classAverage != null ? stats.classAverage.toFixed(1) + " / 20" : "—";
          return `<tr>
            <td><strong>${escHtml(c.courseCode)}</strong></td>
            <td>${escHtml(c.courseName)}</td>
            <td>${stats.studentCount} <small style="color:var(--muted)">(${stats.gradedCount} notés)</small></td>
            <td>${avgTxt}</td>
            <td><button type="button" class="btn btn--role btn--sm btn-edit-grades" data-course-idx="${idx}">Modifier les cotes</button></td>
          </tr>`;
        })
        .join("");

      const classList = classes;
      tbody.querySelectorAll(".btn-edit-grades").forEach((btn) => {
        btn.addEventListener("click", () => {
          const idx = Number(btn.dataset.courseIdx);
          openGradesModal(classList[idx]);
        });
      });
    }

    function openGradesModal(courseClass) {
      activeCourse = courseClass;
      const modal = document.getElementById(modalId);
      if (!modal) return;

      document.getElementById("gradesModalTitle").textContent =
        courseClass.courseCode + " — " + courseClass.courseName;
      document.getElementById("gradesModalSubtitle").textContent =
        (courseClass.classe || courseClass.niveau) +
        " · " +
        (SEMESTERS.find((s) => s.id === currentSemester)?.label || currentSemester);

      const students = SAC_GRADES.getStudentsForClass(courseClass);
      const existing = SAC_GRADES.getForProfessorCourse(
        session.identifiant,
        courseClass,
        currentSemester
      );

      const body = document.getElementById("gradesModalBody");
      if (!students.length) {
        body.innerHTML =
          '<p class="grades-empty">Aucun étudiant inscrit pour cette classe (même université, filière et niveau). Les étudiants doivent s\'inscrire avec les mêmes critères.</p>';
      } else {
        body.innerHTML = `
          <table class="grades-input-table">
            <thead>
              <tr>
                <th>Matricule</th>
                <th>Étudiant</th>
                <th>CC /40</th>
                <th>Examen /60</th>
                <th>Moy. /20</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              ${students
                .map((stu) => {
                  const g = existing.find(
                    (x) => normEmail(x.studentEmail) === normEmail(stu.email)
                  );
                  const cc = g?.cc ?? "";
                  const exam = g?.exam ?? "";
                  const avg =
                    cc !== "" && exam !== ""
                      ? SAC_GRADES.computeAvg(cc, exam)
                      : "—";
                  const st = avg !== "—" ? SAC_GRADES.computeStatus(avg) : "—";
                  return `<tr data-email="${escHtml(stu.email)}">
                    <td>${escHtml(stu.matricule)}</td>
                    <td>${escHtml(typeof SAC_IDENTITY !== "undefined" ? SAC_IDENTITY.formatFullName(stu.prenom, stu.nom) : [stu.prenom, stu.nom].filter(Boolean).join(" "))}</td>
                    <td><input type="number" min="0" max="40" step="0.5" class="inp-cc" value="${cc}" placeholder="0–40" /></td>
                    <td><input type="number" min="0" max="60" step="0.5" class="inp-exam" value="${exam}" placeholder="0–60" /></td>
                    <td><span class="grades-preview-avg">${avg !== "—" ? avg.toFixed(1) : "—"}</span></td>
                    <td><span class="grades-preview-status">${st}</span></td>
                  </tr>`;
                })
                .join("")}
            </tbody>
          </table>`;

        body.querySelectorAll(".inp-cc, .inp-exam").forEach((inp) => {
          inp.addEventListener("input", () => {
            const tr = inp.closest("tr");
            const cc = tr.querySelector(".inp-cc").value;
            const ex = tr.querySelector(".inp-exam").value;
            const avgEl = tr.querySelector(".grades-preview-avg");
            const stEl = tr.querySelector(".grades-preview-status");
            if (cc === "" && ex === "") {
              avgEl.textContent = "—";
              stEl.textContent = "—";
              return;
            }
            const a = SAC_GRADES.computeAvg(cc, ex);
            avgEl.textContent = a.toFixed(1);
            stEl.textContent = SAC_GRADES.computeStatus(a);
          });
        });
      }

      modal.classList.add("open");
      modal.setAttribute("aria-hidden", "false");
    }

    function closeGradesModal() {
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
      }
      activeCourse = null;
      renderCoursesTable();
    }

    document.getElementById("btnSaveGrades")?.addEventListener("click", async () => {
      if (!activeCourse) return;
      const rows = document.querySelectorAll("#gradesModalBody tbody tr[data-email]");
      let saved = 0;
      const btn = document.getElementById("btnSaveGrades");
      if (btn) btn.disabled = true;
      for (const tr of rows) {
        const email = tr.dataset.email;
        const cc = tr.querySelector(".inp-cc").value;
        const exam = tr.querySelector(".inp-exam").value;
        if (cc === "" && exam === "") continue;
        const stu = SAC_GRADES.getStudentsForClass(activeCourse).find((s) => s.email === email);
        if (!stu) continue;
        await SAC_GRADES.upsertGrade(profSession, {
          semester: currentSemester,
          studentEmail: email,
          studentMatricule: stu.matricule,
          studentPrenom: stu.prenom,
          studentNom: stu.nom,
          universite: activeCourse.universite || session.universite,
          filiere: activeCourse.filiere,
          niveau: activeCourse.niveau,
          courseCode: activeCourse.courseCode,
          courseName: activeCourse.courseName,
          classe: activeCourse.classe,
          credits: 3,
          cc,
          exam,
        });
        saved++;
      }
      if (btn) btn.disabled = false;
      alert(
        saved
          ? saved + " cote(s) enregistrée(s) et synchronisée(s) avec le serveur."
          : "Saisissez au moins une note CC ou examen."
      );
      if (saved) closeGradesModal();
    });

    document.getElementById("btnCloseGrades")?.addEventListener("click", closeGradesModal);
    document.getElementById(modalId)?.addEventListener("click", (e) => {
      if (e.target.id === modalId) closeGradesModal();
    });

    renderCoursesTable();
    return {
      refresh: () => ensureGradesReady(profSession).then(() => renderCoursesTable()),
      openCourse: (courseClass) => openGradesModal(courseClass),
      openCourseByIndex: (idx) => {
        const classes = SAC_COURSES.getTeachingClasses(session);
        if (classes[idx]) openGradesModal(classes[idx]);
      },
      getSemester: () => currentSemester,
      setSemester: (id) => {
        if (semesterSel) {
          semesterSel.value = id;
          currentSemester = id;
          renderCoursesTable();
        }
      },
    };
  }

  return {
    STORAGE_KEY,
    CURRENT_SEMESTER,
    SEMESTERS,
    computeAvg,
    computeStatus,
    getAll,
    getForStudent,
    getStudentsForClass,
    loadStudentsFromApi,
    getForProfessorCourse,
    getCourseStats,
    countStudentsForProfessor,
    countGradesForProfessor,
    upsertGrade,
    syncFromServer,
    ensureGradesReady,
    mergeIntoCache,
    studentMatchesClass,
    initDemoGrades,
    semesterOptionsHtml,
    initProfessorGrades,
  };
})();

/**
 * Fiches de cotes & bulletins semestriels — génération automatique après validation IA
 */
const SAC_GRADE_SHEET = (function () {
  const SHEETS_KEY = "sac_grade_sheets";
  const BULLETINS_KEY = "sac_semester_bulletins";
  const SAVED_TRANSCRIPTS_KEY = "sac_saved_transcripts";

  const UNI_NAMES =
    typeof SAC_UNIVERSITIES !== "undefined" ? SAC_UNIVERSITIES.NAMES : { autre: "Autre établissement" };

  const SEMESTER_LABELS = {
    "s1-2025": "Semestre 1 — 2024-2025",
    "s2-2024": "Semestre 2 — 2023-2024",
  };

  /** Emblème officiel RDC — relevé / fiche officiels */
  const RDC_CARTE_SRC = "logo_pro.png";

  function rdcCarteImgHtml() {
    return `<img src="${RDC_CARTE_SRC}" class="releve-header__map" alt="Emblème de la République Démocratique du Congo" width="88" height="100" />`;
  }

  function uid(prefix) {
    return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function readSheets() {
    try {
      return JSON.parse(localStorage.getItem(SHEETS_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function writeSheets(list) {
    localStorage.setItem(SHEETS_KEY, JSON.stringify(list));
  }

  function readBulletins() {
    try {
      return JSON.parse(localStorage.getItem(BULLETINS_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function writeBulletins(list) {
    localStorage.setItem(BULLETINS_KEY, JSON.stringify(list));
  }

  function normCourseCode(code) {
    return String(code || "").trim().toUpperCase();
  }

  function normCourseName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function uniLabel(code) {
    return UNI_NAMES[code] || code || "—";
  }

  function semesterLabel(id) {
    return SEMESTER_LABELS[id] || id || "—";
  }

  function formatDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  function findByGradeId(gradeId) {
    if (!gradeId) return null;
    return readSheets().find((s) => s.gradeId === gradeId && s.type === "fiche") || null;
  }

  function findBySubmission(submissionId) {
    if (!submissionId) return null;
    return readSheets().find((s) => s.submissionId === submissionId) || null;
  }

  function getById(id) {
    return readSheets().find((s) => s.id === id) || readBulletins().find((b) => b.id === id) || null;
  }

  function getSheetsForStudent(email) {
    const e = (email || "").toLowerCase();
    return readSheets()
      .filter((s) => (s.studentEmail || "").toLowerCase() === e)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }

  function getBulletin(studentEmail, semester) {
    const e = (studentEmail || "").toLowerCase();
    return (
      readBulletins().find(
        (b) => (b.studentEmail || "").toLowerCase() === e && b.semester === semester
      ) || null
    );
  }

  function computeSemesterAverage(lines) {
    if (!lines.length) return null;
    const totalCredits = lines.reduce((s, l) => s + (Number(l.credits) || 3), 0);
    if (totalCredits <= 0) {
      return Math.round((lines.reduce((s, l) => s + l.avg, 0) / lines.length) * 100) / 100;
    }
    const weighted =
      lines.reduce((s, l) => s + l.avg * (Number(l.credits) || 3), 0) / totalCredits;
    return Math.round(weighted * 100) / 100;
  }

  function rebuildSemesterBulletin(studentEmail, semester, profile) {
    if (!studentEmail || !semester) return null;
    if (typeof SAC_GRADES === "undefined") return null;

    const grades = SAC_GRADES.getAll().filter(
      (g) =>
        (g.studentEmail || "").toLowerCase() === studentEmail.toLowerCase() &&
        g.semester === semester
    );

    const gradeMap = new Map();
    grades.forEach((g) => {
      const key = [
        normCourseCode(g.courseCode),
        normCourseName(g.courseName),
        (g.professorEmail || "").toLowerCase(),
      ].join("|");
      const prev = gradeMap.get(key);
      if (!prev || String(g.updatedAt || "") > String(prev.updatedAt || "")) {
        gradeMap.set(key, g);
      }
    });

    const lines = [...gradeMap.values()].map((g) => ({
      code: g.courseCode,
      course: g.courseName,
      prof: g.professorName || g.professorEmail || "—",
      cc: g.cc,
      exam: g.exam,
      avg: g.avg,
      status: g.status,
      credits: g.credits || 3,
    }));

    const semesterAverage = computeSemesterAverage(lines);
    const bulletinId = `bul-${semester}-${studentEmail.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

    const bulletin = {
      id: bulletinId,
      type: "bulletin",
      studentEmail: studentEmail.toLowerCase(),
      studentName: profile?.studentName || profile?.fullName || studentEmail,
      studentMatricule: profile?.studentMatricule || profile?.matricule || "—",
      universite: profile?.universite || grades[0]?.universite || "",
      universiteLabel: uniLabel(profile?.universite || grades[0]?.universite),
      filiere: profile?.filiere || grades[0]?.filiere || "—",
      niveau: (profile?.niveau || grades[0]?.niveau || "—").toUpperCase(),
      semester,
      semesterLabel: semesterLabel(semester),
      lines,
      semesterAverage,
      totalCredits: lines.reduce((s, l) => s + (Number(l.credits) || 3), 0),
      courseCount: lines.length,
      generatedAt: new Date().toISOString(),
    };

    const list = readBulletins().filter((b) => b.id !== bulletinId);
    list.unshift(bulletin);
    writeBulletins(list);
    return bulletin;
  }

  function createFromValidation(sub, gradeRow, validator) {
    if (!sub || sub.status !== "valide" || sub.finalGrade == null) return null;

    const existing = findBySubmission(sub.id);
    if (existing) return existing;

    const gradeId = gradeRow?.id || null;
    const sheet = {
      id: uid("fsh"),
      type: "fiche",
      gradeId,
      submissionId: sub.id,
      studentEmail: (sub.studentEmail || "").toLowerCase(),
      studentName: sub.studentName || sub.studentEmail,
      studentMatricule: sub.studentMatricule || "—",
      universite: sub.universite,
      universiteLabel: uniLabel(sub.universite),
      filiere: sub.filiere || "—",
      niveau: (sub.niveau || "—").toUpperCase(),
      classe: sub.classe || "—",
      semester: sub.semester || "s1-2025",
      semesterLabel: semesterLabel(sub.semester || "s1-2025"),
      courseCode: sub.courseCode,
      courseName: sub.courseName,
      assignmentTitle: sub.assignmentTitle || "Travail académique",
      cc: gradeRow?.cc ?? Math.round(sub.finalGrade * 2.5 * 10) / 10,
      exam: gradeRow?.exam ?? 0,
      avg: gradeRow?.avg ?? sub.finalGrade,
      status: gradeRow?.status || (sub.finalGrade >= 10 ? "Validé" : "Rattrapage"),
      finalGrade: sub.finalGrade,
      provisionalGrade: sub.provisionalGrade,
      validatedBy: sub.validatedBy || validator?.email || validator?.identifiant || "—",
      validatedAt: sub.validatedAt || new Date().toISOString(),
      professorEmail: sub.professorEmail || gradeRow?.professorEmail || "—",
      source: "correction_ia",
      createdAt: new Date().toISOString(),
    };

    const list = readSheets();
    list.unshift(sheet);
    writeSheets(list);

    const bulletin = rebuildSemesterBulletin(sheet.studentEmail, sheet.semester, {
      studentName: sheet.studentName,
      studentMatricule: sheet.studentMatricule,
      universite: sheet.universite,
      filiere: sheet.filiere,
      niveau: sheet.niveau,
    });

    window.dispatchEvent(
      new CustomEvent("sac:grade-sheet-created", { detail: { sheet, bulletin } })
    );
    window.dispatchEvent(
      new CustomEvent("sac:bulletin-updated", { detail: { bulletin, grade: gradeRow } })
    );

    return sheet;
  }

  function studentProfileFromGrade(row) {
    const users =
      typeof SAC_IDENTITY !== "undefined" ? SAC_IDENTITY.getLocalUsers() : [];
    const u = users.find(
      (x) => (x.email || "").toLowerCase() === (row.studentEmail || "").toLowerCase()
    );
    const name =
      row.studentPrenom || row.studentNom
        ? typeof SAC_IDENTITY !== "undefined"
          ? SAC_IDENTITY.formatFullName(row.studentPrenom, row.studentNom)
          : [row.studentPrenom, row.studentNom].filter(Boolean).join(" ")
        : u && typeof SAC_IDENTITY !== "undefined"
          ? SAC_IDENTITY.formatFullName(u.prenom, u.nom)
          : row.studentEmail;
    return {
      studentName: name,
      fullName: name,
      studentMatricule: row.studentMatricule || u?.matricule || "—",
      matricule: row.studentMatricule || u?.matricule,
      universite: row.universite || u?.universite,
      filiere: row.filiere || u?.filiere || "—",
      niveau: row.niveau || u?.niveau || "—",
    };
  }

  function syncBulletinAfterGrade(gradeRow) {
    if (!gradeRow?.studentEmail || !gradeRow?.semester) return null;
    const bulletin = rebuildSemesterBulletin(
      gradeRow.studentEmail,
      gradeRow.semester,
      studentProfileFromGrade(gradeRow)
    );
    if (bulletin) {
      window.dispatchEvent(
        new CustomEvent("sac:bulletin-updated", { detail: { bulletin, grade: gradeRow } })
      );
    }
    return bulletin;
  }

  function listStudentsForBulletins(actor, semester) {
    if (typeof SAC_GRADES === "undefined") return [];
    const uni = actor.universite;
    const profEmail = (actor.email || actor.identifiant || "").toLowerCase();
    const isAssistant = actor.role === "assistant";

    const grades = SAC_GRADES.getAll().filter((g) => {
      if (g.semester !== semester) return false;
      if (uni && g.universite && g.universite !== uni) return false;
      if (!isAssistant && actor.role === "professeur") {
        return (g.professorEmail || "").toLowerCase() === profEmail;
      }
      return true;
    });

    const byStudent = new Map();
    grades.forEach((g) => {
      const email = (g.studentEmail || "").toLowerCase();
      if (!email) return;
      if (!byStudent.has(email)) {
        byStudent.set(email, { email, grades: [], profile: studentProfileFromGrade(g) });
      }
      byStudent.get(email).grades.push(g);
    });

    return [...byStudent.values()]
      .map((entry) => {
        const bulletin = rebuildSemesterBulletin(entry.email, semester, entry.profile);
        return {
          email: entry.email,
          name: entry.profile.studentName,
          matricule: entry.profile.studentMatricule,
          courseCount: entry.grades.length,
          semesterAverage: bulletin?.semesterAverage,
          bulletinId: bulletin?.id,
          generatedAt: bulletin?.generatedAt,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }

  function mountAdminBulletinsUI(container, actor, getSemester) {
    if (!container) return null;

    container.innerHTML = `
      <p class="page-desc" style="margin:0 0 1rem;font-size:0.88rem;">
        Téléchargez le relevé de notes de chaque étudiant. Il se met à jour automatiquement à chaque nouvelle cote.
      </p>
      <div class="grades-toolbar" style="margin-bottom:1rem;">
        <label for="adminBulletinSemester">Semestre</label>
        <select id="adminBulletinSemester" class="fi" style="width:auto;max-width:280px;"></select>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Étudiant</th>
              <th>Matricule</th>
              <th>Cours</th>
              <th>Moyenne</th>
              <th>Mis à jour</th>
              <th>Relevé</th>
            </tr>
          </thead>
          <tbody id="adminBulletinsTable">
            <tr><td colspan="6" class="pub-empty">Chargement…</td></tr>
          </tbody>
        </table>
      </div>`;

    const semSel = container.querySelector("#adminBulletinSemester");
    if (semSel && typeof SAC_GRADES !== "undefined") {
      semSel.innerHTML = SAC_GRADES.semesterOptionsHtml(getSemester?.() || "s1-2025");
    }

    function renderTable() {
      const semester = semSel?.value || getSemester?.() || "s1-2025";
      const tbody = container.querySelector("#adminBulletinsTable");
      const rows = listStudentsForBulletins(actor, semester);
      if (!rows.length) {
        tbody.innerHTML =
          '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:1.25rem;">Aucune cote pour ce semestre.</td></tr>';
        return;
      }
      tbody.innerHTML = rows
        .map(
          (r) => `<tr>
            <td>${esc(r.name)}</td>
            <td>${esc(r.matricule)}</td>
            <td>${esc(r.courseCount)}</td>
            <td>${r.semesterAverage != null ? esc(r.semesterAverage) + " / 20" : "—"}</td>
            <td>${esc(formatDate(r.generatedAt))}</td>
            <td>
              <button type="button" class="btn-fiche btn-dl-bulletin" data-email="${esc(r.email)}" data-semester="${esc(semester)}">📋 Télécharger</button>
            </td>
          </tr>`
        )
        .join("");
      tbody.querySelectorAll(".btn-dl-bulletin").forEach((btn) => {
        btn.addEventListener("click", async () => {
          await openBulletinPrint(btn.dataset.email, btn.dataset.semester, actor);
        });
      });
    }

    semSel?.addEventListener("change", renderTable);
    if (typeof SAC_GRADES !== "undefined" && SAC_GRADES.syncFromServer) {
      SAC_GRADES.syncFromServer(actor).then(renderTable);
    } else {
      renderTable();
    }

    window.addEventListener("sac:bulletin-updated", renderTable);
    window.addEventListener("sac:grades-updated", renderTable);

    return { refresh: renderTable };
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const UNI_CITIES = {
    unikin: "KINSHASA",
    ulk: "KINSHASA",
    upn: "KINSHASA",
    ucc: "KINSHASA",
    usk: "KINSHASA",
    uccm: "KINSHASA",
    istap: "KINSHASA",
    isck: "KINSHASA",
    istmed: "KINSHASA",
    istmmayi: "MBUJI-MAYI",
    inarts: "KINSHASA",
    aba: "KINSHASA",
    unilu: "LUBUMBASHI",
    unikis: "KISANGANI",
    unigom: "GOMA",
    unibuk: "BUKAVU",
    uom: "MBUJI-MAYI",
    unikan: "KANANGA",
  };

  const NIVEAU_LABELS = {
    l1: "Première licence",
    l2: "Deuxième licence",
    l3: "Troisième licence",
    master1: "Master 1",
    master2: "Master 2",
    doctorat: "Doctorat",
  };

  const ACADEMIC_YEARS = {
    "s1-2025": "2024 — 2025",
    "s2-2024": "2023 — 2024",
  };

  function formatNiveauLabel(niveau) {
    const key = (niveau || "").toLowerCase();
    return NIVEAU_LABELS[key] || niveau || "—";
  }

  function academicYearLabel(semester) {
    return ACADEMIC_YEARS[semester] || semesterLabel(semester).replace("Semestre 1 — ", "").replace("Semestre 2 — ", "") || "—";
  }

  function formatFiliereOption(filiere) {
    if (!filiere || filiere === "—") return "—";
    const clean = String(filiere).replace(/[-_]/g, " ");
    return "LMD " + clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  function getInstitutionHeader(universiteId) {
    const u =
      typeof SAC_UNIVERSITIES !== "undefined" ? SAC_UNIVERSITIES.getById(universiteId) : null;
    const name = (u?.name || universiteId || "Établissement partenaire").toUpperCase();
    const sigle = (u?.sigle || "").toUpperCase();
    const city = (UNI_CITIES[universiteId] || "KINSHASA").toUpperCase();
    return { name, sigle, city, cityTitle: city.charAt(0) + city.slice(1).toLowerCase() };
  }

  function formatDecision(status, avg) {
    if (status === "Validé" || (avg != null && Number(avg) >= 10)) return "V";
    return "NV";
  }

  function formatLongDate(iso) {
    if (!iso) {
      return new Date().toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
    try {
      return new Date(iso).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  }

  async function ensureHeaderLogo(universiteId) {
    if (
      !universiteId ||
      typeof SAC_UNIVERSITY_LOGO === "undefined"
    ) {
      return null;
    }
    if (typeof SAC_UNIVERSITY_LOGO.ensureLogoForUniversite === "function") {
      return SAC_UNIVERSITY_LOGO.ensureLogoForUniversite(universiteId);
    }
    if (typeof SAC_UNIVERSITY_LOGO.ensureCampusLogo === "function") {
      return SAC_UNIVERSITY_LOGO.ensureCampusLogo(universiteId);
    }
    return null;
  }

  function renderOfficialHeaderHtml(universiteId) {
    const inst = getInstitutionHeader(universiteId);
    const sigleLine = inst.sigle
      ? `${inst.sigle} — CONGO - ${inst.city}`
      : `CONGO - ${inst.city}`;
    const logoLeft =
      typeof SAC_UNIVERSITY_LOGO !== "undefined"
        ? SAC_UNIVERSITY_LOGO.buildHeaderLogoHtml(universiteId, esc)
        : "";
    return `<header class="releve-header">
      <div class="releve-header__side releve-header__side--left">${logoLeft}</div>
      <div class="releve-header__center">
        <p>RÉPUBLIQUE DÉMOCRATIQUE DU CONGO</p>
        <p>MINISTÈRE DE L'ENSEIGNEMENT SUPÉRIEUR ET UNIVERSITAIRE</p>
        <p class="releve-header__institution">${esc(inst.name)}</p>
        <p class="releve-header__sigle">${esc(sigleLine)}</p>
      </div>
      <div class="releve-header__side releve-header__side--right">
        ${rdcCarteImgHtml()}
      </div>
    </header>`;
  }

  function buildCourseEcRows(line) {
    const credits = Number(line.credits) || 3;
    const cc = Number(line.cc) || 0;
    const exam = Number(line.exam) || 0;
    const avg = line.avg;
    const decision = formatDecision(line.status, avg);

    if (cc > 0 && exam > 0) {
      const cr1 = Math.max(1, Math.round(credits * 0.4));
      const cr2 = Math.max(1, credits - cr1);
      const ccOn20 = (Math.round((cc / 2) * 10) / 10).toFixed(1);
      const examOn20 = (Math.round((exam / 3) * 10) / 10).toFixed(1);
      return [
        {
          name: line.course,
          ec: "EC-1 (CC)",
          ecCredit: cr1,
          note: ccOn20,
          decision: null,
        },
        {
          name: line.course,
          ec: "EC-2 (Ex.)",
          ecCredit: cr2,
          note: examOn20,
          decision,
        },
      ];
    }

    const note = avg != null ? Number(avg).toFixed(1) : "—";
    return [
      {
        name: line.course,
        ec: "EC",
        ecCredit: credits,
        note,
        decision,
      },
    ];
  }

  function renderReleveTableRowsHtml(lines) {
    if (!lines?.length) {
      return '<tr><td colspan="7" style="text-align:center;">Aucune cote enregistrée</td></tr>';
    }

    return lines
      .map((line) => {
        const ecRows = buildCourseEcRows(line);
        const rowspan = ecRows.length;
        const code = esc(line.code);
        const credit = esc(line.credits || 3);
        const decisionCell = esc(ecRows[0].decision);

        return ecRows
          .map((ec, idx) => {
            const codeCell =
              idx === 0 ? `<td rowspan="${rowspan}">${code}</td>` : "";
            const creditCell =
              idx === 0 ? `<td rowspan="${rowspan}">${credit}</td>` : "";
            const decisionTd =
              idx === 0
                ? `<td rowspan="${rowspan}">${decisionCell}</td>`
                : "";
            return `<tr>
              ${codeCell}
              ${creditCell}
              <td>${esc(ec.name)}</td>
              <td>${esc(ec.ec)}</td>
              <td>${esc(ec.ecCredit)}</td>
              <td>${esc(ec.note)}</td>
              ${decisionTd}
            </tr>`;
          })
          .join("");
      })
      .join("");
  }

  function renderFicheHtml(sheet) {
    if (!sheet) return "";
    const inst = getInstitutionHeader(sheet.universite);
    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Fiche de cote — ${esc(sheet.studentName)} — ${esc(sheet.courseCode)}</title>
  <link rel="stylesheet" href="css/grade-sheet.css" />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet" />
</head>
<body class="grade-sheet-page">
  <div class="grade-sheet grade-sheet--official">
    ${renderOfficialHeaderHtml(sheet.universite)}
    <h1 class="releve-title">FICHE DE COTE</h1>
    <p class="releve-subtitle">${esc(sheet.semesterLabel)}</p>
    <div class="releve-student">
      <div class="releve-student__col">
        <p><span>Nom & Post-Nom :</span> ${esc(sheet.studentName)}</p>
        <p><span>Section :</span> ${esc(sheet.filiere)}</p>
      </div>
      <div class="releve-student__col">
        <p><span>Niveau :</span> ${esc(formatNiveauLabel(sheet.niveau))}</p>
        <p><span>Matricule :</span> ${esc(sheet.studentMatricule)}</p>
      </div>
    </div>
    <table class="releve-table">
      <thead>
        <tr>
          <th>CODE</th>
          <th>CREDIT</th>
          <th colspan="3">ELEMENTS CONSTITUTIFS</th>
          <th>NOTE</th>
          <th>DECISION</th>
        </tr>
      </thead>
      <tbody>
        ${renderReleveTableRowsHtml([
          {
            code: sheet.courseCode,
            course: sheet.courseName,
            credits: 3,
            cc: sheet.cc,
            exam: sheet.exam,
            avg: sheet.avg,
            status: sheet.status,
          },
        ])}
      </tbody>
    </table>
    <section class="grade-sheet__block">
      <h2>Détail de l'évaluation</h2>
      <dl class="grade-sheet__grid">
        <dt>CC /40</dt><dd>${esc(sheet.cc)}</dd>
        <dt>Examen /60</dt><dd>${esc(sheet.exam)}</dd>
        <dt>Note travail /20</dt><dd>${esc(sheet.finalGrade)}</dd>
        <dt>Validé par</dt><dd>${esc(sheet.validatedBy)} · ${formatDate(sheet.validatedAt)}</dd>
      </dl>
    </section>
    <div class="releve-signature">
      <p>Fait à ${esc(inst.cityTitle)}, le ${esc(formatLongDate(sheet.validatedAt))}</p>
      <p class="releve-signature__role">Secrétaire du jury</p>
    </div>
    <p class="releve-footer-note">Document numérique — Smart Academy of Congo · Réf. ${esc(sheet.id)}</p>
    <div class="grade-sheet__actions no-print" data-sac-transcript-actions="fiche">
      <button type="button" data-sac-action="download">⬇ Télécharger la fiche</button>
      <button type="button" data-sac-action="print">🖨 Imprimer</button>
      <button type="button" data-sac-action="close">Fermer</button>
    </div>
  </div>
</body>
</html>`;
  }

  function renderBulletinHtml(bulletin) {
    if (!bulletin) return "";
    const inst = getInstitutionHeader(bulletin.universite);
    const rows = renderReleveTableRowsHtml(bulletin.lines || []);

    const totalDecision =
      bulletin.semesterAverage != null && bulletin.semesterAverage >= 10 ? "V" : "NV";

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Relevé de notes — ${esc(bulletin.studentName)} — ${esc(bulletin.semesterLabel)}</title>
  <link rel="stylesheet" href="css/grade-sheet.css" />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet" />
</head>
<body class="grade-sheet-page">
  <div class="grade-sheet grade-sheet--official">
    ${renderOfficialHeaderHtml(bulletin.universite)}
    <h1 class="releve-title">RELEVE DE NOTES</h1>
    <p class="releve-subtitle">Année académique ${esc(academicYearLabel(bulletin.semester))}</p>
    <div class="releve-student">
      <div class="releve-student__col">
        <p><span>Nom & Post-Nom :</span> ${esc(bulletin.studentName)}</p>
        <p><span>Section :</span> ${esc(bulletin.filiere)}</p>
      </div>
      <div class="releve-student__col">
        <p><span>Niveau :</span> ${esc(formatNiveauLabel(bulletin.niveau))}</p>
        <p><span>Option :</span> ${esc(formatFiliereOption(bulletin.filiere))}</p>
      </div>
    </div>
    <table class="releve-table">
      <thead>
        <tr>
          <th>CODE</th>
          <th>CREDIT</th>
          <th colspan="3">ELEMENTS CONSTITUTIFS</th>
          <th>NOTE</th>
          <th>DECISION</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="releve-table__total">
          <td>CREDIT TOTAL</td>
          <td>${esc(bulletin.totalCredits)}</td>
          <td colspan="3"></td>
          <td>${bulletin.semesterAverage != null ? esc(Number(bulletin.semesterAverage).toFixed(1)) : "—"}</td>
          <td>${esc(totalDecision)}</td>
        </tr>
      </tbody>
    </table>
    <div class="releve-signature">
      <p>Fait à ${esc(inst.cityTitle)}, le ${esc(formatLongDate(bulletin.generatedAt))}</p>
      <p class="releve-signature__role">Secrétaire du jury</p>
    </div>
    <p class="releve-footer-note">Document numérique — Smart Academy of Congo · Réf. ${esc(bulletin.id)} · ${esc(bulletin.totalCredits)} crédits</p>
    <div class="grade-sheet__actions no-print" data-sac-transcript-actions="bulletin">
      <button type="button" data-sac-action="download">⬇ Télécharger le relevé</button>
      <button type="button" data-sac-action="print">🖨 Imprimer</button>
      <button type="button" data-sac-action="close">Fermer</button>
    </div>
  </div>
</body>
</html>`;
  }

  function normEmail(email) {
    return (email || "").trim().toLowerCase();
  }

  function getActorEmail(actor) {
    return normEmail(actor?.email || actor?.identifiant);
  }

  function canAccessStudentGrades(actor, studentEmail) {
    if (!actor || !studentEmail) return false;
    const target = normEmail(studentEmail);
    const actorEmail = getActorEmail(actor);
    const role = actor.role;

    if (role === "etudiant") return target === actorEmail;

    if (typeof SAC_GRADES === "undefined") return false;

    const grades = SAC_GRADES.getAll().filter((g) => normEmail(g.studentEmail) === target);
    if (!grades.length) return false;

    const campus = actor.universite;
    if (campus && grades.some((g) => g.universite && g.universite !== campus)) {
      return false;
    }

    if (role === "professeur") {
      return grades.some((g) => normEmail(g.professorEmail) === actorEmail);
    }

    if (role === "assistant" || role === "universite" || role === "section") {
      return true;
    }

    return false;
  }

  function canAccessFiche(actor, sheet) {
    if (!sheet || sheet.type !== "fiche") return false;
    return canAccessStudentGrades(actor, sheet.studentEmail);
  }

  async function assertTranscriptAccess(actor, studentEmail, semester) {
    if (!actor) return false;
    if (!canAccessStudentGrades(actor, studentEmail)) return false;

    const sem = semester || "s1-2025";

    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
      try {
        await SAC_API.platformRequest(
          `/platform/grades/transcript?studentEmail=${encodeURIComponent(studentEmail)}&semester=${encodeURIComponent(sem)}`
        );
        return true;
      } catch {
        return false;
      }
    }

    if (typeof SAC_SESSION !== "undefined" && !SAC_SESSION.allowLocalAuth()) {
      return actor.authSource === "api" || !!(actor.userId && actor.userId !== actor.identifiant);
    }

    return true;
  }

  async function prepareTranscriptData(actor, studentEmail, semester) {
    const email = normEmail(studentEmail);
    let profile = {};

    if (typeof SAC_GRADES !== "undefined" && actor) {
      await SAC_GRADES.syncFromServer(actor);
    }

    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
      try {
        const data = await SAC_API.platformRequest(
          `/platform/grades/transcript?studentEmail=${encodeURIComponent(email)}&semester=${encodeURIComponent(semester)}`
        );
        if (data?.grades?.length && typeof SAC_GRADES !== "undefined") {
          SAC_GRADES.mergeIntoCache(data.grades);
        }
        if (data) {
          profile = {
            studentMatricule: data.studentMatricule,
            universite: data.universite,
            filiere: data.filiere,
            niveau: data.niveau,
          };
        }
      } catch (err) {
        if (typeof SAC_SESSION !== "undefined" && !SAC_SESSION.allowLocalAuth()) {
          return null;
        }
      }
    }

    if (typeof SAC_IDENTITY !== "undefined") {
      const u = SAC_IDENTITY.getLocalUsers().find(
        (x) => normEmail(x.email) === email
      );
      if (u) {
        profile = {
          studentName:
            typeof SAC_IDENTITY.formatFullName === "function"
              ? SAC_IDENTITY.formatFullName(u.prenom, u.nom)
              : [u.prenom, u.nom].filter(Boolean).join(" "),
          studentMatricule: u.matricule || profile.studentMatricule,
          universite: u.universite || profile.universite,
          filiere: u.filiere || profile.filiere,
          niveau: u.niveau || profile.niveau,
        };
      }
    }

    let bulletin = getBulletin(email, semester);
    if (!bulletin && typeof SAC_GRADES !== "undefined") {
      bulletin = rebuildSemesterBulletin(email, semester, profile);
    } else if (bulletin && profile.universite && !bulletin.universite) {
      bulletin.universite = profile.universite;
      bulletin.universiteLabel = uniLabel(profile.universite);
    } else if (typeof SAC_GRADES !== "undefined") {
      bulletin = rebuildSemesterBulletin(email, semester, profile) || bulletin;
    }

    if (bulletin?.universite && typeof SAC_UNIVERSITY_LOGO !== "undefined") {
      if (typeof SAC_UNIVERSITY_LOGO.ensureLogoForUniversite === "function") {
        await SAC_UNIVERSITY_LOGO.ensureLogoForUniversite(bulletin.universite);
      } else if (typeof SAC_UNIVERSITY_LOGO.ensureCampusLogo === "function") {
        await SAC_UNIVERSITY_LOGO.ensureCampusLogo(bulletin.universite);
      }
    }

    return bulletin;
  }

  function renderAccessDenied(root, message, loginRole) {
    const role = loginRole || "etudiant";
    const loginHref =
      typeof SAC_SESSION !== "undefined"
        ? SAC_SESSION.loginUrl(role)
        : `connexion.html?role=${encodeURIComponent(role)}`;
    root.innerHTML = `<div style="text-align:center;padding:2.5rem 1.5rem;max-width:420px;margin:2rem auto;">
      <p style="margin:0 0 1rem;color:#5a6d7e;">${esc(message || "Accès refusé.")}</p>
      <a href="${esc(loginHref)}" class="btn btn--role" style="display:inline-block;padding:0.55rem 1.1rem;background:#003366;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Se connecter</a>
    </div>`;
  }

  async function mountProtectedBulletinPage(root, studentEmail, semester) {
    if (!root) return;
    root.innerHTML = '<p style="text-align:center;padding:2rem;">Vérification de l\'accès…</p>';

    let session = null;
    if (typeof SAC_SESSION !== "undefined") {
      session = await SAC_SESSION.verifySession();
    }
    if (!session) {
      renderAccessDenied(root, "Connectez-vous pour consulter ce relevé de notes.", "etudiant");
      return;
    }

    const ok = await assertTranscriptAccess(session, studentEmail);
    if (!ok) {
      renderAccessDenied(
        root,
        "Vous n'êtes pas autorisé à consulter ce relevé de notes.",
        session.role || "etudiant"
      );
      return;
    }

    const bulletin = await prepareTranscriptData(session, studentEmail, semester);
    if (!bulletin || !bulletin.lines?.length) {
      root.innerHTML =
        '<p style="text-align:center;padding:2rem;">Aucune cote publiée pour ce semestre.</p>';
      return;
    }

    await ensureHeaderLogo(bulletin.universite);

    document.title = "Relevé de notes — " + bulletin.semesterLabel;
    const fullHtml = renderBulletinHtml(bulletin);
    root.innerHTML = new DOMParser().parseFromString(fullHtml, "text/html").querySelector(
      ".grade-sheet"
    ).outerHTML;

    wireTranscriptActions(root, fullHtml, {
      id: bulletin.id,
      kind: "bulletin",
      studentEmail: bulletin.studentEmail,
      semester: bulletin.semester,
      studentName: bulletin.studentName,
      title: buildTranscriptFilename(bulletin, "bulletin"),
    });
  }

  async function mountProtectedFichePage(root, sheetId) {
    if (!root) return;
    root.innerHTML = '<p style="text-align:center;padding:2rem;">Vérification de l\'accès…</p>';

    let session = null;
    if (typeof SAC_SESSION !== "undefined") {
      session = await SAC_SESSION.verifySession();
    }
    if (!session) {
      renderAccessDenied(root, "Connectez-vous pour consulter cette fiche de cote.", "etudiant");
      return;
    }

    const sheet = sheetId ? getById(sheetId) : null;
    if (!sheet || sheet.type !== "fiche") {
      root.innerHTML =
        '<p style="text-align:center;padding:2rem;">Fiche introuvable ou expirée.</p>';
      return;
    }

    const ok = await assertTranscriptAccess(session, sheet.studentEmail);
    if (!ok || !canAccessFiche(session, sheet)) {
      renderAccessDenied(
        root,
        "Vous n'êtes pas autorisé à consulter cette fiche de cote.",
        session.role || "etudiant"
      );
      return;
    }

    await ensureHeaderLogo(sheet.universite);

    document.title = "Fiche de cote — " + sheet.courseCode;
    const fullHtml = renderFicheHtml(sheet);
    root.innerHTML = new DOMParser().parseFromString(fullHtml, "text/html").querySelector(
      ".grade-sheet"
    ).outerHTML;

    wireTranscriptActions(root, fullHtml, {
      id: sheet.id,
      kind: "fiche",
      studentEmail: sheet.studentEmail,
      semester: sheet.semester,
      studentName: sheet.studentName,
      courseCode: sheet.courseCode,
      title: buildTranscriptFilename(sheet, "fiche"),
    });
  }

  function buildTranscriptFilename(doc, kind) {
    const name = String(doc.studentName || "etudiant")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "_");
    if (kind === "fiche") {
      return `Fiche_cote_${name}_${normCourseCode(doc.courseCode) || "cours"}.html`;
    }
    return `Releve_notes_${name}_${doc.semester || "semestre"}.html`;
  }

  function saveTranscriptToLocalStorage(meta, html) {
    try {
      const list = JSON.parse(localStorage.getItem(SAVED_TRANSCRIPTS_KEY) || "[]");
      const entry = {
        id: meta.id,
        kind: meta.kind || "bulletin",
        studentEmail: meta.studentEmail || "",
        semester: meta.semester || "",
        title: meta.title,
        savedAt: new Date().toISOString(),
        html,
      };
      const next = [entry, ...list.filter((x) => x.id !== entry.id)].slice(0, 30);
      localStorage.setItem(SAVED_TRANSCRIPTS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function downloadTranscriptHtml(fullHtml, meta) {
    const filename = meta.title || buildTranscriptFilename(meta, meta.kind);
    const blob = new Blob([fullHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    saveTranscriptToLocalStorage(meta, fullHtml);
  }

  function wireTranscriptActions(scopeEl, fullHtml, meta) {
    if (!scopeEl) return;
    scopeEl.querySelectorAll("[data-sac-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.getAttribute("data-sac-action");
        if (action === "download") downloadTranscriptHtml(fullHtml, meta);
        else if (action === "print") window.print();
        else if (action === "close") window.close();
      });
    });
  }

  function openPrintWindow(html, title, meta) {
    const w = window.open("", "_blank", "width=900,height=720");
    if (!w) {
      alert("Autorisez les pop-ups pour ouvrir le relevé.");
      return null;
    }
    const base = window.location.href.replace(/[^/]*$/, "");
    const withBase = html.replace("<head>", `<head><base href="${base}" />`);
    w.document.open();
    w.document.write(withBase);
    w.document.close();
    w.document.title = title || "Relevé de notes";
    if (meta) {
      w.addEventListener("load", () => {
        wireTranscriptActions(w.document.body, withBase, meta);
      });
    }
    return w;
  }

  async function openFiche(sheetId, actor) {
    const sheet = readSheets().find((s) => s.id === sheetId);
    if (!sheet) {
      alert("Fiche introuvable.");
      return null;
    }
    actor =
      actor ||
      (typeof SAC_SESSION !== "undefined" ? SAC_SESSION.getSession() : null);
    if (!(await assertTranscriptAccess(actor, sheet.studentEmail)) || !canAccessFiche(actor, sheet)) {
      alert("Accès refusé. Connectez-vous avec un compte autorisé.");
      return null;
    }
    await ensureHeaderLogo(sheet.universite);
    const meta = {
      id: sheet.id,
      kind: "fiche",
      studentEmail: sheet.studentEmail,
      semester: sheet.semester,
      studentName: sheet.studentName,
      courseCode: sheet.courseCode,
      title: buildTranscriptFilename(sheet, "fiche"),
    };
    return openPrintWindow(renderFicheHtml(sheet), `Fiche — ${sheet.courseCode}`, meta);
  }

  async function openBulletinPrint(studentEmail, semester, actor) {
    actor =
      actor ||
      (typeof SAC_SESSION !== "undefined" ? SAC_SESSION.getSession() : null);
    if (!(await assertTranscriptAccess(actor, studentEmail))) {
      alert("Accès refusé. Connectez-vous avec un compte autorisé.");
      return null;
    }
    const bulletin = await prepareTranscriptData(actor, studentEmail, semester);
    if (!bulletin) {
      alert("Relevé indisponible pour ce semestre.");
      return null;
    }
    await ensureHeaderLogo(bulletin.universite);
    const meta = {
      id: bulletin.id,
      kind: "bulletin",
      studentEmail: bulletin.studentEmail,
      semester: bulletin.semester,
      studentName: bulletin.studentName,
      title: buildTranscriptFilename(bulletin, "bulletin"),
    };
    return openPrintWindow(renderBulletinHtml(bulletin), `Relevé — ${semester}`, meta);
  }

  return {
    createFromValidation,
    rebuildSemesterBulletin,
    syncBulletinAfterGrade,
    listStudentsForBulletins,
    mountAdminBulletinsUI,
    findByGradeId,
    findBySubmission,
    getById,
    getSheetsForStudent,
    getBulletin,
    openFiche,
    openBulletinPrint,
    canAccessStudentGrades,
    canAccessFiche,
    assertTranscriptAccess,
    mountProtectedBulletinPage,
    mountProtectedFichePage,
    prepareTranscriptData,
    renderFicheHtml,
    renderBulletinHtml,
    downloadTranscriptHtml,
    saveTranscriptToLocalStorage,
    formatDate,
    semesterLabel,
  };
})();

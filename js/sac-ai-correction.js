/**
 * Agent IA SAC — correction automatisée des travaux
 * Flux : dépôt → IA → note provisoire → validation professeur → note finale
 */
const SAC_AI_CORRECTION = (function () {
  const STORAGE_KEY = "sac_ai_submissions";
  const REF_STORAGE_KEY = "sac_ai_references";

  const STATUS_LABELS = {
    depose: "Déposé",
    correction_ia: "Correction IA en cours",
    note_provisoire: "Note provisoire — en attente prof",
    valide: "Note finale validée",
    rejete: "Rejeté",
  };

  function uid() {
    return "wrk-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function getLocal() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function saveLocal(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function getLocalRefs() {
    try {
      return JSON.parse(localStorage.getItem(REF_STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function saveLocalRefs(list) {
    localStorage.setItem(REF_STORAGE_KEY, JSON.stringify(list));
  }

  function normTitle(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
  }

  function titlesMatch(a, b) {
    const x = normTitle(a);
    const y = normTitle(b);
    if (!x || !y) return false;
    return x === y || x.includes(y) || y.includes(x);
  }

  function findReference(universite, courseCode, assignmentTitle, professorEmail, semester) {
    const profLower = (professorEmail || "").toLowerCase();
    const matches = getLocalRefs().filter((r) => {
      if (r.universite !== universite || r.courseCode !== courseCode) return false;
      if (semester && r.semester && r.semester !== semester) return false;
      if (!titlesMatch(assignmentTitle, r.assignmentTitle)) return false;
      const rProf = (r.professorEmail || "").toLowerCase();
      if (profLower && rProf && rProf !== profLower) return false;
      return true;
    });
    return matches.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))[0] || null;
  }

  async function listReferences(prof) {
    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
      const json = await SAC_API.platformRequest("/platform/corrections/references");
      return json.references || [];
    }
    const email = (prof.email || prof.identifiant || "").toLowerCase();
    return getLocalRefs()
      .filter((r) => (r.professorEmail || "").toLowerCase() === email)
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }

  async function saveReference(prof, data, file) {
    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
        if (file) {
          const fd = new FormData();
          Object.entries(data).forEach(([k, v]) => fd.append(k, v));
          fd.append("file", file);
          const json = await SAC_API.uploadFormData("/platform/corrections/reference", fd);
          return json.reference;
        }
      const json = await SAC_API.platformRequest("/platform/corrections/reference", {
        method: "POST",
        body: JSON.stringify(data),
      });
      return json.reference;
    }

    const ref = {
      id: uid().replace("wrk-", "ref-"),
      professorEmail: prof.email || prof.identifiant,
      universite: prof.universite,
      courseCode: data.courseCode,
      courseName: data.courseName,
      assignmentTitle: data.assignmentTitle,
      semester: data.semester || "s1-2025",
      referenceText: (data.referenceText || "").slice(0, 8000),
      criteriaNotes: data.criteriaNotes || "",
      fileName: file?.name || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const list = getLocalRefs();
    list.unshift(ref);
    saveLocalRefs(list);
    return ref;
  }

  async function deleteReference(prof, referenceId) {
    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
      await SAC_API.platformRequest(`/platform/corrections/reference/${referenceId}`, {
        method: "DELETE",
      });
      return;
    }
    saveLocalRefs(getLocalRefs().filter((r) => r.id !== referenceId));
  }

  function readTextFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  function analyzeLocally(text, courseName, title, reference) {
    const content = String(text || "").trim();
    const words = content.split(/\s+/).filter(Boolean);
    const wc = words.length;
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 8);
    const paragraphs = content.split(/\n\n+/).filter((p) => p.trim());
    const lower = content.toLowerCase();

    const rubric = {
      contenu: 8,
      structure: 8,
      argumentation: 8,
      originalite: 8,
      presentation: 8,
    };

    if (wc >= 180) rubric.contenu += 2;
    if (wc >= 350) rubric.contenu += 2;
    if (wc >= 550) rubric.contenu += 1;
    if (sentences.length >= 6) rubric.argumentation += 1.5;
    if (paragraphs.length >= 3) rubric.structure += 2;
    if (paragraphs.length >= 5) rubric.structure += 1;
    if (/^(introduction|en conclusion|pour conclure|en somme)/im.test(content) || /conclusion/i.test(lower))
      rubric.structure += 1;
    if (/bibliograph|référence|source|ouvrage|auteur/i.test(lower)) rubric.presentation += 1.5;

    const courseTokens = (courseName || "")
      .toLowerCase()
      .split(/[\s—\-/,]+/)
      .filter((w) => w.length > 4);
    const matchedCourse = courseTokens.filter((w) => lower.includes(w)).length;
    rubric.contenu += Math.min(2, matchedCourse * 0.75);

    const refText = reference?.referenceText || "";
    const criteriaNotes = reference?.criteriaNotes || "";
    const comments = [
      "Analyse intelligente SAC : contenu, structure et argumentation évalués.",
      wc >= 300 ? "Développement satisfaisant pour un travail universitaire." : "Développement à approfondir (longueur insuffisante).",
    ];
    const strengths = [];
    const weaknesses = [];

    if (wc >= 280) strengths.push("Volume de rédaction adapté");
    if (paragraphs.length >= 3) strengths.push("Structure en paragraphes identifiable");
    if (matchedCourse >= 2) strengths.push("Vocabulaire aligné sur le cours");
    if (!strengths.length) strengths.push("Effort de rédaction constaté");
    if (wc < 220) weaknesses.push("Texte trop court — développez vos idées");
    if (paragraphs.length < 2) weaknesses.push("Structurer en introduction, développement et conclusion");

    let originality = 72 + Math.min(18, wc / 35) + paragraphs.length;

    if (refText) {
      const refWords = new Set(refText.toLowerCase().match(/\w{4,}/g) || []);
      const stuWords = new Set(lower.match(/\w{4,}/g) || []);
      const overlap =
        refWords.size > 0 ? [...refWords].filter((w) => stuWords.has(w)).length / refWords.size : 0;
      const refParas = refText.split(/\n\n+/).filter((p) => p.trim()).length;
      const paraRatio = refParas ? Math.min(paragraphs.length, refParas) / refParas : 0.5;
      rubric.contenu += overlap * 3 + paraRatio * 2 - 1;
      rubric.argumentation += overlap * 2;
      originality += overlap * 8;
      comments.unshift(
        `Alignement avec la copie de référence du professeur : ${Math.round(overlap * 100)} %.`
      );
      if (overlap >= 0.32) strengths.push("Bon alignement avec le modèle de correction");
      else {
        weaknesses.push("Écart notable par rapport à la copie de référence");
        comments.push("Reprenez les éléments attendus dans la copie corrigée fournie par votre professeur.");
      }
    } else {
      comments.push("Aucune copie de référence trouvée — correction basée sur les critères généraux SAC.");
    }

    if (criteriaNotes) {
      comments.push(`Critères professeur : ${criteriaNotes.slice(0, 200)}${criteriaNotes.length > 200 ? "…" : ""}`);
      if (/plagiat|copie|similarit/i.test(criteriaNotes)) {
        originality -= 8;
        weaknesses.push("Vérifier le risque de similarité (critère professeur)");
      }
      if (/bibliograph/i.test(criteriaNotes) && !/bibliograph|référence/i.test(lower)) {
        rubric.presentation -= 2;
        weaknesses.push("Bibliographie attendue selon les critères du professeur");
      }
    }

    Object.keys(rubric).forEach((k) => {
      rubric[k] = Math.min(20, Math.max(4, Math.round(rubric[k] * 10) / 10));
    });

    const weights = { contenu: 0.3, structure: 0.2, argumentation: 0.25, originalite: 0.1, presentation: 0.15 };
    let score = 0;
    Object.entries(weights).forEach(([k, w]) => {
      score += (rubric[k] || 8) * w;
    });
    score = Math.min(20, Math.max(5, Math.round(score * 10) / 10));
    originality = Math.min(99, Math.max(55, Math.round(originality)));

    return {
      provisionalGrade: score,
      originalityScore: originality,
      aiComments: comments,
      aiStrengths: strengths,
      aiWeaknesses: weaknesses,
      rubricScores: rubric,
      aiProgress: 100,
      status: "note_provisoire",
      usedReference: !!refText,
    };
  }

  async function syncGradesAfterValidation(sub, validator) {
    if (!sub || sub.status !== "valide" || sub.finalGrade == null) return null;
    const finalGrade = Number(sub.finalGrade);
    if (!Number.isFinite(finalGrade)) return null;
    const cc = Math.round(finalGrade * 2.5 * 10) / 10;
    const exam = 0;
    const avg =
      typeof SAC_GRADES !== "undefined" ? SAC_GRADES.computeAvg(cc, exam) : finalGrade;
    const status =
      typeof SAC_GRADES !== "undefined" ? SAC_GRADES.computeStatus(avg) : avg >= 10 ? "Validé" : "Rattrapage";
    const profEmail = sub.professorEmail || validator.email || validator.identifiant;
    const semester = sub.semester || "s1-2025";
    const payload = {
      studentEmail: sub.studentEmail,
      studentMatricule: sub.studentMatricule,
      courseCode: sub.courseCode,
      courseName: sub.courseName,
      semester,
      universite: sub.universite,
      filiere: sub.filiere,
      niveau: sub.niveau,
      cc,
      exam,
      classe: sub.classe,
    };
    let row = null;

    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
      if (typeof SAC_GRADES !== "undefined") {
        await SAC_GRADES.syncFromServer(validator);
        row = SAC_GRADES.getAll().find(
          (g) =>
            (g.studentEmail || "").toLowerCase() === (sub.studentEmail || "").toLowerCase() &&
            g.courseCode === sub.courseCode &&
            g.semester === semester
        );
      }
    }

    if (!row && typeof SAC_GRADES !== "undefined") {
      row = await SAC_GRADES.upsertGrade(
        {
          identifiant: profEmail,
          email: profEmail,
          role: "professeur",
          universite: sub.universite,
          displayName: validator.displayName,
        },
        payload,
        { skipApi: true }
      );
    }

    let sheet = null;
    if (typeof SAC_GRADE_SHEET !== "undefined") {
      sheet = SAC_GRADE_SHEET.createFromValidation(sub, row, validator);
    }
    window.dispatchEvent(
      new CustomEvent("sac:grades-updated", {
        detail: { submission: sub, grade: row, sheet },
      })
    );
    return row;
  }

  async function submitWork(student, data, file) {
    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
        if (file) {
          const fd = new FormData();
          Object.entries(data).forEach(([k, v]) => fd.append(k, v));
          fd.append("file", file);
          const json = await SAC_API.uploadFormData("/platform/corrections/submit", fd);
          return json.submission;
        }
      const json = await SAC_API.platformRequest("/platform/corrections/submit", {
        method: "POST",
        body: JSON.stringify(data),
      });
      return json.submission;
    }

    const text = data.textContent || data.text || "";
    const reference = findReference(
      student.universite,
      data.courseCode,
      data.assignmentTitle,
      data.professorEmail,
      data.semester
    );
    const analysis = analyzeLocally(text, data.courseName, data.assignmentTitle, reference);
    const sub = {
      id: uid(),
      studentEmail: student.email || student.identifiant,
      studentName: [student.prenom, student.nom].filter(Boolean).join(" ") || student.displayName,
      studentMatricule: student.matricule,
      professorEmail: data.professorEmail,
      universite: student.universite,
      filiere: student.filiere,
      niveau: student.niveau,
      courseCode: data.courseCode,
      courseName: data.courseName,
      classe: data.classe,
      semester: data.semester || "s1-2025",
      assignmentTitle: data.assignmentTitle,
      textContent: text.slice(0, 500),
      fileType: data.fileType || (file ? file.type : "text"),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...analysis,
    };
    const list = getLocal();
    list.unshift(sub);
    saveLocal(list);
    return sub;
  }

  async function listForStudent(student) {
    const email = (student.email || student.identifiant || "").toLowerCase();
    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
      const json = await SAC_API.platformRequest("/platform/corrections/me");
      return json.submissions || [];
    }
    return getLocal().filter((s) => (s.studentEmail || "").toLowerCase() === email);
  }

  async function listPendingProfessor(prof) {
    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
      const json = await SAC_API.platformRequest("/platform/corrections/pending");
      return json.submissions || [];
    }
    const email = (prof.email || prof.identifiant || "").toLowerCase();
    const uni = prof.universite;
    return getLocal().filter((s) => {
      if (s.status !== "note_provisoire") return false;
      if (prof.role === "assistant") return s.universite === uni;
      return (
        s.universite === uni &&
        (!s.professorEmail || s.professorEmail.toLowerCase() === email)
      );
    });
  }

  async function validateSubmission(validator, submissionId, payload) {
    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
      const json = await SAC_API.platformRequest(
        `/platform/corrections/${submissionId}/validate`,
        { method: "POST", body: JSON.stringify(payload) }
      );
      const sub = json.submission;
      if (payload.action !== "reject") await syncGradesAfterValidation(sub, validator);
      return sub;
    }
    const list = getLocal();
    const idx = list.findIndex((s) => s.id === submissionId);
    if (idx < 0) throw new Error("NOT_FOUND");
    const sub = list[idx];
    if (payload.action === "reject") {
      sub.status = "rejete";
      sub.professorComment = payload.comment || "";
    } else {
      sub.status = "valide";
      sub.finalGrade = Number(payload.finalGrade ?? sub.provisionalGrade);
      sub.professorComment = payload.comment || "";
      await syncGradesAfterValidation(sub, validator);
    }
    sub.validatedAt = new Date().toISOString();
    sub.validatedBy = validator.email || validator.identifiant;
    list[idx] = sub;
    saveLocal(list);
    return sub;
  }

  async function getClassStats(universite, classe) {
    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
      const q = classe ? `?classe=${encodeURIComponent(classe)}` : "";
      return SAC_API.platformRequest("/platform/corrections/stats/class" + q);
    }
    const validated = getLocal().filter((s) => s.status === "valide" && s.universite === universite);
    const grades = validated.map((s) => s.finalGrade).filter((g) => g != null);
    const avg = grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : 0;
    return {
      totalStudents: grades.length,
      average: Math.round(avg * 10) / 10,
      passRate: grades.length ? Math.round((100 * grades.filter((g) => g >= 10).length) / grades.length) : 0,
      distribution: [],
    };
  }

  function statusLabel(status) {
    return STATUS_LABELS[status] || status;
  }

  function statusClass(status) {
    if (status === "correction_ia") return "ai-status--ia";
    if (status === "note_provisoire") return "ai-status--pending";
    if (status === "valide") return "ai-status--ok";
    if (status === "rejete") return "ai-status--rej";
    return "ai-status--ia";
  }

  function renderFlowStep(currentStep) {
    const steps = [
      { n: 1, label: "Dépôt du travail" },
      { n: 2, label: "Correction IA" },
      { n: 3, label: "Note provisoire" },
      { n: 4, label: "Validation prof / assistant" },
      { n: 5, label: "Note finale" },
    ];
    return `<div class="ai-flow">${steps
      .map((s) => {
        let cls = "ai-flow__step";
        if (s.n < currentStep) cls += " ai-flow__step--done";
        if (s.n === currentStep) cls += " ai-flow__step--active";
        return `<div class="${cls}"><span class="ai-flow__num">${s.n}</span>${s.label}</div>`;
      })
      .join("")}</div>`;
  }

  function renderSubmissionCard(sub, options = {}) {
    const esc = (s) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    let step = 1;
    if (sub.status === "correction_ia") step = 2;
    if (sub.status === "note_provisoire") step = 3;
    if (sub.status === "valide") step = 5;
    if (sub.status === "rejete") step = 4;

    let body = renderFlowStep(step);
    if (sub.status === "correction_ia") {
      body += `<div class="ai-progress"><div class="ai-progress__bar" style="width:${sub.aiProgress || 80}%"></div></div>
        <p style="font-size:0.85rem;color:var(--text-muted)">Correction en cours… ${sub.aiProgress || 80}%</p>`;
    }
    if (sub.provisionalGrade != null && sub.status !== "depose") {
      body += `<div class="ai-result">
        <div class="ai-result__card"><strong>${sub.provisionalGrade}/20</strong><span>Note provisoire IA</span></div>
        <div class="ai-result__card"><strong>${sub.originalityScore || "—"}%</strong><span>Originalité</span></div>
      </div>`;
      if (sub.usedReference) {
        body += `<p class="ai-ref-used">📋 Correction effectuée selon la copie de référence du professeur.</p>`;
      }
      if (sub.aiStrengths?.length) {
        body += `<div class="ai-comments"><strong>Points forts</strong><ul>${sub.aiStrengths.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>`;
      }
      if (sub.aiWeaknesses?.length) {
        body += `<div class="ai-comments"><strong>À améliorer</strong><ul>${sub.aiWeaknesses.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>`;
      }
      if (sub.aiComments?.length) {
        body += `<div class="ai-comments"><strong>Commentaires IA</strong><ul>${sub.aiComments.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>`;
      }
    }
    if (sub.status === "valide" && sub.finalGrade != null) {
      body += `<p style="margin-top:0.75rem;font-weight:600;color:var(--success,#0d7a4a)">✓ Note finale validée : ${sub.finalGrade}/20 — relevé de cotes mis à jour automatiquement.</p>`;
    }
    if (options.validate && sub.status === "note_provisoire") {
      body += `<form class="ai-validate-form" data-validate-id="${esc(sub.id)}">
        <label>Note finale (/20)<input type="number" class="fi" name="finalGrade" min="0" max="20" step="0.5" value="${sub.provisionalGrade}" /></label>
        <label>Commentaire (prof / assistant)<textarea class="fi" name="comment" rows="2" placeholder="Observations…"></textarea></label>
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">
          <button type="submit" class="btn btn--role btn--sm" data-action="validate">✓ Valider</button>
          <button type="button" class="btn btn--ghost btn--sm" data-action="modify">✎ Modifier & valider</button>
          <button type="button" class="btn btn--ghost btn--sm" data-action="reject" style="color:#b91c1c">✕ Rejeter</button>
        </div>
      </form>`;
    }
    return `<article class="ai-sub-card">
      <div class="ai-sub-card__head">
        <div>
          <div class="ai-sub-card__title">${esc(sub.assignmentTitle)}</div>
          <div class="ai-sub-card__meta">${esc(sub.courseName)} · ${esc(sub.studentName || sub.studentEmail)}</div>
        </div>
        <span class="ai-status ${statusClass(sub.status)}">${esc(statusLabel(sub.status))}</span>
      </div>
      ${body}
    </article>`;
  }

  function mountStudentUI(container, student, courses) {
    if (!container) return;
    const courseOptions = (courses || [])
      .map(
        (c) =>
          `<option value="${c.courseCode}" data-name="${c.courseName || c.courseCode}" data-classe="${c.classe || ""}">${c.courseCode} — ${c.courseName || ""}</option>`
      )
      .join("");

    container.innerHTML = `
      <div class="panel ai-deposit-panel">
        <div class="panel__head ai-deposit-panel__head">
          <div>
            <h2>🤖 Correction automatisée par l'agent IA SAC</h2>
            <p class="ai-deposit-panel__subtitle">Dépôt, analyse IA et validation professeur</p>
          </div>
        </div>
        <div class="panel__body">
          ${renderFlowStep(1)}
          <p class="ai-deposit__intro">Déposez votre travail (texte, PDF, Word ou image). L'agent IA SAC analyse le contenu selon la copie de correction de votre professeur, détecte les similarités et propose une note provisoire — validée ensuite par votre professeur ou l'assistant du campus.</p>
          <form id="aiSubmitForm" class="ai-deposit__form">
            <div class="ai-form-grid">
              <div class="ai-field">
                <label class="ai-field__label" for="aiCourseCode"><span class="ai-field__icon">📚</span> Cours</label>
                <select class="ai-field__input" id="aiCourseCode" name="courseCode" required>${courseOptions || '<option value="GEN">Travail général</option>'}</select>
              </div>
              <div class="ai-field">
                <label class="ai-field__label" for="aiAssignmentTitle"><span class="ai-field__icon">✏️</span> Titre du travail</label>
                <input class="ai-field__input" id="aiAssignmentTitle" name="assignmentTitle" required placeholder="Ex. Travail 1 — Dissertation" />
              </div>
              <div class="ai-field ai-field--full">
                <label class="ai-field__label" for="aiTextContent"><span class="ai-field__icon">📝</span> Contenu (texte)</label>
                <textarea class="ai-field__textarea" id="aiTextContent" name="textContent" rows="8" placeholder="Collez votre texte ou rédigez ici…"></textarea>
                <span class="ai-field__hint">Vous pouvez aussi joindre un fichier ci-dessous à la place du texte.</span>
              </div>
              <div class="ai-field ai-field--full">
                <span class="ai-field__label"><span class="ai-field__icon">📎</span> Fichier (PDF, Word, image)</span>
                <div class="ai-file-upload" id="aiFileUpload">
                  <input class="ai-file-upload__input" type="file" id="aiFileInput" name="file" accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.webp" />
                  <label class="ai-file-upload__zone" for="aiFileInput">
                    <span class="ai-file-upload__icon">📁</span>
                    <span class="ai-file-upload__text">Glissez un fichier ou cliquez pour parcourir</span>
                    <span class="ai-file-upload__hint">PDF, Word, TXT, JPG, PNG — max 10 Mo</span>
                  </label>
                  <span class="ai-file-upload__name" id="aiFileName">Aucun fichier sélectionné</span>
                </div>
              </div>
            </div>
            <div class="ai-deposit__actions">
              <button type="submit" class="ai-submit-btn">
                <span class="ai-submit-btn__icon">📤</span>
                <span>Déposer & lancer la correction IA</span>
              </button>
            </div>
          </form>
        </div>
      </div>
      <div class="panel" style="margin-top:1rem;">
        <div class="panel__head"><h2>Mes travaux corrigés</h2></div>
        <div class="panel__body" id="aiStudentList"><p class="pub-empty">Chargement…</p></div>
      </div>`;

    async function refresh() {
      const listEl = container.querySelector("#aiStudentList");
      const subs = await listForStudent(student);
      listEl.innerHTML = subs.length
        ? subs.map((s) => renderSubmissionCard(s)).join("")
        : '<p class="pub-empty">Aucun travail déposé.</p>';
    }

    const fileInput = container.querySelector("#aiFileInput");
    const fileNameEl = container.querySelector("#aiFileName");
    const fileUploadEl = container.querySelector("#aiFileUpload");

    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) {
        fileNameEl.textContent = file.name;
        fileNameEl.classList.add("ai-file-upload__name--selected");
        fileUploadEl.classList.add("ai-file-upload--has-file");
      } else {
        fileNameEl.textContent = "Aucun fichier sélectionné";
        fileNameEl.classList.remove("ai-file-upload__name--selected");
        fileUploadEl.classList.remove("ai-file-upload--has-file");
      }
    });

    container.querySelector("#aiSubmitForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const sel = e.target.querySelector('[name="courseCode"]');
      const opt = sel.options[sel.selectedIndex];
      const file = fd.get("file");
      const btn = e.target.querySelector(".ai-submit-btn");
      const btnLabel = btn.querySelector("span:last-child");
      const defaultLabel = btnLabel.textContent;
      btn.disabled = true;
      btnLabel.textContent = "Correction IA en cours…";
      try {
        await submitWork(
          student,
          {
            courseCode: fd.get("courseCode"),
            courseName: opt?.dataset?.name || fd.get("courseCode"),
            classe: opt?.dataset?.classe || "",
            assignmentTitle: fd.get("assignmentTitle"),
            textContent: fd.get("textContent"),
            semester: "s1-2025",
            professorEmail: student.professorEmail,
          },
          file && file.size ? file : null
        );
        e.target.reset();
        fileNameEl.textContent = "Aucun fichier sélectionné";
        fileNameEl.classList.remove("ai-file-upload__name--selected");
        fileUploadEl.classList.remove("ai-file-upload--has-file");
        await refresh();
      } catch (err) {
        alert(err.message || "Erreur lors du dépôt");
      }
      btn.disabled = false;
      btnLabel.textContent = defaultLabel;
    });

    refresh();
    return { refresh };
  }

  function renderReferenceCard(ref) {
    const esc = (s) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    const preview = (ref.referenceText || "").slice(0, 120);
    return `<article class="ai-ref-card" data-ref-id="${esc(ref.id)}">
      <div class="ai-ref-card__head">
        <div>
          <div class="ai-ref-card__title">${esc(ref.assignmentTitle)}</div>
          <div class="ai-ref-card__meta">${esc(ref.courseCode)} — ${esc(ref.courseName)}</div>
        </div>
        <button type="button" class="btn btn--ghost btn--sm ai-ref-card__delete" data-delete-ref="${esc(ref.id)}" title="Supprimer">✕</button>
      </div>
      ${preview ? `<p class="ai-ref-card__preview">${esc(preview)}${ref.referenceText.length > 120 ? "…" : ""}</p>` : ""}
      ${ref.criteriaNotes ? `<p class="ai-ref-card__criteria"><strong>Critères :</strong> ${esc(ref.criteriaNotes)}</p>` : ""}
      ${ref.fileName ? `<span class="ai-tag ai-tag--ok">📎 ${esc(ref.fileName)}</span>` : ""}
    </article>`;
  }

  function bindValidationForms(container, validator, refresh) {
    container.querySelectorAll("[data-validate-id]").forEach((form) => {
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const fd = new FormData(form);
        try {
          await validateSubmission(validator, form.dataset.validateId, {
            action: "validate",
            finalGrade: fd.get("finalGrade"),
            comment: fd.get("comment"),
          });
          await refresh();
        } catch (err) {
          alert(err.message || "Erreur lors de la validation");
        }
      });
      form.querySelector('[data-action="reject"]')?.addEventListener("click", async () => {
        const comment = form.querySelector('[name="comment"]')?.value || "";
        if (!confirm("Rejeter ce travail ?")) return;
        try {
          await validateSubmission(validator, form.dataset.validateId, { action: "reject", comment });
          await refresh();
        } catch (err) {
          alert(err.message || "Erreur lors du rejet");
        }
      });
      form.querySelector('[data-action="modify"]')?.addEventListener("click", async () => {
        const fd = new FormData(form);
        try {
          await validateSubmission(validator, form.dataset.validateId, {
            action: "validate",
            finalGrade: fd.get("finalGrade"),
            comment: fd.get("comment"),
          });
          await refresh();
        } catch (err) {
          alert(err.message || "Erreur lors de la validation");
        }
      });
    });
  }

  function mountProfessorUI(container, prof, courses) {
    if (!container) return;
    const courseOptions = (courses || [])
      .map(
        (c) =>
          `<option value="${c.courseCode}" data-name="${c.courseName || c.courseCode}">${c.courseCode} — ${c.courseName || ""}</option>`
      )
      .join("");

    container.innerHTML = `
      <div class="panel ai-ref-panel">
        <div class="panel__head ai-deposit-panel__head">
          <div>
            <h2>📋 Copies de correction (référence IA)</h2>
            <p class="ai-deposit-panel__subtitle">Modèle que l'agent IA suivra pour corriger les travaux</p>
          </div>
        </div>
        <div class="panel__body">
          <p class="ai-deposit__intro">Déposez une copie corrigée pour un cours et un sujet précis. L'IA comparera chaque travail étudiant à ce modèle pour proposer une note provisoire cohérente avec vos attentes.</p>
          <form id="aiRefForm" class="ai-deposit__form">
            <div class="ai-form-grid">
              <div class="ai-field">
                <label class="ai-field__label" for="aiRefCourse"><span class="ai-field__icon">📚</span> Cours</label>
                <select class="ai-field__input" id="aiRefCourse" name="courseCode" required>${courseOptions || '<option value="GEN">Travail général</option>'}</select>
              </div>
              <div class="ai-field">
                <label class="ai-field__label" for="aiRefTitle"><span class="ai-field__icon">✏️</span> Titre du travail (sujet)</label>
                <input class="ai-field__input" id="aiRefTitle" name="assignmentTitle" required placeholder="Ex. Travail 1 — Dissertation" />
                <span class="ai-field__hint">Doit correspondre au titre que les étudiants indiqueront.</span>
              </div>
              <div class="ai-field ai-field--full">
                <label class="ai-field__label" for="aiRefText"><span class="ai-field__icon">📝</span> Contenu de la copie corrigée</label>
                <textarea class="ai-field__textarea" id="aiRefText" name="referenceText" rows="8" placeholder="Collez ici votre copie corrigée modèle (texte annoté, réponses attendues, barème…)"></textarea>
              </div>
              <div class="ai-field ai-field--full">
                <label class="ai-field__label" for="aiRefCriteria"><span class="ai-field__icon">📐</span> Critères de notation (optionnel)</label>
                <textarea class="ai-field__input" id="aiRefCriteria" name="criteriaNotes" rows="3" placeholder="Ex. Introduction 4 pts, argumentation 8 pts, bibliographie obligatoire, pénalité plagiat…"></textarea>
              </div>
              <div class="ai-field ai-field--full">
                <span class="ai-field__label"><span class="ai-field__icon">📎</span> Fichier (PDF, Word, TXT)</span>
                <div class="ai-file-upload" id="aiRefFileUpload">
                  <input class="ai-file-upload__input" type="file" id="aiRefFileInput" name="file" accept=".pdf,.doc,.docx,.txt,.md" />
                  <label class="ai-file-upload__zone" for="aiRefFileInput">
                    <span class="ai-file-upload__icon">📁</span>
                    <span class="ai-file-upload__text">Joindre la copie corrigée (fichier)</span>
                    <span class="ai-file-upload__hint">TXT et MD lus automatiquement — sinon complétez le texte ci-dessus</span>
                  </label>
                  <span class="ai-file-upload__name" id="aiRefFileName">Aucun fichier sélectionné</span>
                </div>
              </div>
            </div>
            <div class="ai-deposit__actions">
              <button type="submit" class="ai-submit-btn ai-submit-btn--prof">
                <span class="ai-submit-btn__icon">💾</span>
                <span>Enregistrer la copie de référence</span>
              </button>
            </div>
          </form>
          <div class="ai-ref-list" id="aiRefList"><p class="pub-empty">Chargement…</p></div>
        </div>
      </div>
      <div class="panel" style="border-left:4px solid var(--prof,#c9a227);margin-top:1rem;">
        <div class="panel__head"><h2>🤖 Validation des corrections IA</h2></div>
        <div class="panel__body">
          ${renderFlowStep(4)}
          <p class="page-desc" style="margin:0 0 1rem;font-size:0.88rem;">Validez, modifiez ou rejetez les notes provisoires proposées par l'agent IA. Après validation, les fiches de cotes et bulletins sont mis à jour automatiquement.</p>
          <div id="aiProfPending"></div>
        </div>
      </div>
      <div class="panel" style="margin-top:1rem;">
        <div class="panel__head"><h2>📊 Statistiques classe (corrections validées)</h2></div>
        <div class="panel__body" id="aiProfStats"></div>
      </div>`;

    const refFileInput = container.querySelector("#aiRefFileInput");
    const refFileNameEl = container.querySelector("#aiRefFileName");
    const refFileUploadEl = container.querySelector("#aiRefFileUpload");

    refFileInput.addEventListener("change", () => {
      const file = refFileInput.files?.[0];
      if (file) {
        refFileNameEl.textContent = file.name;
        refFileNameEl.classList.add("ai-file-upload__name--selected");
        refFileUploadEl.classList.add("ai-file-upload--has-file");
        if (/\.(txt|md)$/i.test(file.name)) {
          readTextFile(file).then((text) => {
            const ta = container.querySelector("#aiRefText");
            if (ta && !ta.value.trim()) ta.value = text;
          });
        }
      } else {
        refFileNameEl.textContent = "Aucun fichier sélectionné";
        refFileNameEl.classList.remove("ai-file-upload__name--selected");
        refFileUploadEl.classList.remove("ai-file-upload--has-file");
      }
    });

    container.querySelector("#aiRefForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const sel = e.target.querySelector('[name="courseCode"]');
      const opt = sel.options[sel.selectedIndex];
      const file = fd.get("file");
      const refText = String(fd.get("referenceText") || "").trim();
      if (!refText && (!file || !file.size)) {
        alert("Indiquez le texte de la copie corrigée ou joignez un fichier.");
        return;
      }
      const btn = e.target.querySelector(".ai-submit-btn");
      const btnLabel = btn.querySelector("span:last-child");
      const defaultLabel = btnLabel.textContent;
      btn.disabled = true;
      btnLabel.textContent = "Enregistrement…";
      try {
        await saveReference(
          prof,
          {
            courseCode: fd.get("courseCode"),
            courseName: opt?.dataset?.name || fd.get("courseCode"),
            assignmentTitle: fd.get("assignmentTitle"),
            referenceText: refText,
            criteriaNotes: fd.get("criteriaNotes"),
            semester: "s1-2025",
          },
          file && file.size ? file : null
        );
        e.target.reset();
        refFileNameEl.textContent = "Aucun fichier sélectionné";
        refFileNameEl.classList.remove("ai-file-upload__name--selected");
        refFileUploadEl.classList.remove("ai-file-upload--has-file");
        await refreshRefs();
      } catch (err) {
        alert(err.message || "Erreur lors de l'enregistrement");
      }
      btn.disabled = false;
      btnLabel.textContent = defaultLabel;
    });

    async function refreshRefs() {
      const listEl = container.querySelector("#aiRefList");
      const refs = await listReferences(prof);
      listEl.innerHTML = refs.length
        ? `<h3 class="ai-ref-list__title">Copies enregistrées (${refs.length})</h3>${refs.map((r) => renderReferenceCard(r)).join("")}`
        : '<p class="pub-empty">Aucune copie de référence. Déposez un modèle pour guider l\'IA.</p>';
      listEl.querySelectorAll("[data-delete-ref]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!confirm("Supprimer cette copie de référence ?")) return;
          await deleteReference(prof, btn.dataset.deleteRef);
          refreshRefs();
        });
      });
    }

    async function refresh() {
      const pending = await listPendingProfessor(prof);
      const pendingEl = container.querySelector("#aiProfPending");
      pendingEl.innerHTML = pending.length
        ? pending.map((s) => renderSubmissionCard(s, { validate: true })).join("")
        : '<p class="pub-empty">Aucun travail en attente de validation.</p>';

      bindValidationForms(pendingEl, prof, refresh);

      const stats = await getClassStats(prof.universite);
      container.querySelector("#aiProfStats").innerHTML = `
        <div class="ai-stats-grid">
          <div class="ai-result__card"><strong>${stats.totalStudents || 0}</strong><span>Travaux validés</span></div>
          <div class="ai-result__card"><strong>${stats.average || 0}/20</strong><span>Moyenne générale</span></div>
          <div class="ai-result__card"><strong>${stats.passRate || 0}%</strong><span>Taux de réussite</span></div>
        </div>
        ${(stats.distribution || [])
          .map(
            (d) =>
              `<div class="ai-dist-bar"><span>${d.range}</span><div class="ai-dist-bar__track"><div class="ai-dist-bar__fill" style="width:${d.percent}%"></div></div><span>${d.percent}%</span></div>`
          )
          .join("")}`;
    }

    refreshRefs();
    refresh();
    return { refresh, refreshRefs };
  }

  function mountAssistantUI(container, assistant) {
    if (!container) return;
    container.innerHTML = `
      <div class="panel" style="border-left:4px solid var(--assistant,#6b4c9a);">
        <div class="panel__head"><h2>🤖 Validation des corrections IA</h2></div>
        <div class="panel__body">
          ${renderFlowStep(4)}
          <p class="page-desc" style="margin:0 0 1rem;font-size:0.88rem;">
            En tant qu'assistant, validez ou modifiez les notes provisoires proposées par l'agent IA.
            Après validation, les fiches de cotes et le relevé étudiant sont remplis et calculés automatiquement.
          </p>
          <div id="aiAssistantPending"><p class="pub-empty">Chargement…</p></div>
        </div>
      </div>
      <div class="panel" style="margin-top:1rem;">
        <div class="panel__head"><h2>📊 Statistiques campus (corrections validées)</h2></div>
        <div class="panel__body" id="aiAssistantStats"></div>
      </div>`;

    const actor = { ...assistant, email: assistant.email || assistant.identifiant, role: "assistant" };

    async function refresh() {
      const pending = await listPendingProfessor(actor);
      const pendingEl = container.querySelector("#aiAssistantPending");
      pendingEl.innerHTML = pending.length
        ? pending.map((s) => renderSubmissionCard(s, { validate: true })).join("")
        : '<p class="pub-empty">Aucun travail en attente de validation.</p>';
      bindValidationForms(pendingEl, actor, refresh);

      const stats = await getClassStats(actor.universite);
      container.querySelector("#aiAssistantStats").innerHTML = `
        <div class="ai-stats-grid">
          <div class="ai-result__card"><strong>${stats.totalStudents || 0}</strong><span>Travaux validés</span></div>
          <div class="ai-result__card"><strong>${stats.average || 0}/20</strong><span>Moyenne générale</span></div>
          <div class="ai-result__card"><strong>${stats.passRate || 0}%</strong><span>Taux de réussite</span></div>
        </div>`;
    }

    refresh();
    return { refresh };
  }

  return {
    submitWork,
    listForStudent,
    listPendingProfessor,
    validateSubmission,
    syncGradesAfterValidation,
    getClassStats,
    saveReference,
    listReferences,
    deleteReference,
    findReference,
    mountStudentUI,
    mountProfessorUI,
    mountAssistantUI,
    renderFlowStep,
    renderSubmissionCard,
    renderReferenceCard,
    statusLabel,
  };
})();

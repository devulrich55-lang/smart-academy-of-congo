/**
 * Agent IA EvoSU — correction automatisée des travaux
 * Flux : dépôt → IA → note provisoire → validation professeur → note finale
 */
const EVOSU_AI_CORRECTION = (function () {
  const STORAGE_KEY = "EVOSU_ai_submissions";
  const REF_STORAGE_KEY = "EVOSU_ai_references";

  const STATUS_LABELS = {
    depose: "Déposé",
    correction_ia: "Analyse en cours",
    note_provisoire: "En attente professeur",
    valide: "Note validée",
    rejete: "Rejeté",
  };

  const REJECT_MSG_NO_SOURCE =
    "Impossible de corriger ce travail : aucune copie professeur et aucune source fiable trouvée sur internet pour ce sujet. Vérifiez le titre du travail ou contactez votre professeur.";
  const REJECT_MSG_REFERENCE_EMPTY =
    "La copie de référence du professeur est illisible. L'IA tente une recherche internet automatique…";

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

  function normText(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
  }

  function normTitle(value) {
    return normText(value);
  }

  function titlesMatch(a, b) {
    const x = normTitle(a);
    const y = normTitle(b);
    if (!x || !y) return false;
    return x === y || x.includes(y) || y.includes(x);
  }

  function filterMatchingReferences(refs, universite, courseCode, assignmentTitle, professorEmail, semester, courseName) {
    const profLower = (professorEmail || "").toLowerCase();
    return (refs || []).filter((r) => {
      if (r.universite !== universite || r.courseCode !== courseCode) return false;
      if (semester && r.semester && r.semester !== semester) return false;
      const rProf = (r.professorEmail || "").toLowerCase();
      if (profLower && rProf && rProf !== profLower) return false;
      if (!r.assignmentTitle) return true;
      if (!assignmentTitle) return true;
      return (
        titlesMatch(assignmentTitle, r.assignmentTitle) ||
        titlesMatch(courseName || assignmentTitle, r.assignmentTitle) ||
        titlesMatch(assignmentTitle, r.courseName)
      );
    });
  }

  function pickLatestReference(matches) {
    return matches.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))[0] || null;
  }

  function hasUsableReference(reference) {
    return !!(reference && String(reference.referenceText || "").trim().length >= 20);
  }

  async function findReference(universite, courseCode, assignmentTitle, professorEmail, semester, courseName) {
    if (typeof EVOSU_API !== "undefined" && (await EVOSU_API.ensureOnline())) {
      try {
        const json = await EVOSU_API.platformRequest("/platform/corrections/references");
        const match = pickLatestReference(
          filterMatchingReferences(
            json.references || [],
            universite,
            courseCode,
            assignmentTitle,
            professorEmail,
            semester,
            courseName
          )
        );
        if (match) return match;
      } catch {
        /* repli localStorage */
      }
    }
    const matches = filterMatchingReferences(
      getLocalRefs(),
      universite,
      courseCode,
      assignmentTitle,
      professorEmail,
      semester,
      courseName
    );
    return pickLatestReference(matches);
  }

  async function listReferences(prof) {
    if (typeof EVOSU_API !== "undefined" && (await EVOSU_API.ensureOnline())) {
      const json = await EVOSU_API.platformRequest("/platform/corrections/references");
      return json.references || [];
    }
    const email = (prof.email || prof.identifiant || "").toLowerCase();
    return getLocalRefs()
      .filter((r) => (r.professorEmail || "").toLowerCase() === email)
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }

  async function saveReference(prof, data, file) {
    if (typeof EVOSU_API !== "undefined" && (await EVOSU_API.ensureOnline())) {
        if (file) {
          const fd = new FormData();
          Object.entries(data).forEach(([k, v]) => fd.append(k, v));
          fd.append("file", file);
          const json = await EVOSU_API.uploadFormData("/platform/corrections/reference", fd);
          return json.reference;
        }
      const json = await EVOSU_API.platformRequest("/platform/corrections/reference", {
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
    if (typeof EVOSU_API !== "undefined" && (await EVOSU_API.ensureOnline())) {
      await EVOSU_API.platformRequest(`/platform/corrections/reference/${referenceId}`, {
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

  async function fetchJsonSafe(url) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  function buildSearchQueries(courseName, assignmentTitle, studentText) {
    const queries = [];
    const title = String(assignmentTitle || "").trim();
    const course = String(courseName || "").trim();
    const text = String(studentText || "").trim();
    if (course && title) queries.push(`${course} ${title}`);
    if (title) queries.push(title);
    if (course) queries.push(course);
    (text.match(/[^.!?\n]{8,}\?/g) || []).slice(0, 4).forEach((q) => queries.push(q.trim()));
    text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 18)
      .slice(0, 3)
      .forEach((line) => queries.push(line.slice(0, 140)));
    return [...new Set(queries.filter(Boolean))].slice(0, 8);
  }

  async function wikiSearch(query, lang) {
    const q = encodeURIComponent(query.slice(0, 120));
    const data = await fetchJsonSafe(
      `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q}&format=json&origin=*&srlimit=2`
    );
    return (data?.query?.search || []).map((hit) => ({ title: hit.title, lang, snippet: hit.snippet || "" }));
  }

  async function wikiSummary(title, lang) {
    const slug = encodeURIComponent(String(title || "").replace(/ /g, "_"));
    const data = await fetchJsonSafe(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${slug}`);
    if (!data?.extract) return null;
    return {
      title: data.title || title,
      extract: data.extract,
      url: data.content_urls?.desktop?.page || "",
      source: `Wikipedia (${lang})`,
    };
  }

  async function duckDuckGoLookup(query) {
    const q = encodeURIComponent(query.slice(0, 200));
    const data = await fetchJsonSafe(
      `https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`
    );
    if (!data) return null;
    if (data.AbstractText) {
      return {
        title: data.Heading || query,
        extract: data.AbstractText,
        url: data.AbstractURL || "",
        source: "DuckDuckGo",
      };
    }
    const related = (data.RelatedTopics || [])
      .flatMap((item) => (item.Text ? [item] : item.Topics || []))
      .filter((item) => item.Text)
      .slice(0, 4)
      .map((item) => item.Text)
      .join("\n");
    return related
      ? { title: query, extract: related, url: "", source: "DuckDuckGo" }
      : null;
  }

  async function requestServerResearch(data) {
    if (typeof EVOSU_API === "undefined" || !(await EVOSU_API.ensureOnline())) return null;
    try {
      const json = await EVOSU_API.platformRequest("/platform/corrections/research", {
        method: "POST",
        body: JSON.stringify({
          courseName: data.courseName,
          courseCode: data.courseCode,
          assignmentTitle: data.assignmentTitle,
          textContent: data.textContent || data.text || "",
        }),
      });
      if (json?.research?.referenceText) return json.research;
    } catch {
      /* repli client */
    }
    return null;
  }

  async function researchWebKnowledge(courseName, assignmentTitle, studentText) {
    const queries = buildSearchQueries(courseName, assignmentTitle, studentText);
    const sources = [];
    const seen = new Set();

    function addSource(entry, query) {
      if (!entry?.extract) return;
      const key = normText(entry.extract).slice(0, 100);
      if (!key || seen.has(key)) return;
      seen.add(key);
      sources.push({ ...entry, query });
    }

    const tasks = [];
    queries.forEach((query) => {
      tasks.push(
        duckDuckGoLookup(query).then((result) => {
          if (result) addSource(result, query);
        })
      );
      ["fr", "en"].forEach((lang) => {
        tasks.push(
          wikiSearch(query, lang).then(async (hits) => {
            for (const hit of hits.slice(0, 2)) {
              const summary = await wikiSummary(hit.title, lang);
              if (summary) addSource(summary, query);
            }
          })
        );
      });
    });
    await Promise.allSettled(tasks);

    if (!sources.length) return null;

    const referenceText = sources
      .slice(0, 6)
      .map((source, index) => {
        const link = source.url ? `\nSource : ${source.url}` : "";
        return `[Référence ${index + 1} — ${source.source}] ${source.title}\n${source.extract}${link}`;
      })
      .join("\n\n");

    return {
      referenceText,
      criteriaNotes:
        "Correction automatique par recherche documentaire (Wikipedia, DuckDuckGo). L'orthographe n'est pas pénalisée.",
      mode: "web_research",
      sources: sources.slice(0, 6).map((source) => ({
        title: source.title,
        url: source.url,
        source: source.source,
      })),
    };
  }

  async function resolveCorrectionSource(reference, data) {
    if (hasUsableReference(reference)) {
      return { source: reference, mode: "prof_reference", usedWebResearch: false };
    }
    const serverResearch = await requestServerResearch(data);
    if (serverResearch?.referenceText) {
      return {
        source: serverResearch,
        mode: "web_research",
        usedWebResearch: true,
      };
    }
    const webResearch = await researchWebKnowledge(
      data.courseName,
      data.assignmentTitle,
      data.textContent || data.text || ""
    );
    if (webResearch?.referenceText) {
      return { source: webResearch, mode: "web_research", usedWebResearch: true };
    }
    return null;
  }

  function buildProfBrief(mode, score, sectionRatio, overlap, strengths, weaknesses) {
    const lines = [`Suggestion IA : ${score}/20 (non définitive).`];
    lines.push(
      mode === "web_research"
        ? "Base : recherche internet (copie prof absente)."
        : "Base : copie de référence du professeur."
    );
    const note =
      weaknesses[0] ||
      strengths[0] ||
      `Conformité estimée : ${Math.round(sectionRatio * 100)} %.`;
    lines.push(String(note).slice(0, 140));
    return lines.slice(0, 3);
  }

  function renderStudentSubmissionBody(sub, esc) {
    if (sub.status === "rejete") {
      return `<p class="ai-student-msg ai-student-msg--rej">Dépôt non accepté. Contactez votre professeur.</p>`;
    }
    if (sub.status === "correction_ia") {
      return `<p class="ai-student-msg">Analyse en cours…</p>`;
    }
    if (sub.status === "note_provisoire") {
      return `<p class="ai-student-msg">Travail reçu. Votre professeur validera la note finale.</p>`;
    }
    if (sub.status === "valide" && sub.finalGrade != null) {
      return `<p class="ai-student-msg ai-student-msg--ok">Note : ${esc(sub.finalGrade)}/20</p>`;
    }
    return "";
  }

  function renderProfessorSubmissionBody(sub, esc, options) {
    let body = options.simple ? "" : renderFlowStep(sub.status === "valide" ? 5 : 4);
    if (sub.status === "rejete") {
      const rejectMsg = sub.professorComment || sub.aiComments?.[0] || REJECT_MSG_NO_SOURCE;
      body += `<p class="ai-reject-msg">✕ ${esc(rejectMsg)}</p>`;
      return body;
    }
    if (sub.status === "note_provisoire" && sub.provisionalGrade != null) {
      const brief =
        sub.aiBriefForProf && sub.aiBriefForProf.length
          ? sub.aiBriefForProf
          : [`Suggestion IA : ${sub.provisionalGrade}/20 (non définitive).`];
      body += `<div class="ai-prof-brief">
        <p class="ai-prof-brief__title">Aide à la décision (concis)</p>
        <ul class="ai-prof-brief__list">${brief.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
      </div>`;
    }
    if (sub.status === "valide" && sub.finalGrade != null) {
      body += `<p class="ai-student-msg ai-student-msg--ok">Note validée : ${esc(sub.finalGrade)}/20</p>`;
    }
    if (options.validate && sub.status === "note_provisoire") {
      body += `<form class="ai-validate-form" data-validate-id="${esc(sub.id)}">
        <p class="ai-validate-hint">Vous seul décidez de la note finale.</p>
        <label>Suggestion IA (/20)<input type="number" class="fi" name="finalGrade" min="0" max="20" step="0.5" value="${sub.provisionalGrade}" /></label>
        <label>Votre commentaire<textarea class="fi" name="comment" rows="2" placeholder="Observations courtes…"></textarea></label>
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">
          <button type="submit" class="btn btn--role btn--sm" data-action="validate">✓ Valider la note</button>
          <button type="button" class="btn btn--ghost btn--sm" data-action="modify">✎ Modifier & valider</button>
          <button type="button" class="btn btn--ghost btn--sm" data-action="reject" style="color:#b91c1c">✕ Rejeter</button>
        </div>
      </form>`;
    }
    return body;
  }

  function buildRejection(reason, message) {
    return {
      status: "rejete",
      rejectionReason: reason,
      provisionalGrade: null,
      originalityScore: null,
      aiComments: [message],
      aiStrengths: [],
      aiWeaknesses: [],
      aiBriefForProf: [message],
      rubricScores: null,
      aiProgress: 100,
      usedReference: false,
      professorComment: message,
    };
  }

  function extractReferenceSections(refText) {
    const blocks = String(refText || "")
      .split(/\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 8);
    if (blocks.length >= 2) return blocks;
    return String(refText || "")
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20);
  }

  function sectionMatchRatio(studentNorm, section) {
    const keyWords = [...new Set(normText(section).match(/\w{4,}/g) || [])].slice(0, 12);
    if (!keyWords.length) return 0;
    const hits = keyWords.filter((w) => studentNorm.includes(w)).length;
    return hits / keyWords.length;
  }

  function analyzeLocally(text, courseName, title, correctionBundle) {
    if (!correctionBundle?.source) {
      return buildRejection("NO_CORRECTION_SOURCE", REJECT_MSG_NO_SOURCE);
    }

    const reference = correctionBundle.source;
    const mode = correctionBundle.mode || "prof_reference";
    const content = String(text || "").trim();
    const refText = String(reference.referenceText || "").trim();
    const criteriaNotes = String(reference.criteriaNotes || "").trim();
    const studentNorm = normText(content);
    const refNorm = normText(refText);

    const refSections = extractReferenceSections(refText);
    const missingElements = [];
    let matchedSections = 0;
    refSections.forEach((section) => {
      const ratio = sectionMatchRatio(studentNorm, section);
      if (ratio >= 0.32) matchedSections += 1;
      else missingElements.push(section.slice(0, 100) + (section.length > 100 ? "…" : ""));
    });

    const sectionRatio = refSections.length ? matchedSections / refSections.length : 0;
    const refWords = new Set(refNorm.match(/\w{4,}/g) || []);
    const stuWords = new Set(studentNorm.match(/\w{4,}/g) || []);
    const overlap = refWords.size ? [...refWords].filter((w) => stuWords.has(w)).length / refWords.size : 0;

    let score = refSections.length ? sectionRatio * 14 + overlap * 6 : overlap * 20;
    if (criteriaNotes && /plagiat|copie|similarit/i.test(criteriaNotes) && overlap > 0.92) {
      score -= 2;
    }
    score = Math.min(20, Math.max(0, Math.round(score * 10) / 10));

    const comments =
      mode === "web_research"
        ? [
            "Copie professeur absente — correction par recherche internet automatique (sources ouvertes fiables).",
            "L'orthographe n'est pas pénalisée ; seules les réponses factuelles et le fond sont évalués.",
            `Conformité aux éléments trouvés : ${Math.round(sectionRatio * 100)} %.`,
            `Alignement avec les références documentaires : ${Math.round(overlap * 100)} %.`,
          ]
        : [
            "Correction effectuée selon la copie de référence du professeur (orthographe non prise en compte).",
            `Éléments attendus retrouvés : ${Math.round(sectionRatio * 100)} %.`,
            `Alignement avec le modèle : ${Math.round(overlap * 100)} %.`,
          ];
    if (criteriaNotes) {
      comments.push(`Consignes : ${criteriaNotes.slice(0, 300)}${criteriaNotes.length > 300 ? "…" : ""}`);
    }

    const strengths = [];
    const weaknesses = [];
    if (sectionRatio >= 0.65) {
      strengths.push(
        mode === "web_research"
          ? "Réponses alignées sur des sources documentaires fiables"
          : "La plupart des éléments de la copie modèle sont présents"
      );
    } else {
      weaknesses.push(
        mode === "web_research"
          ? "Certaines réponses s'écartent des sources trouvées sur internet"
          : "Plusieurs éléments attendus dans la copie de référence sont absents"
      );
    }
    if (overlap >= 0.35) {
      strengths.push(
        mode === "web_research"
          ? "Concepts et vocabulaire cohérents avec le domaine"
          : "Contenu aligné sur le modèle de correction"
      );
    } else {
      weaknesses.push(
        mode === "web_research"
          ? "Réponses incomplètes ou éloignées des références du domaine"
          : "Écart important par rapport à la copie de référence du professeur"
      );
    }
    if (!content.length) {
      weaknesses.push("Aucun contenu textuel détecté dans le dépôt");
      score = 0;
    }
    if (missingElements.length && missingElements.length <= 4) {
      weaknesses.push(
        "Points à revoir : " + missingElements.slice(0, 3).join(" · ")
      );
    }

    const aiBriefForProf = buildProfBrief(
      mode,
      score,
      sectionRatio,
      overlap,
      strengths,
      weaknesses
    );

    return {
      provisionalGrade: score,
      originalityScore: Math.min(99, Math.max(40, Math.round(55 + overlap * 35))),
      aiComments: comments,
      aiStrengths: strengths,
      aiWeaknesses: weaknesses,
      aiBriefForProf,
      rubricScores: {
        conformite_reference: Math.round(sectionRatio * 20 * 10) / 10,
        alignement_modele: Math.round(overlap * 20 * 10) / 10,
      },
      aiProgress: 100,
      status: "note_provisoire",
      usedReference: mode === "prof_reference",
      usedWebResearch: mode === "web_research",
      researchSources: reference.sources || [],
      correctionMode: mode,
    };
  }

  async function syncGradesAfterValidation(sub, validator) {
    if (!sub || sub.status !== "valide" || sub.finalGrade == null) return null;
    const finalGrade = Number(sub.finalGrade);
    if (!Number.isFinite(finalGrade)) return null;
    const cc = Math.round(finalGrade * 2.5 * 10) / 10;
    const exam = 0;
    const avg =
      typeof EVOSU_GRADES !== "undefined" ? EVOSU_GRADES.computeAvg(cc, exam) : finalGrade;
    const status =
      typeof EVOSU_GRADES !== "undefined" ? EVOSU_GRADES.computeStatus(avg) : avg >= 10 ? "Validé" : "Rattrapage";
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

    if (typeof EVOSU_API !== "undefined" && (await EVOSU_API.ensureOnline())) {
      if (typeof EVOSU_GRADES !== "undefined") {
        await EVOSU_GRADES.syncFromServer(validator);
        row = EVOSU_GRADES.getAll().find(
          (g) =>
            (g.studentEmail || "").toLowerCase() === (sub.studentEmail || "").toLowerCase() &&
            g.courseCode === sub.courseCode &&
            g.semester === semester
        );
      }
    }

    if (!row && typeof EVOSU_GRADES !== "undefined") {
      row = await EVOSU_GRADES.upsertGrade(
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
    if (typeof EVOSU_GRADE_SHEET !== "undefined") {
      sheet = EVOSU_GRADE_SHEET.createFromValidation(sub, row, validator);
    }
    window.dispatchEvent(
      new CustomEvent("EvoSU:grades-updated", {
        detail: { submission: sub, grade: row, sheet },
      })
    );
    return row;
  }

  async function extractSubmissionText(file) {
    if (!file || !file.size) return "";
    if (/\.(txt|md)$/i.test(file.name || "")) {
      return String(await readTextFile(file)).trim();
    }
    return "";
  }

  async function submitWork(student, data, file) {
    let text = String(data.textContent || data.text || "").trim();
    if (!text && file) {
      text = await extractSubmissionText(file);
    }
    if (!text) {
      throw new Error(
        "Collez le texte de votre travail dans le champ prévu, ou joignez un fichier TXT."
      );
    }

    const payload = {
      ...data,
      textContent: text,
      assignmentTitle: data.assignmentTitle || data.courseName || data.courseCode,
    };

    const reference = await findReference(
      student.universite,
      payload.courseCode,
      payload.assignmentTitle,
      payload.professorEmail,
      payload.semester,
      payload.courseName
    );
    const correctionBundle = await resolveCorrectionSource(reference, payload);
    if (!correctionBundle) {
      const err = new Error(REJECT_MSG_NO_SOURCE);
      err.code = "NO_CORRECTION_SOURCE";
      throw err;
    }

    const analysis = analyzeLocally(
      text,
      payload.courseName,
      payload.assignmentTitle,
      correctionBundle
    );
    const sub = {
      id: uid(),
      studentEmail: student.email || student.identifiant,
      studentName: [student.prenom, student.nom].filter(Boolean).join(" ") || student.displayName,
      studentMatricule: student.matricule,
      professorEmail: payload.professorEmail,
      universite: student.universite,
      filiere: student.filiere,
      niveau: student.niveau,
      courseCode: payload.courseCode,
      courseName: payload.courseName,
      classe: payload.classe,
      semester: payload.semester || "s1-2025",
      assignmentTitle: payload.assignmentTitle,
      textContent: text.slice(0, 500),
      fileType: payload.fileType || (file ? file.type : "text"),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...analysis,
    };
    const list = getLocal();
    list.unshift(sub);
    saveLocal(list);
    localStorage.removeItem(studentHistoryClearedKey(student.email || student.identifiant));

    if (typeof EVOSU_API !== "undefined" && (await EVOSU_API.ensureOnline())) {
      try {
        await EVOSU_API.platformRequest("/platform/corrections/submit", {
          method: "POST",
          body: JSON.stringify({ ...payload, correctionMode: correctionBundle.mode }),
        });
      } catch {
        /* correction locale déjà enregistrée */
      }
    }

    return sub;
  }

  function studentHistoryClearedKey(email) {
    return "EVOSU_ai_cleared_" + String(email || "").toLowerCase();
  }

  async function deleteStudentSubmission(student, submissionId) {
    const email = (student.email || student.identifiant || "").toLowerCase();
    const list = getLocal();
    const target = list.find((s) => s.id === submissionId);
    if (!target || (target.studentEmail || "").toLowerCase() !== email) {
      throw new Error("Travail introuvable.");
    }
    saveLocal(list.filter((s) => s.id !== submissionId));
    if (typeof EVOSU_API !== "undefined" && (await EVOSU_API.ensureOnline())) {
      try {
        await EVOSU_API.platformRequest(`/platform/corrections/${submissionId}`, {
          method: "DELETE",
        });
      } catch {
        /* supprimé localement */
      }
    }
  }

  async function clearStudentHistory(student) {
    const email = (student.email || student.identifiant || "").toLowerCase();
    saveLocal(getLocal().filter((s) => (s.studentEmail || "").toLowerCase() !== email));
    localStorage.setItem(studentHistoryClearedKey(email), String(Date.now()));
    if (typeof EVOSU_API !== "undefined" && (await EVOSU_API.ensureOnline())) {
      try {
        await EVOSU_API.platformRequest("/platform/corrections/me", { method: "DELETE" });
      } catch {
        /* historique local effacé */
      }
    }
  }

  async function listForStudent(student) {
    const email = (student.email || student.identifiant || "").toLowerCase();
    const local = getLocal().filter((s) => (s.studentEmail || "").toLowerCase() === email);
    if (!local.length && localStorage.getItem(studentHistoryClearedKey(email))) {
      return [];
    }
    if (typeof EVOSU_API !== "undefined" && (await EVOSU_API.ensureOnline())) {
      try {
        const json = await EVOSU_API.platformRequest("/platform/corrections/me");
        const apiSubs = json.submissions || [];
        const merged = [...local];
        apiSubs.forEach((sub) => {
          if (!merged.some((item) => item.id === sub.id)) merged.push(sub);
        });
        return merged.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      } catch {
        return local.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      }
    }
    return local.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }

  async function listPendingProfessor(prof) {
    if (typeof EVOSU_API !== "undefined" && (await EVOSU_API.ensureOnline())) {
      const json = await EVOSU_API.platformRequest("/platform/corrections/pending");
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
    if (typeof EVOSU_API !== "undefined" && (await EVOSU_API.ensureOnline())) {
      const json = await EVOSU_API.platformRequest(
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
    if (typeof EVOSU_API !== "undefined" && (await EVOSU_API.ensureOnline())) {
      const q = classe ? `?classe=${encodeURIComponent(classe)}` : "";
      return EVOSU_API.platformRequest("/platform/corrections/stats/class" + q);
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

  function courseDisplayName(courseOrSub) {
    if (typeof EVOSU_COURSES !== "undefined" && EVOSU_COURSES.pickCourseTitle) {
      return EVOSU_COURSES.pickCourseTitle(courseOrSub);
    }
    const name = String(courseOrSub?.courseName || "").trim();
    const code = String(courseOrSub?.courseCode || "").trim();
    if (name && normText(name) !== normText(code)) return name;
    return name || "Cours";
  }

  function renderSubmissionCard(sub, options = {}) {
    const esc = (s) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const isStudent = options.audience === "student" || (options.simple && !options.validate);
    let body = isStudent
      ? renderStudentSubmissionBody(sub, esc)
      : renderProfessorSubmissionBody(sub, esc, options);

    if (isStudent && sub.id) {
      body += `<div class="ai-student-actions">
        <button type="button" class="btn btn--ghost btn--sm ai-student-delete" data-delete-sub="${esc(sub.id)}">Supprimer</button>
      </div>`;
    }

    const courseLabel = courseDisplayName(sub);

    return `<article class="ai-sub-card" data-sub-id="${esc(sub.id || "")}">
      <div class="ai-sub-card__head">
        <div>
          <div class="ai-sub-card__title">${esc(courseLabel)}</div>
          <div class="ai-sub-card__meta">${esc(sub.studentName || sub.studentEmail)}</div>
        </div>
        <span class="ai-status ${statusClass(sub.status)}">${esc(statusLabel(sub.status))}</span>
      </div>
      ${body}
    </article>`;
  }

  function mountStudentUI(container, student, courses) {
    if (!container) return;
    const facultyCourses = (courses || []).filter((c) => c?.courseCode);
    const courseOptions = facultyCourses
      .map((c) => {
        const name = courseDisplayName(c);
        const prof = c.professorName ? ` · ${c.professorName}` : "";
        return `<option value="${c.courseCode}" data-name="${name}" data-classe="${c.classe || ""}" data-prof="${c.professorEmail || ""}">${name}${prof}</option>`;
      })
      .join("");

    container.innerHTML = `
      <div class="panel ai-deposit-panel">
        <div class="panel__head ai-deposit-panel__head">
          <h2>Déposer un travail</h2>
        </div>
        <div class="panel__body">
          ${
            facultyCourses.length
              ? `<form id="aiSubmitForm" class="ai-deposit__form">
            <div class="ai-form-grid">
              <div class="ai-field ai-field--full">
                <label class="ai-field__label" for="aiCourseSelect"><span class="ai-field__icon">📚</span> Cours concerné</label>
                <select class="ai-field__input" id="aiCourseSelect" name="courseCode" required>${courseOptions}</select>
                <span class="ai-field__hint">Choisissez le cours par son intitulé (nom complet).</span>
              </div>
              <div class="ai-field ai-field--full">
                <label class="ai-field__label" for="aiTextContent"><span class="ai-field__icon">📝</span> Votre travail (texte)</label>
                <textarea class="ai-field__textarea" id="aiTextContent" name="textContent" rows="10" placeholder="Collez ici votre dissertation ou réponses…" required></textarea>
              </div>
              <div class="ai-field ai-field--full">
                <span class="ai-field__label"><span class="ai-field__icon">📎</span> Fichier (optionnel, TXT)</span>
                <div class="ai-file-upload" id="aiFileUpload">
                  <input class="ai-file-upload__input" type="file" id="aiFileInput" name="file" accept=".txt,.md" />
                  <label class="ai-file-upload__zone" for="aiFileInput">
                    <span class="ai-file-upload__icon">📁</span>
                    <span class="ai-file-upload__text">Joindre un fichier texte</span>
                    <span class="ai-file-upload__hint">TXT ou MD — le texte sera lu automatiquement</span>
                  </label>
                  <span class="ai-file-upload__name" id="aiFileName">Aucun fichier sélectionné</span>
                </div>
              </div>
            </div>
            <div class="ai-deposit__actions">
              <button type="submit" class="ai-submit-btn">
                <span class="ai-submit-btn__icon">📤</span>
                <span>Déposer</span>
              </button>
            </div>
          </form>`
              : `<p class="pub-empty">Aucun cours disponible pour votre faculté. Les professeurs doivent d'abord inscrire leurs cours lors de leur inscription.</p>`
          }
        </div>
      </div>
      <div class="panel" style="margin-top:1rem;">
        <div class="panel__head ai-student-history__head">
          <h2>Mes travaux</h2>
          <button type="button" class="btn btn--ghost btn--sm" id="aiClearHistory">Effacer l'historique</button>
        </div>
        <div class="panel__body" id="aiStudentList"><p class="pub-empty">Chargement…</p></div>
      </div>`;

    function bindStudentHistoryActions() {
      container.querySelector("#aiClearHistory")?.addEventListener("click", async () => {
        if (!confirm("Effacer tout votre historique de dépôts IA ? Cette action est définitive.")) return;
        try {
          await clearStudentHistory(student);
          await refresh();
        } catch (err) {
          alert(err.message || "Impossible d'effacer l'historique.");
        }
      });
      container.querySelectorAll("[data-delete-sub]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!confirm("Supprimer ce dépôt de votre historique ?")) return;
          try {
            await deleteStudentSubmission(student, btn.dataset.deleteSub);
            await refresh();
          } catch (err) {
            alert(err.message || "Impossible de supprimer ce dépôt.");
          }
        });
      });
    }

    async function refresh() {
      const listEl = container.querySelector("#aiStudentList");
      const subs = await listForStudent(student);
      listEl.innerHTML = subs.length
        ? subs.map((s) => renderSubmissionCard(s, { audience: "student" })).join("")
        : '<p class="pub-empty">Aucun travail déposé.</p>';
      bindStudentHistoryActions();
    }

    if (!facultyCourses.length) {
      refresh();
      return { refresh };
    }

    const fileInput = container.querySelector("#aiFileInput");
    const fileNameEl = container.querySelector("#aiFileName");
    const fileUploadEl = container.querySelector("#aiFileUpload");

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (file) {
        fileNameEl.textContent = file.name;
        fileNameEl.classList.add("ai-file-upload__name--selected");
        fileUploadEl.classList.add("ai-file-upload--has-file");
        if (/\.(txt|md)$/i.test(file.name)) {
          const text = await readTextFile(file);
          const ta = container.querySelector("#aiTextContent");
          if (ta && !ta.value.trim()) ta.value = text;
        }
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
      btnLabel.textContent = "Envoi en cours…";
      try {
        await submitWork(
          student,
          {
            courseCode: fd.get("courseCode"),
            courseName: courseDisplayName({
              courseCode: fd.get("courseCode"),
              courseName: opt?.dataset?.name || "",
            }),
            classe: opt?.dataset?.classe || "",
            assignmentTitle: courseDisplayName({
              courseCode: fd.get("courseCode"),
              courseName: opt?.dataset?.name || "",
            }),
            textContent: fd.get("textContent"),
            semester: "s1-2025",
            professorEmail: opt?.dataset?.prof || student.professorEmail,
          },
          file && file.size ? file : null
        );
        e.target.reset();
        fileNameEl.textContent = "Aucun fichier sélectionné";
        fileNameEl.classList.remove("ai-file-upload__name--selected");
        fileUploadEl.classList.remove("ai-file-upload--has-file");
        await refresh();
        alert("Travail déposé. Votre professeur validera la note finale.");
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
          <p class="ai-deposit__intro">Déposez une copie corrigée pour guider l'IA. Si vous ne déposez pas de copie, l'agent EvoSU fera une <strong>recherche internet automatique</strong> pour corriger les travaux selon des sources fiables du domaine (sans pénaliser l'orthographe).</p>
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
          <p class="page-desc" style="margin:0 0 1rem;font-size:0.88rem;">L'IA propose une suggestion courte. <strong>Vous seul validez la note finale.</strong></p>
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
          <p class="page-desc" style="margin:0 0 1rem;font-size:0.88rem;">
            L'IA aide avec une suggestion brève. <strong>Vous validez la note finale.</strong>
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
    deleteStudentSubmission,
    clearStudentHistory,
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

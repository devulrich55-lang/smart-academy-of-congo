/**
 * Documents & réactions — API sécurisée + repli localStorage
 */
const SAC_DATA = (function () {
  const STORAGE_KEY = "sac_documents";
  const DOC_VIEWED_SESSION_KEY = "sac_doc_viewed_session";
  const ANON_VIEWER_KEY = "sac_anon_viewer";
  const PUBLISH_ROLES = ["professeur", "assistant", "universite", "section"];
  const SOURCE_BY_ROLE = {
    professeur: "professeur",
    assistant: "assistant",
    universite: "administration",
    section: "administration",
  };

  function universiteMatchDoc(a, b) {
    if (typeof SAC_SECTIONS !== "undefined" && SAC_SECTIONS.universiteMatches) {
      return SAC_SECTIONS.universiteMatches(a, b);
    }
    return String(a || "") === String(b || "");
  }

  let cache = null;
  let useApi = false;
  let readyPromise = null;

  const DEFAULT_DOCS = [
    {
      id: "doc-1",
      title: "Syllabus — Introduction à l'économie",
      description: "Programme ECO101 — visible uniquement L2 Gestion",
      source: "professeur",
      author: "Dr. Mukendi",
      authorId: "prof.mukendi@unikin.cd",
      date: "2025-09-12",
      mediaCategory: "document",
      type: "PDF",
      size: "1,2 Mo",
      audienceType: "ma_classe",
      universite: "unkin",
      filiere: "Sciences économiques — Gestion",
      niveau: "l2",
      courseCode: "ECO101",
      courseName: "Introduction à l'économie",
      classe: "L2 Gestion — Groupe A",
      allowReactions: true,
      reactions: { useful: [], question: [], thanks: [] },
    },
    {
      id: "doc-3",
      title: "Calendrier examens — Campus",
      description: "Tous les étudiants du campus",
      source: "administration",
      author: "Secrétariat",
      authorId: "admin@unikin.cd",
      date: "2025-11-01",
      mediaCategory: "document",
      type: "PDF",
      audienceType: "campus",
      universite: "unkin",
      allowReactions: false,
      reactions: { useful: [], question: [], thanks: [] },
    },
  ];

  function uid() {
    return "doc-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function initLocal() {
    if (typeof SAC_STORAGE !== "undefined" && SAC_STORAGE.cacheGetJson) {
      const parsed = SAC_STORAGE.cacheGetJson(STORAGE_KEY, null);
      if (parsed) return parsed;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      saveLocal(DEFAULT_DOCS);
      return DEFAULT_DOCS.slice();
    }
    try {
      return JSON.parse(raw);
    } catch {
      saveLocal(DEFAULT_DOCS);
      return DEFAULT_DOCS.slice();
    }
  }

  function saveLocal(docs) {
    cache = docs;
    if (typeof SAC_STORAGE !== "undefined" && SAC_STORAGE.cacheSetJson) {
      SAC_STORAGE.cacheSetJson(STORAGE_KEY, docs || []);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
  }

  async function refreshFromServer() {
    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
      try {
        useApi = true;
        const docs = await SAC_API.getDocuments();
        cache = (docs || []).map((d) => normalizeDocument(resolveDocMediaUrls(d)));
        return cache;
      } catch (err) {
        console.warn("[SAC_DATA] refreshFromServer:", err.message || err);
      }
    }
    return getAll();
  }

  async function ensureReady() {
    if (!readyPromise) {
      readyPromise = (async () => {
        if (typeof SAC_API !== "undefined") {
          useApi = await SAC_API.ensureOnline();
          if (useApi) {
            try {
              await refreshFromServer();
              return;
            } catch {
              useApi = false;
            }
          }
        }
        cache = initLocal().map(normalizeDocument);
      })();
    }
    await readyPromise;
  }

  function getAll() {
    return (cache || initLocal()).map(normalizeDocument);
  }

  function getById(id) {
    return getAll().find((d) => d.id === id);
  }

  function getForStudent(student) {
    const session =
      typeof SAC_SESSION !== "undefined" ? SAC_SESSION.getSession() : null;
    if (useApi && session?.role === "etudiant") {
      return getAll();
    }
    return getAll().filter((d) => SAC_COURSES.studentSeesDocument(student, d));
  }

  /** Publications professeurs et assistants visibles par l'étudiant */
  function getTeachingForStudent(student) {
    return getForStudent(student).filter(
      (d) => d.source === "professeur" || d.source === "assistant"
    );
  }

  /** Publications administration université (campus) — profil étudiants de l'établissement */
  function isCampusWideAdminDoc(doc, studentUni) {
    if (!doc || doc.source !== "administration") return false;
    if (doc.audienceType === "section") return false;
    if (!doc.universite) return true;
    return universiteMatchDoc(doc.universite, studentUni);
  }

  function getCampusPublicationsForStudent(student) {
    const uni = student?.universite || "";
    return getForStudent(student).filter((d) => isCampusWideAdminDoc(d, uni));
  }

  /** Annonces campus université — personnel (professeur / assistant) */
  function getCampusPublicationsForStaff(session) {
    const uni = session?.universite || "";
    if (!uni) return [];
    return getAll().filter(
      (d) =>
        d.source === "administration" &&
        d.audienceType !== "section" &&
        universiteMatchDoc(d.universite, uni)
    );
  }

  /** Publications ciblées section créées par l'université */
  function getSectionPublicationsForHead(session) {
    const sectionId = session?.sectionId;
    if (!sectionId) return [];
    return getAll().filter(
      (d) =>
        d.source === "administration" &&
        d.audienceType === "section" &&
        d.sectionId === sectionId
    );
  }

  function getPublicationsByAuthor(session) {
    const src = SOURCE_BY_ROLE[session?.role];
    if (!src) return [];
    const id = session.identifiant || session.userId || "";
    const email = String(session.identifiant || "").toLowerCase();
    return getAll().filter((d) => {
      if (d.source !== src) return false;
      if (!d.authorId) return true;
      const aid = String(d.authorId || "").toLowerCase();
      return (
        d.authorId === id ||
        d.authorId === session.userId ||
        d.authorId === session.identifiant ||
        aid === email ||
        String(d.author || "").toLowerCase() === email
      );
    });
  }

  function canPublish(role) {
    return PUBLISH_ROLES.includes(role);
  }

  function canEdit(session, doc) {
    if (!session || !doc) return false;
    if (session.role === "universite") return doc.source === "administration";
    if (session.role === "section" && doc.audienceType === "section") {
      if (doc.sectionId && session.sectionId && doc.sectionId !== session.sectionId) {
        return false;
      }
      const authorMatch =
        doc.authorId === session.identifiant || doc.authorId === session.userId;
      return doc.source === "administration" && authorMatch;
    }
    const src = SOURCE_BY_ROLE[session.role];
    const authorMatch =
      doc.authorId === session.identifiant || doc.authorId === session.userId;
    return src === doc.source && authorMatch;
  }

  function canDelete(session, doc) {
    return canEdit(session, doc);
  }

  function normalizeDocument(doc) {
    if (!doc) return doc;
    const sourceRaw = doc.source || doc.authorRole || doc.role || "";
    let source = String(sourceRaw || "").toLowerCase();
    if (source === "professor" || source === "prof") source = "professeur";
    if (source === "university" || source === "universite") source = "administration";
    if (!source && doc.audienceType === "campus") source = "administration";
    const normalized = {
      ...doc,
      source: source || doc.source || "professeur",
      audienceType: doc.audienceType || (source === "administration" ? doc.audienceType : "ma_classe"),
      universite: doc.universite || doc.codeUni || doc.sigle || "",
      niveau: doc.niveau ? String(doc.niveau).toLowerCase() : doc.niveau,
      filiere: doc.filiere || "",
      classe: doc.classe || "",
      courseCode: doc.courseCode || "",
      courseName: doc.courseName || "",
      allowReactions:
        doc.allowReactions !== false &&
        (doc.source === "professeur" ||
          doc.source === "assistant" ||
          source === "professeur" ||
          source === "assistant"),
      reactions: doc.reactions || { useful: [], question: [], thanks: [] },
      attachments: Array.isArray(doc.attachments) ? doc.attachments : [],
      viewCount: Number(doc.viewCount || 0),
      uniqueViewCount: Number(doc.uniqueViewCount || doc.viewCount || 0),
    };
    return normalized;
  }

  function resolveDocMediaUrls(doc) {
    if (!doc || typeof SAC_API === "undefined" || typeof SAC_API.getBase !== "function") {
      return normalizeDocument(doc);
    }
    const base = SAC_API.getBase();
    if (!base) return normalizeDocument(doc);
    const fix = (url) =>
      url && String(url).startsWith("/uploads/") ? base + url : url;
    return normalizeDocument({
      ...doc,
      mediaUrl: fix(doc.mediaUrl),
      attachments: (doc.attachments || []).map((a) => ({
        ...a,
        mediaUrl: fix(a.mediaUrl),
      })),
    });
  }

  async function refreshCache() {
    await refreshFromServer();
  }

  async function create(session, data, fileOrFiles) {
    if (!canPublish(session.role)) {
      throw new Error("Publication non autorisée pour ce profil.");
    }

    const uploadFiles = fileOrFiles
      ? Array.isArray(fileOrFiles)
        ? fileOrFiles
        : [fileOrFiles]
      : [];

    if (useApi) {
      const isCampus = session.role === "universite" && data.audienceType !== "section";
      const isSection = data.audienceType === "section" && data.sectionId;
      const audienceType = isSection ? "section" : isCampus ? "campus" : "ma_classe";
      const doc = await SAC_API.createDocument(
        {
          title: data.title,
          description: data.description,
          mediaCategory: data.mediaCategory,
          type: data.type,
          size: data.size,
          mediaUrl: data.mediaUrl,
          universite: data.universite,
          filiere: data.filiere,
          niveau: data.niveau,
          courseCode: data.courseCode,
          courseName: data.courseName,
          classe: data.classe,
          allowReactions: data.allowReactions,
          author: data.author,
          audienceType,
          sectionId: data.sectionId,
          sectionName: data.sectionName,
        },
        uploadFiles.length ? uploadFiles : null
      );
      await refreshCache();
      return resolveDocMediaUrls(doc);
    }

    const isCampus = session.role === "universite" && data.audienceType !== "section";
    const isSection = data.audienceType === "section" && data.sectionId;
    const doc = {
      id: uid(),
      title: data.title,
      description: data.description || "",
      source: SOURCE_BY_ROLE[session.role],
      author:
        data.author ||
        (typeof SAC_IDENTITY !== "undefined"
          ? SAC_IDENTITY.getDisplayName(session)
          : session.displayName || session.nom) ||
        session.identifiant,
      authorId: session.identifiant,
      date: new Date().toISOString().slice(0, 10),
      mediaCategory: data.mediaCategory || "document",
      type: data.type || "PDF",
      size: data.size || "—",
      mediaUrl: data.mediaUrl || "",
      attachments: data.attachments || [],
      audienceType: isSection ? "section" : isCampus ? "campus" : "ma_classe",
      sectionId: data.sectionId || "",
      sectionName: data.sectionName || "",
      universite: data.universite || session.universite || "",
      filiere: data.filiere || "",
      niveau: data.niveau || "",
      courseCode: data.courseCode || "",
      courseName: data.courseName || "",
      classe: data.classe || "",
      allowReactions: !isCampus && !!data.allowReactions,
      reactions: { useful: [], question: [], thanks: [] },
      updatedAt: new Date().toISOString(),
    };
    const docs = getAll();
    docs.unshift(doc);
    saveLocal(docs);
    return normalizeDocument(doc);
  }

  async function update(session, id, data) {
    if (useApi) {
      const doc = await SAC_API.updateDocument(id, data);
      await refreshCache();
      return doc;
    }

    const docs = getAll();
    const i = docs.findIndex((d) => d.id === id);
    if (i === -1 || !canEdit(session, docs[i])) return null;
    docs[i] = {
      ...docs[i],
      title: data.title ?? docs[i].title,
      description: data.description ?? docs[i].description,
      mediaCategory: data.mediaCategory ?? docs[i].mediaCategory,
      type: data.type ?? docs[i].type,
      size: data.size ?? docs[i].size,
      mediaUrl: data.mediaUrl !== undefined ? data.mediaUrl : docs[i].mediaUrl,
      filiere: data.filiere ?? docs[i].filiere,
      niveau: data.niveau ?? docs[i].niveau,
      courseCode: data.courseCode ?? docs[i].courseCode,
      courseName: data.courseName ?? docs[i].courseName,
      classe: data.classe ?? docs[i].classe,
      allowReactions:
        data.allowReactions !== undefined ? data.allowReactions : docs[i].allowReactions,
      updatedAt: new Date().toISOString(),
    };
    saveLocal(docs);
    return docs[i];
  }

  async function remove(session, id) {
    if (useApi) {
      await SAC_API.deleteDocument(id);
      await refreshCache();
      return true;
    }

    const docs = getAll();
    const doc = docs.find((d) => d.id === id);
    if (!doc || !canDelete(session, doc)) return false;
    saveLocal(docs.filter((d) => d.id !== id));
    return true;
  }

  function canReact(doc) {
    return doc.allowReactions && (doc.source === "professeur" || doc.source === "assistant");
  }

  async function addReaction(docId, type, studentId) {
    if (useApi) {
      const doc = await SAC_API.addReaction(docId, type);
      await refreshCache();
      return doc;
    }

    const valid = ["useful", "question", "thanks"];
    if (!valid.includes(type)) return null;
    const docs = getAll();
    const i = docs.findIndex((d) => d.id === docId);
    if (i === -1 || !canReact(docs[i])) return null;
    const reactions = docs[i].reactions || { useful: [], question: [], thanks: [] };
    ["useful", "question", "thanks"].forEach((t) => {
      reactions[t] = (reactions[t] || []).filter((id) => id !== studentId);
    });
    reactions[type] = reactions[type] || [];
    if (!reactions[type].includes(studentId)) reactions[type].push(studentId);
    docs[i].reactions = reactions;
    saveLocal(docs);
    return docs[i];
  }

  function getUserReaction(doc, studentId) {
    if (!doc.reactions) return null;
    for (const t of ["useful", "question", "thanks"]) {
      if ((doc.reactions[t] || []).includes(studentId)) return t;
    }
    return null;
  }

  function reactionCounts(doc) {
    const r = doc.reactions || {};
    return {
      useful: (r.useful || []).length,
      question: (r.question || []).length,
      thanks: (r.thanks || []).length,
    };
  }

  function getViewerKey() {
    try {
      const session =
        typeof SAC_SESSION !== "undefined" && SAC_SESSION.getSession
          ? SAC_SESSION.getSession()
          : JSON.parse(localStorage.getItem("sac_session") || "null");
      if (session?.identifiant) return "u:" + String(session.identifiant).trim().toLowerCase();
      let key = localStorage.getItem(ANON_VIEWER_KEY);
      if (!key) {
        key =
          "a:" +
          (typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : "v" + Date.now().toString(36));
        localStorage.setItem(ANON_VIEWER_KEY, key);
      }
      return key;
    } catch {
      return "a:anon";
    }
  }

  function formatViewStats(doc) {
    const people = Number(doc.uniqueViewCount || doc.viewCount || 0);
    const total = Number(doc.viewCount || 0);
    if (!people && !total) return "";
    const label = people === 1 ? "personne" : "personnes";
    const title = total > people ? total + " consultation(s) au total" : "Lecteurs uniques";
    return `<span class="doc-views" title="${title.replace(/"/g, "&quot;")}">👁️ ${people} ${label}</span>`;
  }

  function _patchDocViews(docId, result) {
    if (!docId || !result) return;
    const docs = getAll();
    const idx = docs.findIndex((d) => d.id === docId);
    if (idx >= 0) {
      docs[idx] = {
        ...docs[idx],
        viewCount: result.viewCount ?? docs[idx].viewCount,
        uniqueViewCount: result.uniqueViewCount ?? docs[idx].uniqueViewCount,
      };
      if (useApi) cache = docs;
      else saveLocal(docs);
    }
    document.querySelectorAll(`[data-doc-id="${docId}"] .doc-views`).forEach((el) => {
      const people = result.uniqueViewCount || result.viewCount || 0;
      const label = people === 1 ? "personne" : "personnes";
      el.textContent = `👁️ ${people} ${label}`;
    });
  }

  async function trackDocumentView(docId) {
    if (!docId) return;
    let viewed = [];
    try {
      viewed = JSON.parse(sessionStorage.getItem(DOC_VIEWED_SESSION_KEY) || "[]");
    } catch {
      viewed = [];
    }
    if (viewed.includes(docId)) return;

    if (useApi && typeof SAC_API !== "undefined" && SAC_API.recordDocumentView) {
      try {
        const online = await SAC_API.ensureOnline();
        if (!online) return;
        const result = await SAC_API.recordDocumentView(docId, getViewerKey());
        _patchDocViews(docId, result);
        viewed.push(docId);
        sessionStorage.setItem(DOC_VIEWED_SESSION_KEY, JSON.stringify(viewed));
      } catch (err) {
        console.warn("[SAC_DATA] view", err.message || err);
      }
      return;
    }

    const docs = getAll();
    const idx = docs.findIndex((d) => d.id === docId);
    if (idx < 0) return;
    docs[idx] = {
      ...docs[idx],
      viewCount: (docs[idx].viewCount || 0) + 1,
      uniqueViewCount: (docs[idx].uniqueViewCount || 0) + 1,
    };
    saveLocal(docs);
    viewed.push(docId);
    sessionStorage.setItem(DOC_VIEWED_SESSION_KEY, JSON.stringify(viewed));
  }

  function bindDocumentViewTracking(root) {
    if (!root || typeof IntersectionObserver === "undefined") return;
    const items = root.querySelectorAll("[data-doc-id]");
    if (!items.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            const id = entry.target.getAttribute("data-doc-id");
            trackDocumentView(id);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: [0.5, 0.7] }
    );
    items.forEach((el) => observer.observe(el));
  }

  function sumPublicationViews(filterFn) {
    return getAll()
      .filter(filterFn || (() => true))
      .reduce(
        (acc, d) => ({
          people: acc.people + Number(d.uniqueViewCount || d.viewCount || 0),
          views: acc.views + Number(d.viewCount || 0),
        }),
        { people: 0, views: 0 }
      );
  }

  function init() {
    if (!cache) cache = initLocal();
  }

  return {
    init,
    ensureReady,
    refreshFromServer,
    refreshCache,
    getAll,
    getById,
    getForStudent,
    getTeachingForStudent,
    isCampusWideAdminDoc,
    getCampusPublicationsForStudent,
    getCampusPublicationsForStaff,
    getSectionPublicationsForHead,
    getPublicationsByAuthor,
    canPublish,
    canEdit,
    canDelete,
    create,
    update,
    remove,
    canReact,
    addReaction,
    getUserReaction,
    reactionCounts,
    formatViewStats,
    trackDocumentView,
    bindDocumentViewTracking,
    sumPublicationViews,
    SOURCE_BY_ROLE,
    PUBLISH_ROLES,
    isUsingApi: () => useApi,
  };
})();

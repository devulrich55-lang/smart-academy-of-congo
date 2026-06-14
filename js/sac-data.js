/**
 * Documents & réactions — API sécurisée + repli localStorage
 */
const SAC_DATA = (function () {
  const STORAGE_KEY = "sac_documents";
  const PUBLISH_ROLES = ["professeur", "assistant", "universite"];
  const SOURCE_BY_ROLE = {
    professeur: "professeur",
    assistant: "assistant",
    universite: "administration",
  };

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
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_DOCS));
      return JSON.parse(localStorage.getItem(STORAGE_KEY));
    }
    try {
      return JSON.parse(raw);
    } catch {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_DOCS));
      return DEFAULT_DOCS;
    }
  }

  function saveLocal(docs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
    cache = docs;
  }

  async function ensureReady() {
    if (!readyPromise) {
      readyPromise = (async () => {
        if (typeof SAC_API !== "undefined") {
          useApi = await SAC_API.ensureOnline();
          if (useApi) {
            try {
              cache = await SAC_API.getDocuments();
              return;
            } catch {
              useApi = false;
            }
          }
        }
        cache = initLocal();
      })();
    }
    await readyPromise;
  }

  function getAll() {
    return cache || initLocal();
  }

  function getById(id) {
    return getAll().find((d) => d.id === id);
  }

  function getForStudent(student) {
    return getAll().filter((d) => SAC_COURSES.studentSeesDocument(student, d));
  }

  /** Publications professeurs et assistants visibles par l'étudiant */
  function getTeachingForStudent(student) {
    return getForStudent(student).filter(
      (d) => d.source === "professeur" || d.source === "assistant"
    );
  }

  /** Publications administration université (campus) — profil étudiants de l'établissement */
  function getCampusPublicationsForStudent(student) {
    return getForStudent(student).filter(
      (d) =>
        d.source === "administration" &&
        d.audienceType !== "section" &&
        (!d.universite || d.universite === student.universite)
    );
  }

  /** Annonces campus université — personnel (professeur / assistant) */
  function getCampusPublicationsForStaff(session) {
    const uni = session?.universite || "";
    if (!uni) return [];
    return getAll().filter(
      (d) =>
        d.source === "administration" &&
        d.audienceType !== "section" &&
        d.universite === uni
    );
  }

  function getPublicationsByAuthor(session) {
    const src = SOURCE_BY_ROLE[session?.role];
    if (!src) return [];
    const id = session.identifiant || session.userId || "";
    return getAll().filter(
      (d) => d.source === src && (d.authorId === id || !d.authorId)
    );
  }

  function canPublish(role) {
    return PUBLISH_ROLES.includes(role);
  }

  function canEdit(session, doc) {
    if (!session || !doc) return false;
    if (session.role === "universite") return doc.source === "administration";
    const src = SOURCE_BY_ROLE[session.role];
    const authorMatch =
      doc.authorId === session.identifiant || doc.authorId === session.userId;
    return src === doc.source && authorMatch;
  }

  function canDelete(session, doc) {
    return canEdit(session, doc);
  }

  async function refreshCache() {
    if (useApi) cache = await SAC_API.getDocuments();
  }

  async function create(session, data, fileOrFiles) {
    if (!canPublish(session.role)) return null;

    const uploadFiles = fileOrFiles
      ? Array.isArray(fileOrFiles)
        ? fileOrFiles
        : [fileOrFiles]
      : [];

    if (useApi) {
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
          audienceType: data.audienceType,
          sectionId: data.sectionId,
          sectionName: data.sectionName,
        },
        uploadFiles.length ? uploadFiles : null
      );
      await refreshCache();
      return doc;
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
    return doc;
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

  function init() {
    if (!cache) cache = initLocal();
  }

  return {
    init,
    ensureReady,
    getAll,
    getById,
    getForStudent,
    getTeachingForStudent,
    getCampusPublicationsForStudent,
    getCampusPublicationsForStaff,
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
    SOURCE_BY_ROLE,
    PUBLISH_ROLES,
    isUsingApi: () => useApi,
  };
})();

/**
 * Informations officielles — panneau public (index.html)
 * Ministère : publications nationales par catégorie (officiel, gouvernement, concours…)
 * Université : panneau campus (profil étudiants) + espace national
 */
const SAC_HOME_NEWS = (function () {
  const STORAGE_KEY = "sac_home_news";
  const NATIONAL_CODE = "national";
  const MINISTRY_CODE = "ministere";
  const MINISTRY_NAME = "Ministère de l'Enseignement Supérieur et Universitaire (MESU)";
  const SCOPES = { university: "university", national: "national" };
  const AUTHOR_ROLES = { ministry: "ministere", university: "universite" };
  let memoryList = null;
  let syncPromise = null;

  function useApi() {
    return typeof SAC_API !== "undefined" && typeof SAC_API.listHomeNews === "function";
  }

  function invalidateSync() {
    memoryList = null;
    syncPromise = null;
  }

  function getAllFromLocalStorage() {
    const raw = localStorage.getItem(STORAGE_KEY);
    let list;
    if (!raw) {
      list = DEFAULT_NEWS.map((n) => normalizeItem({ ...n }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return list;
    }
    try {
      list = JSON.parse(raw);
    } catch {
      list = DEFAULT_NEWS.map((n) => normalizeItem({ ...n }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return list;
    }
    return list.map(normalizeItem);
  }

  async function syncFromServer() {
    if (!useApi()) {
      memoryList = getAllFromLocalStorage();
      return memoryList;
    }
    try {
      const online = await SAC_API.ensureOnline();
      if (!online) {
        memoryList = getAllFromLocalStorage();
        return memoryList;
      }
      const items = await SAC_API.listHomeNews();
      memoryList = (items || []).map((n) => normalizeItem({ ...n }));
      saveAll(memoryList);
      return memoryList;
    } catch (err) {
      console.warn("[SAC_HOME_NEWS] sync", err.message || err);
      memoryList = getAllFromLocalStorage();
      return memoryList;
    }
  }

  async function ensureSynced() {
    if (memoryList) return memoryList;
    if (!syncPromise) {
      syncPromise = syncFromServer().finally(() => {
        syncPromise = null;
      });
    }
    return syncPromise;
  }

  async function refreshFromServer() {
    invalidateSync();
    return syncFromServer();
  }

  const CATEGORIES = [
    { id: "officiel", label: "Information officielle", icon: "🏛️", color: "#0c3d6e" },
    { id: "gouvernemental", label: "Gouvernement", icon: "🇨🇩", color: "#1e40af" },
    { id: "concours", label: "Concours", icon: "📝", color: "#7c2d12" },
    { id: "opportunite", label: "Opportunité", icon: "💼", color: "#0d7a4a" },
    { id: "bourse", label: "Bourse d'études", icon: "🎓", color: "#b45309" },
    { id: "education", label: "Éducation — info importante", icon: "📢", color: "#6b4c9a" },
  ];

  const DEFAULT_NEWS = [
    {
      id: "hn-min-1",
      scope: SCOPES.national,
      authorRole: AUTHOR_ROLES.ministry,
      universite: MINISTRY_CODE,
      universityName: MINISTRY_NAME,
      authorId: "admin@ministere.cd",
      authorName: "Ministère MESU",
      category: "officiel",
      title: "Communiqué officiel — rentrée académique 2025-2026",
      excerpt:
        "Le Ministère confirme le calendrier national de la rentrée universitaire et les directives pour l'inscription des étudiants dans les établissements agréés.",
      body: "Toutes les universités partenaires SAC doivent publier leurs listes d'admission avant le 15 septembre. Consultez la circulaire complète sur le portail national.",
      linkUrl: "",
      linkLabel: "Lire le communiqué",
      published: true,
      pinned: true,
      validUntil: "",
      createdAt: "2025-11-01T09:00:00.000Z",
      updatedAt: "2025-11-01T09:00:00.000Z",
    },
    {
      id: "hn-demo-1",
      scope: SCOPES.university,
      authorRole: AUTHOR_ROLES.university,
      universite: "unkin",
      universityName: "Université de Kinshasa (UNIKIN)",
      authorId: "admin@unikin.cd",
      authorName: "Administration UNIKIN",
      category: "gouvernemental",
      title: "Calendrier national des examens d'État — session 2025",
      excerpt:
        "Le Ministère de l'Enseignement Supérieur confirme les dates de dépôt des dossiers et les épreuves écrites pour les filières scientifiques et littéraires.",
      body: "Les universités partenaires sont invitées à transmettre les listes définitives des candidats avant le 15 juin. Consultez le communiqué complet sur le portail du MESU.",
      linkUrl: "",
      linkLabel: "En savoir plus",
      published: true,
      pinned: true,
      validUntil: "",
      createdAt: "2025-11-15T10:00:00.000Z",
      updatedAt: "2025-11-15T10:00:00.000Z",
    },
    {
      id: "hn-demo-2",
      scope: SCOPES.university,
      authorRole: AUTHOR_ROLES.university,
      universite: "unkin",
      universityName: "Université de Kinshasa (UNIKIN)",
      authorId: "admin@unikin.cd",
      authorName: "Administration UNIKIN",
      category: "bourse",
      title: "Bourses excellence — Master & Doctorat 2025-2026",
      excerpt:
        "Candidatures ouvertes pour les bourses internes (frais académiques partiels) réservées aux étudiants L3 et Master avec moyenne ≥ 14/20.",
      body: "Dossier : relevé de notes, lettre de motivation, attestation d'inscription. Dépôt en ligne ou au secrétariat central avant le 30 novembre.",
      linkUrl: "",
      linkLabel: "Consulter l'appel",
      published: true,
      pinned: false,
      validUntil: "2025-11-30",
      createdAt: "2025-10-20T08:00:00.000Z",
      updatedAt: "2025-10-20T08:00:00.000Z",
    },
    {
      id: "hn-demo-3",
      scope: SCOPES.university,
      authorRole: AUTHOR_ROLES.university,
      universite: "unilu",
      universityName: "Université de Lubumbashi (UNILU)",
      authorId: "admin@unilu.cd",
      authorName: "Administration UNILU",
      category: "concours",
      title: "Concours d'admission — Faculté de Médecine",
      excerpt: "Épreuves écrites et orales : inscriptions du 1er au 20 décembre. Places limitées.",
      body: "Pièces requises : diplôme d'État, extrait de naissance, photos, frais de dossier. Centre d'examen : campus principal.",
      linkUrl: "",
      linkLabel: "",
      published: true,
      pinned: false,
      validUntil: "2025-12-20",
      createdAt: "2025-10-05T12:00:00.000Z",
      updatedAt: "2025-10-05T12:00:00.000Z",
    },
    {
      id: "hn-demo-4",
      scope: SCOPES.university,
      authorRole: AUTHOR_ROLES.university,
      universite: "unkin",
      universityName: "Université de Kinshasa (UNIKIN)",
      authorId: "admin@unikin.cd",
      authorName: "Administration UNIKIN",
      category: "opportunite",
      title: "Stage rémunéré — partenariat entreprises (Kinshasa)",
      excerpt:
        "20 places pour étudiants L2/L3 en Gestion et Informatique. Durée : 3 mois, indemnité mensuelle.",
      body: "Contact : Direction des relations entreprises. CV et lettre de motivation à envoyer via votre espace étudiant ou par e-mail au secrétariat.",
      linkUrl: "",
      linkLabel: "Postuler",
      published: true,
      pinned: false,
      validUntil: "",
      createdAt: "2025-09-28T09:00:00.000Z",
      updatedAt: "2025-09-28T09:00:00.000Z",
    },
  ];

  function uid() {
    return "hn-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function normalizeItem(item) {
    if (!item) return item;
    if (!item.scope) {
      item.scope =
        item.universite === NATIONAL_CODE || item.universite === MINISTRY_CODE
          ? SCOPES.national
          : SCOPES.university;
    }
    if (!item.authorRole) {
      if (item.universite === MINISTRY_CODE) {
        item.authorRole = AUTHOR_ROLES.ministry;
      } else {
        item.authorRole = AUTHOR_ROLES.university;
      }
    }
    if (item.authorRole === AUTHOR_ROLES.ministry) {
      item.scope = SCOPES.national;
      item.universite = MINISTRY_CODE;
      if (!item.universityName) item.universityName = MINISTRY_NAME;
    }
    return item;
  }

  function isMinistryItem(item) {
    return item?.authorRole === AUTHOR_ROLES.ministry || item?.universite === MINISTRY_CODE;
  }

  function canPublish(session) {
    return session?.role === "universite" || session?.role === "ministere";
  }

  function getAll() {
    if (memoryList) return memoryList.map(normalizeItem);
    return getAllFromLocalStorage();
  }

  function saveAll(list) {
    memoryList = list.map(normalizeItem);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryList));
  }

  function getUniCode(session) {
    return session?.universite || session?.codeUni || "";
  }

  function getUniDisplayName(session) {
    if (typeof SAC_UNIVERSITIES !== "undefined") {
      const id = getUniCode(session);
      const u = SAC_UNIVERSITIES.UNIVERSITIES.find((x) => x.id === id);
      if (u) return `${u.name} (${u.sigle})`;
    }
    return session?.nom || session?.nomUniversite || getUniCode(session) || "Université";
  }

  function categoryMeta(id) {
    return CATEGORIES.find((c) => c.id === id) || CATEGORIES[0];
  }

  function categoryLabel(id) {
    return categoryMeta(id).label;
  }

  function isExpired(item) {
    if (!item.validUntil) return false;
    const end = new Date(item.validUntil + "T23:59:59");
    return end < new Date();
  }

  function getPublished(opts = {}) {
    let list = getAll().filter((n) => n.published !== false && !isExpired(n));
    if (opts.scope === SCOPES.national) {
      list = list.filter((n) => n.scope === SCOPES.national);
    } else if (opts.scope === SCOPES.university) {
      list = list.filter((n) => n.scope === SCOPES.university);
    } else if (opts.publicSite) {
      const uni = opts.universite && opts.universite !== "all" ? opts.universite : null;
      if (!uni) {
        list = list.filter((n) => n.scope === SCOPES.national);
      } else {
        list = list.filter(
          (n) =>
            n.scope === SCOPES.national ||
            (n.scope === SCOPES.university && n.universite === uni)
        );
      }
    }
    if (opts.universite && opts.universite !== "all" && !opts.publicSite) {
      list = list.filter(
        (n) => n.scope === SCOPES.national || n.universite === opts.universite
      );
    }
    if (opts.category && opts.category !== "all") {
      list = list.filter((n) => n.category === opts.category);
    }
    return list.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  /** Annonces « mon université » — visibles sur le profil des étudiants de cet établissement uniquement */
  function getUniversityNewsForStudent(universiteCode) {
    const code = String(universiteCode || "").trim().toLowerCase();
    if (!code) return [];
    return getAll().filter(
      (n) =>
        n.scope === SCOPES.university &&
        String(n.universite || "").toLowerCase() === code &&
        n.published !== false &&
        !isExpired(n)
    );
  }

  /** Fil national — visible par tous les étudiants (profil + site public) */
  function getNationalNewsForStudent() {
    return getNationalPublished();
  }

  function getForUniversity(session, scopeFilter) {
    const code = getUniCode(session);
    const authorId = session.identifiant || session.userId || "";
    return getAll()
      .filter((n) => {
        if (scopeFilter === SCOPES.national) {
          return n.scope === SCOPES.national && !isMinistryItem(n) && n.authorId === authorId;
        }
        if (scopeFilter === SCOPES.university) {
          return n.scope === SCOPES.university && n.universite === code;
        }
        return n.universite === code || (n.scope === SCOPES.national && n.authorId === authorId);
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function getForMinistry() {
    return getAll()
      .filter((n) => isMinistryItem(n))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function getNationalPublished() {
    return getAll()
      .filter((n) => n.scope === SCOPES.national && n.published !== false && !isExpired(n))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function owns(session, item) {
    if (session?.role === "ministere") return isMinistryItem(item);
    if (session?.role !== "universite") return false;
    const authorId = session.identifiant || session.userId || "";
    if (isMinistryItem(item)) return false;
    if (item.scope === SCOPES.national) {
      return item.authorId === authorId;
    }
    return item.universite === getUniCode(session);
  }

  async function create(session, data) {
    const role = session?.role;
    if (!canPublish(session)) {
      throw new Error("Publication réservée au Ministère ou à l'administration universitaire.");
    }

    const payload = { ...data };

    if (useApi()) {
      try {
        const online = await SAC_API.ensureOnline();
        if (online) {
          const item = await SAC_API.createHomeNews(payload);
          await refreshFromServer();
          return normalizeItem(item);
        }
      } catch (err) {
        throw new Error(err.message || "Publication impossible sur le serveur.");
      }
    }

    if (role === "ministere") {
      const cat = categoryMeta(data.category);
      const item = {
        id: uid(),
        scope: SCOPES.national,
        authorRole: AUTHOR_ROLES.ministry,
        universite: MINISTRY_CODE,
        universityName: MINISTRY_NAME,
        authorId: session.identifiant || session.userId || "",
        authorName: session.nom || session.displayName || "Ministère MESU",
        category: cat.id,
        title: (data.title || "").trim(),
        excerpt: (data.excerpt || "").trim(),
        body: (data.body || "").trim(),
        linkUrl: (data.linkUrl || "").trim(),
        linkLabel: (data.linkLabel || "En savoir plus").trim(),
        published: data.published !== false,
        pinned: !!data.pinned,
        validUntil: data.validUntil || "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (!item.title || item.title.length < 5) throw new Error("Titre requis (min. 5 caractères).");
      if (!item.excerpt || item.excerpt.length < 10) throw new Error("Résumé requis (min. 10 caractères).");
      const list = getAll();
      list.unshift(item);
      saveAll(list);
      return item;
    }

    const code = getUniCode(session);
    const scope = data.scope === SCOPES.national ? SCOPES.national : SCOPES.university;
    if (!code && scope !== SCOPES.national) {
      throw new Error("Code université manquant dans la session.");
    }
    const cat = categoryMeta(data.category);
    const item = {
      id: uid(),
      scope,
      authorRole: AUTHOR_ROLES.university,
      universite: scope === SCOPES.national ? NATIONAL_CODE : code,
      universityName:
        scope === SCOPES.national
          ? getUniDisplayName(session) + " — Espace national"
          : getUniDisplayName(session),
      authorId: session.identifiant || session.userId || "",
      authorName: session.nom || "Administration",
      category: cat.id,
      title: (data.title || "").trim(),
      excerpt: (data.excerpt || "").trim(),
      body: (data.body || "").trim(),
      linkUrl: (data.linkUrl || "").trim(),
      linkLabel: (data.linkLabel || "En savoir plus").trim(),
      published: data.published !== false,
      pinned: !!data.pinned,
      validUntil: data.validUntil || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (!item.title || item.title.length < 5) throw new Error("Titre requis (min. 5 caractères).");
    if (!item.excerpt || item.excerpt.length < 10) throw new Error("Résumé requis (min. 10 caractères).");
    const list = getAll();
    list.unshift(item);
    saveAll(list);
    return item;
  }

  async function update(session, id, data) {
    if (useApi()) {
      try {
        const online = await SAC_API.ensureOnline();
        if (online) {
          const item = await SAC_API.updateHomeNews(id, data);
          await refreshFromServer();
          return normalizeItem(item);
        }
      } catch (err) {
        throw new Error(err.message || "Mise à jour impossible sur le serveur.");
      }
    }

    const list = getAll();
    const idx = list.findIndex((n) => n.id === id);
    if (idx < 0) throw new Error("Publication introuvable.");
    if (!owns(session, list[idx])) {
      throw new Error(
        session?.role === "ministere"
          ? "Vous ne pouvez modifier que les publications du Ministère."
          : "Vous ne pouvez modifier que les publications de votre université."
      );
    }
    const prev = list[idx];
    list[idx] = {
      ...prev,
      category: data.category || prev.category,
      title: (data.title ?? prev.title).trim(),
      excerpt: (data.excerpt ?? prev.excerpt).trim(),
      body: (data.body ?? prev.body).trim(),
      linkUrl: (data.linkUrl ?? prev.linkUrl).trim(),
      linkLabel: (data.linkLabel ?? prev.linkLabel).trim(),
      published: data.published !== undefined ? !!data.published : prev.published,
      pinned: data.pinned !== undefined ? !!data.pinned : prev.pinned,
      validUntil: data.validUntil !== undefined ? data.validUntil : prev.validUntil,
      updatedAt: new Date().toISOString(),
    };
    saveAll(list);
    return list[idx];
  }

  async function remove(session, id) {
    if (useApi()) {
      try {
        const online = await SAC_API.ensureOnline();
        if (online) {
          await SAC_API.deleteHomeNews(id);
          await refreshFromServer();
          return;
        }
      } catch (err) {
        throw new Error(err.message || "Suppression impossible sur le serveur.");
      }
    }

    const list = getAll();
    const item = list.find((n) => n.id === id);
    if (!item) throw new Error("Publication introuvable.");
    if (!owns(session, item)) throw new Error("Suppression non autorisée.");
    saveAll(list.filter((n) => n.id !== id));
  }

  function escHtml(s) {
    const d = document.createElement("div");
    d.textContent = s || "";
    return d.innerHTML;
  }

  function formatDate(iso) {
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

  function renderCard(item) {
    const cat = categoryMeta(item.category);
    const deadline = item.validUntil
      ? `<span class="hn-card__deadline">⏳ Jusqu'au ${escHtml(item.validUntil)}</span>`
      : "";
    const link =
      item.linkUrl
        ? `<a href="${escHtml(item.linkUrl)}" class="hn-card__link" target="_blank" rel="noopener">${escHtml(item.linkLabel || "En savoir plus")} →</a>`
        : "";
    const nationalBadge =
      item.scope === SCOPES.national
        ? isMinistryItem(item)
          ? '<span class="hn-card__pin" style="background:#0c3d6e;color:#fff;">🏛️ Ministère</span>'
          : '<span class="hn-card__pin" style="background:#1e40af;color:#fff;">🇨🇩 Espace national</span>'
        : "";
    return `
      <article class="hn-card ${item.pinned ? "hn-card--pinned" : ""}" data-category="${item.category}" data-uni="${item.universite}" data-scope="${item.scope || SCOPES.university}">
        <div class="hn-card__top">
          <span class="hn-card__badge" style="background:${cat.color}">${cat.icon} ${escHtml(cat.label)}</span>
          ${nationalBadge}
          ${item.pinned ? '<span class="hn-card__pin">📌 À la une</span>' : ""}
        </div>
        <h3 class="hn-card__title">${escHtml(item.title)}</h3>
        <p class="hn-card__excerpt">${escHtml(item.excerpt)}</p>
        ${item.body ? `<p class="hn-card__body">${escHtml(item.body)}</p>` : ""}
        <div class="hn-card__foot">
          <span class="hn-card__uni">${escHtml(item.universityName || item.universite)}</span>
          <span class="hn-card__date">${formatDate(item.createdAt)}</span>
        </div>
        ${deadline}
        ${link}
      </article>`;
  }

  function renderHomepage(config) {
    const feedId = config.feedId || "homeNewsFeed";
    const filtersId = config.filtersId || "homeNewsFilters";
    const emptyId = config.emptyId || "homeNewsEmpty";
    const uniSelectId = config.uniSelectId || "homeNewsUni";

    const feed = document.getElementById(feedId);
    const filtersEl = document.getElementById(filtersId);
    const emptyEl = document.getElementById(emptyId);
    const uniSelect = document.getElementById(uniSelectId);
    if (!feed) return;

    let currentCategory = "all";
    let currentUni = "all";

    if (uniSelect) {
      uniSelect.addEventListener("change", () => {
        currentUni = uniSelect.value;
        paint();
      });
    }

    if (filtersEl) {
      filtersEl.innerHTML =
        `<button type="button" class="hn-filter active" data-cat="all">Toutes</button>` +
        CATEGORIES.map(
          (c) =>
            `<button type="button" class="hn-filter" data-cat="${c.id}" style="--hn-color:${c.color}">${c.icon} ${escHtml(c.label)}</button>`
        ).join("");
      filtersEl.querySelectorAll(".hn-filter").forEach((btn) => {
        btn.addEventListener("click", () => {
          filtersEl.querySelectorAll(".hn-filter").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          currentCategory = btn.dataset.cat;
          paint();
        });
      });
    }

    function paint() {
      const items = getPublished({
        category: currentCategory,
        universite: currentUni,
        publicSite: true,
      });
      if (!items.length) {
        feed.innerHTML = "";
        if (emptyEl) emptyEl.style.display = "block";
        return;
      }
      if (emptyEl) emptyEl.style.display = "none";
      if (currentCategory === "all") {
        feed.innerHTML = CATEGORIES.map((cat) => {
          const catItems = items.filter((n) => n.category === cat.id);
          if (!catItems.length) return "";
          return `
            <div class="hn-category-block" style="grid-column:1/-1;">
              <h3 class="hn-category-block__title" style="--hn-color:${cat.color}">
                ${cat.icon} ${escHtml(cat.label)}
                <span class="hn-category-block__count">${catItems.length}</span>
              </h3>
              <div class="hn-category-block__grid">${catItems.map(renderCard).join("")}</div>
            </div>`;
        }).join("");
      } else {
        feed.innerHTML = items.map(renderCard).join("");
      }
    }

    async function boot() {
      await ensureSynced();
      if (uniSelect && typeof SAC_UNIVERSITIES !== "undefined") {
        const published = getPublished();
        const uniIds = [...new Set(published.map((n) => n.universite))].filter(Boolean);
        uniSelect.innerHTML =
          '<option value="all">🇨🇩 Espace national uniquement</option>' +
          uniIds
            .map((id) => {
              const name =
                SAC_UNIVERSITIES.NAMES[id] ||
                published.find((n) => n.universite === id)?.universityName ||
                id;
              return `<option value="${id}">${escHtml(name)}</option>`;
            })
            .join("");
      }
      paint();
    }

    boot();
  }

  function initPublisher(session, rootId, opts = {}) {
    const root = document.getElementById(rootId);
    if (!root || !canPublish(session)) return;

    const isMinistry = session.role === "ministere";
    const q = (sel) => root.querySelector(sel);

    const scope = isMinistry
      ? SCOPES.national
      : opts.scope === SCOPES.national
        ? SCOPES.national
        : SCOPES.university;
    const isNational = scope === SCOPES.national;
    const borderColor =
      opts.borderColor || (isMinistry ? "#0c3d6e" : isNational ? "#1e40af" : "#0d7a4a");
    const pageTitle =
      opts.pageTitle ||
      (isMinistry
        ? "Panneau public national"
        : isNational
          ? "Espace national"
          : "Annonces de mon université");
    const pageDesc =
      opts.pageDesc ||
      (isMinistry
        ? "Publiez des informations officielles par <strong>catégorie</strong> (gouvernement, concours, bourses, éducation…). Elles apparaissent sur la <strong>page d'accueil publique</strong> et dans l'espace national de tous les étudiants."
        : isNational
          ? "Publiez des informations visibles par <strong>toutes les universités</strong> partenaires et sur la page d'accueil du site (fil national)."
          : `Annonces officielles de <strong>${escHtml(getUniDisplayName(session))}</strong> — visibles sur le <strong>profil de vos étudiants</strong> uniquement.`);
    const listTitle =
      opts.listTitle ||
      (isMinistry
        ? "Mes publications — Ministère"
        : isNational
          ? "Mes publications — espace national"
          : "Mes annonces (mon université)");
    const submitLabel =
      opts.submitLabel ||
      (isMinistry
        ? "Publier sur le panneau public"
        : isNational
          ? "Publier à l'espace national"
          : "Publier pour mon université");

    let editingId = null;

    const catOptions = CATEGORIES.map(
      (c) => `<option value="${c.id}">${c.icon} ${c.label}</option>`
    ).join("");

    root.innerHTML = `
      ${opts.embedded ? "" : `<h2 class="page-title" style="font-size:1.35rem;">${escHtml(pageTitle)}</h2>`}
      <p class="page-desc" style="margin-bottom:1rem;">${pageDesc}</p>
      <div class="panel" style="margin-bottom:1.25rem;border-left:4px solid ${borderColor};">
        <div class="panel__head"><h2 data-hn-form-title>Nouvelle publication</h2></div>
        <div class="panel__body">
          <form data-hn-form class="rec-form">
            <div class="form-row-2">
              <div class="fg">
                <label>Catégorie *</label>
                <select class="fi" data-hn-category required>${catOptions}</select>
              </div>
              <div class="fg">
                <label>Date limite (optionnel)</label>
                <input type="date" class="fi" data-hn-valid-until />
              </div>
            </div>
            <div class="fg">
              <label>Titre *</label>
              <input type="text" class="fi" data-hn-title required maxlength="200" placeholder="Ex. Appel à candidatures — bourses Master" />
            </div>
            <div class="fg">
              <label>Résumé court * <small>(affiché sur la carte)</small></label>
              <textarea class="fi" data-hn-excerpt rows="2" required maxlength="400" placeholder="2 à 3 phrases visibles sur le panneau public…"></textarea>
            </div>
            <div class="fg">
              <label>Contenu détaillé</label>
              <textarea class="fi" data-hn-body rows="4" placeholder="Instructions, pièces à fournir, contacts…"></textarea>
            </div>
            <div class="form-row-2">
              <div class="fg">
                <label>Lien externe (optionnel)</label>
                <input type="url" class="fi" data-hn-link-url placeholder="https://…" />
              </div>
              <div class="fg">
                <label>Texte du lien</label>
                <input type="text" class="fi" data-hn-link-label placeholder="En savoir plus" />
              </div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:1rem;margin-top:0.5rem;">
              <label class="chk"><input type="checkbox" data-hn-published checked /> Publié (visible)</label>
              <label class="chk"><input type="checkbox" data-hn-pinned /> Mettre à la une (épinglé)</label>
            </div>
            <div style="display:flex;gap:0.5rem;margin-top:1rem;flex-wrap:wrap;">
              <button type="submit" class="btn btn--role" data-hn-submit>${escHtml(submitLabel)}</button>
              <button type="button" class="btn btn--ghost" data-hn-cancel style="display:none;">Annuler</button>
            </div>
          </form>
        </div>
      </div>
      <div class="panel">
        <div class="panel__head">
          <h2>${escHtml(listTitle)}</h2>
          <span data-hn-list-count style="font-size:0.85rem;color:var(--muted);"></span>
        </div>
        <div class="panel__body"><div data-hn-admin-list></div></div>
      </div>`;

    function getAdminList() {
      if (isMinistry) return getForMinistry();
      return getForUniversity(session, scope);
    }

    function resetForm() {
      editingId = null;
      q("[data-hn-form-title]").textContent = "Nouvelle publication";
      q("[data-hn-form]").reset();
      q("[data-hn-published]").checked = true;
      q("[data-hn-pinned]").checked = false;
      q("[data-hn-cancel]").style.display = "none";
      q("[data-hn-submit]").textContent = submitLabel;
    }

    function fillForm(item) {
      editingId = item.id;
      q("[data-hn-form-title]").textContent = "Modifier la publication";
      q("[data-hn-category]").value = item.category;
      q("[data-hn-title]").value = item.title;
      q("[data-hn-excerpt]").value = item.excerpt;
      q("[data-hn-body]").value = item.body || "";
      q("[data-hn-link-url]").value = item.linkUrl || "";
      q("[data-hn-link-label]").value = item.linkLabel || "";
      q("[data-hn-valid-until]").value = item.validUntil || "";
      q("[data-hn-published]").checked = item.published !== false;
      q("[data-hn-pinned]").checked = !!item.pinned;
      q("[data-hn-cancel]").style.display = "";
      q("[data-hn-submit]").textContent = "Enregistrer les modifications";
    }

    function renderAdminList() {
      const list = getAdminList();
      const el = q("[data-hn-admin-list]");
      q("[data-hn-list-count]").textContent = list.length + " publication(s)";
      if (!list.length) {
        el.innerHTML =
          '<p style="color:var(--muted);font-size:0.9rem;">Aucune publication. Créez une annonce pour le panneau public.</p>';
        return;
      }
      el.innerHTML = list
        .map((item) => {
          const cat = categoryMeta(item.category);
          const status = item.published === false ? "Brouillon" : item.pinned ? "À la une" : "Publié";
          const scopeTag = isMinistry
            ? `<span class="hn-admin-item__status" style="background:#0c3d6e;color:#fff;">Ministère</span>`
            : item.scope === SCOPES.national
              ? '<span class="hn-admin-item__status" style="background:#1e40af;color:#fff;">National</span>'
              : `<span class="hn-admin-item__status">${status}</span>`;
          return `
            <article class="hn-admin-item">
              <div class="hn-admin-item__head">
                <span class="hn-card__badge" style="background:${cat.color};font-size:0.72rem;">${cat.icon} ${escHtml(cat.label)}</span>
                ${scopeTag}
              </div>
              <strong>${escHtml(item.title)}</strong>
              <p style="font-size:0.88rem;color:var(--muted);margin:0.35rem 0;">${escHtml(item.excerpt)}</p>
              <small style="color:var(--muted);">${formatDate(item.createdAt)}</small>
              <div class="hn-admin-item__actions">
                <button type="button" class="btn btn--ghost btn--sm" data-edit="${item.id}">Modifier</button>
                <button type="button" class="btn btn--ghost btn--sm" data-del="${item.id}" style="color:#b91c1c;">Supprimer</button>
              </div>
            </article>`;
        })
        .join("");

      el.querySelectorAll("[data-edit]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const item = getAll().find((n) => n.id === btn.dataset.edit);
          if (item) fillForm(item);
        });
      });
      el.querySelectorAll("[data-del]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!confirm("Supprimer cette publication du panneau public ?")) return;
          try {
            await remove(session, btn.dataset.del);
            renderAdminList();
            if (editingId === btn.dataset.del) resetForm();
            if (opts.onChange) opts.onChange();
          } catch (e) {
            alert(e.message);
          }
        });
      });
    }

    q("[data-hn-form]").addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        category: q("[data-hn-category]").value,
        title: q("[data-hn-title]").value,
        excerpt: q("[data-hn-excerpt]").value,
        body: q("[data-hn-body]").value,
        linkUrl: q("[data-hn-link-url]").value,
        linkLabel: q("[data-hn-link-label]").value,
        validUntil: q("[data-hn-valid-until]").value,
        published: q("[data-hn-published]").checked,
        pinned: q("[data-hn-pinned]").checked,
      };
      try {
        const wasEdit = !!editingId;
        payload.scope = scope;
        if (editingId) await update(session, editingId, payload);
        else await create(session, payload);
        resetForm();
        renderAdminList();
        if (isNational && !isMinistry) {
          await renderNationalFeedReadonly("nationalFeedReadonly");
        }
        if (opts.onChange) opts.onChange();
        alert(
          wasEdit
            ? "Publication mise à jour."
            : isMinistry
              ? "Publication enregistrée sur le panneau public national (par catégorie)."
              : isNational
                ? "Publication enregistrée dans l'espace national (site + tous les étudiants)."
                : "Publication enregistrée pour votre université (visible sur le profil de vos étudiants uniquement)."
        );
      } catch (err) {
        alert(err.message);
      }
    });

    q("[data-hn-cancel]").addEventListener("click", resetForm);
    (async () => {
      await ensureSynced();
      renderAdminList();
      if (scope === SCOPES.national && !isMinistry) {
        await renderNationalFeedReadonly("nationalFeedReadonly");
      }
    })();
  }

  function initUniversityPublisher(session, rootId, opts = {}) {
    if (session?.role !== "universite") return;
    initPublisher(session, rootId, opts);
  }

  function initMinistryPublisher(session, rootId, opts = {}) {
    if (session?.role !== "ministere") return;
    initPublisher(session, rootId, {
      embedded: true,
      pageTitle: "Panneau public national",
      listTitle: "Publications du Ministère",
      submitLabel: "Publier sur le panneau public",
      borderColor: "#0c3d6e",
      ...opts,
    });
  }

  async function renderPublicPreview(rootId) {
    await ensureSynced();
    const root = document.getElementById(rootId);
    if (!root) return;
    const items = getPublished({ publicSite: true, universite: "all", category: "all" });
    if (!items.length) {
      root.innerHTML =
        '<p style="color:var(--muted);font-size:0.88rem;margin:0;">Aucune publication sur le panneau public pour le moment.</p>';
      return;
    }
    root.innerHTML =
      '<p style="font-size:0.88rem;color:var(--muted);margin:0 0 1rem;">Aperçu du panneau public — informations classées par catégorie :</p>' +
      CATEGORIES.map((cat) => {
        const catItems = items.filter((n) => n.category === cat.id);
        if (!catItems.length) return "";
        return `
          <div class="hn-preview-block" style="margin-bottom:1.25rem;">
            <h4 style="font-size:0.95rem;color:${cat.color};margin:0 0 0.65rem;">${cat.icon} ${escHtml(cat.label)} (${catItems.length})</h4>
            <div class="hn-readonly-feed">${catItems.slice(0, 3).map(renderCard).join("")}</div>
          </div>`;
      }).join("");
  }

  async function renderNationalFeedReadonly(rootId) {
    await ensureSynced();
    const root = document.getElementById(rootId);
    if (!root) return;
    const items = getNationalPublished();
    if (!items.length) {
      root.innerHTML =
        '<p style="color:var(--muted);font-size:0.88rem;margin:0;">Aucune publication nationale pour le moment.</p>';
      return;
    }
    root.innerHTML =
      '<h3 style="font-size:1rem;margin:0 0 0.75rem;color:var(--primary);">Fil national — Ministère et universités</h3>' +
      '<div class="hn-readonly-feed">' +
      items.map(renderCard).join("") +
      "</div>";
  }

  function initProfilePublishers(session) {
    if (typeof SAC_initUniversityProfilePublisher === "function") {
      SAC_initUniversityProfilePublisher(session, "campusPortalPublisherRoot");
    }
    initUniversityPublisher(session, "campusHomeNewsRoot", {
      embedded: true,
      scope: SCOPES.university,
      pageTitle: "Annonces publiques — Mon université",
      pageDesc:
        "Annonces officielles visibles <strong>uniquement sur le profil des étudiants</strong> inscrits à votre établissement (pas sur le fil public sans filtre).",
      listTitle: "Mes annonces — mon université",
      submitLabel: "Publier pour mon université",
    });
    initUniversityPublisher(session, "nationalPublisherRoot", {
      embedded: true,
      scope: SCOPES.national,
      pageTitle: "Espace national",
      pageDesc:
        "Informations destinées à <strong>toutes les universités</strong> partenaires : visibles sur la page d'accueil nationale et consultables par chaque établissement inscrit.",
      listTitle: "Mes publications — espace national",
      submitLabel: "Publier à l'espace national",
      borderColor: "#1e40af",
    });
  }

  return {
    CATEGORIES,
    SCOPES,
    NATIONAL_CODE,
    MINISTRY_CODE,
    AUTHOR_ROLES,
    categoryLabel,
    categoryMeta,
    getAll,
    getPublished,
    getNationalPublished,
    getForMinistry,
    getUniversityNewsForStudent,
    getNationalNewsForStudent,
    getForUniversity,
    create,
    update,
    remove,
    ensureSynced,
    refreshFromServer,
    renderHomepage,
    renderCard,
    initPublisher,
    initUniversityPublisher,
    initMinistryPublisher,
    initProfilePublishers,
    renderNationalFeedReadonly,
    renderPublicPreview,
  };
})();

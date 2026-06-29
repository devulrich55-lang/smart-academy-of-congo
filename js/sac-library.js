/**
 * Bibliothèque numérique — publication Ministère + consultation publique
 */
const SAC_LIBRARY = (function () {
  const STORAGE_KEY = "sac_digital_library_cache";

  const CATEGORY_GROUPS = [
    {
      label: "Éducation & pédagogie",
      items: [
        { id: "education", label: "Éducation générale" },
        { id: "pedagogie", label: "Pédagogie" },
        { id: "manuel", label: "Manuels scolaires" },
        { id: "programme", label: "Programmes officiels" },
        { id: "examen", label: "Annales & examens" },
        { id: "methodes", label: "Méthodes & recherche" },
        { id: "memoire", label: "Mémoires & thèses" },
      ],
    },
    {
      label: "Sciences & techniques",
      items: [
        { id: "mathematiques", label: "Mathématiques" },
        { id: "physique", label: "Physique" },
        { id: "chimie", label: "Chimie" },
        { id: "biologie", label: "Biologie & SVT" },
        { id: "sciences", label: "Sciences générales" },
        { id: "informatique", label: "Informatique & numérique" },
        { id: "ingenierie", label: "Ingénierie & technologie" },
        { id: "medecine", label: "Médecine & pharmacie" },
        { id: "sante", label: "Santé publique" },
        { id: "agriculture", label: "Agriculture & agronomie" },
        { id: "environnement", label: "Environnement & écologie" },
      ],
    },
    {
      label: "Sciences humaines & sociales",
      items: [
        { id: "histoire", label: "Histoire" },
        { id: "geographie", label: "Géographie" },
        { id: "philosophie", label: "Philosophie" },
        { id: "droit", label: "Droit" },
        { id: "economie", label: "Économie" },
        { id: "gestion", label: "Gestion & comptabilité" },
        { id: "politique", label: "Sciences politiques" },
        { id: "sociologie", label: "Sociologie & anthropologie" },
        { id: "psychologie", label: "Psychologie" },
      ],
    },
    {
      label: "Lettres, arts & culture",
      items: [
        { id: "roman", label: "Romans & nouvelles" },
        { id: "litterature", label: "Littérature" },
        { id: "poesie", label: "Poésie" },
        { id: "theatre", label: "Théâtre" },
        { id: "langues", label: "Langues & linguistique" },
        { id: "arts", label: "Arts & beaux-arts" },
        { id: "musique", label: "Musique" },
        { id: "religion", label: "Religion & théologie" },
        { id: "enfants", label: "Jeunesse & lecture enfants" },
      ],
    },
    {
      label: "Références & divers",
      items: [
        { id: "dictionnaire", label: "Dictionnaires & encyclopédies" },
        { id: "culture", label: "Culture & patrimoine" },
        { id: "developpement", label: "Développement & coopération" },
        { id: "autre", label: "Autre" },
      ],
    },
  ];

  const CATEGORIES = CATEGORY_GROUPS.flatMap((g) => g.items);

  function categoriesSelectHtml() {
    return CATEGORY_GROUPS.map(
      (g) =>
        '<optgroup label="' +
        esc(g.label) +
        '">' +
        g.items.map((c) => '<option value="' + c.id + '">' + esc(c.label) + "</option>").join("") +
        "</optgroup>"
    ).join("");
  }

  function esc(s) {
    const el = document.createElement("div");
    el.textContent = String(s || "");
    return el.innerHTML;
  }

  function categoryLabel(id) {
    return CATEGORIES.find((c) => c.id === id)?.label || id || "Document";
  }

  function cacheItems(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items || []));
    } catch {
      /* ignore */
    }
  }

  function readCache() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function absUrl(url) {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    if (typeof SAC_API !== "undefined" && SAC_API.getBase) {
      const base = SAC_API.getBase();
      if (base) return base + url;
    }
    return url;
  }

  function filterByCountry(items, countryCode) {
    if (!Array.isArray(items)) return [];
    if (typeof SAC_AFRICA_COUNTRIES === "undefined") return items;
    const cc = countryCode ? String(countryCode).toUpperCase() : "";
    if (!cc) return items;
    return items.filter((item) => SAC_AFRICA_COUNTRIES.matchesLibraryCountry(item, cc));
  }

  function sessionCountryCode(session) {
    if (!session) return "";
    if (session.countryCode) return String(session.countryCode).toUpperCase();
    if (session.role === "ministere") return String(session.countryCode || "CD").toUpperCase();
    if (session.role === "universite" && session.universite && typeof SAC_UNIVERSITIES !== "undefined") {
      return SAC_UNIVERSITIES.getCountryCode(session.universite);
    }
    return "";
  }

  async function listPublished(countryCode) {
    const cc =
      countryCode ||
      (typeof SAC_AFRICA_COUNTRIES !== "undefined" ? SAC_AFRICA_COUNTRIES.getStoredCountry() : "");
    if (typeof SAC_API !== "undefined" && SAC_API.listDigitalLibrary) {
      try {
        const online = await SAC_API.ensureOnline();
        if (online) {
          const data = await SAC_API.listDigitalLibrary(cc);
          let items = data?.items || [];
          items = filterByCountry(items, cc);
          if (items.length) {
            cacheItems(items);
            return items;
          }
        }
      } catch {
        /* fallback */
      }
    }
    const cached = filterByCountry(readCache(), cc);
    if (cached.length) return cached;
    if (typeof SAC_PLATFORM !== "undefined" && SAC_PLATFORM.getLibrary) {
      try {
        return filterByCountry(await SAC_PLATFORM.getLibrary(), cc);
      } catch {
        return [];
      }
    }
    return [];
  }

  async function listManage(session) {
    const cc = sessionCountryCode(session);
    if (typeof SAC_API !== "undefined" && SAC_API.listDigitalLibraryManage) {
      const data = await SAC_API.listDigitalLibraryManage(cc);
      const items = data?.items || [];
      return filterByCountry(items, cc);
    }
    return [];
  }

  async function createBook(payload) {
    if (typeof SAC_API !== "undefined" && SAC_API.createDigitalLibraryBook) {
      const data = await SAC_API.createDigitalLibraryBook(payload);
      return data?.item || data;
    }
    throw new Error("Publication en ligne requise.");
  }

  async function updateBook(id, payload) {
    if (typeof SAC_API !== "undefined" && SAC_API.updateDigitalLibraryBook) {
      const data = await SAC_API.updateDigitalLibraryBook(id, payload);
      return data?.item || data;
    }
    throw new Error("Mise à jour en ligne requise.");
  }

  async function deleteBook(id) {
    if (typeof SAC_API !== "undefined" && SAC_API.deleteDigitalLibraryBook) {
      return SAC_API.deleteDigitalLibraryBook(id);
    }
    throw new Error("Suppression en ligne requise.");
  }

  async function uploadFile(file) {
    if (typeof SAC_API !== "undefined" && SAC_API.uploadDigitalLibraryFile) {
      const fd = new FormData();
      fd.append("files", file);
      return SAC_API.uploadDigitalLibraryFile(fd);
    }
    throw new Error("Téléversement indisponible.");
  }

  function initMinistryPublisher(session, rootId, options) {
    const root = document.getElementById(rootId || "libraryPublisherRoot");
    if (!root) return;
    if (!session || session.role !== "ministere") {
      root.innerHTML =
        '<p class="page-desc" style="margin:0;color:#b91c1c;">Réservé au compte Ministère.</p>';
      return;
    }

    const onChange = typeof options?.onChange === "function" ? options.onChange : null;
    const showList = options?.showList !== false;
    const countryCode = sessionCountryCode(session) || "CD";
    const countryLabel =
      typeof SAC_AFRICA_COUNTRIES !== "undefined"
        ? SAC_AFRICA_COUNTRIES.label(countryCode)
        : countryCode;
    let editingId = null;

    const listPanel = showList
      ? '<div class="panel panel--ws lib-manage-panel"><div class="panel__head"><h2>Mes publications — bibliothèque</h2></div>' +
        '<div class="panel__body lib-manage-list"><p style="color:var(--muted);">Chargement…</p></div></div>'
      : "";

    root.innerHTML =
      '<div class="panel panel--ws lib-form-panel" style="margin-bottom:1rem;">' +
      '<div class="panel__head"><h2 class="lib-form-title">Publier un livre numérique</h2></div>' +
      '<div class="panel__body">' +
      '<p class="lib-form-intro" style="margin:0 0 0.75rem;color:var(--muted);font-size:0.88rem;">Bibliothèque nationale — <strong>' +
      esc(countryLabel) +
      "</strong>. Les ouvrages publiés ici sont visibles pour les utilisateurs de ce pays.</p>" +
      '<form class="lib-publish-form ws-form-grid">' +
      '<p class="lib-form-intro" style="grid-column:1/-1;margin:0 0 0.35rem;color:var(--muted);font-size:0.88rem;">Renseignez les informations du livre, ajoutez une couverture et téléversez le fichier (PDF, EPUB, DOC).</p>' +
      '<div class="fg" style="grid-column:1/-1;"><label>Titre du livre *</label><input class="fi lib-title" required minlength="3" placeholder="Ex: Mathématiques — Terminale" /></div>' +
      '<div class="fg"><label>Auteur</label><input class="fi lib-author" placeholder="Nom de l\'auteur" /></div>' +
      '<div class="fg"><label>Catégorie *</label><select class="fi lib-category" required>' +
      categoriesSelectHtml() +
      "</select></div>" +
      '<div class="fg"><label>Langue</label><select class="fi lib-lang"><option value="fr">Français</option><option value="en">Anglais</option><option value="bilingue">Bilingue FR/EN</option></select></div>' +
      '<div class="fg" style="grid-column:1/-1;"><label>Description / résumé</label><textarea class="fi lib-desc" rows="3" placeholder="Présentation courte du livre…"></textarea></div>' +
      '<div class="fg" style="grid-column:1/-1;">' +
      '<label>Image de couverture (JPG, PNG, WebP)</label>' +
      '<input type="file" class="fi lib-cover-file" accept="image/jpeg,image/png,image/webp,image/*" />' +
      '<input class="fi lib-cover-url" placeholder="Ou URL de l\'image de couverture" style="margin-top:0.45rem;" />' +
      '<div class="lib-cover-preview" style="display:none;margin-top:0.55rem;border:1px solid var(--border);border-radius:10px;overflow:hidden;max-width:180px;">' +
      '<img class="lib-cover-preview-img" alt="Aperçu couverture" style="display:block;width:100%;height:220px;object-fit:cover;" />' +
      "</div></div>" +
      '<div class="fg" style="grid-column:1/-1;"><label>Fichier du livre (PDF, EPUB, DOC…) *</label><input type="file" class="fi lib-file" accept=".pdf,.epub,.doc,.docx" /></div>' +
      '<div class="fg" style="grid-column:1/-1;"><label>Ou lien direct du livre (URL)</label><input class="fi lib-url" placeholder="https://…" /></div>' +
      '<div class="fg" style="grid-column:1/-1;"><label class="chk"><input type="checkbox" class="lib-published" checked /> Publier immédiatement dans la bibliothèque de ' +
      esc(countryLabel) +
      "</label></div>" +
      '<div class="fg" style="grid-column:1/-1;display:flex;gap:0.5rem;flex-wrap:wrap;">' +
      '<button type="submit" class="btn btn--role lib-submit">Publier le livre</button>' +
      '<button type="button" class="btn btn--ghost lib-cancel" style="display:none;">Annuler</button>' +
      "</div></form></div></div>" +
      listPanel;

    const form = root.querySelector(".lib-publish-form");
    const btnCancel = root.querySelector(".lib-cancel");
    const formTitle = root.querySelector(".lib-form-title");
    const btnSubmit = root.querySelector(".lib-submit");
    const coverPreview = root.querySelector(".lib-cover-preview");
    const coverPreviewImg = root.querySelector(".lib-cover-preview-img");

    function q(sel) {
      return root.querySelector(sel);
    }

    function showCoverPreview(url) {
      if (!url || !coverPreview || !coverPreviewImg) return;
      coverPreviewImg.src = absUrl(url);
      coverPreview.style.display = "block";
    }

    function hideCoverPreview() {
      if (coverPreview) coverPreview.style.display = "none";
      if (coverPreviewImg) coverPreviewImg.removeAttribute("src");
    }

    q(".lib-cover-file")?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => showCoverPreview(reader.result);
      reader.readAsDataURL(file);
    });

    q(".lib-cover-url")?.addEventListener("input", (e) => {
      const url = e.target.value.trim();
      if (url) showCoverPreview(url);
      else hideCoverPreview();
    });

    async function renderManage() {
      if (!showList) return;
      const listEl = root.querySelector(".lib-manage-list");
      if (!listEl) return;
      try {
        const items = await listManage(session);
        if (!items.length) {
          listEl.innerHTML = '<p style="color:var(--muted);margin:0;">Aucun livre publié pour le moment.</p>';
          return;
        }
        listEl.innerHTML =
          '<div style="display:grid;gap:0.65rem;">' +
          items
            .map(
              (b) => {
                const thumb = b.coverUrl
                  ? '<img src="' +
                    esc(absUrl(b.coverUrl)) +
                    '" alt="" style="width:52px;height:72px;object-fit:cover;border-radius:6px;margin-right:0.55rem;vertical-align:middle;" />'
                  : '<span style="display:inline-flex;width:52px;height:72px;align-items:center;justify-content:center;background:var(--border);border-radius:6px;margin-right:0.55rem;vertical-align:middle;">📘</span>';
                return (
                '<article style="border:1px solid var(--border);border-radius:10px;padding:0.75rem;background:var(--bg);display:flex;align-items:flex-start;gap:0.5rem;">' +
                thumb +
                '<div style="flex:1;min-width:0;">' +
                "<strong>" +
                esc(b.title) +
                "</strong> · " +
                esc(categoryLabel(b.category)) +
                " · " +
                esc(b.language || "fr") +
                "<br/><span style='font-size:0.84rem;color:var(--muted);'>" +
                esc(b.author || "—") +
                " · " +
                (b.published ? "Publié" : "Brouillon") +
                "</span>" +
                '<div style="margin-top:0.5rem;display:flex;gap:0.4rem;flex-wrap:wrap;">' +
                '<button type="button" class="btn btn--ghost btn--sm" data-edit-lib="' +
                esc(b.id) +
                '">Modifier</button>' +
                '<button type="button" class="btn btn--ghost btn--sm" data-del-lib="' +
                esc(b.id) +
                '">Supprimer</button>' +
                (b.fileUrl
                  ? '<a class="btn btn--ghost btn--sm" href="' +
                    esc(absUrl(b.fileUrl)) +
                    '" target="_blank" rel="noopener">Ouvrir le livre</a>'
                  : "") +
                "</div></div></article>"
                );
              }
            )
            .join("") +
          "</div>";

        listEl.querySelectorAll("[data-edit-lib]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const item = items.find((x) => x.id === btn.dataset.editLib);
            if (!item) return;
            editingId = item.id;
            q(".lib-title").value = item.title || "";
            q(".lib-author").value = item.author || "";
            q(".lib-category").value = item.category || "autre";
            q(".lib-lang").value = item.language || "fr";
            q(".lib-desc").value = item.description || "";
            q(".lib-url").value = item.fileUrl || "";
            q(".lib-cover-url").value = item.coverUrl || "";
            if (item.coverUrl) showCoverPreview(item.coverUrl);
            else hideCoverPreview();
            q(".lib-published").checked = !!item.published;
            formTitle.textContent = "Modifier le livre";
            btnSubmit.textContent = "Enregistrer";
            btnCancel.style.display = "inline-block";
          });
        });

        listEl.querySelectorAll("[data-del-lib]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            if (!confirm("Supprimer ce livre de la bibliothèque ?")) return;
            try {
              await deleteBook(btn.dataset.delLib);
              await renderManage();
              if (onChange) onChange();
            } catch (err) {
              alert(err.message || "Suppression impossible.");
            }
          });
        });
      } catch (err) {
        listEl.innerHTML =
          '<p style="color:#b91c1c;margin:0;">' + esc(err.message || "Chargement impossible.") + "</p>";
      }
    }

    function resetForm() {
      editingId = null;
      form.reset();
      q(".lib-published").checked = true;
      hideCoverPreview();
      formTitle.textContent = "Publier un livre numérique";
      btnSubmit.textContent = "Publier le livre";
      btnCancel.style.display = "none";
    }

    btnCancel?.addEventListener("click", resetForm);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        title: q(".lib-title").value.trim(),
        author: q(".lib-author").value.trim(),
        category: q(".lib-category").value,
        language: q(".lib-lang").value,
        description: q(".lib-desc").value.trim(),
        fileUrl: q(".lib-url").value.trim(),
        coverUrl: q(".lib-cover-url").value.trim(),
        published: q(".lib-published").checked,
        countryCode: countryCode,
      };

      const coverFile = q(".lib-cover-file")?.files?.[0];
      if (coverFile) {
        try {
          const upCover = await uploadFile(coverFile);
          if (upCover?.fileUrl) payload.coverUrl = upCover.fileUrl;
        } catch (err) {
          alert(err.message || "Échec du téléversement de la couverture.");
          return;
        }
      }

      const file = q(".lib-file")?.files?.[0];
      if (file) {
        try {
          const up = await uploadFile(file);
          if (up?.fileUrl) payload.fileUrl = up.fileUrl;
        } catch (err) {
          alert(err.message || "Échec du téléversement.");
          return;
        }
      }

      if (!payload.fileUrl) {
        alert("Ajoutez un fichier du livre (PDF, EPUB, DOC) ou une URL.");
        return;
      }

      try {
        const wasEdit = !!editingId;
        if (editingId) await updateBook(editingId, payload);
        else await createBook(payload);
        resetForm();
        await renderManage();
        if (onChange) onChange();
        alert(wasEdit ? "Livre mis à jour." : "Livre publié dans la bibliothèque de " + countryLabel + ".");
      } catch (err) {
        alert(err.message || "Publication impossible.");
      }
    });

    renderManage();
  }

  return {
    CATEGORY_GROUPS,
    CATEGORIES,
    categoriesSelectHtml,
    categoryLabel,
    listPublished,
    listManage,
    filterByCountry,
    sessionCountryCode,
    createBook,
    updateBook,
    deleteBook,
    initMinistryPublisher,
    absUrl,
  };
})();

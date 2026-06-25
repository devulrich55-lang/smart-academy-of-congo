/**
 * Bibliothèque numérique — publication Ministère + consultation publique
 */
const SAC_LIBRARY = (function () {
  const STORAGE_KEY = "sac_digital_library_cache";

  const CATEGORIES = [
    { id: "roman", label: "Roman" },
    { id: "sciences", label: "Sciences" },
    { id: "langues", label: "Langues" },
    { id: "methodes", label: "Méthodes" },
    { id: "informatique", label: "Informatique" },
    { id: "histoire", label: "Histoire" },
    { id: "education", label: "Éducation" },
    { id: "autre", label: "Autre" },
  ];

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

  async function listPublished() {
    if (typeof SAC_API !== "undefined" && SAC_API.listDigitalLibrary) {
      try {
        const online = await SAC_API.ensureOnline();
        if (online) {
          const data = await SAC_API.listDigitalLibrary();
          const items = data?.items || [];
          if (items.length) {
            cacheItems(items);
            return items;
          }
        }
      } catch {
        /* fallback */
      }
    }
    const cached = readCache();
    if (cached.length) return cached;
    if (typeof SAC_PLATFORM !== "undefined" && SAC_PLATFORM.getLibrary) {
      try {
        return await SAC_PLATFORM.getLibrary();
      } catch {
        return [];
      }
    }
    return [];
  }

  async function listManage() {
    if (typeof SAC_API !== "undefined" && SAC_API.listDigitalLibraryManage) {
      const data = await SAC_API.listDigitalLibraryManage();
      return data?.items || [];
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
    let editingId = null;

    root.innerHTML =
      '<div class="panel panel--ws" style="margin-bottom:1rem;">' +
      '<div class="panel__head"><h2 id="libFormTitle">Publier un livre numérique</h2></div>' +
      '<div class="panel__body">' +
      '<form id="libPublishForm" class="ws-form-grid">' +
      '<div class="fg" style="grid-column:1/-1;"><label>Titre *</label><input class="fi" id="libTitle" required minlength="3" /></div>' +
      '<div class="fg"><label>Auteur</label><input class="fi" id="libAuthor" /></div>' +
      '<div class="fg"><label>Catégorie *</label><select class="fi" id="libCategory" required>' +
      CATEGORIES.map((c) => '<option value="' + c.id + '">' + esc(c.label) + "</option>").join("") +
      "</select></div>" +
      '<div class="fg"><label>Langue</label><select class="fi" id="libLang"><option value="fr">Français</option><option value="en">Anglais</option><option value="bilingue">Bilingue FR/EN</option></select></div>' +
      '<div class="fg" style="grid-column:1/-1;"><label>Description</label><textarea class="fi" id="libDesc" rows="3"></textarea></div>' +
      '<div class="fg" style="grid-column:1/-1;">' +
      '<label>Image de couverture (JPG, PNG, WebP)</label>' +
      '<input type="file" class="fi" id="libCoverFile" accept="image/jpeg,image/png,image/webp,image/*" />' +
      '<input class="fi" id="libCoverUrl" placeholder="Ou URL de l\'image de couverture" style="margin-top:0.45rem;" />' +
      '<div id="libCoverPreview" style="display:none;margin-top:0.55rem;border:1px solid var(--border);border-radius:10px;overflow:hidden;max-width:180px;">' +
      '<img id="libCoverPreviewImg" alt="Aperçu couverture" style="display:block;width:100%;height:220px;object-fit:cover;" />' +
      "</div></div>" +
      '<div class="fg" style="grid-column:1/-1;"><label>Fichier du livre (PDF, EPUB, DOC…)</label><input type="file" class="fi" id="libFile" accept=".pdf,.epub,.doc,.docx" /></div>' +
      '<div class="fg" style="grid-column:1/-1;"><label>Ou lien direct du livre (URL)</label><input class="fi" id="libUrl" placeholder="https://…" /></div>' +
      '<div class="fg" style="grid-column:1/-1;"><label class="chk"><input type="checkbox" id="libPublished" checked /> Publier dans la bibliothèque nationale</label></div>' +
      '<div class="fg" style="grid-column:1/-1;display:flex;gap:0.5rem;flex-wrap:wrap;">' +
      '<button type="submit" class="btn btn--role" id="libSubmit">Publier le livre</button>' +
      '<button type="button" class="btn btn--ghost" id="libCancel" style="display:none;">Annuler</button>' +
      "</div></form></div></div>" +
      '<div class="panel panel--ws"><div class="panel__head"><h2>Mes publications — bibliothèque</h2></div>' +
      '<div class="panel__body" id="libManageList"><p style="color:var(--muted);">Chargement…</p></div></div>';

    const form = root.querySelector("#libPublishForm");
    const btnCancel = root.querySelector("#libCancel");
    const formTitle = root.querySelector("#libFormTitle");
    const btnSubmit = root.querySelector("#libSubmit");
    const coverPreview = root.querySelector("#libCoverPreview");
    const coverPreviewImg = root.querySelector("#libCoverPreviewImg");

    function showCoverPreview(url) {
      if (!url || !coverPreview || !coverPreviewImg) return;
      coverPreviewImg.src = absUrl(url);
      coverPreview.style.display = "block";
    }

    function hideCoverPreview() {
      if (coverPreview) coverPreview.style.display = "none";
      if (coverPreviewImg) coverPreviewImg.removeAttribute("src");
    }

    root.querySelector("#libCoverFile")?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => showCoverPreview(reader.result);
      reader.readAsDataURL(file);
    });

    root.querySelector("#libCoverUrl")?.addEventListener("input", (e) => {
      const url = e.target.value.trim();
      if (url) showCoverPreview(url);
      else hideCoverPreview();
    });

    async function renderManage() {
      const listEl = root.querySelector("#libManageList");
      try {
        const items = await listManage();
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
            root.querySelector("#libTitle").value = item.title || "";
            root.querySelector("#libAuthor").value = item.author || "";
            root.querySelector("#libCategory").value = item.category || "autre";
            root.querySelector("#libLang").value = item.language || "fr";
            root.querySelector("#libDesc").value = item.description || "";
            root.querySelector("#libUrl").value = item.fileUrl || "";
            root.querySelector("#libCoverUrl").value = item.coverUrl || "";
            if (item.coverUrl) showCoverPreview(item.coverUrl);
            else hideCoverPreview();
            root.querySelector("#libPublished").checked = !!item.published;
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
      root.querySelector("#libPublished").checked = true;
      hideCoverPreview();
      formTitle.textContent = "Publier un livre numérique";
      btnSubmit.textContent = "Publier le livre";
      btnCancel.style.display = "none";
    }

    btnCancel?.addEventListener("click", resetForm);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        title: root.querySelector("#libTitle").value.trim(),
        author: root.querySelector("#libAuthor").value.trim(),
        category: root.querySelector("#libCategory").value,
        language: root.querySelector("#libLang").value,
        description: root.querySelector("#libDesc").value.trim(),
        fileUrl: root.querySelector("#libUrl").value.trim(),
        coverUrl: root.querySelector("#libCoverUrl").value.trim(),
        published: root.querySelector("#libPublished").checked,
      };

      const coverInput = root.querySelector("#libCoverFile");
      const coverFile = coverInput?.files?.[0];
      if (coverFile) {
        try {
          const upCover = await uploadFile(coverFile);
          if (upCover?.fileUrl) payload.coverUrl = upCover.fileUrl;
        } catch (err) {
          alert(err.message || "Échec du téléversement de la couverture.");
          return;
        }
      }

      const fileInput = root.querySelector("#libFile");
      const file = fileInput?.files?.[0];
      if (file) {
        try {
          const up = await uploadFile(file);
          if (up?.fileUrl) payload.fileUrl = up.fileUrl;
        } catch (err) {
          alert(err.message || "Échec du téléversement.");
          return;
        }
      }

      try {
        const wasEdit = !!editingId;
        if (editingId) await updateBook(editingId, payload);
        else await createBook(payload);
        resetForm();
        await renderManage();
        if (onChange) onChange();
        alert(wasEdit ? "Livre mis à jour." : "Livre publié dans la bibliothèque nationale.");
      } catch (err) {
        alert(err.message || "Publication impossible.");
      }
    });

    renderManage();
  }

  return {
    CATEGORIES,
    categoryLabel,
    listPublished,
    listManage,
    createBook,
    updateBook,
    deleteBook,
    initMinistryPublisher,
    absUrl,
  };
})();

/**
 * Catalogue de cours en ligne — publication campus + inscription étudiant
 */
const SAC_COURSE_CATALOG = (function () {
  const CATEGORIES = [
    { id: "mooc", label: "MOOC / Cours en ligne", icon: "🎓" },
    { id: "revision", label: "Révision & soutien", icon: "📖" },
    { id: "td", label: "TD / Travaux dirigés", icon: "✏️" },
    { id: "certifiant", label: "Parcours certifiant", icon: "🏅" },
    { id: "autre", label: "Autre", icon: "📚" },
  ];

  function esc(s) {
    const el = document.createElement("div");
    el.textContent = String(s || "");
    return el.innerHTML;
  }

  function catLabel(id) {
    return CATEGORIES.find((c) => c.id === id)?.label || id || "Cours";
  }

  function catIcon(id) {
    return CATEGORIES.find((c) => c.id === id)?.icon || "📚";
  }

  function isLocalDev() {
    return (
      typeof SAC_API !== "undefined" &&
      typeof SAC_API.isLocalDevHost === "function" &&
      SAC_API.isLocalDevHost()
    );
  }

  async function listForStudent(session) {
    if (typeof SAC_API !== "undefined" && SAC_API.listCoursesForStudent) {
      try {
        const online = await SAC_API.ensureOnline();
        if (online) return await SAC_API.listCoursesForStudent();
      } catch {
        /* fallback */
      }
    }
    if (typeof SAC_PLATFORM !== "undefined" && SAC_PLATFORM.getCourses) {
      return SAC_PLATFORM.getCourses();
    }
    return [];
  }

  async function listManage(session) {
    if (typeof SAC_API !== "undefined" && SAC_API.listCoursesManage) {
      try {
        const online = await SAC_API.ensureOnline();
        if (online) return await SAC_API.listCoursesManage();
      } catch {
        if (!isLocalDev()) throw new Error("Chargement en ligne requis.");
      }
    }
    if (typeof SAC_PLATFORM !== "undefined" && SAC_PLATFORM.read) {
      const code = session?.universite || session?.codeUni || "";
      return (SAC_PLATFORM.read(SAC_PLATFORM.KEYS.courses) || []).filter(
        (c) => !code || c.universite === code
      );
    }
    return [];
  }

  async function listMyEnrollments(session) {
    if (typeof SAC_API !== "undefined" && SAC_API.listMyCourseEnrollments) {
      try {
        const online = await SAC_API.ensureOnline();
        if (online) return await SAC_API.listMyCourseEnrollments();
      } catch {
        /* ignore */
      }
    }
    return [];
  }

  async function enroll(session, courseId) {
    if (typeof SAC_API !== "undefined" && SAC_API.enrollCourse) {
      const online = await SAC_API.ensureOnline();
      if (online) return await SAC_API.enrollCourse(courseId);
    }
    if (typeof SAC_PLATFORM !== "undefined" && SAC_PLATFORM.enrollCourse) {
      return SAC_PLATFORM.enrollCourse(courseId);
    }
    throw new Error("Inscription en ligne requise.");
  }

  async function createCourse(session, payload) {
    if (typeof SAC_API !== "undefined" && SAC_API.createCourse) {
      const online = await SAC_API.ensureOnline();
      if (online) return await SAC_API.createCourse(payload);
    }
    throw new Error("Publication en ligne requise.");
  }

  async function updateCourse(courseId, payload) {
    if (typeof SAC_API !== "undefined" && SAC_API.updateCourse) {
      return SAC_API.updateCourse(courseId, payload);
    }
    throw new Error("Mise à jour en ligne requise.");
  }

  async function deleteCourse(courseId) {
    if (typeof SAC_API !== "undefined" && SAC_API.deleteCourse) {
      return SAC_API.deleteCourse(courseId);
    }
    throw new Error("Suppression en ligne requise.");
  }

  function courseCard(c, opts) {
    const enrolled = !!c.enrolled;
    const href = c.resourceUrl
      ? '<a class="btn btn--ghost btn--sm" href="' +
        esc(c.resourceUrl) +
        '" target="_blank" rel="noopener">Ressource</a>'
      : "";
    const btn = enrolled
      ? '<span style="font-size:0.82rem;color:var(--success);font-weight:600;">✓ Inscrit</span>'
      : opts?.canEnroll
        ? '<button type="button" class="btn btn--role btn--sm" data-enroll-crs="' +
          esc(c.id) +
          '">S\'inscrire</button>'
        : "";
    return (
      '<article class="cat-course-card" data-cat="' +
      esc(c.category || "mooc") +
      '">' +
      '<div class="cat-course-card__icon">' +
      catIcon(c.category) +
      "</div>" +
      '<div class="cat-course-card__body">' +
      "<strong>" +
      esc(c.title) +
      "</strong>" +
      '<span style="font-size:0.78rem;color:var(--muted);margin-left:0.35rem;">' +
      esc(c.code || "") +
      "</span>" +
      '<p style="margin:0.35rem 0 0;font-size:0.84rem;color:var(--muted);">' +
      esc(catLabel(c.category)) +
      (c.professorName ? " · " + esc(c.professorName) : "") +
      (c.filiere ? " · " + esc(c.filiere) : "") +
      (c.niveau && c.niveau !== "tous" ? " · " + esc(c.niveau) : "") +
      "</p>" +
      (c.description
        ? '<p style="margin:0.35rem 0 0;font-size:0.84rem;">' + esc(c.description) + "</p>"
        : "") +
      '<div style="margin-top:0.55rem;display:flex;gap:0.4rem;flex-wrap:wrap;align-items:center;">' +
      btn +
      href +
      "</div></div></article>"
    );
  }

  function mountStudentUI(root, session) {
    if (!root || !session) return;
    root.innerHTML =
      '<div class="cat-toolbar">' +
      '<input type="search" class="fi cat-search" placeholder="Rechercher un cours, code, filière…" />' +
      '<select class="fi cat-filter-cat"><option value="all">Toutes catégories</option>' +
      CATEGORIES.map(
        (c) => '<option value="' + c.id + '">' + esc(c.label) + "</option>"
      ).join("") +
      "</select></div>" +
      '<div class="panel" style="margin:1rem 0;"><div class="panel__head"><h2>Mes inscriptions</h2></div>' +
      '<div class="panel__body" id="catMyEnrollments"><p class="empty">Chargement…</p></div></div>' +
      '<div class="panel"><div class="panel__head"><h2>Catalogue du campus</h2></div>' +
      '<div class="panel__body cat-course-grid" id="catCourseList"><p class="empty">Chargement…</p></div></div>';

    let allCourses = [];

    async function renderEnrollments() {
      const el = root.querySelector("#catMyEnrollments");
      const items = await listMyEnrollments(session);
      if (!items.length) {
        el.innerHTML =
          '<p style="margin:0;color:var(--muted);font-size:0.9rem;">Vous n\'êtes inscrit à aucun cours du catalogue pour le moment.</p>';
        return;
      }
      el.innerHTML =
        '<div class="cat-course-grid">' +
        items
          .map((e) => {
            const c = e.course || e;
            return courseCard({ ...c, enrolled: true }, { canEnroll: false });
          })
          .join("") +
        "</div>";
    }

    function paintCourses(list) {
      const el = root.querySelector("#catCourseList");
      if (!list.length) {
        el.innerHTML =
          '<p style="margin:0;color:var(--muted);">Aucun cours publié pour votre campus. L\'administration universitaire peut en ajouter.</p>';
        return;
      }
      el.innerHTML = list.map((c) => courseCard(c, { canEnroll: true })).join("");
      el.querySelectorAll("[data-enroll-crs]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          try {
            await enroll(session, btn.dataset.enrollCrs);
            await refresh();
            alert("Inscription enregistrée.");
          } catch (err) {
            alert(err.message || "Inscription impossible.");
          }
        });
      });
    }

    function applyFilters() {
      const q = (root.querySelector(".cat-search")?.value || "").trim().toLowerCase();
      const cat = root.querySelector(".cat-filter-cat")?.value || "all";
      let list = allCourses.slice();
      if (cat !== "all") list = list.filter((c) => c.category === cat);
      if (q) {
        list = list.filter((c) =>
          [c.title, c.code, c.description, c.filiere, c.professorName, catLabel(c.category)]
            .join(" ")
            .toLowerCase()
            .includes(q)
        );
      }
      paintCourses(list);
    }

    async function refresh() {
      allCourses = await listForStudent(session);
      await renderEnrollments();
      applyFilters();
    }

    root.querySelector(".cat-search")?.addEventListener("input", applyFilters);
    root.querySelector(".cat-filter-cat")?.addEventListener("change", applyFilters);
    refresh();
  }

  function mountManageUI(root, session) {
    if (!root || !session) return;
    const catOpts = CATEGORIES.map(
      (c) => '<option value="' + c.id + '">' + esc(c.label) + "</option>"
    ).join("");
    const nivOpts =
      typeof SAC_COURSES !== "undefined" && SAC_COURSES.niveauOptionsHtml
        ? SAC_COURSES.niveauOptionsHtml("tous").replace(
            '<option value="l1"',
            '<option value="tous">Tous niveaux</option><option value="l1"'
          )
        : '<option value="tous">Tous niveaux</option>';

    root.innerHTML =
      '<div class="panel panel--workspace" style="margin-bottom:1rem;">' +
      '<div class="panel__head"><h2>Publier un cours</h2></div><div class="panel__body">' +
      '<form id="catPublishForm" class="rec-form ws-form-grid">' +
      '<div class="fg"><label>Code cours *</label><input class="fi" id="catCode" required placeholder="Ex. ECO101" /></div>' +
      '<div class="fg"><label>Titre *</label><input class="fi" id="catTitle" required minlength="3" placeholder="Introduction à l\'économie" /></div>' +
      '<div class="fg"><label>Catégorie</label><select class="fi" id="catCategory">' +
      catOpts +
      "</select></div>" +
      '<div class="fg"><label>Niveau cible</label><select class="fi" id="catNiveau">' +
      nivOpts +
      "</select></div>" +
      '<div class="fg"><label>Filière (optionnel)</label><input class="fi" id="catFiliere" placeholder="Sciences économiques" /></div>' +
      '<div class="fg"><label>Professeur</label><input class="fi" id="catProf" placeholder="Nom du responsable" /></div>' +
      '<div class="fg" style="grid-column:1/-1;"><label>Description</label><textarea class="fi" id="catDesc" rows="3"></textarea></div>' +
      '<div class="fg"><label>URL ressource (PDF, vidéo…)</label><input class="fi" id="catResource" placeholder="https://…" /></div>' +
      '<div class="fg"><label>Durée (heures)</label><input class="fi" id="catHours" type="number" min="0" value="0" /></div>' +
      '<div class="fg"><label>Crédits</label><input class="fi" id="catCredits" type="number" min="0" value="0" /></div>' +
      '<div class="fg" style="grid-column:1/-1;"><label class="chk"><input type="checkbox" id="catPublished" checked /> Publier dans le catalogue étudiant</label></div>' +
      '<div class="fg" style="grid-column:1/-1;"><button type="submit" class="btn btn--role">Publier le cours</button></div>' +
      "</form></div></div>" +
      '<div class="panel"><div class="panel__head"><h2>Cours du campus</h2></div>' +
      '<div class="panel__body" id="catManageList"><p class="empty">Chargement…</p></div></div>';

    async function renderList() {
      const el = root.querySelector("#catManageList");
      try {
        const items = await listManage(session);
        if (!items.length) {
          el.innerHTML = '<p class="empty" style="margin:0;">Aucun cours publié.</p>';
          return;
        }
        el.innerHTML =
          '<div style="display:grid;gap:0.65rem;">' +
          items
            .map(
              (c) =>
                '<article style="border:1px solid var(--border);border-radius:10px;padding:0.85rem;">' +
                "<strong>" +
                esc(c.title) +
                "</strong> · " +
                esc(c.code) +
                " · " +
                esc(catLabel(c.category)) +
                "<br/><span style='font-size:0.84rem;color:var(--muted);'>" +
                (c.published ? "Publié" : "Brouillon") +
                (c.filiere ? " · " + esc(c.filiere) : "") +
                "</span>" +
                '<div style="margin-top:0.5rem;display:flex;gap:0.4rem;">' +
                '<button type="button" class="btn btn--ghost btn--sm" data-toggle-crs="' +
                esc(c.id) +
                '">' +
                (c.published ? "Dépublier" : "Publier") +
                "</button>" +
                '<button type="button" class="btn btn--ghost btn--sm" data-del-crs="' +
                esc(c.id) +
                '">Supprimer</button></div></article>"
            )
            .join("") +
          "</div>";
        el.querySelectorAll("[data-toggle-crs]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const item = items.find((x) => x.id === btn.dataset.toggleCrs);
            if (!item) return;
            try {
              await updateCourse(item.id, { published: !item.published });
              await renderList();
            } catch (err) {
              alert(err.message);
            }
          });
        });
        el.querySelectorAll("[data-del-crs]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            if (!confirm("Supprimer ce cours du catalogue ?")) return;
            try {
              await deleteCourse(btn.dataset.delCrs);
              await renderList();
            } catch (err) {
              alert(err.message);
            }
          });
        });
      } catch (err) {
        el.innerHTML = '<p style="color:#b91c1c;">' + esc(err.message) + "</p>";
      }
    }

    root.querySelector("#catPublishForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        code: root.querySelector("#catCode").value.trim(),
        title: root.querySelector("#catTitle").value.trim(),
        category: root.querySelector("#catCategory").value,
        niveau: root.querySelector("#catNiveau").value,
        filiere: root.querySelector("#catFiliere").value.trim(),
        professorName: root.querySelector("#catProf").value.trim(),
        description: root.querySelector("#catDesc").value.trim(),
        resourceUrl: root.querySelector("#catResource").value.trim(),
        durationHours: Number(root.querySelector("#catHours").value || 0),
        credits: Number(root.querySelector("#catCredits").value || 0),
        published: root.querySelector("#catPublished").checked,
        universityName: session.nomUniversite || session.universite || "",
      };
      if (session.role === "professeur") {
        payload.professorEmail = session.identifiant || session.email;
      }
      try {
        await createCourse(session, payload);
        e.target.reset();
        root.querySelector("#catPublished").checked = true;
        await renderList();
        alert("Cours publié dans le catalogue.");
      } catch (err) {
        alert(err.message || "Publication impossible.");
      }
    });

    renderList();
  }

  return {
    CATEGORIES,
    catLabel,
    listForStudent,
    listManage,
    enroll,
    mountStudentUI,
    mountManageUI,
  };
})();

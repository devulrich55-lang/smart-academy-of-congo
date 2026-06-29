/**
 * Stages & emplois — offres campus / nationales + candidatures étudiant
 */
const SAC_CAREERS = (function () {
  const TYPES = [
    { id: "stage", label: "Stage", icon: "🎓" },
    { id: "emploi", label: "Emploi", icon: "💼" },
    { id: "alternance", label: "Alternance", icon: "🔄" },
    { id: "bourse", label: "Bourse / programme", icon: "🏅" },
    { id: "autre", label: "Autre", icon: "📋" },
  ];

  const STATUS_LABELS = {
    pending: "En attente",
    viewed: "Vue",
    accepted: "Acceptée",
    rejected: "Refusée",
  };

  function esc(s) {
    const el = document.createElement("div");
    el.textContent = String(s || "");
    return el.innerHTML;
  }

  function typeLabel(id) {
    return TYPES.find((t) => t.id === id)?.label || id || "Offre";
  }

  function typeIcon(id) {
    return TYPES.find((t) => t.id === id)?.icon || "💼";
  }

  function statusLabel(id) {
    return STATUS_LABELS[id] || id || "—";
  }

  async function listForStudent(session) {
    if (typeof SAC_API !== "undefined" && SAC_API.listCareersForStudent) {
      try {
        const online = await SAC_API.ensureOnline();
        if (online) return await SAC_API.listCareersForStudent();
      } catch {
        /* fallback */
      }
    }
    if (typeof SAC_PLATFORM !== "undefined" && SAC_PLATFORM.getCareers) {
      return SAC_PLATFORM.getCareers();
    }
    return [];
  }

  async function listManage(session) {
    if (typeof SAC_API !== "undefined" && SAC_API.listCareersManage) {
      const online = await SAC_API.ensureOnline();
      if (online) return await SAC_API.listCareersManage();
    }
    return [];
  }

  async function listMyApplications(session) {
    if (typeof SAC_API !== "undefined" && SAC_API.listMyCareerApplications) {
      try {
        const online = await SAC_API.ensureOnline();
        if (online) return await SAC_API.listMyCareerApplications();
      } catch {
        /* ignore */
      }
    }
    return [];
  }

  async function apply(session, offerId, message) {
    if (typeof SAC_API !== "undefined" && SAC_API.applyCareer) {
      const online = await SAC_API.ensureOnline();
      if (online) return await SAC_API.applyCareer(offerId, message);
    }
    throw new Error("Candidature en ligne requise.");
  }

  async function createOffer(session, payload) {
    if (typeof SAC_API !== "undefined" && SAC_API.createCareer) {
      const online = await SAC_API.ensureOnline();
      if (online) return await SAC_API.createCareer(payload);
    }
    throw new Error("Publication en ligne requise.");
  }

  async function updateOffer(id, payload) {
    if (typeof SAC_API !== "undefined" && SAC_API.updateCareer) {
      return SAC_API.updateCareer(id, payload);
    }
    throw new Error("Mise à jour en ligne requise.");
  }

  async function deleteOffer(id) {
    if (typeof SAC_API !== "undefined" && SAC_API.deleteCareer) {
      return SAC_API.deleteCareer(id);
    }
    throw new Error("Suppression en ligne requise.");
  }

  async function listApplications(session, offerId) {
    if (typeof SAC_API !== "undefined" && SAC_API.listCareerApplications) {
      return SAC_API.listCareerApplications(offerId);
    }
    return [];
  }

  async function updateApplicationStatus(session, appId, status) {
    if (typeof SAC_API !== "undefined" && SAC_API.updateCareerApplication) {
      return SAC_API.updateCareerApplication(appId, status);
    }
    throw new Error("Mise à jour en ligne requise.");
  }

  function offerCard(o, opts) {
    const applied = !!o.applied;
    const scopeTag =
      o.scope === "national"
        ? '<span style="font-size:0.72rem;background:rgba(12,61,110,0.12);color:var(--primary);padding:0.15rem 0.45rem;border-radius:999px;margin-left:0.35rem;">National</span>'
        : '<span style="font-size:0.72rem;background:rgba(13,122,74,0.12);color:var(--success);padding:0.15rem 0.45rem;border-radius:999px;margin-left:0.35rem;">Campus</span>';
    const extLink = o.applyUrl
      ? '<a class="btn btn--ghost btn--sm" href="' +
        esc(o.applyUrl) +
        '" target="_blank" rel="noopener">Lien externe</a>'
      : "";
    const btn = applied
      ? '<span style="color:var(--success);font-weight:600;font-size:0.84rem;">✓ Candidature envoyée</span>'
      : opts?.canApply
        ? '<button type="button" class="btn btn--role btn--sm" data-apply-job="' +
          esc(o.id) +
          '">Postuler</button>'
        : "";
    return (
      '<article class="career-card" data-type="' +
      esc(o.type || "stage") +
      '">' +
      '<div class="career-card__icon">' +
      typeIcon(o.type) +
      "</div>" +
      '<div class="career-card__body">' +
      "<strong>" +
      esc(o.title) +
      "</strong>" +
      scopeTag +
      '<p style="margin:0.3rem 0 0;font-size:0.84rem;color:var(--muted);">' +
      esc(typeLabel(o.type)) +
      " · " +
      esc(o.organization || "—") +
      (o.location ? " · " + esc(o.location) : "") +
      "</p>" +
      (o.description
        ? '<p style="margin:0.35rem 0 0;font-size:0.86rem;">' + esc(o.description) + "</p>"
        : "") +
      (o.deadline
        ? '<p style="margin:0.25rem 0 0;font-size:0.78rem;color:var(--muted);">Date limite : ' +
          esc(o.deadline) +
          "</p>"
        : "") +
      '<div style="margin-top:0.55rem;display:flex;gap:0.4rem;flex-wrap:wrap;align-items:center;">' +
      btn +
      extLink +
      "</div></div></article>"
    );
  }

  function mountStudentUI(root, session) {
    if (!root || !session) return;
    root.innerHTML =
      '<div class="career-toolbar">' +
      '<input type="search" class="fi career-search" placeholder="Rechercher stage, entreprise, ville…" />' +
      '<select class="fi career-filter-type"><option value="all">Tous types</option>' +
      TYPES.map((t) => '<option value="' + t.id + '">' + esc(t.label) + "</option>").join("") +
      "</select>" +
      '<select class="fi career-filter-scope"><option value="all">Campus + national</option><option value="national">National uniquement</option><option value="campus">Campus uniquement</option></select></div>" +
      '<div class="panel" style="margin:1rem 0;"><div class="panel__head"><h2>Mes candidatures</h2></div>' +
      '<div class="panel__body" id="careerMyApps"><p class="empty">Chargement…</p></div></div>' +
      '<div class="panel"><div class="panel__head"><h2>Offres disponibles</h2></div>' +
      '<div class="panel__body career-grid" id="careerList"><p class="empty">Chargement…</p></div></div>';

    let allOffers = [];

    async function renderApps() {
      const el = root.querySelector("#careerMyApps");
      const apps = await listMyApplications(session);
      if (!apps.length) {
        el.innerHTML =
          '<p style="margin:0;color:var(--muted);">Aucune candidature pour le moment.</p>';
        return;
      }
      el.innerHTML =
        '<div style="display:grid;gap:0.55rem;">' +
        apps
          .map(
            (a) =>
              '<div style="border:1px solid var(--border);border-radius:10px;padding:0.75rem;">' +
              "<strong>" +
              esc(a.offer?.title || "Offre") +
              "</strong> · " +
              esc(statusLabel(a.status)) +
              '<br/><span style="font-size:0.82rem;color:var(--muted);">' +
              esc(a.offer?.organization || "") +
              " · " +
              new Date(a.appliedAt).toLocaleDateString("fr-FR") +
              "</span></div>"
          )
          .join("") +
        "</div>";
    }

    function paintOffers(list) {
      const el = root.querySelector("#careerList");
      if (!list.length) {
        el.innerHTML =
          '<p style="margin:0;color:var(--muted);">Aucune offre publiée pour le moment.</p>';
        return;
      }
      el.innerHTML = list.map((o) => offerCard(o, { canApply: true })).join("");
      el.querySelectorAll("[data-apply-job]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const msg = prompt("Message de motivation (optionnel) :");
          if (msg === null) return;
          try {
            await apply(session, btn.dataset.applyJob, msg);
            await refresh();
            alert("Candidature enregistrée.");
          } catch (err) {
            alert(err.message || "Candidature impossible.");
          }
        });
      });
    }

    function applyFilters() {
      const q = (root.querySelector(".career-search")?.value || "").trim().toLowerCase();
      const type = root.querySelector(".career-filter-type")?.value || "all";
      const scope = root.querySelector(".career-filter-scope")?.value || "all";
      let list = allOffers.slice();
      if (type !== "all") list = list.filter((o) => o.type === type);
      if (scope !== "all") list = list.filter((o) => o.scope === scope);
      if (q) {
        list = list.filter((o) =>
          [o.title, o.organization, o.location, o.description, typeLabel(o.type)]
            .join(" ")
            .toLowerCase()
            .includes(q)
        );
      }
      paintOffers(list);
    }

    async function refresh() {
      allOffers = await listForStudent(session);
      await renderApps();
      applyFilters();
    }

    root.querySelector(".career-search")?.addEventListener("input", applyFilters);
    root.querySelector(".career-filter-type")?.addEventListener("change", applyFilters);
    root.querySelector(".career-filter-scope")?.addEventListener("change", applyFilters);
    refresh();
  }

  function mountManageUI(root, session, options) {
    if (!root || !session) return;
    const isNational = options?.national || session.role === "ministere";
    const typeOpts = TYPES.map(
      (t) => '<option value="' + t.id + '">' + esc(t.label) + "</option>"
    ).join("");

    root.innerHTML =
      '<div class="panel panel--workspace" style="margin-bottom:1rem;">' +
      '<div class="panel__head"><h2>' +
      (isNational ? "Publier une offre nationale" : "Publier une offre campus") +
      "</h2></div><div class="panel__body">" +
      '<form id="careerPublishForm" class="rec-form ws-form-grid">' +
      '<div class="fg"><label>Type *</label><select class="fi" id="jobType" required>' +
      typeOpts +
      "</select></div>" +
      '<div class="fg"><label>Titre du poste / stage *</label><input class="fi" id="jobTitle" required minlength="3" placeholder="Stage développeur web" /></div>' +
      '<div class="fg"><label>Organisation *</label><input class="fi" id="jobOrg" required placeholder="Entreprise ou institution" /></div>' +
      '<div class="fg"><label>Lieu</label><input class="fi" id="jobLocation" placeholder="Capitale, ville principale…" /></div>' +
      '<div class="fg"><label>Filière cible (optionnel)</label><input class="fi" id="jobFiliere" placeholder="Informatique, Droit…" /></div>' +
      '<div class="fg"><label>Niveau (optionnel)</label><input class="fi" id="jobNiveau" placeholder="L3, Master…" /></div>' +
      '<div class="fg" style="grid-column:1/-1;"><label>Description *</label><textarea class="fi" id="jobDesc" rows="3" required placeholder="Missions, durée, profil recherché…"></textarea></div>' +
      '<div class="fg"><label>E-mail contact</label><input class="fi" id="jobEmail" type="email" placeholder="rh@entreprise.cd" /></div>' +
      '<div class="fg"><label>Lien candidature externe</label><input class="fi" id="jobUrl" placeholder="https://…" /></div>' +
      '<div class="fg"><label>Date limite</label><input class="fi" id="jobDeadline" type="date" /></div>' +
      '<div class="fg" style="grid-column:1/-1;"><label class="chk"><input type="checkbox" id="jobPublished" checked /> Publier immédiatement</label></div>' +
      '<div class="fg" style="grid-column:1/-1;"><button type="submit" class="btn btn--role">Publier l\'offre</button></div>' +
      "</form></div></div>" +
      '<div class="panel"><div class="panel__head"><h2>Offres publiées</h2></div>' +
      '<div class="panel__body" id="careerManageList"><p class="empty">Chargement…</p></div></div>';

    async function renderList() {
      const el = root.querySelector("#careerManageList");
      try {
        const items = await listManage(session);
        if (!items.length) {
          el.innerHTML = '<p class="empty" style="margin:0;">Aucune offre.</p>';
          return;
        }
        el.innerHTML =
          '<div style="display:grid;gap:0.75rem;">' +
          items
            .map(
              (o) =>
                '<article style="border:1px solid var(--border);border-radius:10px;padding:0.85rem;">' +
                "<strong>" +
                esc(o.title) +
                "</strong> · " +
                esc(typeLabel(o.type)) +
                (o.scope === "national" ? " · 🌍 Régional" : " · Campus") +
                "<br/><span style='font-size:0.84rem;color:var(--muted);'>" +
                esc(o.organization) +
                (o.location ? " · " + esc(o.location) : "") +
                " · " +
                (o.published ? "Publié" : "Brouillon") +
                "</span>" +
                '<div style="margin-top:0.5rem;display:flex;gap:0.4rem;flex-wrap:wrap;">' +
                '<button type="button" class="btn btn--ghost btn--sm" data-view-apps="' +
                esc(o.id) +
                '">Candidatures</button>' +
                '<button type="button" class="btn btn--ghost btn--sm" data-toggle-job="' +
                esc(o.id) +
                '">' +
                (o.published ? "Dépublier" : "Publier") +
                "</button>" +
                '<button type="button" class="btn btn--ghost btn--sm" data-del-job="' +
                esc(o.id) +
                '">Supprimer</button></div>' +
                '<div id="apps-' +
                esc(o.id) +
                '" style="display:none;margin-top:0.65rem;"></div></article>'
            )
            .join("") +
          "</div>";

        el.querySelectorAll("[data-toggle-job]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const item = items.find((x) => x.id === btn.dataset.toggleJob);
            if (!item) return;
            try {
              await updateOffer(item.id, { published: !item.published });
              await renderList();
            } catch (err) {
              alert(err.message);
            }
          });
        });
        el.querySelectorAll("[data-del-job]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            if (!confirm("Supprimer cette offre ?")) return;
            try {
              await deleteOffer(btn.dataset.delJob);
              await renderList();
            } catch (err) {
              alert(err.message);
            }
          });
        });
        el.querySelectorAll("[data-view-apps]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const box = document.getElementById("apps-" + btn.dataset.viewApps);
            if (!box) return;
            if (box.style.display === "block") {
              box.style.display = "none";
              return;
            }
            box.style.display = "block";
            box.innerHTML = "<p style='color:var(--muted);'>Chargement…</p>";
            try {
              const apps = await listApplications(session, btn.dataset.viewApps);
              if (!apps.length) {
                box.innerHTML = "<p style='margin:0;color:var(--muted);'>Aucune candidature.</p>";
                return;
              }
              box.innerHTML =
                '<div style="display:grid;gap:0.45rem;">' +
                apps
                  .map(
                    (a) =>
                      '<div style="border:1px dashed var(--border);border-radius:8px;padding:0.55rem;font-size:0.84rem;">' +
                      "<strong>" +
                      esc(a.studentName || a.studentEmail) +
                      "</strong> · " +
                      esc(statusLabel(a.status)) +
                      (a.message
                        ? '<p style="margin:0.25rem 0 0;">' + esc(a.message) + "</p>"
                        : "") +
                      '<div style="margin-top:0.35rem;display:flex;gap:0.3rem;flex-wrap:wrap;">' +
                      ["viewed", "accepted", "rejected"].map(
                        (st) =>
                          '<button type="button" class="btn btn--ghost btn--xs" data-set-app="' +
                          esc(a.id) +
                          '" data-set-status="' +
                          st +
                          '">' +
                          esc(statusLabel(st)) +
                          "</button>"
                      ).join("") +
                      "</div></div>"
                  )
                  .join("") +
                "</div>";
              box.querySelectorAll("[data-set-app]").forEach((b) => {
                b.addEventListener("click", async () => {
                  try {
                    await updateApplicationStatus(session, b.dataset.setApp, b.dataset.setStatus);
                    btn.click();
                    btn.click();
                  } catch (err) {
                    alert(err.message);
                  }
                });
              });
            } catch (err) {
              box.innerHTML = "<p style='color:#b91c1c;'>" + esc(err.message) + "</p>";
            }
          });
        });
      } catch (err) {
        el.innerHTML = "<p style='color:#b91c1c;'>" + esc(err.message) + "</p>";
      }
    }

    root.querySelector("#careerPublishForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        scope: isNational ? "national" : "campus",
        type: root.querySelector("#jobType").value,
        title: root.querySelector("#jobTitle").value.trim(),
        organization: root.querySelector("#jobOrg").value.trim(),
        location: root.querySelector("#jobLocation").value.trim(),
        filiere: root.querySelector("#jobFiliere").value.trim(),
        niveau: root.querySelector("#jobNiveau").value.trim(),
        description: root.querySelector("#jobDesc").value.trim(),
        contactEmail: root.querySelector("#jobEmail").value.trim(),
        applyUrl: root.querySelector("#jobUrl").value.trim(),
        deadline: root.querySelector("#jobDeadline").value,
        published: root.querySelector("#jobPublished").checked,
        universityName: session.nomUniversite || session.universite || "MESU",
      };
      try {
        await createOffer(session, payload);
        e.target.reset();
        root.querySelector("#jobPublished").checked = true;
        await renderList();
        alert("Offre publiée.");
      } catch (err) {
        alert(err.message || "Publication impossible.");
      }
    });

    renderList();
  }

  return {
    TYPES,
    typeLabel,
    mountStudentUI,
    mountManageUI,
  };
})();

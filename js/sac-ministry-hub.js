/**
 * Hub Ministère — 10 activités nationales (MESU)
 */
const SAC_MINISTRY_HUB = (function () {
  const MODULES = [
    {
      id: "accueil",
      section: "accueil",
      icon: "📊",
      label: "Tableau de bord",
      short: "Statistiques nationales",
    },
    {
      id: "publier",
      section: "publier",
      icon: "📢",
      label: "Communications",
      short: "Circulaires, communiqués, calendrier",
    },
    {
      id: "etablissements",
      section: "etablissements",
      icon: "🏛️",
      label: "Établissements",
      short: "Validation & suivi universités",
    },
    {
      id: "diplomes",
      section: "diplomes",
      icon: "🎓",
      label: "Diplômes",
      short: "Vérification & authenticité",
    },
    {
      id: "performances",
      section: "performances",
      icon: "📈",
      label: "Performances",
      short: "Réussite, diplômés, facultés",
    },
    {
      id: "inspections",
      section: "inspections",
      icon: "🔍",
      label: "Inspections",
      short: "Programmation & rapports",
    },
    {
      id: "plaintes",
      section: "plaintes",
      icon: "📩",
      label: "Plaintes",
      short: "Réclamations & suivi",
    },
    {
      id: "accreditations",
      section: "accreditations",
      icon: "✅",
      label: "Accréditations",
      short: "Filières & agréments",
    },
    {
      id: "messagerie",
      section: "messagerie",
      icon: "✉️",
      label: "Messagerie",
      short: "Messages aux universités",
    },
    {
      id: "rapports",
      section: "rapports",
      icon: "📄",
      label: "Rapports",
      short: "Export PDF / Excel",
    },
  ];

  const STORAGE_KEY = "sac_ministry_hub_v1";
  let sessionRef = null;

  function esc(s) {
    const el = document.createElement("div");
    el.textContent = String(s ?? "");
    return el.innerHTML;
  }

  function readStore() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function writeStore(patch) {
    const all = readStore();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...all, ...patch }));
  }

  function resolveUniversityStatus(admin, statuses, key) {
    const local = statuses[key];
    if (local === "suspended") return "suspended";
    if (admin?.verified === false || admin?.active === false) return "pending";
    if (local === "pending") return "pending";
    return "approved";
  }

  function statusTag(st) {
    if (st === "suspended") return '<span class="mh-tag mh-tag--bad">Suspendu</span>';
    if (st === "pending") return '<span class="mh-tag mh-tag--wait">En attente</span>';
    return '<span class="mh-tag mh-tag--ok">Actif</span>';
  }

  function uid(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  }

  function provinceLabel(admin) {
    return String(admin?.province || admin?.provinceName || admin?.region || admin?.ville || "Non renseignée").trim();
  }

  function aggregateByProvince(admins) {
    const unis = (admins || []).filter((a) => a.role === "universite");
    const map = {};
    unis.forEach((u) => {
      const p = provinceLabel(u);
      if (!map[p]) map[p] = { province: p, universities: 0 };
      map[p].universities += 1;
    });
    return Object.values(map).sort((a, b) => b.universities - a.universities);
  }

  function recordEnrollmentSnapshot(stats) {
    const hist = readStore().enrollmentHistory || [];
    const today = new Date().toISOString().slice(0, 10);
    if (!hist.length || hist[0].date !== today) {
      writeStore({
        enrollmentHistory: [
          { date: today, students: stats.students, universities: stats.universities },
          ...hist,
        ].slice(0, 45),
      });
    }
  }

  function loadAllReclamations() {
    try {
      return JSON.parse(localStorage.getItem("sac_reclamations") || "[]");
    } catch {
      return [];
    }
  }

  function saveAllReclamations(list) {
    localStorage.setItem("sac_reclamations", JSON.stringify(list));
  }

  function complaintStatutLabel(id) {
    if (typeof SAC_SECTIONS !== "undefined" && SAC_SECTIONS.statutLabel) {
      return SAC_SECTIONS.statutLabel(id);
    }
    const map = { ouverte: "Ouverte", en_cours: "En cours", resolue: "Résolue", rejetee: "Rejetée" };
    return map[id] || id || "—";
  }

  function bindGotoButtons(root) {
    root.querySelectorAll("[data-mh-goto],[data-goto]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.mhGoto || btn.dataset.goto;
        if (target && typeof window.__mhGoto === "function") window.__mhGoto(target);
      });
    });
  }

  function injectNav(activeSection) {
    const nav = document.querySelector(".nav-tabs");
    if (!nav) return;
    nav.innerHTML =
      MODULES.map(
        (m) =>
          '<button type="button" class="nav-tab' +
          (m.section === activeSection ? " active" : "") +
          '" data-section="' +
          m.section +
          '">' +
          m.icon +
          " " +
          esc(m.label) +
          "</button>"
      ).join("") +
      '<button type="button" class="nav-tab" data-section="administrateurs">👥 Comptes</button>' +
      '<button type="button" class="nav-tab" data-section="activites">📋 Journal</button>' +
      '<button type="button" class="nav-tab" data-section="securite">🔒 Sécurité</button>';
  }

  function setupMinistryLayout() {
    document.body.classList.add("ws-ministry-mode");
    const legacy = document.getElementById("ministryLegacyAccueil");
    const national = document.getElementById("ministryNationalRoot");
    if (legacy) legacy.hidden = true;
    if (national) national.hidden = false;
    injectNav("accueil");
  }

  async function loadNationalStats(session) {
    const stats = {
      universities: 0,
      students: 0,
      professors: 0,
      staff: 0,
      byProvince: [],
      admins: [],
      error: null,
    };
    try {
      if (typeof SAC_INSTITUTIONAL !== "undefined") {
        const { summary, admins } = await SAC_INSTITUTIONAL.load(session);
        const list = Array.isArray(admins) ? admins : [];
        stats.admins = list;
        stats.universities = list.filter((a) => a.role === "universite").length;
        if (summary?.byRole?.universite != null) {
          stats.universities = summary.byRole.universite;
        }
        if (summary?.byRole?.professeur != null) {
          stats.professors = summary.byRole.professeur;
        }
        stats.byProvince = aggregateByProvince(list);
      }
      if (typeof SAC_API !== "undefined" && SAC_API.getPublicPlatformStats) {
        const pub = await SAC_API.getPublicPlatformStats();
        stats.students = Number(pub?.registeredStudents) || 0;
        const totalUsers = Number(pub?.registeredUsers) || 0;
        stats.staff = Math.max(0, totalUsers - stats.students);
        if (!stats.professors && pub?.registeredProfessors != null) {
          stats.professors = Number(pub.registeredProfessors) || 0;
        }
      }
      recordEnrollmentSnapshot(stats);
    } catch (err) {
      stats.error = err.message || String(err);
    }
    return stats;
  }

  function renderModuleGrid(onSelect) {
    return (
      '<div class="mh-grid">' +
      MODULES.filter((m) => m.section !== "accueil")
        .map(
          (m) =>
            '<button type="button" class="mh-card" data-mh-goto="' +
            m.section +
            '">' +
            '<span class="mh-card__icon">' +
            m.icon +
            "</span>" +
            "<strong>" +
            esc(m.label) +
            "</strong>" +
            "<span>" +
            esc(m.short) +
            "</span></button>"
        )
        .join("") +
      "</div>"
    );
  }

  async function mountNationalDashboard(root, session) {
    if (!root) return;
    root.innerHTML = '<p class="page-desc">Chargement des indicateurs nationaux…</p>';
    const stats = await loadNationalStats(session);
    const country =
      session.countryCode && typeof SAC_AFRICA_COUNTRIES !== "undefined"
        ? SAC_AFRICA_COUNTRIES.label(session.countryCode)
        : "National";

    const hist = readStore().enrollmentHistory || [];
    const provinceRows = stats.byProvince.length
      ? stats.byProvince
          .map(
            (p) =>
              "<tr><td>" +
              esc(p.province) +
              "</td><td>" +
              p.universities +
              '</td><td style="color:var(--muted)">—</td></tr>'
          )
          .join("")
      : '<tr><td colspan="3" style="text-align:center;color:var(--muted)">Aucun campus avec province renseignée</td></tr>';
    const histRows = hist.length
      ? hist
          .slice(0, 12)
          .map(
            (h) =>
              "<tr><td>" +
              esc(h.date) +
              "</td><td>" +
              Number(h.students || 0).toLocaleString("fr-FR") +
              "</td><td>" +
              Number(h.universities || 0) +
              "</td></tr>"
          )
          .join("")
      : '<tr><td colspan="3" style="text-align:center;color:var(--muted)">Historique en cours de constitution</td></tr>';

    root.innerHTML =
      '<h2 class="mh-title">Tableau de bord national — ' +
      esc(country) +
      "</h2>" +
      (stats.error
        ? '<div class="mh-alert mh-alert--warn">' + esc(stats.error) + "</div>"
        : "") +
      '<div class="mh-kpi-row">' +
      '<div class="mh-kpi"><strong>' +
      stats.universities +
      "</strong><span>Universités inscrites</span></div>" +
      '<div class="mh-kpi"><strong>' +
      stats.students.toLocaleString("fr-FR") +
      "</strong><span>Étudiants</span></div>" +
      '<div class="mh-kpi"><strong>' +
      (stats.professors ? stats.professors.toLocaleString("fr-FR") : "—") +
      "</strong><span>Enseignants</span></div>" +
      '<div class="mh-kpi"><strong>' +
      Math.max(0, stats.staff).toLocaleString("fr-FR") +
      "</strong><span>Utilisateurs plateforme</span></div>" +
      "</div>" +
      '<div class="panel panel--ws" style="margin-top:1rem">' +
      '<div class="panel__head"><h2>Statistiques par province</h2></div>' +
      '<div class="panel__body"><p class="page-desc">Répartition des universités partenaires par province ou ville déclarée.</p>' +
      '<table class="ws-table"><thead><tr><th>Province / zone</th><th>Universités</th><th>Étudiants</th></tr></thead>' +
      "<tbody>" +
      provinceRows +
      "</tbody></table></div></div>" +
      '<div class="panel panel--ws" style="margin-top:1rem">' +
      '<div class="panel__head"><h2>Évolution des inscriptions</h2></div>' +
      '<div class="panel__body"><p class="page-desc">Snapshots quotidiens des indicateurs nationaux (45 derniers jours).</p>' +
      '<table class="ws-table"><thead><tr><th>Date</th><th>Étudiants</th><th>Universités</th></tr></thead>' +
      "<tbody>" +
      histRows +
      "</tbody></table></div></div>" +
      "<h3 style=\"margin:1.25rem 0 0.75rem;font-size:1rem\">Activités du Ministère</h3>" +
      renderModuleGrid();

    root.querySelectorAll("[data-mh-goto]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (typeof window.__mhGoto === "function") window.__mhGoto(btn.dataset.mhGoto);
      });
    });
  }

  async function mountEstablishments(root, session) {
    if (!root) return;
    root.innerHTML = "<p class=\"page-desc\">Chargement…</p>";
    let universities = [];
    try {
      const { admins } = await SAC_INSTITUTIONAL.load(session);
      universities = (admins || []).filter((a) => a.role === "universite");
    } catch (err) {
      root.innerHTML =
        '<div class="mh-alert mh-alert--warn">' + esc(err.message) + "</div>";
      return;
    }
    const store = readStore();
    const statuses = store.universityStatus || {};

    root.innerHTML =
      "<p class=\"page-desc\">Approuver, suspendre ou réactiver une université partenaire. Le statut serveur (compte vérifié) est lu depuis l'API ; la suspension ministérielle est enregistrée dans le registre national EvoSU.</p>" +
      '<div class="mh-actions" style="margin-bottom:1rem">' +
      '<button type="button" class="btn btn--role" data-goto="administrateurs">👥 Voir tous les comptes campus</button></div>' +
      (universities.length
        ? '<div class="ws-table-wrap"><table class="ws-table"><thead><tr>' +
          "<th>Établissement</th><th>E-mail</th><th>Ville</th><th>Statut</th><th>Actions</th>" +
          "</tr></thead><tbody>" +
          universities
            .map((u) => {
              const key = String(u.email || u.id || "").toLowerCase();
              const st = resolveUniversityStatus(u, statuses, key);
              const stLabel = statusTag(st);
              return (
                "<tr data-uni-email=\"" +
                esc(key) +
                "\"><td><strong>" +
                esc(u.nomUniversite || u.displayName || u.sigle || "—") +
                "</strong><br><small>" +
                esc(u.sigle || u.universite || "") +
                "</small></td><td>" +
                esc(u.email) +
                "</td><td>" +
                esc(u.ville || "—") +
                "</td><td class=\"mh-status-cell\">" +
                stLabel +
                '</td><td class="mh-actions">' +
                '<button type="button" class="btn btn--ghost btn--xs" data-uni-action="approve">Approuver</button> ' +
                '<button type="button" class="btn btn--ghost btn--xs" data-uni-action="suspend">Suspendre</button> ' +
                '<button type="button" class="btn btn--ghost btn--xs" data-uni-action="reactivate">Réactiver</button>' +
                "</td></tr>"
              );
            })
            .join("") +
          "</tbody></table></div>"
        : '<p class="page-desc">Aucune université enregistrée pour votre pays. Demandez au Super Admin la création d\'un compte « Admin université ».</p>');

    root.querySelectorAll("[data-uni-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const row = btn.closest("[data-uni-email]");
        const email = row?.getAttribute("data-uni-email");
        if (!email) return;
        const action = btn.dataset.uniAction;
        const store2 = readStore();
        const statuses2 = { ...(store2.universityStatus || {}) };
        if (action === "approve" || action === "reactivate") statuses2[email] = "approved";
        else if (action === "suspend") statuses2[email] = "suspended";
        writeStore({ universityStatus: statuses2 });
        mountEstablishments(root, session);
      });
    });
    root.querySelectorAll("[data-goto]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (typeof window.__mhGoto === "function") window.__mhGoto(btn.dataset.goto);
      });
    });
  }

  async function mountDiplomas(root, session) {
    if (!root) return;
    root.innerHTML = "<p class=\"page-desc\">Chargement des diplômes…</p>";
    let list = [];
    try {
      if (typeof SAC_API !== "undefined" && SAC_API.listCampusDiplomasManage) {
        await SAC_API.ensureOnline(false);
        list = (await SAC_API.listCampusDiplomasManage()) || [];
      }
    } catch {
      list = [];
    }
    const dupes = {};
    list.forEach((d) => {
      const k = String(d.verificationCode || d.diplomaNumber || "").trim();
      if (k) dupes[k] = (dupes[k] || 0) + 1;
    });

    root.innerHTML =
      "<p class=\"page-desc\">Consulter les diplômes enregistrés, vérifier leur authenticité et détecter les doublons.</p>" +
      '<div class="mh-actions" style="margin-bottom:1rem">' +
      '<a class="btn btn--ghost" href="verifier-diplome.html" target="_blank" rel="noopener">🔍 Page publique de vérification</a></div>' +
      (list.length
        ? '<div class="ws-table-wrap"><table class="ws-table"><thead><tr>' +
          "<th>Étudiant</th><th>Université</th><th>Type</th><th>N°</th><th>Code</th><th>Statut</th>" +
          "</tr></thead><tbody>" +
          list
            .slice(0, 80)
            .map((d) => {
              const code = d.verificationCode || "—";
              const fraud = dupes[code] > 1;
              return (
                "<tr" +
                (fraud ? ' style="background:#fef2f2"' : "") +
                "><td>" +
                esc(d.studentName || d.studentEmail) +
                "</td><td>" +
                esc(d.universite || d.universityName || "—") +
                "</td><td>" +
                esc(d.diplomaType || "—") +
                "</td><td>" +
                esc(d.diplomaNumber || "—") +
                "</td><td><code>" +
                esc(code) +
                "</code>" +
                (fraud ? ' <span class="mh-tag mh-tag--bad">Doublon</span>' : "") +
                "</td><td>" +
                (d.revokedAt
                  ? '<span class="mh-tag mh-tag--bad">Révoqué</span>'
                  : '<span class="mh-tag mh-tag--ok">Valide</span>') +
                "</td></tr>"
              );
            })
            .join("") +
          "</tbody></table></div>"
        : '<p class="page-desc">Aucun diplôme enregistré sur la plateforme pour le moment.</p>');
  }

  async function mountPerformances(root, session) {
    if (!root) return;
    root.innerHTML = "<p class=\"page-desc\">Chargement des indicateurs…</p>";
    const stats = await loadNationalStats(session);
    let diplomas = [];
    try {
      if (typeof SAC_API !== "undefined" && SAC_API.listCampusDiplomasManage) {
        diplomas = (await SAC_API.listCampusDiplomasManage()) || [];
      }
    } catch {
      diplomas = [];
    }
    const byUni = {};
    diplomas.forEach((d) => {
      const u = d.universite || d.universityName || "—";
      byUni[u] = (byUni[u] || 0) + 1;
    });
    const uniRows = Object.entries(byUni)
      .sort((a, b) => b[1] - a[1])
      .map(
        ([name, count]) =>
          "<tr><td>" +
          esc(name) +
          "</td><td>" +
          count +
          '</td><td style="color:var(--muted)">—</td></tr>'
      )
      .join("");

    root.innerHTML =
      "<p class=\"page-desc\">Indicateurs nationaux consolidés à partir du registre diplômes et des statistiques plateforme.</p>" +
      '<div class="mh-kpi-row" style="margin-bottom:1rem">' +
      '<div class="mh-kpi"><strong>' +
      diplomas.length +
      "</strong><span>Diplômes enregistrés</span></div>" +
      '<div class="mh-kpi"><strong>' +
      stats.students.toLocaleString("fr-FR") +
      "</strong><span>Étudiants inscrits</span></div>" +
      '<div class="mh-kpi"><strong>' +
      Object.keys(byUni).length +
      "</strong><span>Universités avec diplômés</span></div></div>" +
      '<div class="panel panel--ws"><div class="panel__head"><h2>Diplômés par établissement</h2></div>' +
      '<div class="panel__body ws-table-wrap"><table class="ws-table"><thead><tr>' +
      "<th>Université</th><th>Diplômés</th><th>Taux de réussite</th></tr></thead><tbody>" +
      (uniRows ||
        '<tr><td colspan="3" style="text-align:center;color:var(--muted)">Aucun diplôme enregistré</td></tr>') +
      "</tbody></table></div></div>" +
      '<p class="ws-field-hint" style="margin-top:0.75rem">Le taux de réussite par faculté sera disponible lors de la synchronisation des notes campus.</p>';
  }

  function mountInspections(root, session) {
    if (!root) return;
    const inspections = readStore().inspections || [];
    root.innerHTML =
      "<p class=\"page-desc\">Programmer des inspections et enregistrer les recommandations ministérielles.</p>" +
      '<div class="panel panel--ws" style="margin-bottom:1rem"><div class="panel__head"><h2>Programmer une inspection</h2></div>' +
      '<div class="panel__body ws-form-grid" style="grid-template-columns:1fr 1fr">' +
      '<div class="fg"><label>Établissement</label><input class="fi" id="mhInspUni" placeholder="Nom université" /></div>' +
      '<div class="fg"><label>Date prévue</label><input class="fi" id="mhInspDate" type="date" /></div>' +
      '<div class="fg" style="grid-column:1/-1"><label>Inspecteur / mission</label><input class="fi" id="mhInspInspector" placeholder="Équipe inspection MESU" /></div>' +
      '<div class="fg" style="grid-column:1/-1"><label>Recommandations</label><textarea class="fi" id="mhInspNotes" rows="3" placeholder="Points de contrôle…"></textarea></div>' +
      '<button type="button" class="btn btn--role" id="mhInspAdd">Programmer</button></div></div>' +
      '<div class="panel panel--ws"><div class="panel__head"><h2>Inspections (' +
      inspections.length +
      ")</h2></div><div class=\"panel__body\">" +
      (inspections.length
        ? '<div class="ws-table-wrap"><table class="ws-table"><thead><tr><th>Date</th><th>Établissement</th><th>Inspecteur</th><th>Statut</th></tr></thead><tbody>' +
          inspections
            .map(
              (i) =>
                "<tr><td>" +
                esc(i.date || "—") +
                "</td><td>" +
                esc(i.university) +
                "</td><td>" +
                esc(i.inspector) +
                "</td><td>" +
                (i.status === "done"
                  ? '<span class="mh-tag mh-tag--ok">Terminée</span>'
                  : '<span class="mh-tag mh-tag--wait">Programmée</span>') +
                "</td></tr>"
            )
            .join("") +
          "</tbody></table></div>"
        : "<p class=\"page-desc\">Aucune inspection programmée.</p>") +
      "</div></div>";

    root.querySelector("#mhInspAdd")?.addEventListener("click", () => {
      const university = root.querySelector("#mhInspUni")?.value?.trim();
      const date = root.querySelector("#mhInspDate")?.value;
      const inspector = root.querySelector("#mhInspInspector")?.value?.trim() || "MESU";
      const notes = root.querySelector("#mhInspNotes")?.value?.trim() || "";
      if (!university) {
        alert("Indiquez l'établissement.");
        return;
      }
      const list = readStore().inspections || [];
      list.unshift({
        id: uid("insp"),
        university,
        date: date || new Date().toISOString().slice(0, 10),
        inspector,
        notes,
        status: "scheduled",
        createdAt: new Date().toISOString(),
      });
      writeStore({ inspections: list.slice(0, 50) });
      mountInspections(root, session);
    });
  }

  async function mountComplaints(root, session) {
    if (!root) return;
    root.innerHTML = "<p class=\"page-desc\">Chargement des réclamations…</p>";
    if (typeof SAC_SECTIONS !== "undefined" && SAC_SECTIONS.syncReclamationsFromServer) {
      try {
        await SAC_SECTIONS.syncReclamationsFromServer(session);
      } catch {
        /* ignore */
      }
    }
    const list = loadAllReclamations().sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
    const overlays = readStore().complaintOverlays || {};

    root.innerHTML =
      "<p class=\"page-desc\">Réclamations étudiantes remontées depuis les campus — transfert et suivi ministériel.</p>" +
      (list.length
        ? '<div class="ws-table-wrap"><table class="ws-table"><thead><tr>' +
          "<th>Date</th><th>Étudiant</th><th>Université</th><th>Sujet</th><th>Statut</th><th>Actions</th>" +
          "</tr></thead><tbody>" +
          list
            .slice(0, 60)
            .map((r) => {
              const ov = overlays[r.id] || {};
              const st = ov.statut || r.statut || "ouverte";
              return (
                "<tr data-rec-id=\"" +
                esc(r.id) +
                "\"><td><small>" +
                esc((r.createdAt || "").slice(0, 10)) +
                "</small></td><td>" +
                esc(r.studentNom || r.studentEmail) +
                "</td><td>" +
                esc(r.universite || ov.targetUni || "—") +
                "</td><td>" +
                esc(r.sujet) +
                "</td><td>" +
                esc(complaintStatutLabel(st)) +
                (ov.ministryNote ? '<br><small>' + esc(ov.ministryNote) + "</small>" : "") +
                '</td><td class="mh-actions">' +
                '<button type="button" class="btn btn--ghost btn--xs" data-rec-transfer>Transférer</button> ' +
                '<button type="button" class="btn btn--ghost btn--xs" data-rec-progress>En cours</button> ' +
                '<button type="button" class="btn btn--ghost btn--xs" data-rec-resolve>Résolue</button>' +
                "</td></tr>"
              );
            })
            .join("") +
          "</tbody></table></div>"
        : '<p class="page-desc">Aucune réclamation enregistrée pour le moment.</p>');

    root.querySelectorAll("[data-rec-transfer]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.closest("[data-rec-id]")?.getAttribute("data-rec-id");
        const rec = list.find((r) => r.id === id);
        if (!rec) return;
        const target = prompt("Transférer à l'université (code ou nom) :", rec.universite || "");
        if (!target) return;
        const overlays2 = { ...(readStore().complaintOverlays || {}) };
        overlays2[id] = {
          ...(overlays2[id] || {}),
          targetUni: target,
          statut: "en_cours",
          ministryNote: "Transféré par le Ministère → " + target,
          at: new Date().toISOString(),
        };
        writeStore({ complaintOverlays: overlays2 });
        const all = loadAllReclamations();
        const idx = all.findIndex((r) => r.id === id);
        if (idx >= 0) {
          all[idx] = { ...all[idx], statut: "en_cours", universite: target };
          saveAllReclamations(all);
        }
        mountComplaints(root, session);
      });
    });
    root.querySelectorAll("[data-rec-progress]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.closest("[data-rec-id]")?.getAttribute("data-rec-id");
        if (!id) return;
        patchComplaintStatus(id, "en_cours", session);
        mountComplaints(root, session);
      });
    });
    root.querySelectorAll("[data-rec-resolve]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.closest("[data-rec-id]")?.getAttribute("data-rec-id");
        if (!id) return;
        patchComplaintStatus(id, "resolue", session);
        mountComplaints(root, session);
      });
    });
  }

  function patchComplaintStatus(recId, statut, session) {
    const overlays = { ...(readStore().complaintOverlays || {}) };
    overlays[recId] = { ...(overlays[recId] || {}), statut, at: new Date().toISOString() };
    writeStore({ complaintOverlays: overlays });
    const all = loadAllReclamations();
    const idx = all.findIndex((r) => r.id === recId);
    if (idx < 0) return;
    all[idx] = { ...all[idx], statut, updatedAt: new Date().toISOString() };
    saveAllReclamations(all);
    if (typeof SAC_API !== "undefined" && SAC_API.patchReclamation) {
      SAC_API.patchReclamation(recId, { statut }).catch(() => {});
    }
  }

  function mountAccreditations(root, session) {
    if (!root) return;
    const items = readStore().accreditations || [];
    root.innerHTML =
      "<p class=\"page-desc\">Autoriser de nouvelles filières et suivre les agréments ministériels.</p>" +
      '<div class="panel panel--ws" style="margin-bottom:1rem"><div class="panel__head"><h2>Nouvelle demande / décision</h2></div>' +
      '<div class="panel__body ws-form-grid" style="grid-template-columns:1fr 1fr">' +
      '<div class="fg"><label>Université</label><input class="fi" id="mhAccUni" placeholder="Établissement" /></div>' +
      '<div class="fg"><label>Filière</label><input class="fi" id="mhAccProgram" placeholder="Ex. Licence Informatique" /></div>' +
      '<div class="fg"><label>Décision</label><select class="fi" id="mhAccDecision"><option value="pending">En examen</option><option value="approved">Autorisée</option><option value="rejected">Refusée</option></select></div>' +
      '<div class="fg"><label>Référence</label><input class="fi" id="mhAccRef" placeholder="N° arrêté (optionnel)" /></div>' +
      '<div class="fg" style="grid-column:1/-1"><label>Notes</label><textarea class="fi" id="mhAccNotes" rows="2"></textarea></div>' +
      '<button type="button" class="btn btn--role" id="mhAccAdd">Enregistrer</button></div></div>' +
      '<div class="panel panel--ws"><div class="panel__head"><h2>Historique des décisions (' +
      items.length +
      ")</h2></div><div class=\"panel__body\">" +
      (items.length
        ? '<div class="ws-table-wrap"><table class="ws-table"><thead><tr><th>Date</th><th>Université</th><th>Filière</th><th>Décision</th><th>Réf.</th></tr></thead><tbody>' +
          items
            .map((a) => {
              const tag =
                a.decision === "approved"
                  ? '<span class="mh-tag mh-tag--ok">Autorisée</span>'
                  : a.decision === "rejected"
                    ? '<span class="mh-tag mh-tag--bad">Refusée</span>'
                    : '<span class="mh-tag mh-tag--wait">En examen</span>';
              return (
                "<tr><td><small>" +
                esc((a.createdAt || "").slice(0, 10)) +
                "</small></td><td>" +
                esc(a.university) +
                "</td><td>" +
                esc(a.program) +
                "</td><td>" +
                tag +
                "</td><td>" +
                esc(a.reference || "—") +
                "</td></tr>"
              );
            })
            .join("") +
          "</tbody></table></div>"
        : "<p class=\"page-desc\">Aucune décision enregistrée.</p>") +
      "</div></div>";

    root.querySelector("#mhAccAdd")?.addEventListener("click", () => {
      const university = root.querySelector("#mhAccUni")?.value?.trim();
      const program = root.querySelector("#mhAccProgram")?.value?.trim();
      if (!university || !program) {
        alert("Université et filière requis.");
        return;
      }
      const list = readStore().accreditations || [];
      list.unshift({
        id: uid("acc"),
        university,
        program,
        decision: root.querySelector("#mhAccDecision")?.value || "pending",
        reference: root.querySelector("#mhAccRef")?.value?.trim() || "",
        notes: root.querySelector("#mhAccNotes")?.value?.trim() || "",
        createdAt: new Date().toISOString(),
      });
      writeStore({ accreditations: list.slice(0, 80) });
      mountAccreditations(root, session);
    });
  }

  function mountPlaceholder(root, title, bullets, ctaSection) {
    if (!root) return;
    root.innerHTML =
      "<p class=\"page-desc\">" +
      esc(title) +
      "</p><ul class=\"ws-guide\">" +
      bullets.map((b) => "<li>" + esc(b) + "</li>").join("") +
      "</ul>" +
      (ctaSection
        ? '<p style="margin-top:1rem"><button type="button" class="btn btn--role" data-mh-goto="' +
          ctaSection +
          '">Ouvrir le module lié</button></p>'
        : '<p class="mh-alert" style="margin-top:1rem">Module en déploiement — données synchronisées avec les campus à la prochaine mise à jour API.</p>');
    root.querySelectorAll("[data-mh-goto]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (typeof window.__mhGoto === "function") window.__mhGoto(btn.dataset.mhGoto);
      });
    });
  }

  function mountMessaging(root, session) {
    root.innerHTML =
      "<p class=\"page-desc\">Envoyer un message à toutes les universités via le <strong>panneau public national</strong>, ou utiliser l'espace live pour les réunions.</p>" +
      '<div class="panel panel--ws"><div class="panel__head"><h2>Message national</h2></div>' +
      '<div class="panel__body"><div class="fg"><label>Titre</label><input class="fi" id="mhMsgTitle" placeholder="Objet du message" /></div>' +
      '<div class="fg"><label>Corps du message</label><textarea class="fi" id="mhMsgBody" rows="4" placeholder="Texte officiel…"></textarea></div>' +
      '<div class="fg"><label>Ciblage</label><select class="fi" id="mhMsgTarget"><option value="all">Toutes les universités (panneau public)</option>' +
      '<option value="province" disabled>Par province (bientôt)</option><option value="uni" disabled>Établissement précis (bientôt)</option></select></div>' +
      '<button type="button" class="btn btn--role" id="mhMsgSend">Publier sur le panneau national</button>' +
      '<p class="ws-field-hint" style="margin-top:0.5rem">Le message apparaît sur la page d\'accueil publique. Pour une réunion : <button type="button" class="btn btn--ghost btn--xs" data-mh-goto="live">espace live</button>.</p></div></div>' +
      '<div id="mhLiveEmbed" style="margin-top:1rem"></div>';

    root.querySelector("#mhMsgSend")?.addEventListener("click", async () => {
      const title = root.querySelector("#mhMsgTitle")?.value?.trim() || "";
      const body = root.querySelector("#mhMsgBody")?.value?.trim() || "";
      if (title.length < 5) {
        alert("Titre requis (minimum 5 caractères).");
        return;
      }
      const excerpt =
        body.length >= 10 ? body.slice(0, 400) : body || title + " — communication nationale du Ministère.";
      if (excerpt.length < 10) {
        alert("Message trop court (minimum 10 caractères).");
        return;
      }
      const btn = root.querySelector("#mhMsgSend");
      btn.disabled = true;
      try {
        if (typeof SAC_HOME_NEWS !== "undefined") {
          await SAC_HOME_NEWS.create(session, {
            category: "officiel",
            title,
            excerpt,
            body: body || excerpt,
            published: true,
            countryCode: session.countryCode,
          });
          const msgs = readStore().messages || [];
          msgs.unshift({ title, body, target: "all", at: new Date().toISOString(), published: true });
          writeStore({ messages: msgs.slice(0, 20) });
          root.querySelector("#mhMsgTitle").value = "";
          root.querySelector("#mhMsgBody").value = "";
          alert("Message publié sur le panneau public national.");
          return;
        }
        throw new Error("Module de publication indisponible.");
      } catch (err) {
        alert(err.message || "Publication impossible.");
      } finally {
        btn.disabled = false;
      }
    });
    root.querySelectorAll("[data-mh-goto]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (typeof window.__mhGoto === "function") window.__mhGoto(btn.dataset.mhGoto);
      });
    });
    if (typeof SAC_MINISTRY_LIVE !== "undefined") {
      SAC_MINISTRY_LIVE.mountMinistryUI(root.querySelector("#mhLiveEmbed"), session);
    }
  }

  function mountReports(root, session) {
    root.innerHTML =
      "<p class=\"page-desc\">Générer des rapports et exporter les statistiques nationales.</p>" +
      '<div class="mh-actions">' +
      '<button type="button" class="btn btn--role" id="mhExportCsv">Exporter CSV</button> ' +
      '<button type="button" class="btn btn--ghost" id="mhExportPrint">Imprimer / PDF</button> ' +
      '<button type="button" class="btn btn--ghost" id="mhExportXls">Exporter Excel (CSV)</button></div>' +
      '<div id="mhReportPreview" class="panel panel--ws" style="margin-top:1rem" hidden></div>' +
      '<p class="ws-field-hint" style="margin-top:0.75rem">Utilisez « Imprimer / PDF » puis « Enregistrer en PDF » dans la boîte de dialogue d\'impression.</p>';

    async function buildReportHtml() {
      const stats = await loadNationalStats(session);
      const country =
        session.countryCode && typeof SAC_AFRICA_COUNTRIES !== "undefined"
          ? SAC_AFRICA_COUNTRIES.label(session.countryCode)
          : "National";
      return (
        "<h2>Rapport national MESU — " +
        esc(country) +
        "</h2><p>Généré le " +
        new Date().toLocaleString("fr-FR") +
        "</p><ul>" +
        "<li>Universités : " +
        stats.universities +
        "</li>" +
        "<li>Étudiants : " +
        stats.students.toLocaleString("fr-FR") +
        "</li>" +
        "<li>Enseignants : " +
        (stats.professors || "—") +
        "</li>" +
        "<li>Utilisateurs : " +
        Math.max(0, stats.staff).toLocaleString("fr-FR") +
        "</li></ul>" +
        "<h3>Par province</h3><table border=\"1\" cellpadding=\"6\"><tr><th>Province</th><th>Universités</th></tr>" +
        (stats.byProvince.length
          ? stats.byProvince.map((p) => "<tr><td>" + esc(p.province) + "</td><td>" + p.universities + "</td></tr>").join("")
          : "<tr><td colspan=\"2\">—</td></tr>") +
        "</table>"
      );
    }

    root.querySelector("#mhExportCsv")?.addEventListener("click", async () => {
      const stats = await loadNationalStats(session);
      const lines = [
        "indicateur;valeur",
        "universites;" + stats.universities,
        "etudiants;" + stats.students,
        "enseignants;" + (stats.professors || 0),
        "utilisateurs;" + stats.staff,
        "date;" + new Date().toISOString(),
      ];
      stats.byProvince.forEach((p) => {
        lines.push("province_" + p.province + ";" + p.universities);
      });
      const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "mesu-rapport-national-" + new Date().toISOString().slice(0, 10) + ".csv";
      a.click();
      URL.revokeObjectURL(a.href);
    });

    root.querySelector("#mhExportXls")?.addEventListener("click", () => {
      root.querySelector("#mhExportCsv")?.click();
    });

    root.querySelector("#mhExportPrint")?.addEventListener("click", async () => {
      const preview = root.querySelector("#mhReportPreview");
      preview.hidden = false;
      preview.innerHTML =
        '<div class="panel__body" id="mhReportBody">' + (await buildReportHtml()) + "</div>";
      const w = window.open("", "_blank", "width=800,height=600");
      if (!w) {
        window.print();
        return;
      }
      w.document.write(
        "<html><head><title>Rapport MESU</title></head><body>" +
          preview.querySelector("#mhReportBody").innerHTML +
          "</body></html>"
      );
      w.document.close();
      w.focus();
      w.print();
    });
  }

  function onSectionShow(sectionId, session, gotoFn) {
    sessionRef = session;
    window.__mhGoto = gotoFn;
    injectNav(sectionId);

    if (sectionId === "accueil") {
      void mountNationalDashboard(document.getElementById("ministryNationalRoot"), session);
    }
    const map = {
      etablissements: () => mountEstablishments(document.getElementById("ministryEtabRoot"), session),
      diplomes: () => mountDiplomas(document.getElementById("ministryDiplomaRoot"), session),
      performances: () => mountPerformances(document.getElementById("ministryPerfRoot"), session),
      inspections: () => mountInspections(document.getElementById("ministryInspectRoot"), session),
      plaintes: () => mountComplaints(document.getElementById("ministryComplaintRoot"), session),
      accreditations: () => mountAccreditations(document.getElementById("ministryAccredRoot"), session),
      messagerie: () => mountMessaging(document.getElementById("ministryMsgRoot"), session),
      rapports: () => mountReports(document.getElementById("ministryReportRoot"), session),
    };
    if (map[sectionId]) map[sectionId]();
  }

  return {
    MODULES,
    setupMinistryLayout,
    onSectionShow,
    injectNav,
    mountNationalDashboard,
  };
})();

if (typeof window !== "undefined") {
  window.SAC_MINISTRY_HUB = SAC_MINISTRY_HUB;
}

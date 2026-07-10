/**
 * Hub Ministère — 11 activités nationales (MESU)
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
      id: "bibliotheque",
      section: "bibliotheque",
      icon: "📚",
      label: "Bibliothèque",
      short: "Référentiels officiels",
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
      error: null,
    };
    try {
      if (typeof SAC_INSTITUTIONAL !== "undefined") {
        const { summary, admins } = await SAC_INSTITUTIONAL.load(session);
        const list = Array.isArray(admins) ? admins : [];
        stats.universities = list.filter((a) => a.role === "universite").length;
        if (summary?.byRole?.universite != null) {
          stats.universities = summary.byRole.universite;
        }
      }
      if (typeof SAC_API !== "undefined" && SAC_API.getPublicPlatformStats) {
        const pub = await SAC_API.getPublicPlatformStats();
        stats.students = Number(pub?.registeredStudents) || 0;
        stats.staff =
          Number(pub?.registeredUsers) - Number(pub?.registeredStudents) || 0;
      }
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
      '<div class="mh-kpi"><strong>—</strong><span>Enseignants (agrégation)</span></div>' +
      '<div class="mh-kpi"><strong>' +
      Math.max(0, stats.staff).toLocaleString("fr-FR") +
      "</strong><span>Utilisateurs plateforme</span></div>" +
      "</div>" +
      '<div class="panel panel--ws" style="margin-top:1rem">' +
      '<div class="panel__head"><h2>Statistiques par province</h2></div>' +
      '<div class="panel__body"><p class="page-desc">Cartographie provinciale — agrégation automatique à partir des campus enregistrés (prochaine version).</p>' +
      '<table class="ws-table"><thead><tr><th>Province</th><th>Universités</th><th>Étudiants</th></tr></thead>' +
      '<tbody><tr><td colspan="3" style="text-align:center;color:var(--muted)">Données en cours de consolidation</td></tr></tbody></table></div></div>' +
      '<div class="panel panel--ws" style="margin-top:1rem">' +
      '<div class="panel__head"><h2>Évolution des inscriptions</h2></div>' +
      '<div class="panel__body"><p class="page-desc">Courbe annuelle des inscriptions — liaison registre national en cours.</p></div></div>' +
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
      "<p class=\"page-desc\">Approuver, suspendre ou réactiver une université partenaire. Vérification des informations institutionnelles.</p>" +
      '<div class="mh-actions" style="margin-bottom:1rem">' +
      '<button type="button" class="btn btn--role" data-goto="administrateurs">👥 Voir tous les comptes campus</button></div>' +
      (universities.length
        ? '<div class="ws-table-wrap"><table class="ws-table"><thead><tr>' +
          "<th>Établissement</th><th>E-mail</th><th>Ville</th><th>Statut</th><th>Actions</th>" +
          "</tr></thead><tbody>" +
          universities
            .map((u) => {
              const key = String(u.email || u.id || "").toLowerCase();
              const st = statuses[key] || "approved";
              const stLabel =
                st === "suspended"
                  ? '<span class="mh-tag mh-tag--bad">Suspendu</span>'
                  : st === "pending"
                    ? '<span class="mh-tag mh-tag--wait">En attente</span>'
                    : '<span class="mh-tag mh-tag--ok">Actif</span>';
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

  function mountComplaints(root) {
    mountPlaceholder(
      root,
      "Recevoir les réclamations nationales, les transférer aux universités et suivre leur traitement.",
      [
        "Réclamations étudiantes remontées depuis les campus",
        "Transfert vers l'administration universitaire concernée",
        "Suivi du statut : ouverte, en cours, résolue",
      ],
      "activites"
    );
  }

  function mountMessaging(root, session) {
    root.innerHTML =
      "<p class=\"page-desc\">Envoyer un message à toutes les universités ou cibler par province, établissement ou catégorie.</p>" +
      '<div class="panel panel--ws"><div class="panel__head"><h2>Message national</h2></div>' +
      '<div class="panel__body"><div class="fg"><label>Titre</label><input class="fi" id="mhMsgTitle" placeholder="Objet du message" /></div>' +
      '<div class="fg"><label>Corps du message</label><textarea class="fi" id="mhMsgBody" rows="4" placeholder="Texte officiel…"></textarea></div>' +
      '<div class="fg"><label>Ciblage</label><select class="fi" id="mhMsgTarget"><option value="all">Toutes les universités</option>' +
      '<option value="province">Par province (bientôt)</option><option value="uni">Établissement précis (bientôt)</option></select></div>' +
      '<button type="button" class="btn btn--role" id="mhMsgSend">Envoyer (brouillon local)</button>' +
      '<p class="ws-field-hint" style="margin-top:0.5rem">Diffusion ciblée complète — prochaine version. Utilisez aussi l\'<button type="button" class="btn btn--ghost btn--xs" data-mh-goto="live">espace live</button> pour les réunions nationales.</p></div></div>' +
      '<div id="mhLiveEmbed" style="margin-top:1rem"></div>';

    root.querySelector("#mhMsgSend")?.addEventListener("click", () => {
      const msgs = readStore().messages || [];
      msgs.unshift({
        title: root.querySelector("#mhMsgTitle")?.value || "Sans titre",
        body: root.querySelector("#mhMsgBody")?.value || "",
        target: root.querySelector("#mhMsgTarget")?.value || "all",
        at: new Date().toISOString(),
      });
      writeStore({ messages: msgs.slice(0, 20) });
      alert("Message enregistré en brouillon ministériel (local). Diffusion API à venir.");
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
      '<button type="button" class="btn btn--role" id="mhExportCsv">Exporter statistiques (CSV)</button> ' +
      '<button type="button" class="btn btn--ghost" disabled>Export PDF (bientôt)</button> ' +
      '<button type="button" class="btn btn--ghost" disabled>Export Excel (bientôt)</button></div>' +
      '<p class="ws-field-hint" style="margin-top:0.75rem">Le CSV inclut les indicateurs du tableau de bord national.</p>';

    root.querySelector("#mhExportCsv")?.addEventListener("click", async () => {
      const stats = await loadNationalStats(session);
      const lines = [
        "indicateur;valeur",
        "universites;" + stats.universities,
        "etudiants;" + stats.students,
        "utilisateurs;" + stats.staff,
        "date;" + new Date().toISOString(),
      ];
      const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "mesu-rapport-national-" + new Date().toISOString().slice(0, 10) + ".csv";
      a.click();
      URL.revokeObjectURL(a.href);
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
      performances: () =>
        mountPlaceholder(
          document.getElementById("ministryPerfRoot"),
          "Suivi des performances académiques nationales.",
          [
            "Taux de réussite par université",
            "Nombre de diplômés par année",
            "Statistiques par faculté",
            "Rapports comparatifs inter-établissements",
          ]
        ),
      inspections: () =>
        mountPlaceholder(
          document.getElementById("ministryInspectRoot"),
          "Gestion des inspections et recommandations.",
          [
            "Programmer une inspection",
            "Envoyer des recommandations aux établissements",
            "Recevoir les rapports des inspecteurs",
          ]
        ),
      plaintes: () => mountComplaints(document.getElementById("ministryComplaintRoot")),
      accreditations: () =>
        mountPlaceholder(
          document.getElementById("ministryAccredRoot"),
          "Gestion des accréditations et agréments.",
          [
            "Autoriser l'ouverture de nouvelles filières",
            "Suivre les agréments en cours",
            "Historique des décisions ministérielles",
          ]
        ),
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

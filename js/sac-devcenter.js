/**
 * Dev Center — espace développeurs, tickets AI Ops, profil
 */
const SAC_DEVCENTER = (function () {
  "use strict";

  const FILTERS = {
    mine: { title: "Mes tickets", desc: "Tickets qui vous sont attribués." },
    critical: { title: "Critiques", desc: "Tickets urgents — gravité critique, action immédiate." },
    in_progress: { title: "En cours", desc: "Tickets en cours de traitement." },
    done: { title: "Terminés", desc: "Tickets résolus ou clos." },
    new: { title: "Nouveaux", desc: "Tickets en attente — non assignés ou nouvellement ouverts." },
  };

  let session = null;
  let profile = null;
  let currentFilter = "mine";
  let ticketsCache = [];
  let selectedId = null;

  function esc(s) {
    const el = document.createElement("div");
    el.textContent = String(s ?? "");
    return el.innerHTML;
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" });
    } catch {
      return iso;
    }
  }

  function toast(msg) {
    const el = document.getElementById("dcToast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("dc-toast--show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      el.classList.remove("dc-toast--show");
    }, 3200);
  }

  function sevClass(sev) {
    if (sev === "critical") return "dc-sev--critical";
    if (sev === "warning") return "dc-sev--warning";
    return "dc-sev--info";
  }

  let workflowLabels = {};

  function statusLabel(st) {
    if (workflowLabels[st]) return workflowLabels[st];
    const map = {
      open: "Nouveau",
      assigned: "Attribué",
      in_progress: "En cours",
      review: "En revue",
      validated: "Validé",
      production: "En production",
      resolved: "Résolu",
      closed: "Clos",
    };
    return map[st] || st;
  }

  async function guardDevCenter() {
    const s = await SAC_SESSION.verifySession(null);
    if (!s || (s.role !== "developpeur" && s.role !== "superadmin")) {
      window.location.replace(
        typeof SAC_PORTAL !== "undefined" ? SAC_PORTAL.loginUrlForRole("developpeur") : "devcenter/"
      );
      return null;
    }
    return s;
  }

  async function loadProfile() {
    if (!SAC_API.getDevCenterProfile) return null;
    profile = await SAC_API.getDevCenterProfile();
    return profile;
  }

  async function loadStats() {
    if (!SAC_API.getDevCenterStats) return {};
    return await SAC_API.getDevCenterStats();
  }

  async function loadTickets(filter) {
    if (!SAC_API.listDevCenterTickets) return [];
    const data = await SAC_API.listDevCenterTickets(filter || currentFilter, 120);
    ticketsCache = data.tickets || [];
    return ticketsCache;
  }

  function renderStats(stats) {
    const s = stats || {};
    const set = function (id, val) {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val ?? 0);
    };
    set("dcCountMine", s.mine);
    set("dcCountCritical", s.critical);
    set("dcCountProgress", s.inProgress);
    set("dcCountNew", s.new);
    set("dcCountDone", s.done);
  }

  function renderProfileChip() {
    const el = document.getElementById("dcProfileChip");
    if (!el || !profile) return;
    el.innerHTML =
      '<div class="dc-chip">' +
      '<span class="dc-chip__avatar">' +
      (profile.displayName || "?").charAt(0).toUpperCase() +
      "</span>" +
      "<div><strong>" +
      esc(profile.displayName) +
      "</strong><span>" +
      esc(profile.fonction || "Développeur") +
      (profile.speciality ? " · " + esc(profile.speciality) : "") +
      "</span></div></div>";
  }

  function renderTicketsList() {
    const host = document.getElementById("dcTicketsList");
    if (!host) return;
    if (!ticketsCache.length) {
      host.innerHTML = '<p class="dc-empty">Aucun ticket dans cette catégorie.</p>';
      return;
    }
    host.innerHTML = ticketsCache
      .map(function (t) {
        const active = t.id === selectedId ? " dc-ticket--active" : "";
        return (
          '<article class="dc-ticket' +
          active +
          '" data-id="' +
          esc(t.id) +
          '">' +
          '<div class="dc-ticket__head">' +
          '<code>' +
          esc(t.ticketNumber) +
          "</code>" +
          '<span class="' +
          sevClass(t.severity) +
          '">' +
          esc(t.severity) +
          "</span></div>" +
          "<strong>" +
          esc(t.title) +
          "</strong>" +
          '<p class="dc-ticket__meta">' +
          esc(t.service) +
          " · " +
          statusLabel(t.status) +
          (t.assignee ? " · " + esc(t.assignee) : " · non assigné") +
          "</p></article>"
        );
      })
      .join("");

    host.querySelectorAll(".dc-ticket").forEach(function (row) {
      row.addEventListener("click", function () {
        selectedId = row.dataset.id;
        renderTicketsList();
        renderTicketDetail(selectedId);
      });
    });
  }

  async function renderTicketDetail(ticketId) {
    const host = document.getElementById("dcTicketDetail");
    if (!host) return;
    const t = ticketsCache.find(function (x) {
      return x.id === ticketId;
    });
    if (!t) {
      host.innerHTML = '<p class="dc-empty">Ticket introuvable.</p>';
      return;
    }
    let comments = [];
    let history = [];
    try {
      if (SAC_API.listDevCenterComments) {
        const c = await SAC_API.listDevCenterComments(ticketId);
        comments = c.comments || [];
      }
      if (SAC_API.listDevCenterHistory) {
        const h = await SAC_API.listDevCenterHistory(ticketId);
        history = h.history || [];
      }
    } catch {
      /* ignore */
    }
    const fixes = (t.analysis?.fixes || [])
      .map(function (f) {
        return "<li>" + esc(f) + "</li>";
      })
      .join("");
    host.innerHTML =
      '<div class="dc-detail">' +
      '<div class="dc-detail__head"><code>' +
      esc(t.ticketNumber) +
      "</code><h2>" +
      esc(t.title) +
      "</h2></div>" +
      '<p class="dc-detail__meta">' +
      fmtDate(t.createdAt) +
      " · " +
      esc(t.project || t.service) +
      " · Priorité " +
      esc(t.priority || "medium") +
      " · " +
      statusLabel(t.status) +
      (t.timeSpentMinutes ? " · ⏱ " + t.timeSpentMinutes + " min" : "") +
      "</p>" +
      "<p>" +
      esc(t.description || "") +
      "</p>" +
      (fixes ? "<h3>Corrections proposées</h3><ul>" + fixes + "</ul>" : "") +
      (t.correctiveCode
        ? "<h3>Code correctif</h3><pre class='dc-code'>" + esc(t.correctiveCode) + "</pre>"
        : "") +
      '<div class="dc-detail__actions">' +
      (t.status === "open" || t.status === "assigned"
        ? '<button type="button" class="btn btn--role" data-action="take">📌 Prendre en charge</button>'
        : "") +
      (t.status === "assigned" || t.status === "open"
        ? '<button type="button" class="btn btn--ghost" data-action="progress">🟠 Démarrer</button>'
        : "") +
      (t.status === "in_progress"
        ? '<button type="button" class="btn btn--ghost" data-action="review">📤 Soumettre en revue</button>'
        : "") +
      "</div>" +
      '<div class="dc-comments"><h3>💬 Commentaires</h3><div class="dc-comment-list">' +
      (comments.length
        ? comments
            .map(
              (c) =>
                '<div class="dc-comment"><strong>' +
                esc(c.authorName) +
                "</strong> <small>" +
                fmtDate(c.createdAt) +
                "</small><p>" +
                esc(c.body) +
                "</p></div>"
            )
            .join("")
        : '<p class="dc-empty">Aucun commentaire.</p>') +
      '</div><form id="dcCommentForm" class="dc-inline-form"><input class="fi" name="body" placeholder="Ajouter un commentaire…" required /><button type="submit" class="btn btn--ghost btn--xs">Envoyer</button></form></div>' +
      '<div class="dc-history"><h3>📜 Historique</h3><ul class="dc-history-list">' +
      (history.length
        ? history
            .map(
              (h) =>
                "<li><strong>" +
                esc(h.action) +
                "</strong> — " +
                fmtDate(h.createdAt) +
                (h.fromStatus && h.toStatus
                  ? " (" + statusLabel(h.fromStatus) + " → " + statusLabel(h.toStatus) + ")"
                  : "") +
                (h.actorName ? " · " + esc(h.actorName) : "") +
                "</li>"
            )
            .join("")
        : "<li>—</li>") +
      "</ul></div>" +
      '<form id="dcTimeForm" class="dc-inline-form"><label>Temps passé (min)<input class="fi" type="number" name="minutes" min="1" max="480" value="30" /></label><input class="fi" name="note" placeholder="Note optionnelle" /><button type="submit" class="btn btn--ghost btn--xs">⏱ Enregistrer</button></form></div>';

    host.querySelector("[data-action='take']")?.addEventListener("click", function () {
      assignTicket(t.id);
    });
    host.querySelector("[data-action='progress']")?.addEventListener("click", function () {
      updateStatus(t.id, "in_progress");
    });
    host.querySelector("[data-action='review']")?.addEventListener("click", function () {
      updateStatus(t.id, "review");
    });
    host.querySelector("#dcCommentForm")?.addEventListener("submit", async function (e) {
      e.preventDefault();
      const body = new FormData(e.target).get("body");
      try {
        await SAC_API.addDevCenterComment(t.id, String(body));
        toast("Commentaire ajouté.");
        renderTicketDetail(t.id);
      } catch (err) {
        toast(err.message);
      }
    });
    host.querySelector("#dcTimeForm")?.addEventListener("submit", async function (e) {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await SAC_API.logDevCenterTime(t.id, {
          minutes: Number(fd.get("minutes")),
          note: fd.get("note"),
        });
        toast("Temps enregistré.");
        await refreshAll();
        renderTicketDetail(t.id);
      } catch (err) {
        toast(err.message);
      }
    });
  }

  async function assignTicket(id) {
    try {
      await SAC_API.assignDevCenterTicket(id);
      toast("Ticket pris en charge.");
      await refreshAll();
      selectedId = id;
      renderTicketDetail(id);
    } catch (err) {
      toast(err.message || "Action impossible.");
    }
  }

  async function updateStatus(id, status) {
    try {
      await SAC_API.updateDevCenterTicket(id, { status: status });
      toast("Statut mis à jour.");
      await refreshAll();
      selectedId = id;
      renderTicketDetail(id);
    } catch (err) {
      toast(err.message || "Action impossible.");
    }
  }

  function renderProfilePanel() {
    const host = document.getElementById("dcProfilePanel");
    if (!host || !profile) return;
    if (profile.role !== "developpeur") {
      host.innerHTML =
        '<p class="dc-empty">Profil éditable réservé aux comptes développeur. En tant que Super Admin, vous voyez tous les tickets.</p>';
      return;
    }
    const stack = (profile.stack || []).join(", ");
    host.innerHTML =
      '<form id="dcProfileForm" class="dc-profile-form">' +
      "<h3>" +
      esc(profile.displayName) +
      "</h3>" +
      '<p class="dc-meta">' +
      esc(profile.email) +
      "</p>" +
      '<label>Spécialité<input class="fi" name="speciality" value="' +
      esc(profile.speciality || "") +
      '" placeholder="Backend, Frontend, DevOps…" /></label>' +
      '<label>Bio<textarea class="fi" name="bio" rows="3" placeholder="Votre rôle sur EvoSU…">' +
      esc(profile.bio || "") +
      "</textarea></label>" +
      '<label>Stack (séparée par des virgules)<input class="fi" name="stack" value="' +
      esc(stack) +
      '" placeholder="Python, FastAPI, JavaScript…" /></label>' +
      '<div class="dc-stats-inline">' +
      "<span>📌 Mes tickets : <strong>" +
      (profile.stats?.mine || 0) +
      "</strong></span>" +
      "<span>🔴 Critiques : <strong>" +
      (profile.stats?.critical || 0) +
      "</strong></span>" +
      "<span>🟠 En cours : <strong>" +
      (profile.stats?.inProgress || 0) +
      "</strong></span>" +
      "</div>" +
      '<button type="submit" class="btn btn--role">Enregistrer mon profil</button></form>';

    host.querySelector("#dcProfileForm")?.addEventListener("submit", async function (e) {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        profile = await SAC_API.updateDevCenterProfile({
          speciality: fd.get("speciality"),
          bio: fd.get("bio"),
          stack: String(fd.get("stack") || "")
            .split(",")
            .map(function (s) {
              return s.trim();
            })
            .filter(Boolean),
        });
        toast("Profil enregistré.");
        renderProfileChip();
        renderProfilePanel();
      } catch (err) {
        toast(err.message || "Échec enregistrement.");
      }
    });
  }

  function setFilter(filter) {
    currentFilter = filter || "mine";
    const meta = FILTERS[currentFilter] || FILTERS.mine;
    const title = document.getElementById("dcFilterTitle");
    const desc = document.getElementById("dcFilterDesc");
    if (title) title.textContent = meta.title;
    if (desc) desc.textContent = meta.desc;
    document.querySelectorAll(".dc-filter").forEach(function (tab) {
      tab.classList.toggle("active", tab.dataset.filter === currentFilter);
    });
    document.getElementById("section-tickets")?.classList.add("active");
    document.getElementById("section-profil")?.classList.remove("active");
    document.querySelectorAll(".nav-tab[data-section]").forEach(function (t) {
      t.classList.remove("active");
    });
  }

  async function refreshAll() {
    const [stats] = await Promise.all([loadStats(), loadTickets(currentFilter)]);
    renderStats(stats);
    renderTicketsList();
    if (selectedId) renderTicketDetail(selectedId);
  }

  function showWorkspace(ws) {
    const map = {
      tickets: "section-tickets",
      projects: "section-projects",
      performance: "section-performance",
      time: "section-time",
      profil: "section-profil",
    };
    document.querySelectorAll(".page-section").forEach(function (s) {
      s.classList.remove("active");
    });
    document.getElementById(map[ws] || "section-tickets")?.classList.add("active");
    document.querySelectorAll(".dc-ws").forEach(function (t) {
      t.classList.toggle("active", t.dataset.ws === ws);
    });
    const filters = document.getElementById("dcTicketFilters");
    if (filters) filters.hidden = ws !== "tickets";
  }

  async function renderProjects() {
    const host = document.getElementById("dcProjectsPanel");
    if (!host || !SAC_API.getDevCenterProjects) return;
    try {
      const data = await SAC_API.getDevCenterProjects();
      const items = data.projects || [];
      host.innerHTML = items.length
        ? '<div class="dc-project-grid">' +
          items
            .map(
              (p) =>
                '<article class="dc-project-card"><h3>' +
                esc(p.project) +
                "</h3><p><strong>" +
                p.active +
                "</strong> actifs · " +
                p.done +
                " terminés · " +
                p.total +
                " total</p></article>"
            )
            .join("") +
          "</div>"
        : '<p class="dc-empty">Aucun projet pour le moment.</p>';
    } catch {
      host.innerHTML = '<p class="dc-empty">Projets indisponibles.</p>';
    }
  }

  async function renderPerformance() {
    const host = document.getElementById("dcPerfPanel");
    if (!host || !SAC_API.getDevCenterPerformance) return;
    try {
      const p = await SAC_API.getDevCenterPerformance();
      host.innerHTML =
        '<div class="dc-kpi-grid">' +
        '<div class="dc-kpi"><strong>' +
        (p.assignedTotal || 0) +
        "</strong><span>Tickets assignés</span></div>" +
        '<div class="dc-kpi"><strong>' +
        (p.inProgress || 0) +
        "</strong><span>En cours</span></div>" +
        '<div class="dc-kpi"><strong>' +
        (p.resolved || 0) +
        "</strong><span>Résolus</span></div>" +
        '<div class="dc-kpi"><strong>' +
        (p.resolutionRate || 0) +
        '%</strong><span>Taux résolution</span></div>' +
        '<div class="dc-kpi"><strong>' +
        (p.timeSpentMinutes || 0) +
        " min</strong><span>Temps total</span></div></div>";
    } catch {
      host.innerHTML = '<p class="dc-empty">Performances indisponibles.</p>';
    }
  }

  async function renderTimePanel() {
    const host = document.getElementById("dcTimePanel");
    if (!host) return;
    const mine = ticketsCache.filter(function (t) {
      return t.timeSpentMinutes > 0;
    });
    host.innerHTML =
      '<p class="dc-meta">Enregistrez le temps depuis le détail d\'un ticket (section Mes tickets).</p>' +
      (mine.length
        ? "<ul>" +
          mine
            .map(
              (t) =>
                "<li><code>" +
                esc(t.ticketNumber) +
                "</code> " +
                esc(t.title) +
                " — <strong>" +
                t.timeSpentMinutes +
                " min</strong></li>"
            )
            .join("") +
          "</ul>"
        : '<p class="dc-empty">Aucun temps enregistré.</p>');
  }

  function renderWorkflowHint(chain) {
    const el = document.getElementById("dcWorkflowHint");
    if (!el || !chain?.length) return;
    el.textContent =
      "Cycle ticket : " +
      chain.map(function (s) {
        return statusLabel(s);
      }).join(" → ");
  }

  async function init() {
    session = await guardDevCenter();
    if (!session) return;

    const name =
      [session.prenom, session.nom].filter(Boolean).join(" ") || session.identifiant || session.email;
    const nameEl = document.getElementById("dcUserName");
    if (nameEl) nameEl.textContent = name;

    if (typeof SAC_PORTAL !== "undefined") {
      SAC_PORTAL.applyBranding("developpeur");
    }

    await loadProfile();
    renderProfileChip();
    if (SAC_API.getDevCenterWorkflow) {
      try {
        const wf = await SAC_API.getDevCenterWorkflow();
        workflowLabels = wf.labels || {};
        renderWorkflowHint(wf.chain);
      } catch {
        /* ignore */
      }
    }
    await refreshAll();

    document.querySelectorAll(".dc-ws").forEach(function (tab) {
      tab.addEventListener("click", async function () {
        const ws = tab.dataset.ws;
        showWorkspace(ws);
        if (ws === "projects") await renderProjects();
        if (ws === "performance") await renderPerformance();
        if (ws === "time") await renderTimePanel();
        if (ws === "profil") renderProfilePanel();
      });
    });

    document.getElementById("dcRefreshBtn")?.addEventListener("click", function () {
      refreshAll().then(function () {
        toast("Actualisé.");
      });
    });

    document.getElementById("btnLogout")?.addEventListener("click", function () {
      const target =
        typeof SAC_PORTAL !== "undefined" ? SAC_PORTAL.siteUrl("devcenter/") : "devcenter/";
      SAC_SESSION.logout(target);
    });

    document.querySelectorAll(".dc-filter").forEach(function (tab) {
      tab.addEventListener("click", async function () {
        setFilter(tab.dataset.filter);
        showWorkspace("tickets");
        await loadTickets(currentFilter);
        renderTicketsList();
        selectedId = null;
        document.getElementById("dcTicketDetail").innerHTML =
          '<p class="dc-empty">Sélectionnez un ticket.</p>';
      });
    });
  }

  return { init, refreshAll };
})();

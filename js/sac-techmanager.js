/**
 * Tech Manager — attribution, priorités, validation, stats équipe
 */
const SAC_TECHMANAGER = (function () {
  "use strict";

  let session = null;
  let tickets = [];
  let team = [];
  let selectedId = null;
  let currentView = "board";
  let shieldTimer = null;

  function esc(s) {
    const el = document.createElement("div");
    el.textContent = String(s ?? "");
    return el.innerHTML;
  }

  function toast(msg) {
    const el = document.getElementById("tmToast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("dc-toast--show");
    setTimeout(function () {
      el.classList.remove("dc-toast--show");
    }, 3000);
  }

  async function guard() {
    const s = await SAC_SESSION.verifySession(null);
    if (!s || (s.role !== "techmanager" && s.role !== "superadmin")) {
      window.location.replace(SAC_PORTAL.loginUrlForRole("techmanager"));
      return null;
    }
    return s;
  }

  async function loadTickets(filter) {
    const data = await SAC_API.listTechManagerTickets(filter || "all", 150);
    tickets = data.tickets || [];
    return tickets;
  }

  async function loadTeam() {
    const data = await SAC_API.listTechManagerTeam();
    team = data.developers || [];
    return team;
  }

  function renderList() {
    const host = document.getElementById("tmTicketsList");
    if (!host) return;
    host.innerHTML = tickets.length
      ? tickets
          .map(function (t) {
            return (
              '<article class="dc-ticket' +
              (t.id === selectedId ? " dc-ticket--active" : "") +
              '" data-id="' +
              esc(t.id) +
              '"><code>' +
              esc(t.ticketNumber) +
              "</code> <strong>" +
              esc(t.title) +
              '</strong><p class="dc-ticket__meta">' +
              esc(t.priority) +
              " · " +
              esc(t.status) +
              (t.assignee ? " · " + esc(t.assignee) : "") +
              "</p></article>"
            );
          })
          .join("")
      : '<p class="dc-empty">Aucun ticket.</p>';
    host.querySelectorAll(".dc-ticket").forEach(function (row) {
      row.addEventListener("click", function () {
        selectedId = row.dataset.id;
        renderList();
        renderDetail(selectedId);
      });
    });
  }

  function renderDetail(id) {
    const host = document.getElementById("tmTicketDetail");
    const t = tickets.find(function (x) {
      return x.id === id;
    });
    if (!host || !t) return;
    const devOpts = team
      .map(function (d) {
        return (
          '<option value="' +
          esc(d.email) +
          '"' +
          (d.email === t.assignee ? " selected" : "") +
          ">" +
          esc(d.displayName) +
          "</option>"
        );
      })
      .join("");
    host.innerHTML =
      "<h2>" +
      esc(t.title) +
      "</h2>" +
      "<p>" +
      esc(t.description || "") +
      "</p>" +
      (t.correctiveCode ? "<pre class='dc-code'>" + esc(t.correctiveCode) + "</pre>" : "") +
      '<form id="tmAssignForm" class="dc-inline-form">' +
      '<select class="fi" name="assignee">' +
      devOpts +
      '</select><select class="fi" name="priority"><option value="low">Basse</option><option value="medium">Moyenne</option><option value="high">Haute</option><option value="critical">Critique</option></select>' +
      '<button type="submit" class="btn btn--role">Attribuer</button></form>' +
      '<div class="dc-detail__actions">' +
      (t.status === "review"
        ? '<button type="button" class="btn btn--role" data-act="validate">✅ Valider correction</button><button type="button" class="btn btn--ghost" data-act="reject">↩ Renvoyer</button>'
        : "") +
      (t.status === "validated"
        ? '<button type="button" class="btn btn--role" data-act="production">🚀 Mettre en production</button>'
        : "") +
      (t.status === "production"
        ? '<button type="button" class="btn btn--ghost" data-act="resolve">🟢 Clore ticket</button>'
        : "") +
      "</div>";
    host.querySelector("[name=priority]").value = t.priority || "medium";
    host.querySelector("#tmAssignForm")?.addEventListener("submit", async function (e) {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await SAC_API.assignTechManagerTicket(t.id, {
          assignee: fd.get("assignee"),
          priority: fd.get("priority"),
        });
        toast("Ticket attribué.");
        await refresh();
        renderDetail(t.id);
      } catch (err) {
        toast(err.message);
      }
    });
    host.querySelector("[data-act='validate']")?.addEventListener("click", async function () {
      await SAC_API.validateTechManagerTicket(t.id, { approve: true });
      toast("Correction validée.");
      await refresh();
    });
    host.querySelector("[data-act='reject']")?.addEventListener("click", async function () {
      await SAC_API.validateTechManagerTicket(t.id, { approve: false });
      toast("Renvoyé au développeur.");
      await refresh();
    });
    host.querySelector("[data-act='production']")?.addEventListener("click", async function () {
      await SAC_API.approveTechManagerProduction(t.id);
      toast("Mise en production.");
      await refresh();
    });
    host.querySelector("[data-act='resolve']")?.addEventListener("click", async function () {
      await SAC_API.resolveTechManagerTicket(t.id);
      toast("Ticket clos.");
      await refresh();
    });
  }

  async function renderTeam() {
    const host = document.getElementById("tmTeamPanel");
    if (!host) return;
    host.innerHTML = "<p class='dc-empty'>Chargement équipe…</p>";
    try {
      await loadTeam();
      host.innerHTML =
        "<h1 class='page-title'>Performances équipe</h1>" +
        (team.length
          ? team
              .map(function (d) {
                const p = d.performance || {};
                return (
                  '<article class="dc-project-card"><h3>' +
                  esc(d.displayName) +
                  "</h3><p>" +
                  esc(d.fonction || "") +
                  "</p><p>" +
                  p.assignedTotal +
                  " assignés · " +
                  p.inProgress +
                  " en cours · " +
                  p.resolved +
                  " résolus · " +
                  p.resolutionRate +
                  "% · ⏱ " +
                  p.timeSpentMinutes +
                  " min</p></article>"
                );
              })
              .join("")
          : '<p class="dc-empty">Aucun développeur.</p>');
    } catch (err) {
      host.innerHTML =
        "<h1 class='page-title'>Performances équipe</h1><p class='dc-empty'>" +
        esc(err.message || "Impossible de charger l'équipe.") +
        "</p>";
    }
  }

  function scoreClass(score) {
    if (score >= 70) return "tm-shield-score tm-shield-score--high";
    if (score >= 40) return "tm-shield-score tm-shield-score--mid";
    return "tm-shield-score tm-shield-score--low";
  }

  function actionLabel(action) {
    const map = {
      allow: "Autorisé",
      throttle: "Ralenti",
      block: "Bloqué",
      honeypot: "Honeypot",
    };
    return map[action] || action;
  }

  async function renderShield() {
    const host = document.getElementById("tmShieldPanel");
    if (!host) return;
    host.innerHTML = "<p class='dc-empty'>Chargement du bouclier…</p>";
    try {
      const overview = await SAC_API.getTechManagerShieldOverview();
      const eventsData = await SAC_API.listTechManagerShieldEvents(40);
      const blockedData = await SAC_API.listTechManagerShieldBlocked();
      const honeypotData = await SAC_API.listTechManagerShieldHoneypot(30);
      const events = eventsData.events || [];
      const blocked = blockedData.blocked || [];
      const hits = honeypotData.hits || [];
      const statusClass = overview.enabled ? "tm-shield-status--on" : "tm-shield-status--off";
      const statusText = overview.enabled ? "Actif" : "Désactivé";

      host.innerHTML =
        "<h1 class='page-title'>Bouclier anti-attaque</h1>" +
        "<p class='page-desc'>Scoring temps réel, blocage IP et pièges honeypot — visible uniquement ici.</p>" +
        "<p class='tm-shield-meta'>Mis à jour : " +
        esc(overview.updatedAt || "—") +
        " · Seuils : ralenti " +
        esc(overview.thresholds?.throttle) +
        " · blocage " +
        esc(overview.thresholds?.block) +
        " · honeypot " +
        esc(overview.thresholds?.honeypot) +
        "</p>" +
        '<span class="tm-shield-status ' +
        statusClass +
        '">🛡 ' +
        statusText +
        "</span>" +
        '<div class="dc-kpi-grid" style="margin-top:1rem">' +
        '<div class="dc-kpi"><strong>' +
        esc(overview.events24h) +
        "</strong><span>Événements 24h</span></div>" +
        '<div class="dc-kpi"><strong>' +
        esc(overview.blockedActive) +
        "</strong><span>IP bloquées</span></div>" +
        '<div class="dc-kpi"><strong>' +
        esc(overview.honeypot24h) +
        "</strong><span>Honeypot 24h</span></div>" +
        '<div class="dc-kpi"><strong>' +
        esc(overview.avgScore24h) +
        "</strong><span>Score moyen</span></div></div>" +
        '<div class="tm-shield-section"><h2>Événements récents</h2>' +
        (events.length
          ? '<table class="tm-shield-table"><thead><tr><th>Heure</th><th>IP</th><th>Score</th><th>Action</th><th>Requête</th></tr></thead><tbody>' +
            events
              .map(function (ev) {
                return (
                  "<tr><td>" +
                  esc((ev.createdAt || "").slice(11, 19)) +
                  "</td><td>" +
                  esc(ev.ipMasked) +
                  '</td><td><span class="' +
                  scoreClass(ev.score) +
                  '">' +
                  esc(ev.score) +
                  '</span></td><td><span class="tm-shield-action">' +
                  esc(actionLabel(ev.action)) +
                  '</span></td><td><span class="tm-shield-path">' +
                  esc(ev.method) +
                  " " +
                  esc(ev.path) +
                  "</span></td></tr>"
                );
              })
              .join("") +
            "</tbody></table>"
          : '<p class="dc-empty">Aucun événement récent.</p>') +
        "</div>" +
        '<div class="tm-shield-section"><h2>IP bloquées</h2>' +
        (blocked.length
          ? '<table class="tm-shield-table"><thead><tr><th>IP</th><th>Score</th><th>Raison</th><th>Jusqu\'à</th><th></th></tr></thead><tbody>' +
            blocked
              .map(function (b) {
                return (
                  "<tr><td>" +
                  esc(b.ipMasked) +
                  '</td><td><span class="' +
                  scoreClass(b.score) +
                  '">' +
                  esc(b.score) +
                  "</span></td><td>" +
                  esc(b.reason) +
                  "</td><td>" +
                  esc((b.blockedUntil || "").slice(0, 19)) +
                  '</td><td><button type="button" class="btn btn--ghost btn--xs" data-unblock="' +
                  esc(b.ipHash) +
                  '">Débloquer</button></td></tr>"
                );
              })
              .join("") +
            "</tbody></table>"
          : '<p class="dc-empty">Aucune IP bloquée active.</p>') +
        "</div>" +
        '<div class="tm-shield-section"><h2>Pièges honeypot</h2>' +
        (hits.length
          ? '<table class="tm-shield-table"><thead><tr><th>Heure</th><th>Chemin</th><th>Agent</th></tr></thead><tbody>' +
            hits
              .map(function (h) {
                return (
                  "<tr><td>" +
                  esc((h.createdAt || "").slice(11, 19)) +
                  '</td><td><span class="tm-shield-path">' +
                  esc(h.path) +
                  "</span></td><td>" +
                  esc((h.userAgent || "").slice(0, 60)) +
                  "</td></tr>"
                );
              })
              .join("") +
            "</tbody></table>"
          : '<p class="dc-empty">Aucun piège déclenché.</p>') +
        "</div>";

      host.querySelectorAll("[data-unblock]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          try {
            await SAC_API.unblockTechManagerShieldIp(btn.dataset.unblock);
            toast("IP débloquée.");
            await renderShield();
          } catch (err) {
            toast(err.message || "Erreur déblocage");
          }
        });
      });
    } catch (err) {
      host.innerHTML =
        "<h1 class='page-title'>Bouclier anti-attaque</h1><p class='dc-empty'>" +
        esc(err.message || "Impossible de charger le bouclier.") +
        "</p>";
    }
  }

  function startShieldPolling() {
    stopShieldPolling();
    shieldTimer = setInterval(function () {
      if (currentView === "shield") renderShield();
    }, 15000);
  }

  function stopShieldPolling() {
    if (shieldTimer) {
      clearInterval(shieldTimer);
      shieldTimer = null;
    }
  }

  async function renderStats() {
    const host = document.getElementById("tmStatsPanel");
    if (!host) return;
    host.innerHTML = "<p class='dc-empty'>Chargement statistiques…</p>";
    try {
      const data = await SAC_API.getTechManagerStats();
      const g = data.global || {};
      host.innerHTML =
        "<h1 class='page-title'>Statistiques de résolution</h1>" +
        '<div class="dc-kpi-grid">' +
        '<div class="dc-kpi"><strong>' +
        g.total +
        "</strong><span>Total tickets</span></div>" +
        '<div class="dc-kpi"><strong>' +
        g.open +
        "</strong><span>Ouverts</span></div>" +
        '<div class="dc-kpi"><strong>' +
        g.resolved +
        "</strong><span>Résolus</span></div>" +
        '<div class="dc-kpi"><strong>' +
        g.resolutionRate +
        '%</strong><span>Taux global</span></div>' +
        '<div class="dc-kpi"><strong>' +
        g.avgTimeMinutes +
        " min</strong><span>Temps moyen</span></div></div>";
    } catch (err) {
      host.innerHTML =
        "<h1 class='page-title'>Statistiques de résolution</h1><p class='dc-empty'>" +
        esc(err.message || "Impossible de charger les statistiques.") +
        "</p>";
    }
  }

  function showView(view) {
    currentView = view;
    const sectionMap = {
      board: "tm-board",
      review: "tm-board",
      team: "tm-team",
      stats: "tm-stats",
      shield: "tm-shield",
    };
    document.querySelectorAll(".tm-tab").forEach(function (t) {
      t.classList.toggle("active", t.dataset.view === view);
    });
    document.querySelectorAll(".page-section").forEach(function (s) {
      s.classList.remove("active");
    });
    const targetId = sectionMap[view] || "tm-board";
    document.getElementById(targetId)?.classList.add("active");
    if (view === "shield") startShieldPolling();
    else stopShieldPolling();
  }

  async function refresh() {
    const filter = currentView === "review" ? "review" : "all";
    try {
      await loadTickets(filter);
    } catch (err) {
      toast(err.message || "Impossible de charger les tickets.");
    }
    try {
      await loadTeam();
    } catch {
      /* équipe optionnelle pour la liste tickets */
    }
    const reviewEl = document.getElementById("tmReviewCount");
    if (reviewEl) {
      reviewEl.textContent = String(
        tickets.filter(function (t) {
          return t.status === "review";
        }).length
      );
    }
    if (currentView === "board" || currentView === "review") {
      renderList();
    }
  }

  function bindTabs() {
    document.querySelectorAll(".tm-tab").forEach(function (tab) {
      tab.addEventListener("click", async function () {
        const view = tab.dataset.view || "board";
        showView(view);
        try {
          if (view === "review") await loadTickets("review");
          else if (view === "board") await loadTickets("all");
          else if (view === "team") await renderTeam();
          else if (view === "stats") await renderStats();
          else if (view === "shield") await renderShield();
          if (view === "board" || view === "review") renderList();
        } catch (err) {
          toast(err.message || "Erreur lors du chargement.");
        }
      });
    });
  }

  async function init() {
    session = await guard();
    if (!session) return;
    document.getElementById("tmUserName").textContent =
      [session.prenom, session.nom].filter(Boolean).join(" ") || session.email;
    SAC_PORTAL.applyBranding("techmanager");
    bindTabs();
    await refresh();
    document.getElementById("tmRefreshBtn")?.addEventListener("click", refresh);
    document.getElementById("btnLogout")?.addEventListener("click", function () {
      SAC_SESSION.logout(SAC_PORTAL.siteUrl("techmanager/"));
    });
  }

  return { init };
})();

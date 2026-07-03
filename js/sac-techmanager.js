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
  }

  async function renderStats() {
    const host = document.getElementById("tmStatsPanel");
    if (!host) return;
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
  }

  function showView(view) {
    currentView = view;
    document.querySelectorAll(".tm-tab").forEach(function (t) {
      t.classList.toggle("active", t.dataset.view === view);
    });
    document.getElementById("tm-board").classList.toggle("active", view === "board" || view === "review");
    document.getElementById("tm-team").classList.toggle("active", view === "team");
    document.getElementById("tm-stats").classList.toggle("active", view === "stats");
  }

  async function refresh() {
    const filter = currentView === "review" ? "review" : "all";
    await loadTickets(filter);
    await loadTeam();
    const reviewEl = document.getElementById("tmReviewCount");
    if (reviewEl) {
      reviewEl.textContent = String(
        tickets.filter(function (t) {
          return t.status === "review";
        }).length
      );
    }
    renderList();
  }

  async function init() {
    session = await guard();
    if (!session) return;
    document.getElementById("tmUserName").textContent =
      [session.prenom, session.nom].filter(Boolean).join(" ") || session.email;
    SAC_PORTAL.applyBranding("techmanager");
    await refresh();
    document.querySelectorAll(".tm-tab").forEach(function (tab) {
      tab.addEventListener("click", async function () {
        showView(tab.dataset.view);
        if (tab.dataset.view === "review") await loadTickets("review");
        if (tab.dataset.view === "board") await loadTickets("all");
        if (tab.dataset.view === "team") await renderTeam();
        if (tab.dataset.view === "stats") await renderStats();
        renderList();
      });
    });
    document.getElementById("tmRefreshBtn")?.addEventListener("click", refresh);
    document.getElementById("btnLogout")?.addEventListener("click", function () {
      SAC_SESSION.logout(SAC_PORTAL.siteUrl("techmanager/"));
    });
  }

  return { init };
})();

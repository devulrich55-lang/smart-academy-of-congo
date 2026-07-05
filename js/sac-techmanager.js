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
  let shieldPulseTimer = null;
  let shieldPulseSince = null;

  function esc(s) {
    const el = document.createElement("div");
    el.textContent = String(s != null ? s : "");
    return el.innerHTML;
  }

  function on(el, event, fn) {
    if (el) el.addEventListener(event, fn);
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
    on(host.querySelector("#tmAssignForm"), "submit", async function (e) {
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
    on(host.querySelector("[data-act='validate']"), "click", async function () {
      await SAC_API.validateTechManagerTicket(t.id, { approve: true });
      toast("Correction validée.");
      await refresh();
    });
    on(host.querySelector("[data-act='reject']"), "click", async function () {
      await SAC_API.validateTechManagerTicket(t.id, { approve: false });
      toast("Renvoyé au développeur.");
      await refresh();
    });
    on(host.querySelector("[data-act='production']"), "click", async function () {
      await SAC_API.approveTechManagerProduction(t.id);
      toast("Mise en production.");
      await refresh();
    });
    on(host.querySelector("[data-act='resolve']"), "click", async function () {
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

  function renderHourlyChart(hourly) {
    if (!hourly || !hourly.length) {
      return '<p class="dc-empty">Pas encore de données horaires.</p>';
    }
    var max = 1;
    hourly.forEach(function (h) {
      if (h.total > max) max = h.total;
    });
    return (
      '<div class="tm-shield-chart">' +
      hourly
        .map(function (h) {
          var pct = Math.max(4, Math.round((h.total / max) * 100));
          var label = (h.hour || "").slice(11, 13);
          if (label) label += "h";
          return (
            '<div class="tm-shield-chart__bar" title="' +
            esc(h.hour) +
            " — " +
            esc(h.total) +
            ' total · bloc ' +
            esc(h.block || 0) +
            ' · honeypot ' +
            esc(h.honeypot || 0) +
            '"><span style="height:' +
            pct +
            '%"></span><em>' +
            esc(label || "?") +
            "</em></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function bindShieldActions(host) {
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

    var blockForm = host.querySelector("#tmShieldBlockForm");
    if (blockForm) {
      blockForm.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        var fd = new FormData(blockForm);
        var ip = String(fd.get("ip") || "").trim();
        if (!ip) {
          toast("Indiquez une IP.");
          return;
        }
        var payload = { ip: ip, reason: String(fd.get("reason") || "manual_block").trim() };
        var mins = String(fd.get("minutes") || "").trim();
        if (mins) payload.minutes = parseInt(mins, 10);
        try {
          await SAC_API.blockTechManagerShieldIp(payload);
          toast("IP bloquée.");
          blockForm.reset();
          await renderShield();
        } catch (err) {
          toast(err.message || "Erreur blocage");
        }
      });
    }

    var testBtn = host.querySelector("#tmShieldTestAlert");
    if (testBtn) {
      testBtn.addEventListener("click", async function () {
        testBtn.disabled = true;
        try {
          var out = await SAC_API.testTechManagerShieldAlert();
          var okEmail = out.email && out.email.ok;
          var okWa = out.whatsapp && out.whatsapp.ok;
          toast(
            "Test envoyé — email " +
              (okEmail ? "OK" : "échec") +
              " · WhatsApp " +
              (okWa ? "OK" : out.whatsapp && out.whatsapp.note ? out.whatsapp.note : "échec")
          );
        } catch (err) {
          toast(err.message || "Erreur test alerte");
        } finally {
          testBtn.disabled = false;
        }
      });
    }
  }

  async function refreshShieldPulse() {
    if (currentView !== "shield") return;
    var live = document.getElementById("tmShieldLive");
    if (!live || !SAC_API || typeof SAC_API.getTechManagerShieldPulse !== "function") return;
    try {
      var pulse = await SAC_API.getTechManagerShieldPulse(shieldPulseSince);
      if (pulse.updatedAt) shieldPulseSince = pulse.updatedAt;
      live.textContent =
        (pulse.newEvents || 0) +
        " nouveaux événements · " +
        (pulse.blockedActive || 0) +
        " IP bloquées";
      live.title = "Pulse depuis " + ((pulse.since || "").slice(11, 19) || "—");
    } catch (err) {
      /* pulse silencieux */
    }
  }

  async function renderShield() {
    const host = document.getElementById("tmShieldPanel");
    if (!host) return;
    if (
      !SAC_API ||
      typeof SAC_API.getTechManagerShieldOverview !== "function"
    ) {
      host.innerHTML =
        "<h1 class='page-title'>Bouclier anti-attaque</h1><p class='dc-empty'>API bouclier indisponible — redeployez le frontend et l'API puis Ctrl+F5.</p>";
      return;
    }
    host.innerHTML = "<p class='dc-empty'>Chargement du bouclier…</p>";
    try {
      const results = await Promise.all([
        SAC_API.getTechManagerShieldOverview(),
        SAC_API.getTechManagerShieldTrends(24),
        SAC_API.listTechManagerShieldEvents(40),
        SAC_API.listTechManagerShieldBlocked(),
        SAC_API.listTechManagerShieldHoneypot(30),
        SAC_API.getTechManagerShieldAlertsStatus(),
      ]);
      const overview = results[0];
      const trends = results[1];
      const eventsData = results[2];
      const blockedData = results[3];
      const honeypotData = results[4];
      const alertsStatus = results[5];
      const events = eventsData.events || [];
      const blocked = blockedData.blocked || [];
      const hits = honeypotData.hits || [];
      const hourly = trends.hourly || [];
      const topPaths = trends.topPaths || [];
      const topIps = trends.topIps || [];
      const recentAlerts = trends.recentAlerts || [];
      const statusClass = overview.enabled ? "tm-shield-status--on" : "tm-shield-status--off";
      const statusText = overview.enabled ? "Actif" : "Désactivé";
      const alertsOn = alertsStatus.enabled;
      const alertsClass = alertsOn ? "tm-shield-status--on" : "tm-shield-status--off";

      shieldPulseSince = overview.updatedAt || new Date().toISOString();

      const thresholds = overview.thresholds || {};
      host.innerHTML =
        "<h1 class='page-title'>Bouclier anti-attaque</h1>" +
        "<p class='page-desc'>Scoring temps réel, blocage IP et pièges honeypot — visible uniquement ici.</p>" +
        "<p class='tm-shield-meta'>Mis à jour : " +
        esc(overview.updatedAt || "—") +
        " · Seuils : ralenti " +
        esc(thresholds.throttle) +
        " · blocage " +
        esc(thresholds.block) +
        " · honeypot " +
        esc(thresholds.honeypot) +
        "</p>" +
        '<p id="tmShieldLive" class="tm-shield-live">Pulse en cours…</p>' +
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
        '<div class="tm-shield-section"><h2>Tendance 24h</h2>' +
        renderHourlyChart(hourly) +
        "</div>" +
        '<div class="tm-shield-grid">' +
        '<div class="tm-shield-section"><h2>Top chemins</h2>' +
        (topPaths.length
          ? '<table class="tm-shield-table"><thead><tr><th>Chemin</th><th>Hits</th><th>Max</th></tr></thead><tbody>' +
            topPaths
              .map(function (p) {
                return (
                  "<tr><td><span class='tm-shield-path'>" +
                  esc(p.path) +
                  "</span></td><td>" +
                  esc(p.count) +
                  '</td><td><span class="' +
                  scoreClass(p.maxScore) +
                  '">' +
                  esc(p.maxScore) +
                  "</span></td></tr>"
                );
              })
              .join("") +
            "</tbody></table>"
          : '<p class="dc-empty">Aucun chemin suspect.</p>') +
        "</div>" +
        '<div class="tm-shield-section"><h2>Top IP</h2>' +
        (topIps.length
          ? '<table class="tm-shield-table"><thead><tr><th>IP</th><th>Hits</th><th>Max</th></tr></thead><tbody>' +
            topIps
              .map(function (ip) {
                return (
                  "<tr><td>" +
                  esc(ip.ipMasked) +
                  "</td><td>" +
                  esc(ip.count) +
                  '</td><td><span class="' +
                  scoreClass(ip.maxScore) +
                  '">' +
                  esc(ip.maxScore) +
                  "</span></td></tr>"
                );
              })
              .join("") +
            "</tbody></table>"
          : '<p class="dc-empty">Aucune IP récurrente.</p>') +
        "</div></div>" +
        '<div class="tm-shield-section"><h2>Alertes automatiques</h2>' +
        '<span class="tm-shield-status ' +
        alertsClass +
        '">' +
        (alertsOn ? "Actives" : "Désactivées") +
        "</span>" +
        " · Seuil " +
        esc(alertsStatus.minScore) +
        " · Envoyées 24h : " +
        esc(alertsStatus.sent24h) +
        (alertsStatus.whatsappPhone
          ? " · WhatsApp " + esc(alertsStatus.whatsappPhone)
          : "") +
        '<div class="tm-shield-actions">' +
        '<button type="button" class="btn btn--ghost btn--xs" id="tmShieldTestAlert">Tester alertes</button>' +
        "</div>" +
        (recentAlerts.length
          ? '<table class="tm-shield-table"><thead><tr><th>Heure</th><th>Action</th><th>IP</th><th>Score</th><th>Chemin</th></tr></thead><tbody>' +
            recentAlerts
              .map(function (a) {
                return (
                  "<tr><td>" +
                  esc((a.createdAt || "").slice(11, 19)) +
                  '</td><td><span class="tm-shield-action">' +
                  esc(actionLabel(a.action)) +
                  "</span></td><td>" +
                  esc(a.ipMasked) +
                  '</td><td><span class="' +
                  scoreClass(a.score) +
                  '">' +
                  esc(a.score) +
                  "</span></td><td><span class='tm-shield-path'>" +
                  esc(a.path) +
                  "</span></td></tr>"
                );
              })
              .join("") +
            "</tbody></table>"
          : '<p class="dc-empty">Aucune alerte envoyée récemment.</p>') +
        "</div>" +
        '<div class="tm-shield-section"><h2>Bloquer une IP manuellement</h2>' +
        '<form id="tmShieldBlockForm" class="dc-inline-form tm-shield-block-form">' +
        '<input class="fi" name="ip" placeholder="Adresse IP" required />' +
        '<input class="fi" name="reason" placeholder="Raison (optionnel)" />' +
        '<input class="fi" name="minutes" type="number" min="5" max="1440" placeholder="Minutes" />' +
        '<button type="submit" class="btn btn--role btn--xs">Bloquer</button></form></div>' +
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

      bindShieldActions(host);
      refreshShieldPulse();
    } catch (err) {
      host.innerHTML =
        "<h1 class='page-title'>Bouclier anti-attaque</h1><p class='dc-empty'>" +
        esc(err.message || "Impossible de charger le bouclier.") +
        "</p>";
    }
  }

  function startShieldPolling() {
    stopShieldPolling();
    shieldPulseSince = new Date().toISOString();
    shieldTimer = setInterval(function () {
      if (currentView === "shield") renderShield();
    }, 20000);
    shieldPulseTimer = setInterval(function () {
      if (currentView === "shield") refreshShieldPulse();
    }, 8000);
  }

  function stopShieldPolling() {
    if (shieldTimer) {
      clearInterval(shieldTimer);
      shieldTimer = null;
    }
    if (shieldPulseTimer) {
      clearInterval(shieldPulseTimer);
      shieldPulseTimer = null;
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
    const target = document.getElementById(targetId);
    if (target) target.classList.add("active");
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
    } catch (err) {
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

  async function handleTab(view) {
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
  }

  async function init() {
    try {
      session = await guard();
      if (!session) return;
      const nameEl = document.getElementById("tmUserName");
      if (nameEl) {
        nameEl.textContent =
          [session.prenom, session.nom].filter(Boolean).join(" ") || session.email;
      }
      if (typeof SAC_PORTAL !== "undefined") {
        SAC_PORTAL.applyBranding("techmanager");
      }
      refresh().catch(function (err) {
        toast(err.message || "Impossible de charger les données.");
      });
    } catch (err) {
      toast(err.message || "Erreur initialisation Tech Manager.");
    }
  }

  return { init, showView, handleTab, refresh };
})();
window.SAC_TECHMANAGER = SAC_TECHMANAGER;

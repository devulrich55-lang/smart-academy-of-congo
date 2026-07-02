/**
 * EvoMonitor — centre de supervision (Super Admin)
 */
const SAC_EVOMONITOR = (function () {
  "use strict";

  const REFRESH_MS = 30000;
  let session = null;
  let timer = null;
  let lastOverview = null;

  function esc(s) {
    const el = document.createElement("div");
    el.textContent = String(s ?? "");
    return el.innerHTML;
  }

  function fmtNum(v, suffix) {
    if (v == null || v === "") return "—";
    return String(v) + (suffix || "");
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" });
    } catch {
      return iso;
    }
  }

  function fmtDuration(ms) {
    if (ms == null) return "—";
    if (ms < 60000) return Math.round(ms / 1000) + " s";
    if (ms < 3600000) return Math.round(ms / 60000) + " min";
    return Math.round(ms / 3600000) + " h";
  }

  function statusClass(status) {
    if (status === "critical") return "em-status--critical";
    if (status === "warning") return "em-status--warning";
    return "em-status--ok";
  }

  function severityClass(sev) {
    if (sev === "critical") return "em-sev--critical";
    if (sev === "warning") return "em-sev--warning";
    return "em-sev--info";
  }

  function toast(msg) {
    const el = document.getElementById("emToast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("em-toast--show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("em-toast--show"), 3200);
  }

  function showSection(id) {
    document.querySelectorAll(".page-section").forEach((s) => s.classList.remove("active"));
    document.getElementById("section-" + id)?.classList.add("active");
    document.querySelectorAll(".nav-tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.section === id);
    });
  }

  function scoreRing(score) {
    const s = Math.max(0, Math.min(100, Number(score) || 0));
    const color = s >= 80 ? "#10b981" : s >= 50 ? "#f59e0b" : "#ef4444";
    const offset = 283 - (283 * s) / 100;
    return (
      '<div class="em-score-ring" style="--em-score-color:' +
      color +
      '">' +
      '<svg viewBox="0 0 100 100" aria-hidden="true">' +
      '<circle class="em-score-ring__bg" cx="50" cy="50" r="45" />' +
      '<circle class="em-score-ring__fg" cx="50" cy="50" r="45" stroke-dasharray="283" stroke-dashoffset="' +
      offset +
      '" />' +
      "</svg>" +
      '<div class="em-score-ring__value"><strong>' +
      s +
      "</strong><span>/ 100</span></div></div>"
    );
  }

  function metricCard(icon, label, value, hint, extraClass) {
    return (
      '<div class="em-metric' +
      (extraClass ? " " + extraClass : "") +
      '">' +
      '<div class="em-metric__icon" aria-hidden="true">' +
      icon +
      "</div>" +
      "<div><strong>" +
      esc(value) +
      "</strong><span>" +
      esc(label) +
      "</span>" +
      (hint ? '<small class="em-metric__hint">' + esc(hint) + "</small>" : "") +
      "</div></div>"
    );
  }

  function renderOverview(data) {
    lastOverview = data;
    const hero = document.getElementById("emHeroStatus");
    const scoreEl = document.getElementById("emHealthScore");
    const updated = document.getElementById("emLastUpdate");
    if (hero) {
      hero.className = "em-hero-status " + statusClass(data.status);
      hero.innerHTML =
        '<span class="em-hero-status__icon">' +
        esc(data.statusIcon || "🟢") +
        "</span>" +
        "<div><strong>" +
        esc(data.statusLabel) +
        "</strong><span>État général du système</span></div>";
    }
    if (scoreEl) scoreEl.innerHTML = scoreRing(data.healthScore);
    if (updated) updated.textContent = "Mis à jour : " + fmtDate(data.updatedAt);

    const perf = data.performance || {};
    const db = data.database || {};
    const net = data.network || {};
    const users = data.users || {};

    const perfGrid = document.getElementById("emPerfGrid");
    if (perfGrid) {
      perfGrid.innerHTML =
        metricCard("⚡", "Temps de réponse", fmtNum(perf.responseMs, " ms")) +
        metricCard("🖥️", "CPU", fmtNum(perf.cpuPercent, " %")) +
        metricCard("🧠", "RAM", fmtNum(perf.ramPercent, " %"), perf.ramUsedMb ? perf.ramUsedMb + " / " + perf.ramTotalMb + " Mo" : "") +
        metricCard("💾", "Stockage", fmtNum(perf.diskPercent, " %"), perf.diskFreeGb != null ? perf.diskFreeGb + " Go libres" : "") +
        metricCard("📊", "Charge serveur", fmtNum(perf.loadScore, " %"));
    }

    const dbGrid = document.getElementById("emDbGrid");
    if (dbGrid) {
      dbGrid.innerHTML =
        metricCard("🔌", "Connexion", db.connected ? "Active" : "Hors ligne", db.backend, db.connected ? "em-metric--ok" : "em-metric--bad") +
        metricCard("⏱️", "Temps requêtes", fmtNum(db.queryMs, " ms")) +
        metricCard("❌", "Erreurs (24 h)", fmtNum(db.errors24h)) +
        metricCard("🗄️", "Sauvegarde", db.backupLabel || "—", db.backupStatus, db.backupStatus === "ok" ? "em-metric--ok" : "em-metric--warn");
    }

    const netGrid = document.getElementById("emNetGrid");
    if (netGrid) {
      netGrid.innerHTML =
        metricCard("🌐", "Latence", fmtNum(net.latencyMs, " ms")) +
        metricCard("📶", "Internet", net.internetAvailable ? "Disponible" : "Indisponible", "", net.internetAvailable ? "em-metric--ok" : "em-metric--bad") +
        metricCard("📈", "Requêtes / min", fmtNum(net.requestsPerMinute)) +
        metricCard("⚠️", "Taux d'échec", fmtNum(net.failureRate, " %"));
    }

    const usersGrid = document.getElementById("emUsersGrid");
    if (usersGrid) {
      usersGrid.innerHTML =
        metricCard("👥", "Connectés", fmtNum(users.online)) +
        metricCard("📝", "Inscriptions (24 h)", fmtNum(users.newRegistrations24h)) +
        metricCard("⏳", "Comptes verrouillés", fmtNum(users.expiredSessions)) +
        metricCard("🔐", "Échecs connexion (24 h)", fmtNum(users.failedLogins24h));
    }

    renderAnomalies(data.anomalies || []);
    renderIncidents((data.incidents && data.incidents.recent) || []);
    renderAlerts(data);

    const perf2 = document.getElementById("emPerfGrid2");
    if (perfGrid && perf2) perf2.innerHTML = perfGrid.innerHTML;
    const users2 = document.getElementById("emUsersGrid2");
    if (usersGrid && users2) users2.innerHTML = usersGrid.innerHTML;
  }

  function renderAnomalies(items) {
    const box = document.getElementById("emAnomaliesList");
    if (!box) return;
    if (!items.length) {
      box.innerHTML = '<p class="em-empty">✅ Aucune anomalie détectée pour le moment.</p>';
      return;
    }
    box.innerHTML = items
      .map(
        (a) =>
          '<article class="em-anomaly ' +
          severityClass(a.severity) +
          '">' +
          '<div class="em-anomaly__head"><span class="em-anomaly__badge">' +
          esc(a.severity === "critical" ? "🔴" : "⚠️") +
          "</span><strong>" +
          esc(a.title) +
          '</strong><span class="em-anomaly__svc">' +
          esc(a.service) +
          "</span></div>" +
          "<p>" +
          esc(a.message) +
          "</p>" +
          (a.actions && a.actions.length
            ? '<ul class="em-anomaly__actions">' +
              a.actions.map((x) => "<li>" + esc(x) + "</li>").join("") +
              "</ul>"
            : "") +
          "</article>"
      )
      .join("");
  }

  function renderIncidents(items) {
    const tbody = document.getElementById("emIncidentsBody");
    const count = document.getElementById("emOpenIncidents");
    if (count && lastOverview) {
      count.textContent = String((lastOverview.incidents && lastOverview.incidents.open) || 0);
    }
    if (!tbody) return;
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="em-empty">Aucun incident enregistré.</td></tr>';
      return;
    }
    tbody.innerHTML = items
      .map(
        (inc) =>
          "<tr>" +
          "<td>" +
          fmtDate(inc.createdAt) +
          "</td>" +
          '<td><span class="em-pill ' +
          severityClass(inc.severity) +
          '">' +
          esc(inc.severity) +
          "</span></td>" +
          "<td>" +
          esc(inc.service) +
          "</td>" +
          "<td><strong>" +
          esc(inc.title) +
          "</strong><br/><small>" +
          esc(inc.message) +
          "</small></td>" +
          "<td>" +
          (inc.status === "open"
            ? '<span class="em-pill em-pill--open">Ouvert</span>'
            : inc.status === "acknowledged"
              ? '<span class="em-pill em-pill--ack">Pris en charge</span>'
              : '<span class="em-pill em-pill--resolved">Résolu</span>') +
          "<br/><small>" +
          (inc.resolvedBy ? "Par " + esc(inc.resolvedBy) : "") +
          "</small></td>" +
          "<td>" +
          (inc.status === "open"
            ? '<button type="button" class="btn btn--ghost btn--xs" data-resolve="' +
              esc(inc.id) +
              '">Marquer résolu</button>'
            : fmtDuration(inc.resolutionMs)) +
          "</td></tr>"
      )
      .join("");

    tbody.querySelectorAll("[data-resolve]").forEach((btn) => {
      btn.addEventListener("click", () => resolveIncident(btn.dataset.resolve));
    });
  }

  function renderAlerts(data) {
    const box = document.getElementById("emAlertsInfo");
    if (!box) return;
    const alerts = data.alerts || {};
    box.innerHTML =
      '<div class="em-alert-cards">' +
      metricCard("📧", "E-mail configuré", alerts.emailConfigured ? "Oui" : "Non", "", alerts.emailConfigured ? "em-metric--ok" : "em-metric--warn") +
      metricCard("🚨", "Incidents ouverts", fmtNum(alerts.openIncidents)) +
      metricCard("📨", "E-mails envoyés (scan)", fmtNum(alerts.emailsSent)) +
      "</div>" +
      '<p class="em-hint">Lorsqu\'une anomalie critique est détectée, EvoMonitor peut notifier l\'administrateur par e-mail et enregistrer l\'incident automatiquement.</p>';
  }

  async function loadOverview(opts) {
    const notify = opts && opts.notify;
    const btn = document.getElementById("emRefreshBtn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Actualisation…";
    }
    try {
      if (typeof SAC_API === "undefined" || !SAC_API.getMonitorOverview) {
        throw new Error("API EvoMonitor indisponible.");
      }
      await SAC_API.ensureApiSession({ soft: true });
      const data = await SAC_API.getMonitorOverview({ notify: !!notify });
      renderOverview(data);
    } catch (err) {
      toast(err.message || "Impossible de charger les métriques.");
      const hero = document.getElementById("emHeroStatus");
      if (hero) {
        hero.className = "em-hero-status em-status--critical";
        hero.innerHTML =
          '<span class="em-hero-status__icon">🔴</span><div><strong>Panne critique</strong><span>API inaccessible</span></div>';
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Actualiser";
      }
    }
  }

  async function resolveIncident(id) {
    if (!id || !confirm("Marquer cet incident comme résolu ?")) return;
    try {
      await SAC_API.resolveMonitorIncident(id, "resolved");
      toast("Incident résolu.");
      await loadOverview();
    } catch (err) {
      toast(err.message || "Action impossible.");
    }
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    timer = setInterval(() => loadOverview(), REFRESH_MS);
  }

  function stopAutoRefresh() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  async function init() {
    session = await SAC_SESSION.guard("superadmin");
    if (!session) return;

    const name = [session.prenom, session.nom].filter(Boolean).join(" ") || session.identifiant || session.email;
    const nameEl = document.getElementById("emUserName");
    if (nameEl) nameEl.textContent = name;

    if (typeof SAC_PORTAL !== "undefined") {
      SAC_PORTAL.applyBranding("superadmin");
    }

    document.getElementById("emRefreshBtn")?.addEventListener("click", () => loadOverview());
    document.getElementById("emScanBtn")?.addEventListener("click", () => loadOverview({ notify: true }));
    document.getElementById("btnLogout")?.addEventListener("click", () => {
      stopAutoRefresh();
      const logoutTarget =
        typeof SAC_PORTAL !== "undefined" ? SAC_PORTAL.siteUrl("evomonitor/") : "evomonitor/";
      SAC_SESSION.logout(logoutTarget);
    });

    document.querySelectorAll(".nav-tab").forEach((tab) => {
      tab.addEventListener("click", () => showSection(tab.dataset.section));
    });

    document.getElementById("emHeroDate").textContent = new Date().toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    await loadOverview();
    startAutoRefresh();
  }

  return { init, loadOverview, showSection };
})();

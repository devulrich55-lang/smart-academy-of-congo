/**
 * EvoMonitor — centre de supervision (Super Admin) + SATA intelligence
 */
const SAC_EVOMONITOR = (function () {
  "use strict";

  const REFRESH_MS = 20000;
  const SECURITY_PULSE_MS = 20000;
  const LIVE_REFRESH_MS = 5000;
  const AIOPS_WATCH_MS = 25000;
  let session = null;
  let timer = null;
  let securityTimer = null;
  let liveTimer = null;
  let aiOpsTimer = null;
  let lastOverview = null;
  let lastLoadError = null;
  let logsCache = [];
  let logFilters = { q: "", category: "all", level: "all" };

  const INTEL = typeof SAC_EVOMONITOR_INTEL !== "undefined" ? SAC_EVOMONITOR_INTEL : null;
  const AIOPS = typeof SAC_EVOMONITOR_AIOPS !== "undefined" ? SAC_EVOMONITOR_AIOPS : null;

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
    if (id === "live") startLiveRefresh();
    else stopLiveRefresh();
    if (id === "logs") loadLogs();
    if (id === "sata") renderSata();
    if (id === "aiops") renderAiOps();
    if (id === "debug") renderDebug();
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

  let lastPredictionKey = "";

  function enrichOverview(data) {
    if (!data || !INTEL) return data;
    let overview = INTEL.applySimulation(data);
    INTEL.recordSnapshot(overview);
    const predictions = INTEL.predictAnomalies(overview, INTEL.getHistory());
    overview._predictions = predictions;
    overview._moduleScores = overview.moduleScores || INTEL.computeModuleScores(overview);
    overview._epm = overview.epm != null ? overview.epm : INTEL.estimateEpm(overview, INTEL.getHistory());
    overview.anomalies = (overview.anomalies || []).concat(predictions);
    return overview;
  }

  function renderOverview(data) {
    const enriched = enrichOverview(data);
    lastOverview = enriched;
    const hero = document.getElementById("emHeroStatus");
    const scoreEl = document.getElementById("emHealthScore");
    const updated = document.getElementById("emLastUpdate");
    const moduleHost = document.getElementById("emModuleScores");
    const epmEl = document.getElementById("emEpmBadge");

    if (hero) {
      hero.className = "em-hero-status " + statusClass(enriched.status);
      hero.innerHTML =
        '<span class="em-hero-status__icon">' +
        esc(enriched.statusIcon || "🟢") +
        "</span>" +
        "<div><strong>" +
        esc(enriched.statusLabel) +
        "</strong><span>État général du système</span></div>";
    }
    const displayScore = enriched._moduleScores?.global ?? enriched.healthScore;
    if (scoreEl) scoreEl.innerHTML = scoreRing(displayScore);
    if (updated) updated.textContent = "Mis à jour : " + fmtDate(enriched.updatedAt);
    if (INTEL && moduleHost) INTEL.renderModuleScores(moduleHost, enriched._moduleScores);
    if (epmEl) {
      epmEl.textContent = (enriched._epm || 0) + " EPM";
      epmEl.hidden = false;
    }

    const perf = enriched.performance || {};
    const db = enriched.database || {};
    const net = enriched.network || {};
    const users = enriched.users || {};

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
        metricCard("⚠️", "Taux d'échec", fmtNum(net.failureRate, " %")) +
        metricCard("🔥", "Erreurs / min", fmtNum(enriched._epm || 0, " EPM"), "Errors Per Minute");
    }

    const usersGrid = document.getElementById("emUsersGrid");
    if (usersGrid) {
      usersGrid.innerHTML =
        metricCard("👥", "Connectés", fmtNum(users.online)) +
        metricCard("📝", "Inscriptions (24 h)", fmtNum(users.newRegistrations24h)) +
        metricCard("⏳", "Comptes verrouillés", fmtNum(users.expiredSessions)) +
        metricCard("🔐", "Échecs connexion (24 h)", fmtNum(users.failedLogins24h));
    }

    renderAnomalies(enriched.anomalies || []);
    renderIncidents((enriched.incidents && enriched.incidents.recent) || []);
    renderAlerts(enriched);
    renderSecurityBanner(enriched);

    if (INTEL) {
      INTEL.renderLiveDashboard(document.getElementById("emLiveCharts"), enriched, INTEL.getHistory());
    }

    const perf2 = document.getElementById("emPerfGrid2");
    if (perfGrid && perf2) perf2.innerHTML = perfGrid.innerHTML;
    const users2 = document.getElementById("emUsersGrid2");
    if (usersGrid && users2) users2.innerHTML = usersGrid.innerHTML;

    if (INTEL && enriched._predictions?.length) {
      const key = enriched._predictions.map((p) => p.title).join("|");
      if (key !== lastPredictionKey) {
        lastPredictionKey = key;
        INTEL.dispatchAlert(
          { severity: enriched._predictions[0].severity, message: enriched._predictions[0].title },
          toast
        );
      }
    }
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
          esc(a.severity === "critical" ? "🔴" : a.kind === "prediction" ? "🧠" : "⚠️") +
          "</span><strong>" +
          esc(a.title) +
          '</strong><span class="em-anomaly__svc">' +
          esc(a.service) +
          (a.kind === "prediction" ? ' · <em class="em-tag-pred">Prédiction</em>' : "") +
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

  function incidentStatusUi(inc) {
    if (!inc) return { label: "—", pill: "em-pill--open" };
    if (!INTEL) {
      if (inc.status === "acknowledged") return { label: "Pris en charge", pill: "em-pill--ack" };
      if (inc.status === "resolved") return { label: "Résolu", pill: "em-pill--resolved" };
      return { label: "Ouvert", pill: "em-pill--open" };
    }
    const ui = INTEL.uiStatusFromApi(inc.status);
    return INTEL.INCIDENT_STATUS[ui] || INTEL.INCIDENT_STATUS.open;
  }

  function renderIncidents(items) {
    const tbody = document.getElementById("emIncidentsBody");
    const count = document.getElementById("emOpenIncidents");
    const mttrEl = document.getElementById("emMttrStat");
    const list = (items || []).filter(Boolean);
    if (count && lastOverview) {
      const open = (lastOverview.incidents && lastOverview.incidents.open) || 0;
      count.textContent = String(open);
      count.hidden = open <= 0;
    }
    if (INTEL && mttrEl) {
      const mttr = INTEL.computeMttr(list);
      mttrEl.textContent = mttr != null ? "MTTR moyen : " + fmtDuration(mttr) : "MTTR : —";
    }
    if (!tbody) return;
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="em-empty">Aucun incident enregistré.</td></tr>';
      return;
    }
    tbody.innerHTML = list
      .map((inc) => {
        const st = incidentStatusUi(inc);
        const meta =
          INTEL && inc.id ? INTEL.getIncidentMeta()[inc.id] || {} : {};
        const assignee = meta.assignee || inc.assignee || "—";
        return (
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
          '<span class="em-pill ' +
          st.pill +
          '">' +
          esc(st.label) +
          "</span>" +
          "</td>" +
          "<td><small>" +
          esc(assignee) +
          "</small></td>" +
          "<td>" +
          (inc.status === "open"
            ? '<button type="button" class="btn btn--ghost btn--xs" data-investigate="' +
              esc(inc.id) +
              '">Investiguer</button> '
            : "") +
          (inc.status !== "resolved"
            ? '<button type="button" class="btn btn--ghost btn--xs" data-resolve="' +
              esc(inc.id) +
              '">Corrigé</button>'
            : fmtDuration(inc.resolutionMs)) +
          "</td></tr>"
        );
      })
      .join("");

    tbody.querySelectorAll("[data-resolve]").forEach((btn) => {
      btn.addEventListener("click", () => updateIncident(btn.dataset.resolve, "fixed"));
    });
    tbody.querySelectorAll("[data-investigate]").forEach((btn) => {
      btn.addEventListener("click", () => updateIncident(btn.dataset.investigate, "investigating"));
    });
  }

  function renderSecurityBanner(data) {
    const host = document.getElementById("emQuickPreview");
    if (!host) return;
    const users = data.users || {};
    const alerts = data.alerts || {};
    const failed = users.failedLogins24h || 0;
    const openSec = alerts.openSecurityIncidents || 0;
    let banner = host.querySelector(".em-security-banner");
    if (!failed && !openSec) {
      if (banner) banner.remove();
      return;
    }
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "em-panel em-security-banner";
      host.insertBefore(banner, host.firstChild);
    }
    banner.innerHTML =
      "<h3>🛡️ Surveillance sécurité</h3>" +
      "<p>" +
      (openSec ? openSec + " alerte(s) sécurité ouverte(s). " : "") +
      (failed ? failed + " échec(s) de connexion (24 h) — détection brute force active. " : "") +
      'Consultez l’onglet <button type="button" class="btn btn--ghost btn--xs" id="emGoAlerts">Alertes</button> ou <button type="button" class="btn btn--ghost btn--xs" id="emGoLogs">Logs</button>.</p>';
    banner.querySelector("#emGoAlerts")?.addEventListener("click", () => showSection("alerts"));
    banner.querySelector("#emGoLogs")?.addEventListener("click", () => showSection("logs"));
  }

  function renderAlerts(data) {
    const box = document.getElementById("emAlertsInfo");
    const secList = document.getElementById("emSecurityList");
    const secBadge = document.getElementById("emOpenSecurity");
    if (!box) return;
    const alerts = data.alerts || {};
    const openSec = alerts.openSecurityIncidents || 0;
    const cfg = INTEL ? INTEL.getAlertConfig() : {};
    if (secBadge) {
      secBadge.textContent = String(openSec);
      secBadge.hidden = openSec <= 0;
    }
    box.innerHTML =
      '<div class="em-alert-cards">' +
      metricCard("📧", "E-mail configuré", alerts.emailConfigured ? "Oui" : "Non", "", alerts.emailConfigured ? "em-metric--ok" : "em-metric--warn") +
      metricCard("📬", "Destinataires alertes", fmtNum(alerts.alertRecipients || 0)) +
      metricCard("🚨", "Incidents ouverts", fmtNum(alerts.openIncidents)) +
      metricCard("🛡️", "Alertes sécurité", fmtNum(openSec), "< " + (alerts.securityWindowSeconds || 30) + " s") +
      metricCard("📱", "Canaux SATA actifs", countActiveChannels(cfg)) +
      metricCard("🗑️", "Résolus purgés", fmtNum(alerts.purgedResolved || 0), "auto") +
      "</div>" +
      '<p class="em-hint">Alertes multi-canaux : dashboard, e-mail, SMS, Telegram, WhatsApp, push. Configurez dans l’onglet SATA.</p>';

    if (!secList) return;
    const recent = ((data.incidents && data.incidents.recent) || []).filter((inc) => inc.service === "security");
    if (!recent.length) {
      secList.innerHTML =
        '<p class="em-empty">✅ Aucune alerte sécurité ouverte. Détection : brute force, IP suspectes, injections SQL (côté API).</p>';
      return;
    }
    secList.innerHTML =
      '<h3 class="em-security-list__title">Alertes sécurité récentes</h3>' +
      recent
        .map(
          (inc) =>
            '<article class="em-anomaly em-sev--critical">' +
            '<div class="em-anomaly__head"><span class="em-anomaly__badge">🛡️</span><strong>' +
            esc(inc.title) +
            '</strong><span class="em-anomaly__svc">' +
            fmtDate(inc.createdAt) +
            "</span></div><p>" +
            esc(inc.message) +
            "</p>" +
            (inc.status === "open"
              ? '<button type="button" class="btn btn--ghost btn--xs" data-resolve-sec="' +
                esc(inc.id) +
                '">Marquer résolu</button>'
              : "") +
            "</article>"
        )
        .join("");
    secList.querySelectorAll("[data-resolve-sec]").forEach((btn) => {
      btn.addEventListener("click", () => updateIncident(btn.dataset.resolveSec, "fixed"));
    });
  }

  function countActiveChannels(cfg) {
    let n = 0;
    if (cfg.dashboard) n++;
    if (cfg.email) n++;
    if (cfg.sms) n++;
    if (cfg.telegram) n++;
    if (cfg.whatsapp) n++;
    if (cfg.push) n++;
    return String(n);
  }

  async function pollSecurityPulse() {
    if (typeof SAC_API === "undefined" || !SAC_API.getMonitorSecurityPulse) return;
    try {
      const pulse = await SAC_API.getMonitorSecurityPulse();
      if (pulse && pulse.newAlerts > 0) {
        toast("🛡️ " + pulse.newAlerts + " alerte(s) sécurité détectée(s)");
        if (INTEL) {
          await INTEL.dispatchAlert(
            { severity: "critical", message: pulse.newAlerts + " alerte(s) sécurité" },
            toast
          );
        }
        await loadOverview();
      }
    } catch {
      /* ignore */
    }
  }

  function renderOutageState(err) {
    const msg = err?.message || "API inaccessible";
    const scoreEl = document.getElementById("emHealthScore");
    if (scoreEl) scoreEl.innerHTML = scoreRing(0);
    const moduleHost = document.getElementById("emModuleScores");
    if (moduleHost) {
      moduleHost.innerHTML =
        '<div class="em-outage-modules">' +
        '<p class="em-empty em-empty--warn">⚠️ Supervision interrompue — ' + esc(msg) + "</p>" +
        (lastOverview?.incidents?.open
          ? '<p class="em-meta">' + lastOverview.incidents.open + " incident(s) en cache (dernière sync).</p>"
          : "") +
        "</div>";
    }
    const updated = document.getElementById("emLastUpdate");
    if (updated) updated.textContent = "Échec sync : " + fmtDate(new Date().toISOString());

    const offlineMetrics =
      metricCard("⚡", "Temps de réponse", "—", "API hors ligne", "em-metric--bad") +
      metricCard("🖥️", "CPU", "—", "", "em-metric--bad") +
      metricCard("🌐", "Latence", "—", "", "em-metric--bad") +
      metricCard("🔌", "Base de données", "—", "Non vérifiable", "em-metric--bad");

    ["emPerfGrid", "emPerfGrid2", "emDbGrid", "emNetGrid"].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = offlineMetrics;
    });

    const openInc = lastOverview?.incidents?.open;
    const count = document.getElementById("emOpenIncidents");
    if (count && openInc > 0) {
      count.textContent = String(openInc);
      count.hidden = false;
      count.title = "Incidents en cache — API monitor inaccessible";
    }

    const aiBadge = document.getElementById("emAiOpsAlert");
    if (aiBadge) {
      aiBadge.textContent = "1";
      aiBadge.hidden = false;
    }
  }

  function formatOverviewError(err) {
    if (!err) return "API inaccessible";
    if (err.status === 401 || err.code === "AUTH_REQUIRED" || err.code === "TOKEN_EXPIRED") {
      return "Session expirée — déconnectez-vous et reconnectez-vous";
    }
    if (err.status === 403 || err.code === "FORBIDDEN") {
      return "Accès refusé — compte superadmin requis";
    }
    if (err.status === 404) {
      return "Routes monitor absentes — redéployez API-1 (backend-python)";
    }
    if (err.status === 502 || err.status === 503 || err.status === 504) {
      return "API-1 en veille ou surchargée (Render) — réessayez dans 60 s";
    }
    if (err.code === "NETWORK_ERROR") {
      return err.message || "Connexion impossible";
    }
    return err.message || "Erreur supervision";
  }

  async function probeUrl(label, baseUrl, path, auth) {
    const url = String(baseUrl || "").replace(/\/+$/, "") + path;
    const started = Date.now();
    try {
      const headers = auth && typeof SAC_API !== "undefined" && SAC_API.getAccessToken
        ? { Authorization: "Bearer " + (SAC_API.getAccessToken() || "") }
        : {};
      const res = await fetch(url, {
        method: "GET",
        credentials: "omit",
        mode: "cors",
        headers: headers,
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      return {
        label: label,
        url: url,
        ok: res.ok,
        status: res.status,
        ms: Date.now() - started,
        data: data,
      };
    } catch (e) {
      return {
        label: label,
        url: url,
        ok: false,
        status: 0,
        ms: Date.now() - started,
        error: e.message || String(e),
      };
    }
  }

  async function runApiDiagnostics() {
    const host = document.getElementById("emApiDiag");
    const btn = document.getElementById("emDiagBtn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Diagnostic…";
    }
    if (host) host.innerHTML = '<p class="em-empty">Diagnostic API en cours (peut prendre 60 s si cold start)…</p>';

    const origin = window.location.origin.replace(/\/+$/, "");
    const direct = "https://smart-academy-of-congo-api-1.onrender.com";
    const apiBase =
      (typeof SAC_API !== "undefined" && SAC_API.getBase && SAC_API.getBase()) ||
      (typeof window !== "undefined" && window.SAC_API_BASE) ||
      origin;

    if (typeof SAC_API !== "undefined" && SAC_API.resolveApiBase) {
      try {
        await SAC_API.resolveApiBase(true);
      } catch {
        /* ignore */
      }
    }

    const checks = [
      await probeUrl("Health via site (proxy)", origin, "/api/health", false),
      await probeUrl("Health API-1 direct", direct, "/api/health", false),
      await probeUrl("Monitor overview (auth)", apiBase, "/api/admin/monitor/overview", true),
      await probeUrl("Centre IA status (auth)", apiBase, "/api/admin/monitor/ai-ops/status", true),
    ];

    const lines = checks.map(function (c) {
      const icon = c.ok ? "✅" : c.status === 401 ? "🔐" : c.status === 404 ? "⚠️" : "❌";
      let detail = c.error || "HTTP " + c.status + " · " + c.ms + " ms";
      if (c.data?.database) detail += " · DB " + c.data.database;
      if (c.data?.ok === false) detail += " · ok=false";
      if (c.status === 401) detail = "401 — reconnectez-vous (JWT expiré)";
      if (c.status === 404) detail = "404 — route absente, redéployez API-1";
      if (c.status === 502 || c.status === 503) detail = c.status + " — API Render en veille ou crash";
      return (
        "<tr><td>" + icon + " " + esc(c.label) + "</td><td><code>" + esc(detail) + "</code></td></tr>"
      );
    });

    const healthProxy = checks[0];
    const healthDirect = checks[1];
    const monitor = checks[2];
    const aiOps = checks[3];

    let verdict = "";
    if (!healthProxy.ok && !healthDirect.ok) {
      verdict = "🔴 API-1 semble hors ligne ou en cold start prolongé.";
    } else if (healthProxy.ok && monitor.status === 401) {
      verdict = "🔐 API joignable — session EvoMonitor expirée. Déconnectez-vous puis reconnectez-vous.";
    } else if (healthProxy.ok && monitor.status === 404) {
      verdict = "⚠️ API up mais routes /admin/monitor/* manquantes — commit backend non déployé sur API-1.";
    } else if (healthProxy.ok && aiOps.status === 404) {
      verdict = "⚠️ Monitor OK mais Centre IA (ai-ops) absent — déployez commit 161e650+ sur API-1.";
    } else if (healthProxy.ok && monitor.ok) {
      verdict = "✅ Chaîne API + monitor opérationnelle. Si le tableau échoue encore, Ctrl+F5.";
    } else if (healthDirect.ok && !healthProxy.ok) {
      verdict = "⚠️ API-1 OK mais proxy frontend (congoat) ne répond pas — vérifiez le service Node Render.";
    } else {
      verdict = "Diagnostic partiel — voir détail ci-dessous.";
    }

    if (host) {
      host.innerHTML =
        '<div class="em-panel em-panel--diag">' +
        "<h3>🔬 Diagnostic API Render</h3>" +
        '<p class="em-ai-summary">' + esc(verdict) + "</p>" +
        '<p class="em-meta">Base client : <code>' + esc(apiBase) + "</code></p>" +
        '<table class="em-table em-table--compact"><tbody>' +
        lines.join("") +
        "</tbody></table>" +
        '<p class="em-hint">Render API-1 : vérifiez ALLOWED_ORIGINS inclut <code>' +
        esc(origin) +
        "</code>, disque /data, CROSS_ORIGIN_AUTH=true, Manual Deploy après push backend.</p></div>";
    }

    toast(verdict.replace(/^[^\s]+\s*/, "").slice(0, 120));
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Diagnostiquer API";
    }
    return checks;
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
      lastLoadError = null;
      try {
        renderOverview(data);
      } catch (renderErr) {
        console.error("[EvoMonitor] renderOverview", renderErr);
        toast("Erreur d'affichage : " + (renderErr.message || renderErr));
      }
      if (AIOPS && AIOPS.syncFromOverview) {
        AIOPS.syncFromOverview(lastOverview, null, { onToast: toast });
      }
    } catch (err) {
      lastLoadError = err;
      const errLabel = formatOverviewError(err);
      toast(errLabel);
      renderOutageState(err);
      const hero = document.getElementById("emHeroStatus");
      if (hero) {
        hero.className = "em-hero-status em-status--critical";
        hero.innerHTML =
          '<span class="em-hero-status__icon">🔴</span><div><strong>Panne critique</strong><span>' +
          esc(errLabel) +
          "</span></div>";
      }
      const outage =
        AIOPS && AIOPS.detectOutageFromError
          ? [Object.assign({}, AIOPS.detectOutageFromError(err), { message: errLabel })]
          : [
              {
                severity: "critical",
                service: "api",
                title: "API EvoMonitor inaccessible",
                message: err.message || "Impossible de joindre l'API.",
                kind: "active_anomaly",
              },
            ];
      renderAnomalies(outage);
      if (INTEL) {
        INTEL.dispatchAlert({ severity: "critical", message: "Panne API — " + (err.message || "inaccessible") }, toast);
      }
      if (AIOPS && AIOPS.syncFromOverview) {
        AIOPS.syncFromOverview(lastOverview, err, { onToast: toast });
      }
      if (document.getElementById("section-aiops")?.classList.contains("active")) {
        renderAiOps();
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Actualiser";
      }
    }
  }

  async function updateIncident(id, uiStatus) {
    if (!id) return;
    const label = INTEL?.INCIDENT_STATUS[uiStatus]?.label || uiStatus;
    if (!confirm("Passer l'incident en « " + label + " » ?")) return;
    try {
      const apiStatus = INTEL ? INTEL.apiStatusFromUi(uiStatus) : uiStatus === "fixed" ? "resolved" : uiStatus;
      if (typeof SAC_API.updateMonitorIncident === "function") {
        await SAC_API.updateMonitorIncident(id, { status: apiStatus });
      } else {
        await SAC_API.resolveMonitorIncident(id, apiStatus);
      }
      if (INTEL && session) {
        INTEL.setIncidentMeta(id, {
          assignee: session.identifiant || session.email,
          updatedAt: new Date().toISOString(),
        });
      }
      toast("Incident mis à jour : " + label);
      await loadOverview();
    } catch (err) {
      toast(err.message || "Action impossible.");
    }
  }

  async function loadLogs() {
    const host = document.getElementById("emLogsList");
    if (!host || !INTEL) return;
    host.innerHTML = '<p class="em-empty">Chargement des logs…</p>';
    try {
      const result = await INTEL.fetchLogs(250);
      logsCache = result.logs || [];
      const repeats = result.repeats || INTEL.detectRepeatedErrors(logsCache);
      INTEL.renderLogsPanel(host, logsCache, logFilters, repeats);
    } catch (err) {
      host.innerHTML = '<p class="em-empty" style="color:#b91c1c;">' + esc(err.message) + "</p>";
    }
  }

  function renderSata() {
    if (!INTEL || !INTEL.renderSataPanel) return;
    INTEL.renderSataPanel(document.getElementById("emSataPanel"), {
      onToast: toast,
      onRefresh: () => loadOverview(),
    });
  }

  function renderAiOps() {
    const panel = document.getElementById("emAiOpsPanel");
    if (!panel) return;
    if (!AIOPS || !AIOPS.renderAiOpsPanel) {
      panel.innerHTML =
        '<div class="em-panel em-empty--warn">' +
        "<p><strong>Module Centre IA non chargé.</strong></p>" +
        "<p>Rechargez avec Ctrl+F5 ou vérifiez la console (erreur JavaScript).</p></div>";
      return;
    }
    panel.innerHTML = '<p class="em-empty">Chargement du Centre IA…</p>';
    AIOPS.renderAiOpsPanel(panel, {
      onToast: toast,
      getLastError: function () {
        return lastLoadError;
      },
      getLastOverview: function () {
        return lastOverview;
      },
      getLastErrorLog: function () {
        const errors = logsCache.filter(function (l) {
          return l.level === "error" || l.level === "warn" || (l.action && String(l.action).includes("failed"));
        });
        return errors.length ? errors[0] : null;
      },
    }).catch(function (renderErr) {
      panel.innerHTML =
        '<div class="em-panel">' +
        '<p class="em-empty em-empty--warn">⚠️ Centre IA — erreur d\'affichage : ' +
        esc(renderErr?.message || "inconnue") +
        "</p>" +
        (lastLoadError
          ? '<p class="em-meta">Panne active : ' + esc(lastLoadError.message) + "</p>"
          : "") +
        '<button type="button" class="btn btn--ghost btn--xs" onclick="location.reload()">Recharger</button></div>';
    });
  }

  function renderDebug() {
    if (!INTEL) return;
    INTEL.renderDebugPanel(document.getElementById("emDebugPanel"));
  }

  function startLiveRefresh() {
    stopLiveRefresh();
    liveTimer = setInterval(() => {
      if (lastOverview && INTEL) {
        INTEL.renderLiveDashboard(document.getElementById("emLiveCharts"), lastOverview, INTEL.getHistory());
      }
    }, LIVE_REFRESH_MS);
  }

  function stopLiveRefresh() {
    if (liveTimer) {
      clearInterval(liveTimer);
      liveTimer = null;
    }
  }

  async function runAiOpsWatchdog() {
    if (!AIOPS || !AIOPS.runWatchdog) return;
    try {
      const data = await AIOPS.runWatchdog(
        function () { return lastOverview; },
        function () { return lastLoadError; },
        { onToast: toast }
      );
      if (data && data.offline && !lastLoadError) {
        lastLoadError = new Error(data.summary || "Panne API détectée");
      }
      if (lastLoadError && data && !data.offline && (data.predictions || []).length === 0) {
        lastLoadError = null;
      }
      if (lastLoadError) {
        const hero = document.getElementById("emHeroStatus");
        if (hero && !hero.className.includes("critical")) {
          hero.className = "em-hero-status em-status--critical";
          hero.innerHTML =
            '<span class="em-hero-status__icon">🔴</span><div><strong>Panne critique</strong><span>API inaccessible</span></div>';
        }
        const outage =
          AIOPS.detectOutageFromError
            ? [AIOPS.detectOutageFromError(lastLoadError)]
            : [];
        if (outage.length) renderAnomalies(outage);
      }
    } catch {
      /* ignore */
    }
  }

  function startAiOpsWatchdog() {
    stopAiOpsWatchdog();
    aiOpsTimer = setInterval(function () {
      runAiOpsWatchdog();
    }, AIOPS_WATCH_MS);
  }

  function stopAiOpsWatchdog() {
    if (aiOpsTimer) {
      clearInterval(aiOpsTimer);
      aiOpsTimer = null;
    }
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    timer = setInterval(() => loadOverview(), REFRESH_MS);
    securityTimer = setInterval(() => pollSecurityPulse(), SECURITY_PULSE_MS);
    startAiOpsWatchdog();
  }

  function stopAutoRefresh() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (securityTimer) {
      clearInterval(securityTimer);
      securityTimer = null;
    }
    stopAiOpsWatchdog();
    stopLiveRefresh();
  }

  function syncDebugToggle() {
    const btn = document.getElementById("emDebugToggle");
    if (!btn || !INTEL) return;
    const on = INTEL.isDebugMode();
    btn.classList.toggle("em-debug-on", on);
    btn.textContent = on ? "🐛 Debug ON" : "🐛 Debug";
  }

  async function init() {
    session = await SAC_SESSION.guard("superadmin");
    if (!session) return;

    if (INTEL) INTEL.wrapFetchForDebug();

    const name = [session.prenom, session.nom].filter(Boolean).join(" ") || session.identifiant || session.email;
    const nameEl = document.getElementById("emUserName");
    if (nameEl) nameEl.textContent = name;

    if (typeof SAC_PORTAL !== "undefined") {
      SAC_PORTAL.applyBranding("superadmin");
    }

    document.getElementById("emRefreshBtn")?.addEventListener("click", () => loadOverview());
    document.getElementById("emDiagBtn")?.addEventListener("click", () => runApiDiagnostics());
    document.getElementById("emScanBtn")?.addEventListener("click", () => loadOverview({ notify: true }));
    document.getElementById("emDebugToggle")?.addEventListener("click", () => {
      if (!INTEL) return;
      INTEL.setDebugMode(!INTEL.isDebugMode());
      syncDebugToggle();
      toast(INTEL.isDebugMode() ? "Mode debug activé." : "Mode debug désactivé.");
    });
    document.getElementById("btnLogout")?.addEventListener("click", () => {
      stopAutoRefresh();
      const logoutTarget =
        typeof SAC_PORTAL !== "undefined" ? SAC_PORTAL.siteUrl("evomonitor/") : "evomonitor/";
      SAC_SESSION.logout(logoutTarget);
    });

    document.querySelectorAll(".nav-tab").forEach((tab) => {
      tab.addEventListener("click", () => showSection(tab.dataset.section));
    });

    document.getElementById("emLogSearch")?.addEventListener("input", (e) => {
      logFilters.q = e.target.value;
      if (INTEL) INTEL.renderLogsPanel(document.getElementById("emLogsList"), logsCache, logFilters, INTEL.detectRepeatedErrors(logsCache));
    });
    document.getElementById("emLogCategory")?.addEventListener("change", (e) => {
      logFilters.category = e.target.value;
      loadLogs();
    });
    document.getElementById("emLogLevel")?.addEventListener("change", (e) => {
      logFilters.level = e.target.value;
      loadLogs();
    });
    document.getElementById("emLogsRefresh")?.addEventListener("click", () => loadLogs());

    document.getElementById("emHeroDate").textContent = new Date().toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    syncDebugToggle();
    if (AIOPS && AIOPS.restoreState) AIOPS.restoreState();
    await loadOverview();
    pollSecurityPulse();
    runAiOpsWatchdog();
    startAutoRefresh();
  }

  return { init, loadOverview, showSection };
})();

/**
 * EvoMonitor SATA — intelligence, logs, incidents, auto-healing, debug
 * Complète sac-evomonitor.js sans modifier l'API existante.
 */
const SAC_EVOMONITOR_INTEL = (function () {
  "use strict";

  const HISTORY_KEY = "em_metrics_history_v1";
  const ALERT_CFG_KEY = "em_alert_channels_v1";
  const DEBUG_KEY = "em_debug_mode";
  const INCIDENT_META_KEY = "em_incident_meta_v1";
  const MAX_HISTORY = 120;
  const debugBuffer = [];
  const MAX_DEBUG = 50;

  const INCIDENT_STATUS = {
    open: { label: "Ouvert", pill: "em-pill--open" },
    investigating: { label: "En investigation", pill: "em-pill--ack", api: "acknowledged" },
    fixed: { label: "Corrigé", pill: "em-pill--resolved", api: "resolved" },
  };

  function esc(s) {
    const el = document.createElement("div");
    el.textContent = String(s ?? "");
    return el.innerHTML;
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }

  function avg(nums) {
    const list = nums.filter((n) => Number.isFinite(n));
    if (!list.length) return 0;
    return list.reduce((a, b) => a + b, 0) / list.length;
  }

  function pctChange(current, baseline) {
    if (!baseline) return current > 0 ? 100 : 0;
    return Math.round(((current - baseline) / baseline) * 100);
  }

  function snapshotFromOverview(data) {
    const perf = data?.performance || {};
    const db = data?.database || {};
    const net = data?.network || {};
    const users = data?.users || {};
    return {
      t: Date.now(),
      cpu: Number(perf.cpuPercent) || 0,
      ram: Number(perf.ramPercent) || 0,
      responseMs: Number(perf.responseMs) || 0,
      load: Number(perf.loadScore) || 0,
      latencyMs: Number(net.latencyMs) || 0,
      rpm: Number(net.requestsPerMinute) || 0,
      failureRate: Number(net.failureRate) || 0,
      dbErrors: Number(db.errors24h) || 0,
      dbQueryMs: Number(db.queryMs) || 0,
      onlineUsers: Number(users.online) || 0,
      failedLogins: Number(users.failedLogins24h) || 0,
      healthScore: Number(data?.healthScore) || 0,
    };
  }

  function recordSnapshot(overview) {
    if (!overview) return;
    const snap = snapshotFromOverview(overview);
    const history = readJson(HISTORY_KEY, []);
    history.push(snap);
    while (history.length > MAX_HISTORY) history.shift();
    writeJson(HISTORY_KEY, history);
    return snap;
  }

  function getHistory() {
    return readJson(HISTORY_KEY, []);
  }

  function recentSlice(history, minutes) {
    const cutoff = Date.now() - minutes * 60000;
    return history.filter((h) => h.t >= cutoff);
  }

  function detectImmediateOutage(overview) {
    const preds = [];
    if (!overview) return preds;

    if (overview.status === "critical") {
      preds.push({
        severity: "critical",
        service: "platform",
        title: "État système critique",
        message:
          overview.statusLabel ||
          "Le tableau de santé signale une panne active sur la plateforme.",
        actions: [
          "Consulter l'onglet Incidents",
          "Lancer l'auto-healing (SATA)",
          "Analyser dans le Centre IA",
        ],
        kind: "active_anomaly",
      });
    }

    const db = overview.database || {};
    if (db.connected === false) {
      preds.push({
        severity: "critical",
        service: "database",
        title: "Base de données hors ligne",
        message: "La connexion à la base de données est interrompue.",
        actions: ["Tester reconnexion DB", "Vérifier MySQL Render", "Créer un ticket développeur"],
        kind: "active_anomaly",
      });
    }
    if (Number(db.errors24h) >= 5) {
      preds.push({
        severity: Number(db.errors24h) >= 20 ? "critical" : "warning",
        service: "database",
        title: "Erreurs base de données (24 h)",
        message: db.errors24h + " erreur(s) enregistrée(s) sur les dernières 24 h.",
        actions: ["Lancer diagnostic DB", "Consulter les logs"],
        kind: "active_anomaly",
      });
    }

    if (overview.status === "warning") {
      preds.push({
        severity: "warning",
        service: "platform",
        title: "État système dégradé",
        message:
          overview.statusLabel ||
          "Le tableau de santé signale une dégradation — surveillance renforcée.",
        actions: ["Actualiser le tableau", "Consulter Anomalies", "Ouvrir Centre IA"],
        kind: "active_anomaly",
      });
    }

    (overview.anomalies || []).forEach(function (a) {
      if (!a || !a.title) return;
      if (preds.some(function (p) { return p.title === a.title; })) return;
      preds.push(Object.assign({ kind: a.kind || "active_anomaly" }, a));
    });

    const openInc = Number(overview.incidents?.open);
    if (openInc > 0) {
      preds.push({
        severity: openInc >= 3 ? "critical" : "warning",
        service: "platform",
        title: openInc + " incident(s) ouvert(s)",
        message: "Des incidents sont en cours sur la plateforme.",
        actions: ["Consulter l'onglet Incidents", "Assigner un responsable"],
        kind: "active_anomaly",
      });
    }

    const perf = overview.performance || {};
    if (Number(perf.responseMs) >= 2500) {
      preds.push({
        severity: "warning",
        service: "api",
        title: "Temps de réponse API élevé",
        message: "Réponse moyenne ~" + Math.round(Number(perf.responseMs)) + " ms.",
        actions: ["Vérifier charge serveur", "Contrôler la base de données"],
        kind: "active_anomaly",
      });
    }

    const net = overview.network || {};
    if (net.internetAvailable === false) {
      preds.push({
        severity: "critical",
        service: "network",
        title: "Connexion réseau indisponible",
        message: "Le serveur ne peut pas joindre Internet ou l'API externe.",
        actions: ["Vérifier Render / DNS", "Ping API health"],
        kind: "active_anomaly",
      });
    }

    const failRate = Number(net.failureRate);
    if (failRate >= 8) {
      preds.push({
        severity: failRate >= 15 ? "critical" : "warning",
        service: "network",
        title: "Taux d'échec API élevé",
        message: "Environ " + failRate.toFixed(1) + "% des requêtes échouent actuellement.",
        actions: ["Consulter les logs", "Analyser avec le Centre IA"],
        kind: "active_anomaly",
      });
    }

    const hs = Number(overview.healthScore);
    if (Number.isFinite(hs) && hs > 0 && hs < 60) {
      preds.push({
        severity: hs < 40 ? "critical" : "warning",
        service: "platform",
        title: hs < 40 ? "Score de santé très bas" : "Score de santé dégradé",
        message: "Score actuel : " + hs + "/100 — intervention recommandée.",
        actions: ["Actualiser le tableau", "Ouvrir Centre IA → Prédictions"],
        kind: "active_anomaly",
      });
    }

    return preds;
  }

  function predictAnomalies(overview, history) {
    const preds = detectImmediateOutage(overview);
    const hist = history || getHistory();
    if (hist.length < 3) return preds;

    const last = hist[hist.length - 1];
    const last10 = recentSlice(hist, 10);
    const prev30 = recentSlice(hist, 30).filter((h) => h.t < Date.now() - 10 * 60000);

    const rpmNow = avg(last10.map((h) => h.rpm));
    const rpmBase = avg(prev30.map((h) => h.rpm)) || rpmNow;
    const cpuNow = avg(last10.map((h) => h.cpu));
    const cpuBase = avg(prev30.map((h) => h.cpu)) || cpuNow;
    const failNow = avg(last10.map((h) => h.failureRate));
    const failBase = avg(prev30.map((h) => h.failureRate)) || failNow;
    const latNow = avg(last10.map((h) => h.latencyMs));
    const latBase = avg(prev30.map((h) => h.latencyMs)) || latNow;

    if (rpmBase > 0 && rpmNow > rpmBase * 1.4 && rpmNow > 20) {
      const rise = pctChange(rpmNow, rpmBase);
      preds.push({
        severity: rise > 80 ? "critical" : "warning",
        service: "api",
        title: "Trafic API en hausse anormale",
        message:
          "Le trafic API augmente de " +
          rise +
          "% depuis ~10 min (" +
          Math.round(rpmNow) +
          " req/min vs " +
          Math.round(rpmBase) +
          " en moyenne). Risque de surcharge dans ~30 min si la tendance continue.",
        actions: ["Surveiller CPU et latence", "Préparer montée en charge ou cache", "Activer auto-healing si disponible"],
        kind: "prediction",
      });
    }

    if (cpuBase > 0 && cpuNow > Math.max(75, cpuBase * 1.35)) {
      preds.push({
        severity: cpuNow > 90 ? "critical" : "warning",
        service: "performance",
        title: "CPU en saturation progressive",
        message:
          "CPU moyen " +
          Math.round(cpuNow) +
          "% (baseline " +
          Math.round(cpuBase) +
          "%). Panne possible sous 15–30 min.",
        actions: ["Vider le cache applicatif", "Redémarrer le service API si auto-healing activé"],
        kind: "prediction",
      });
    }

    if (failNow > Math.max(5, failBase * 2)) {
      preds.push({
        severity: "critical",
        service: "network",
        title: "Taux d'échec API en hausse",
        message:
          "Taux d'échec ~" +
          failNow.toFixed(1) +
          "% (baseline " +
          failBase.toFixed(1) +
          "%). Vérifiez les logs et la base de données.",
        actions: ["Consulter les logs centralisés", "Lancer diagnostic DB"],
        kind: "prediction",
      });
    }

    if (latNow > latBase * 1.5 && latNow > 400) {
      preds.push({
        severity: "warning",
        service: "network",
        title: "Latence dégradée",
        message:
          "Latence moyenne " +
          Math.round(latNow) +
          " ms (+" +
          pctChange(latNow, latBase) +
          "%). Dégradation utilisateur probable.",
        actions: ["Vérifier connexion DB", "Contrôler charge serveur Render"],
        kind: "prediction",
      });
    }

    const failedLogins = overview?.users?.failedLogins24h || last.failedLogins || 0;
    if (failedLogins >= 15) {
      preds.push({
        severity: failedLogins >= 40 ? "critical" : "warning",
        service: "security",
        title: "Tentatives de connexion suspectes",
        message: failedLogins + " échecs de connexion sur 24 h — possible brute force.",
        actions: ["Bloquer IP suspectes (API)", "Renforcer rate-limit auth", "Alerter équipe sécurité"],
        kind: "security",
      });
    }

    return preds;
  }

  function computeModuleScores(overview) {
    const perf = overview?.performance || {};
    const db = overview?.database || {};
    const net = overview?.network || {};
    const users = overview?.users || {};

    const apiScore = clampScore(
      100 -
        (Number(net.failureRate) || 0) * 2 -
        Math.max(0, (Number(net.latencyMs) || 0) - 200) / 20 -
        Math.max(0, (Number(perf.responseMs) || 0) - 300) / 15
    );
    const dbScore = clampScore(
      100 -
        (db.connected ? 0 : 60) -
        Math.max(0, (Number(db.queryMs) || 0) - 100) / 5 -
        Math.min(30, (Number(db.errors24h) || 0) / 2)
    );
    const authScore = clampScore(100 - Math.min(50, (Number(users.failedLogins24h) || 0) / 2));
    const storageScore = clampScore(
      100 - Math.max(0, (Number(perf.diskPercent) || 0) - 70) * 2 - Math.max(0, (Number(perf.ramPercent) || 0) - 85)
    );
    const securityScore = clampScore(
      100 -
        ((overview?.alerts?.openSecurityIncidents || 0) * 12) -
        Math.min(25, (Number(users.failedLogins24h) || 0) / 3)
    );
    const global = Math.round((apiScore + dbScore + authScore + storageScore + securityScore) / 5);

    return {
      global,
      modules: [
        { id: "api", label: "API", score: apiScore, icon: "🌐" },
        { id: "db", label: "Base de données", score: dbScore, icon: "🗄️" },
        { id: "auth", label: "Auth", score: authScore, icon: "🔐" },
        { id: "storage", label: "Storage", score: storageScore, icon: "💾" },
        { id: "security", label: "Sécurité", score: securityScore, icon: "🛡️" },
      ],
    };
  }

  function clampScore(n) {
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function estimateEpm(overview, history) {
    const hist = history || getHistory();
    const net = overview?.network || {};
    const rpm = Number(net.requestsPerMinute) || 0;
    const failRate = (Number(net.failureRate) || 0) / 100;
    const direct = Math.round(rpm * failRate);
    if (direct > 0) return direct;

    if (hist.length >= 2) {
      const deltas = [];
      for (let i = 1; i < hist.length; i++) {
        const dtMin = (hist[i].t - hist[i - 1].t) / 60000;
        if (dtMin > 0 && dtMin < 2) {
          const errDelta = Math.max(0, hist[i].dbErrors - hist[i - 1].dbErrors);
          deltas.push(errDelta / dtMin);
        }
      }
      if (deltas.length) return Math.round(avg(deltas));
    }
    return 0;
  }

  function renderModuleScores(host, scores) {
    if (!host || !scores) return;
    host.innerHTML =
      '<div class="em-module-scores">' +
      scores.modules
        .map(function (m) {
          const color = m.score >= 80 ? "var(--em-ok)" : m.score >= 50 ? "var(--em-warn)" : "var(--em-critical)";
          return (
            '<div class="em-module-score">' +
            '<span class="em-module-score__icon">' +
            m.icon +
            "</span>" +
            '<div class="em-module-score__bar"><div style="width:' +
            m.score +
            "%;background:" +
            color +
            '"></div></div>' +
            "<strong>" +
            m.score +
            "%</strong>" +
            "<span>" +
            esc(m.label) +
            "</span></div>"
          );
        })
        .join("") +
      "</div>" +
      '<p class="em-hint">Score global modules : <strong>' +
      scores.global +
      "%</strong></p>";
  }

  function drawSparkline(canvas, values, color) {
    if (!canvas || !values.length) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const pad = 4;
    ctx.clearRect(0, 0, w, h);
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;
    ctx.strokeStyle = color || "#0e7490";
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach(function (v, i) {
      const x = pad + (i / Math.max(values.length - 1, 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function renderLiveDashboard(host, overview, history) {
    if (!host) return;
    const hist = history || getHistory();
    const epm = estimateEpm(overview, hist);
    const last = hist[hist.length - 1] || snapshotFromOverview(overview);

    host.innerHTML =
      '<div class="em-live-grid">' +
      '<div class="em-panel em-live-chart"><h3>CPU %</h3><canvas id="emChartCpu" width="400" height="120"></canvas><p class="em-live-val">' +
      fmtNum(last.cpu) +
      " %</p></div>" +
      '<div class="em-panel em-live-chart"><h3>Trafic API (req/min)</h3><canvas id="emChartRpm" width="400" height="120"></canvas><p class="em-live-val">' +
      fmtNum(last.rpm) +
      "</p></div>" +
      '<div class="em-panel em-live-chart"><h3>Latence (ms)</h3><canvas id="emChartLat" width="400" height="120"></canvas><p class="em-live-val">' +
      fmtNum(last.latencyMs) +
      " ms</p></div>" +
      '<div class="em-panel em-live-chart"><h3>Erreurs / min (EPM)</h3><canvas id="emChartEpm" width="400" height="120"></canvas><p class="em-live-val em-live-val--warn">' +
      epm +
      " EPM</p></div>" +
      '<div class="em-panel em-live-chart"><h3>Utilisateurs connectés</h3><canvas id="emChartUsers" width="400" height="120"></canvas><p class="em-live-val">' +
      fmtNum(last.onlineUsers) +
      "</p></div>" +
      '<div class="em-panel em-live-chart"><h3>Temps de réponse API</h3><canvas id="emChartResp" width="400" height="120"></canvas><p class="em-live-val">' +
      fmtNum(last.responseMs) +
      " ms</p></div></div>";

    const cpus = hist.map((h) => h.cpu);
    const rpms = hist.map((h) => h.rpm);
    const lats = hist.map((h) => h.latencyMs);
    const epms = hist.map((h, i) => {
      if (i === 0) return 0;
      const dt = (h.t - hist[i - 1].t) / 60000;
      if (dt <= 0) return 0;
      return Math.max(0, Math.round((h.rpm * h.failureRate) / 100 / dt));
    });
    const users = hist.map((h) => h.onlineUsers);
    const resps = hist.map((h) => h.responseMs);

    drawSparkline(document.getElementById("emChartCpu"), cpus, "#0e7490");
    drawSparkline(document.getElementById("emChartRpm"), rpms, "#7c3aed");
    drawSparkline(document.getElementById("emChartLat"), lats, "#f59e0b");
    drawSparkline(document.getElementById("emChartEpm"), epms, "#ef4444");
    drawSparkline(document.getElementById("emChartUsers"), users, "#10b981");
    drawSparkline(document.getElementById("emChartResp"), resps, "#0891b2");
  }

  function fmtNum(v) {
    if (v == null || v === "") return "—";
    return String(Math.round(v * 10) / 10);
  }

  function classifyLog(item) {
    const action = String(item.action || item.type || "").toLowerCase();
    const text = (action + " " + (item.message || "") + " " + JSON.stringify(item.meta || {})).toLowerCase();
    if (/login|auth|password|token|403|401|brute|injection|security|failed/.test(text)) return "security";
    if (/error|exception|crash|fail|500|panic/.test(text)) return "api";
    if (/user|student|prof|inscription|register/.test(text)) return "user";
    return "server";
  }

  function normalizeLogItem(item) {
    return {
      id: item.id || item._id || "log-" + (item.createdAt || item.at || Date.now()),
      at: item.createdAt || item.at || item.timestamp || new Date().toISOString(),
      level: item.level || (item.severity === "error" ? "error" : item.severity === "warn" ? "warn" : "info"),
      category: item.category || classifyLog(item),
      action: item.action || item.type || "event",
      message: item.message || item.summary || item.description || metaLine(item),
      meta: item.meta || {},
      source: item.source || "activities",
    };
  }

  function metaLine(item) {
    const m = item.meta || {};
    const parts = [];
    if (m.email) parts.push(m.email);
    if (m.role) parts.push(m.role);
    if (item.universite) parts.push(item.universite);
    return parts.join(" · ") || item.action || "—";
  }

  async function fetchLogs(limit) {
    const items = [];
    let repeats = [];
    if (typeof SAC_API !== "undefined" && SAC_API.listMonitorLogs) {
      try {
        const data = await SAC_API.listMonitorLogs({ limit: limit || 200 });
        const list = data?.logs || data?.items || [];
        list.forEach((l) => items.push(normalizeLogItem({ ...l, source: "monitor" })));
        repeats = data?.repeats || [];
        if (list.length) {
          return {
            logs: items.sort((a, b) => String(b.at).localeCompare(String(a.at))),
            repeats,
          };
        }
      } catch {
        /* fallback */
      }
    }
    if (!items.length && typeof SAC_API !== "undefined" && SAC_API.listAdminActivities) {
      try {
        const acts = await SAC_API.listAdminActivities(limit || 200);
        acts.forEach((a) => items.push(normalizeLogItem(a)));
      } catch {
        /* ignore */
      }
    }
    const logs = items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return { logs, repeats: repeats.length ? repeats : detectRepeatedErrors(logs) };
  }

  function filterLogs(logs, filters) {
    const q = String(filters?.q || "").toLowerCase().trim();
    const cat = filters?.category || "all";
    const level = filters?.level || "all";
    return logs.filter(function (log) {
      if (cat !== "all" && log.category !== cat) return false;
      if (level !== "all" && log.level !== level) return false;
      if (!q) return true;
      const hay = (log.action + " " + log.message + " " + JSON.stringify(log.meta)).toLowerCase();
      return hay.includes(q);
    });
  }

  function detectRepeatedErrors(logs) {
    const map = {};
    logs.forEach(function (log) {
      if (log.level !== "error" && log.level !== "warn") return;
      const key = log.action + "|" + log.message.slice(0, 80);
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map)
      .filter(([, c]) => c >= 3)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }

  function renderLogsPanel(host, logs, filters, repeats) {
    if (!host) return;
    const filtered = filterLogs(logs, filters);
    let repeatsHtml = "";
    if (repeats && repeats.length) {
      repeatsHtml =
        '<div class="em-log-repeats"><h3>🔁 Erreurs répétées</h3><ul>' +
        repeats.map((r) => "<li><strong>" + r.count + "×</strong> " + esc(r.key.split("|")[1] || r.key) + "</li>").join("") +
        "</ul></div>";
    }
    if (!filtered.length) {
      host.innerHTML =
        repeatsHtml + '<p class="em-empty">Aucun log pour ces filtres.</p>';
      return;
    }
    host.innerHTML =
      repeatsHtml +
      '<div class="em-log-list">' +
      filtered
        .slice(0, 150)
        .map(
          (log) =>
            '<article class="em-log-row em-log-row--' +
            esc(log.level) +
            '">' +
            '<time>' +
            esc(new Date(log.at).toLocaleString("fr-FR")) +
            "</time>" +
            '<span class="em-log-cat">' +
            esc(log.category) +
            "</span>" +
            '<span class="em-log-action">' +
            esc(log.action) +
            "</span>" +
            "<p>" +
            esc(log.message) +
            "</p></article>"
        )
        .join("") +
      "</div>";
  }

  function getIncidentMeta() {
    return readJson(INCIDENT_META_KEY, {});
  }

  function setIncidentMeta(id, patch) {
    const map = getIncidentMeta();
    map[id] = Object.assign({}, map[id] || {}, patch);
    writeJson(INCIDENT_META_KEY, map);
  }

  function uiStatusFromApi(status) {
    if (status === "acknowledged") return "investigating";
    if (status === "resolved") return "fixed";
    return "open";
  }

  function apiStatusFromUi(status) {
    const s = INCIDENT_STATUS[status];
    return (s && s.api) || status;
  }

  function computeMttr(incidents) {
    const resolved = (incidents || []).filter((i) => i.resolutionMs != null);
    if (!resolved.length) return null;
    return Math.round(avg(resolved.map((i) => Number(i.resolutionMs))));
  }

  function getAlertConfig() {
    return Object.assign(
      {
        dashboard: true,
        email: true,
        sms: false,
        telegram: false,
        whatsapp: false,
        push: false,
        telegramChatId: "",
        smsPhone: "",
        minSeverity: "warning",
      },
      readJson(ALERT_CFG_KEY, {})
    );
  }

  function saveAlertConfig(cfg) {
    writeJson(ALERT_CFG_KEY, Object.assign(getAlertConfig(), cfg || {}));
  }

  async function dispatchAlert(payload, toastFn) {
    const cfg = getAlertConfig();
    const sev = payload.severity || "info";
    const msg = payload.message || payload.title || "Alerte EvoMonitor";
    if (cfg.dashboard && toastFn) toastFn("🔔 " + msg);
    if (cfg.email && typeof SAC_API !== "undefined" && SAC_API.getMonitorOverview) {
      try {
        await SAC_API.getMonitorOverview({ notify: true });
      } catch {
        /* ignore */
      }
    }
    if (cfg.telegram && cfg.telegramChatId && typeof SAC_API !== "undefined" && SAC_API.sendMonitorAlert) {
      try {
        await SAC_API.sendMonitorAlert({ channel: "telegram", message: msg, severity: sev });
      } catch {
        /* backend optional */
      }
    }
    return true;
  }

  const HEAL_ACTIONS = [
    { id: "ping_api", label: "Ping API / health", icon: "💓", safe: true },
    { id: "warm_cache", label: "Réveiller l'API (warm-up)", icon: "🔥", safe: true },
    { id: "clear_local_cache", label: "Vider cache local EvoMonitor", icon: "🧹", safe: true },
    { id: "reconnect_db", label: "Tester reconnexion DB", icon: "🔌", safe: true },
    { id: "restart_api", label: "Demander redémarrage API", icon: "🔄", safe: false },
  ];

  async function runAutoHeal(actionId) {
    if (actionId === "ping_api") {
      if (typeof SAC_API !== "undefined" && SAC_API.ping) {
        const ok = await SAC_API.ping();
        return { ok, message: ok ? "API répond correctement." : "API injoignable." };
      }
      return { ok: false, message: "Client API indisponible." };
    }
    if (actionId === "warm_cache") {
      if (typeof SAC_API !== "undefined" && SAC_API.ensureOnline) {
        await SAC_API.ensureOnline(true);
        return { ok: true, message: "Warm-up API exécuté." };
      }
      return { ok: false, message: "Warm-up impossible." };
    }
    if (actionId === "clear_local_cache") {
      localStorage.removeItem(HISTORY_KEY);
      return { ok: true, message: "Cache métriques local vidé." };
    }
    if (actionId === "reconnect_db") {
      if (typeof SAC_API !== "undefined" && SAC_API.triggerMonitorHeal) {
        try {
          const res = await SAC_API.triggerMonitorHeal("reconnect_db");
          return { ok: true, message: res?.message || "Test DB envoyé au serveur." };
        } catch {
          const data = await SAC_API.getMonitorOverview().catch(() => null);
          const connected = data?.database?.connected;
          return {
            ok: !!connected,
            message: connected ? "Base de données connectée." : "Base de données hors ligne ou API monitor absente.",
          };
        }
      }
      return { ok: false, message: "Action DB non disponible." };
    }
    if (actionId === "restart_api") {
      if (typeof SAC_API !== "undefined" && SAC_API.triggerMonitorHeal) {
        const res = await SAC_API.triggerMonitorHeal("restart_api");
        return { ok: true, message: res?.message || "Demande de redémarrage transmise (si backend configuré)." };
      }
      return { ok: false, message: "Redémarrage auto non configuré sur l'API — action manuelle Render requise." };
    }
    return { ok: false, message: "Action inconnue." };
  }

  let simulationActive = false;
  let simulationOverlay = null;

  function startSimulation(type) {
    simulationActive = true;
    simulationOverlay = {
      type: type,
      startedAt: Date.now(),
      cpuBoost: type === "cpu" ? 35 : type === "api_crash" ? 0 : 10,
      rpmBoost: type === "traffic" ? 80 : 0,
      failBoost: type === "api_crash" ? 25 : type === "traffic" ? 5 : 0,
    };
    return simulationOverlay;
  }

  function stopSimulation() {
    simulationActive = false;
    simulationOverlay = null;
  }

  function applySimulation(overview) {
    if (!simulationActive || !simulationOverlay || !overview) return overview;
    const o = JSON.parse(JSON.stringify(overview));
    o.performance = o.performance || {};
    o.network = o.network || {};
    o.performance.cpuPercent = Math.min(99, (Number(o.performance.cpuPercent) || 0) + simulationOverlay.cpuBoost);
    o.network.requestsPerMinute = (Number(o.network.requestsPerMinute) || 0) + simulationOverlay.rpmBoost;
    o.network.failureRate = (Number(o.network.failureRate) || 0) + simulationOverlay.failBoost;
    o.status = simulationOverlay.type === "api_crash" ? "critical" : "warning";
    o.statusLabel = "🧪 Simulation active — " + simulationOverlay.type;
    o.anomalies = (o.anomalies || []).concat([
      {
        severity: "warning",
        service: "simulation",
        title: "Mode test SATA",
        message: "Métriques simulées pour valider alertes et graphiques. Aucun impact production.",
        actions: ["Arrêter la simulation"],
      },
    ]);
    return o;
  }

  function isDebugMode() {
    return localStorage.getItem(DEBUG_KEY) === "1";
  }

  function setDebugMode(on) {
    localStorage.setItem(DEBUG_KEY, on ? "1" : "0");
  }

  function recordDebugEntry(entry) {
    if (!isDebugMode()) return;
    debugBuffer.unshift(entry);
    while (debugBuffer.length > MAX_DEBUG) debugBuffer.pop();
  }

  function getDebugBuffer() {
    return debugBuffer.slice();
  }

  function wrapFetchForDebug() {
    if (typeof window === "undefined" || window.__emFetchWrapped) return;
    const orig = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      const url = typeof input === "string" ? input : input.url;
      const method = (init && init.method) || "GET";
      const started = Date.now();
      let res;
      let err;
      try {
        res = await orig(input, init);
        return res;
      } catch (e) {
        err = e;
        throw e;
      } finally {
        if (isDebugMode() && String(url).includes("/api/")) {
          let body = "";
          try {
            if (res) body = await res.clone().text();
          } catch {
            body = "";
          }
          recordDebugEntry({
            at: new Date().toISOString(),
            method,
            url,
            status: res?.status,
            ms: Date.now() - started,
            error: err?.message,
            body: body.slice(0, 4000),
          });
        }
      }
    };
    window.__emFetchWrapped = true;
  }

  function renderDebugPanel(host) {
    if (!host) return;
    const rows = getDebugBuffer();
    host.innerHTML =
      '<p class="em-hint">Mode développeur : capture les requêtes /api (max ' +
      MAX_DEBUG +
      ").</p>" +
      (rows.length
        ? '<div class="em-debug-list">' +
          rows
            .map(
              (r) =>
                '<details class="em-debug-row"><summary>' +
                esc(r.method) +
                " " +
                esc(r.url) +
                " — " +
                (r.status || "ERR") +
                " (" +
                r.ms +
                " ms)</summary><pre>" +
                esc(r.body || r.error || "") +
                "</pre><button type='button' class='btn btn--ghost btn--xs' data-replay='" +
                esc(r.url) +
                "'>Rejouer GET</button></details>"
            )
            .join("") +
          "</div>"
        : '<p class="em-empty">Aucune requête capturée. Activez le mode debug et actualisez.</p>');

    host.querySelectorAll("[data-replay]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        try {
          const res = await fetch(btn.dataset.replay, { credentials: "include" });
          const text = await res.text();
          alert("HTTP " + res.status + "\n\n" + text.slice(0, 1500));
        } catch (e) {
          alert(e.message);
        }
      });
    });
  }

  function renderSataPanel(host, callbacks) {
    if (!host) return;
    const cfg = getAlertConfig();
    host.innerHTML =
      '<div class="em-sata-grid">' +
      '<div class="em-panel"><h3>🔔 Canaux d\'alerte</h3>' +
      '<form id="emAlertChannelsForm" class="em-channel-form">' +
      channelCheckbox("dashboard", "Notification dashboard", cfg.dashboard) +
      channelCheckbox("email", "E-mail (API)", cfg.email) +
      channelCheckbox("sms", "SMS (critique)", cfg.sms) +
      channelCheckbox("telegram", "Telegram bot", cfg.telegram) +
      channelCheckbox("whatsapp", "WhatsApp", cfg.whatsapp) +
      channelCheckbox("push", "Push mobile", cfg.push) +
      '<label class="em-channel-field">Chat ID Telegram<input class="fi" name="telegramChatId" value="' +
      esc(cfg.telegramChatId) +
      '" placeholder="-100…" /></label>' +
      '<label class="em-channel-field">Téléphone SMS<input class="fi" name="smsPhone" value="' +
      esc(cfg.smsPhone) +
      '" placeholder="+243…" /></label>' +
      '<button type="submit" class="btn btn--role">Enregistrer les canaux</button></form></div>' +
      '<div class="em-panel"><h3>🔄 Auto-réparation</h3><div class="em-heal-actions">' +
      HEAL_ACTIONS.map(
        (a) =>
          '<button type="button" class="btn btn--ghost em-heal-btn" data-heal="' +
          a.id +
          '">' +
          a.icon +
          " " +
          esc(a.label) +
          "</button>"
      ).join("") +
      '</div><p class="em-hint" id="emHealStatus">Actions sûres : ping, warm-up, cache. Redémarrage API selon configuration backend.</p></div>' +
      '<div class="em-panel"><h3>🧪 Simulation de panne</h3>' +
      '<p class="em-hint">Teste alertes et graphiques sans impacter la production.</p>' +
      '<div class="em-heal-actions">' +
      '<button type="button" class="btn btn--ghost" data-sim="traffic">Surcharge trafic</button>' +
      '<button type="button" class="btn btn--ghost" data-sim="cpu">Saturation CPU</button>' +
      '<button type="button" class="btn btn--ghost" data-sim="api_crash">Crash API simulé</button>' +
      '<button type="button" class="btn btn--ghost" data-sim="stop">Arrêter simulation</button>' +
      "</div></div></div>";

    host.querySelector("#emAlertChannelsForm")?.addEventListener("submit", function (e) {
      e.preventDefault();
      const fd = new FormData(e.target);
      saveAlertConfig({
        dashboard: !!fd.get("dashboard"),
        email: !!fd.get("email"),
        sms: !!fd.get("sms"),
        telegram: !!fd.get("telegram"),
        whatsapp: !!fd.get("whatsapp"),
        push: !!fd.get("push"),
        telegramChatId: String(fd.get("telegramChatId") || "").trim(),
        smsPhone: String(fd.get("smsPhone") || "").trim(),
      });
      if (callbacks.onToast) callbacks.onToast("Canaux d'alerte enregistrés.");
    });

    host.querySelectorAll("[data-heal]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        const status = host.querySelector("#emHealStatus");
        if (status) status.textContent = "Exécution…";
        const res = await runAutoHeal(btn.dataset.heal);
        if (status) status.textContent = (res.ok ? "✅ " : "⚠️ ") + res.message;
        if (callbacks.onToast) callbacks.onToast(res.message);
        if (callbacks.onRefresh) callbacks.onRefresh();
      });
    });

    host.querySelectorAll("[data-sim]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.dataset.sim === "stop") {
          stopSimulation();
          if (callbacks.onToast) callbacks.onToast("Simulation arrêtée.");
        } else {
          startSimulation(btn.dataset.sim);
          if (callbacks.onToast) callbacks.onToast("Simulation « " + btn.dataset.sim + " » démarrée.");
        }
        if (callbacks.onRefresh) callbacks.onRefresh();
      });
    });
  }

  function channelCheckbox(name, label, checked) {
    return (
      '<label class="chk"><input type="checkbox" name="' +
      name +
      '" value="1"' +
      (checked ? " checked" : "") +
      " /> " +
      esc(label) +
      "</label>"
    );
  }

  wrapFetchForDebug();

  return {
    recordSnapshot,
    getHistory,
    predictAnomalies,
    detectImmediateOutage,
    computeModuleScores,
    estimateEpm,
    renderModuleScores,
    renderLiveDashboard,
    fetchLogs,
    filterLogs,
    detectRepeatedErrors,
    renderLogsPanel,
    getIncidentMeta,
    setIncidentMeta,
    uiStatusFromApi,
    apiStatusFromUi,
    computeMttr,
    INCIDENT_STATUS,
    getAlertConfig,
    saveAlertConfig,
    dispatchAlert,
    runAutoHeal,
    startSimulation,
    stopSimulation,
    applySimulation,
    isSimulationActive: function () {
      return simulationActive;
    },
    isDebugMode,
    setDebugMode,
    renderDebugPanel,
    wrapFetchForDebug,
    renderSataPanel,
  };
})();

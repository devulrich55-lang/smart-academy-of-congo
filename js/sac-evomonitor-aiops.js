/**
 * EvoMonitor AI Ops — Centre IA : analyse erreurs, correctifs, tickets dev, prédiction
 */
const SAC_EVOMONITOR_AIOPS = (function () {
  "use strict";

  let lastAnalysis = null;
  let lastPredictions = null;
  let ticketsCache = [];
  const STATE_KEY = "em_aiops_state_v1";

  function readState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeState(payload) {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }

  function mergePredictionLists() {
    const out = [];
    for (let i = 0; i < arguments.length; i++) {
      const list = arguments[i] || [];
      list.forEach(function (p) {
        if (!p || !p.title) return;
        if (!out.some(function (x) { return x.title === p.title && x.service === p.service; })) {
          out.push(p);
        }
      });
    }
    return out;
  }

  function mergePredictionResults(local, remote) {
    const predictions = mergePredictionLists(local?.predictions || [], remote?.predictions || []);
    const critical = predictions.filter(function (p) { return p.severity === "critical"; }).length;
    const warning = predictions.filter(function (p) { return p.severity === "warning"; }).length;
    let summary = remote?.summary || local?.summary || "";
    if (local?.offline) summary = local.summary;
    else if ((critical || warning) && !/panne|critique|alerte|dégrad|incident|🚨/i.test(summary)) {
      summary =
        (critical ? critical + " alerte(s) critique(s)" : "") +
        (critical && warning ? " · " : "") +
        (warning ? warning + " avertissement(s)" : "") +
        (summary ? ". " + summary : " détecté(s).");
    }
    return {
      predictions: predictions,
      count: predictions.length,
      summary: summary || local?.summary || "Surveillance active.",
      source: remote?.source || local?.source || "rules",
      offline: !!(local?.offline || remote?.offline),
      healthScore: remote?.healthScore ?? local?.healthScore,
    };
  }

  function countAlerts(data, error) {
    const preds = data?.predictions || [];
    const critical = preds.filter(function (p) { return p.severity === "critical"; }).length;
    const warning = preds.filter(function (p) { return p.severity === "warning"; }).length;
    return critical + warning + (error ? 1 : 0);
  }

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

  function severityClass(sev) {
    if (sev === "critical") return "em-sev--critical";
    if (sev === "warning") return "em-sev--warning";
    return "em-sev--info";
  }

  function sourceBadge(source) {
    if (source === "llm") {
      return '<span class="em-ai-badge em-ai-badge--llm">✨ Analyse IA (OpenAI)</span>';
    }
    return '<span class="em-ai-badge em-ai-badge--rules">📋 Mode règles EvoMonitor</span>';
  }

  function isClientBugError(err) {
    const msg = String(err?.message || err || "");
    return /cannot read propert|undefined \(reading|is not a function|syntaxerror|unexpected token/i.test(msg);
  }

  function clearOutageState() {
    lastOutageState = { overview: lastOutageState?.overview || null, error: null, at: Date.now() };
    lastAiOpsAlertKey = "";
    updateNavBadge(0);
    writeState({ at: Date.now(), alertCount: 0, summary: "", offline: false });
  }

  function detectOutageFromError(err) {
    if (isClientBugError(err)) {
      return {
        severity: "warning",
        service: "platform",
        title: "Bug d'affichage EvoMonitor (corrigé)",
        message:
          "Erreur JavaScript locale — pas une panne API. Rechargez avec Ctrl+F5 pour appliquer le correctif.",
        explanation: "Le tableau a rencontré un bug d'affichage (assignee). Correctif déployé côté frontend.",
        fixes: ["Ctrl+F5 sur EvoMonitor", "Vider le cache navigateur", "Actualiser le tableau de santé"],
        correctiveCode: "// Correctif appliqué dans sac-evomonitor.js — meta incident || {}",
        confidence: 0.95,
        source: "rules",
        kind: "active_anomaly",
        actions: ["Recharger la page (Ctrl+F5)", "Actualiser le tableau"],
      };
    }
    const msg = String(err?.message || err || "API inaccessible");
    return {
      severity: "critical",
      service: "api",
      title: "API EvoMonitor inaccessible",
      message: msg,
      explanation:
        "Le Centre IA n'a pas pu joindre l'API de supervision. Panne probable ou service Render en veille.",
      fixes: [
        "Vérifier le statut Render (API-1)",
        "Relancer un warm-up API",
        "Consulter les logs Render",
        "Créer un ticket développeur",
      ],
      correctiveCode:
        "# Vérifier health\nGET /api/health\n\n# Redémarrer le service sur Render si cold start bloqué",
      confidence: 0.85,
      source: "rules",
      kind: "active_anomaly",
      actions: [
        "Ping API / health",
        "Réveiller l'API (warm-up)",
        "Redémarrer le service Render",
      ],
    };
  }

  function appendOverviewSignals(predictions, overview) {
    if (!overview) return predictions;
    const open = Number(overview.incidents?.open);
    if (open > 0) {
      const title = open + " incident(s) ouvert(s)";
      if (!predictions.some(function (p) { return p.title === title; })) {
        predictions.push({
          severity: open >= 5 ? "critical" : "warning",
          service: "platform",
          title: title,
          message: "Incidents enregistrés dans EvoMonitor — intervention requise.",
          actions: ["Ouvrir l'onglet Incidents", "Créer un ticket développeur"],
          kind: "active_anomaly",
        });
      }
    }
    if (overview.status === "critical" || overview.status === "warning") {
      const title = overview.status === "critical" ? "État système critique (cache)" : "État système dégradé (cache)";
      if (!predictions.some(function (p) { return p.title.indexOf("État système") === 0; })) {
        predictions.push({
          severity: overview.status === "critical" ? "critical" : "warning",
          service: "platform",
          title: title,
          message: overview.statusLabel || "Dernière mesure connue avant perte de sync API.",
          actions: ["Actualiser", "Analyser avec l'IA"],
          kind: "active_anomaly",
        });
      }
    }
    return predictions;
  }

  function buildLocalPredictions(overview, error) {
    const predictions = [];
    const srcOverview = overview || lastOutageState?.overview || null;
    const outageErr = error && !isClientBugError(error) ? error : null;
    if (outageErr) predictions.push(detectOutageFromError(outageErr));
    else if (error && isClientBugError(error)) {
      predictions.push(detectOutageFromError(error));
    }
    if (srcOverview) {
      if (typeof SAC_EVOMONITOR_INTEL !== "undefined") {
        const local = SAC_EVOMONITOR_INTEL.predictAnomalies(
          srcOverview,
          SAC_EVOMONITOR_INTEL.getHistory()
        );
        local.forEach(function (p) {
          if (!predictions.some(function (x) { return x.title === p.title; })) predictions.push(p);
        });
      }
      (srcOverview.anomalies || []).forEach(function (a) {
        if (!a || !a.title) return;
        if (!predictions.some(function (x) { return x.title === a.title; })) {
          predictions.push(Object.assign({ kind: a.kind || "active_anomaly" }, a));
        }
      });
      (srcOverview._predictions || []).forEach(function (a) {
        if (!a || !a.title) return;
        if (!predictions.some(function (x) { return x.title === a.title; })) predictions.push(a);
      });
    }
    appendOverviewSignals(predictions, srcOverview);
    const critical = predictions.filter(function (p) {
      return p.severity === "critical";
    }).length;
    return {
      predictions: predictions,
      count: predictions.length,
      summary: outageErr
        ? "🚨 Panne active : " +
          (outageErr.message || "API inaccessible") +
          ". Surveillance locale activée."
        : error && isClientBugError(error)
          ? "⚠️ Bug d'affichage corrigé — rechargez avec Ctrl+F5."
          : critical
          ? critical + " alerte(s) critique(s) détectée(s)."
          : predictions.length
            ? predictions.length + " signal(s) à surveiller."
            : "Aucune panne prévue à court terme.",
      source: "rules",
      offline: !!error,
      healthScore: srcOverview?.healthScore,
    };
  }

  async function fetchPredictionsSafe(overview, error) {
    const local = buildLocalPredictions(overview, error);
    if (error) return local;
    if (typeof SAC_API !== "undefined" && SAC_API.getAiOpsPredictions) {
      try {
        const remote = await SAC_API.getAiOpsPredictions();
        return mergePredictionResults(local, remote);
      } catch (err) {
        return mergePredictionResults(local, buildLocalPredictions(overview, err));
      }
    }
    return local;
  }

  function restoreState() {
    const saved = readState();
    if (!saved || !saved.alertCount) return;
    if (Date.now() - Number(saved.at || 0) > 45 * 60000) return;
    updateNavBadge(saved.alertCount);
  }

  function updateNavBadge(count) {
    const badge = document.getElementById("emAiOpsAlert");
    if (!badge) return;
    const n = Number(count) || 0;
    badge.textContent = String(n);
    badge.hidden = n <= 0;
  }

  async function maybeAutoTicket(analysis) {
    if (!analysis || analysis.severity !== "critical") return null;
    const key =
      "em_aiops_autoticket_" +
      String(analysis.title || "outage")
        .slice(0, 48)
        .replace(/\W+/g, "_");
    try {
      const last = sessionStorage.getItem(key);
      if (last && Date.now() - Number(last) < 3600000) return null;
    } catch {
      /* ignore */
    }
    try {
      const ticket = await createTicket({
        title: "[Auto] " + (analysis.title || "Incident EvoMonitor"),
        description: analysis.explanation || analysis.message || "",
        severity: analysis.severity || "critical",
        service: analysis.service || "api",
        analysis: analysis,
        correctiveCode: analysis.correctiveCode || "",
        errorContext: { errorMessage: analysis.message || analysis.title, service: analysis.service },
      });
      try {
        sessionStorage.setItem(key, String(Date.now()));
      } catch {
        /* ignore */
      }
      return ticket;
    } catch {
      return null;
    }
  }

  let lastOutageState = null;
  let aiOpsPanelMounted = false;
  let lastAiOpsAlertKey = "";

  async function syncFromOverview(overview, error, callbacks) {
    const normalizedError = error && !isClientBugError(error) ? error : null;
    lastOutageState = { overview: overview || null, error: normalizedError, at: Date.now() };
    const data = await fetchPredictionsSafe(overview, normalizedError);
    lastPredictions = data;
    const alertCount = countAlerts(data, normalizedError);
    updateNavBadge(alertCount);
    writeState({
      at: Date.now(),
      alertCount: alertCount,
      summary: data.summary || "",
      offline: !!(error || data.offline),
    });

    const predEl = document.getElementById("emAiOpsPredictions");
    if (predEl && aiOpsPanelMounted) renderPredictions(predEl, data);

    const critical = (data.predictions || []).filter(function (p) {
      return p.severity === "critical";
    }).length;
    const alertKey = normalizedError
      ? "err:" + (normalizedError.message || "")
      : "sig:" + critical + ":" + alertCount + ":" + (data.summary || "").slice(0, 40);
    if (normalizedError || alertCount > 0) {
      const analysis = normalizedError
        ? detectOutageFromError(normalizedError)
        : (data.predictions || []).find(function (p) { return p.severity === "critical"; }) ||
          data.predictions?.[0];
      if (analysis) {
        const ticket = await maybeAutoTicket(analysis);
        if (ticket && callbacks?.onToast) {
          callbacks.onToast("Ticket auto " + (ticket.ticketNumber || "") + " créé (panne détectée).");
          lastAiOpsAlertKey = alertKey;
        } else if (callbacks?.onToast && alertKey !== lastAiOpsAlertKey) {
          callbacks.onToast(
            "🚨 Centre IA : " +
              (normalizedError ? "panne API" : alertCount + " signal(s)") +
              " — consultez Prédictions."
          );
          lastAiOpsAlertKey = alertKey;
        }
      }
    } else {
      lastAiOpsAlertKey = "";
      updateNavBadge(0);
      writeState({ at: Date.now(), alertCount: 0, summary: "", offline: false });
    }
    return data;
  }

  async function runWatchdog(getOverview, getError, callbacks) {
    let overview = typeof getOverview === "function" ? getOverview() : getOverview;
    let error = typeof getError === "function" ? getError() : getError;

    if (typeof SAC_API !== "undefined" && SAC_API.ping) {
      try {
        const ok = await SAC_API.ping({ attempts: 1, timeoutMs: 12000 });
        if (!ok) {
          error = error || new Error("Health check — API injoignable");
        } else if (error && !overview) {
          error = null;
        }
      } catch (pingErr) {
        error = pingErr;
      }
    }

    if (typeof SAC_API !== "undefined" && SAC_API.probeApiReachability && !error) {
      try {
        const probe = await SAC_API.probeApiReachability();
        if (probe && !probe.ok && probe.scenario !== "NO_API") {
          error = new Error(probe.message || "API inaccessible (" + (probe.scenario || "erreur") + ")");
        }
      } catch {
        /* ignore */
      }
    }

    return syncFromOverview(overview, error, callbacks);
  }

  async function fetchStatus() {
    if (typeof SAC_API !== "undefined" && SAC_API.getAiOpsStatus) {
      return await SAC_API.getAiOpsStatus();
    }
    return { llmAvailable: false, mode: "rules" };
  }

  async function analyze(context) {
    if (typeof SAC_API !== "undefined" && SAC_API.analyzeAiOpsError) {
      const data = await SAC_API.analyzeAiOpsError(context);
      return data?.analysis || data;
    }
    return rulesFallbackAnalyze(context);
  }

  function rulesFallbackAnalyze(ctx) {
    const msg = String(ctx?.errorMessage || "").toLowerCase();
    if (msg.includes("403") || msg.includes("accès refus")) {
      return {
        source: "rules",
        title: "Accès refusé",
        explanation: "Le rôle connecté n'a pas les permissions pour cette action.",
        fixes: ["Vérifier le rôle (ministere / superadmin)", "Se reconnecter", "Contrôler require_roles côté API"],
        correctiveCode: '@router.post("/...")\ndef route(user = Depends(require_roles("ministere", "superadmin"))):',
        confidence: 0.7,
        severity: "warning",
        service: ctx?.service || "api",
      };
    }
    return {
      source: "rules",
      title: "Erreur à analyser",
      explanation: "API AI Ops indisponible — analyse locale basique.",
      fixes: ["Vérifier la connexion API", "Consulter les logs EvoMonitor"],
      correctiveCode: "# Diagnostic manuel requis",
      confidence: 0.4,
      severity: "info",
      service: ctx?.service || "api",
    };
  }

  async function fetchPredictions(overview, error) {
    return fetchPredictionsSafe(
      overview != null ? overview : lastOutageState?.overview,
      error != null ? error : lastOutageState?.error
    );
  }

  async function fetchTickets() {
    if (typeof SAC_API !== "undefined" && SAC_API.listAiOpsTickets) {
      const data = await SAC_API.listAiOpsTickets(50);
      ticketsCache = data?.tickets || [];
      return ticketsCache;
    }
    return [];
  }

  async function createTicket(payload) {
    if (typeof SAC_API !== "undefined" && SAC_API.createAiOpsTicket) {
      const data = await SAC_API.createAiOpsTicket(payload);
      return data?.ticket || data;
    }
    throw new Error("Création de ticket indisponible.");
  }

  function renderAnalysis(host, analysis) {
    if (!host) return;
    lastAnalysis = analysis;
    if (!analysis) {
      host.innerHTML = '<p class="em-empty">Lancez une analyse pour voir les résultats.</p>';
      return;
    }
    const fixes = (analysis.fixes || [])
      .map((f) => "<li>" + esc(f) + "</li>")
      .join("");
    host.innerHTML =
      sourceBadge(analysis.source) +
      '<article class="em-ai-result">' +
      '<h3 class="em-ai-result__title">' +
      esc(analysis.title || "Analyse") +
      '</h3><p class="em-ai-result__explain">' +
      esc(analysis.explanation || "") +
      "</p>" +
      (analysis.rootCause
        ? '<p class="em-meta"><strong>Cause probable :</strong> ' + esc(analysis.rootCause) + "</p>"
        : "") +
      '<p class="em-meta">Confiance : ' +
      Math.round((analysis.confidence || 0) * 100) +
      "% · Service : " +
      esc(analysis.service || "—") +
      " · Gravité : <span class='" +
      severityClass(analysis.severity) +
      "'>" +
      esc(analysis.severity || "info") +
      "</span></p>" +
      (fixes ? "<h4>Corrections proposées</h4><ul class='em-ai-fixes'>" + fixes + "</ul>" : "") +
      (analysis.correctiveCode
        ? "<h4>Code correctif suggéré</h4><pre class='em-ai-code'>" +
          esc(analysis.correctiveCode) +
          "</pre><button type='button' class='btn btn--ghost btn--xs' id='emAiCopyCode'>Copier le code</button>"
        : "") +
      '<div class="em-ai-actions">' +
      '<button type="button" class="btn btn--role" id="emAiCreateTicket">🎫 Créer ticket développeur</button>' +
      "</div></article>";

    host.querySelector("#emAiCopyCode")?.addEventListener("click", function () {
      navigator.clipboard?.writeText(analysis.correctiveCode || "").then(
        () => host.dispatchEvent(new CustomEvent("aiops-toast", { detail: "Code copié." })),
        () => {}
      );
    });
    host.querySelector("#emAiCreateTicket")?.addEventListener("click", function () {
      host.dispatchEvent(new CustomEvent("aiops-create-ticket", { detail: analysis }));
    });
  }

  function renderPredictions(host, data) {
    if (!host) return;
    lastPredictions = data;
    const preds = data?.predictions || [];
    const summary = data?.summary || "";
    host.innerHTML =
      '<div class="em-panel em-panel--predict">' +
      '<div class="em-ai-predict-head">' +
      "<h3>🔮 Prédiction de pannes</h3>" +
      sourceBadge(data?.source === "llm" ? "llm" : "rules") +
      "</div>" +
      '<p class="em-ai-summary">' +
      esc(summary) +
      "</p>" +
      (data?.healthScore != null
        ? '<p class="em-meta">Score santé actuel : <strong>' + esc(data.healthScore) + "/100</strong></p>"
        : "") +
      (preds.length
        ? '<div class="em-ai-predict-list">' +
          preds
            .map(
              (p) =>
                '<article class="em-anomaly ' +
                severityClass(p.severity) +
                '">' +
                '<div class="em-anomaly__head"><span class="em-anomaly__badge">' +
                (p.kind === "prediction" ? "📈" : p.kind === "active_anomaly" ? "⚠️" : "🔮") +
                "</span><strong>" +
                esc(p.title) +
                '</strong><span class="em-anomaly__svc">' +
                esc(p.service || "") +
                "</span></div><p>" +
                esc(p.message || "") +
                "</p>" +
                (p.actions?.length
                  ? "<ul class='em-ai-fixes'>" +
                    p.actions.map((a) => "<li>" + esc(a) + "</li>").join("") +
                    "</ul>"
                  : "") +
                '<button type="button" class="btn btn--ghost btn--xs em-ai-analyze-pred" data-title="' +
                esc(p.title) +
                '" data-msg="' +
                esc(p.message || p.title) +
                '" data-service="' +
                esc(p.service || "api") +
                '" data-severity="' +
                esc(p.severity || "warning") +
                '">Analyser avec l\'IA</button></article>'
            )
            .join("") +
          "</div>"
        : data?.offline || /panne|indisponible|critique|alerte|hors ligne|🚨/i.test(summary)
          ? '<p class="em-empty em-empty--warn">⚠️ ' +
            esc(summary || "Signaux de panne détectés — analyse recommandée.") +
            "</p>"
          : '<p class="em-empty">✅ Aucun signal de panne imminente.</p>') +
      "</div>";

    host.querySelectorAll(".em-ai-analyze-pred").forEach(function (btn) {
      btn.addEventListener("click", function () {
        host.dispatchEvent(
          new CustomEvent("aiops-prefill", {
            detail: {
              errorMessage: btn.dataset.msg,
              service: btn.dataset.service,
              severity: btn.dataset.severity,
              title: btn.dataset.title,
            },
          })
        );
      });
    });
  }

  function renderTickets(host, tickets) {
    if (!host) return;
    ticketsCache = tickets || [];
    if (!ticketsCache.length) {
      host.innerHTML =
        '<p class="em-empty">Aucun ticket développeur. Créez-en depuis une analyse d\'erreur.</p>';
      return;
    }
    host.innerHTML =
      '<div class="em-panel em-panel--table"><table class="em-table"><thead><tr>' +
      "<th>N°</th><th>Date</th><th>Gravité</th><th>Service</th><th>Titre</th><th>Statut</th><th>Actions</th>" +
      "</tr></thead><tbody>" +
      ticketsCache
        .map(function (t) {
          return (
            "<tr><td><code>" +
            esc(t.ticketNumber) +
            "</code></td><td>" +
            fmtDate(t.createdAt) +
            "</td><td><span class='" +
            severityClass(t.severity) +
            "'>" +
            esc(t.severity) +
            "</span></td><td>" +
            esc(t.service) +
            "</td><td>" +
            esc(t.title) +
            "</td><td><span class='em-pill em-pill--" +
            (t.status === "resolved" || t.status === "closed" ? "resolved" : "open") +
            "'>" +
            esc(t.status) +
            "</span></td><td>" +
            (t.status === "open"
              ? "<button type='button' class='btn btn--ghost btn--xs' data-ticket-progress='" +
                esc(t.id) +
                "'>En cours</button>"
              : "") +
            (t.status !== "resolved" && t.status !== "closed"
              ? " <button type='button' class='btn btn--ghost btn--xs' data-ticket-resolve='" +
                esc(t.id) +
                "'>Résolu</button>"
              : "") +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div>";

    host.querySelectorAll("[data-ticket-progress]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        host.dispatchEvent(new CustomEvent("aiops-ticket-update", { detail: { id: btn.dataset.ticketProgress, status: "in_progress" } }));
      });
    });
    host.querySelectorAll("[data-ticket-resolve]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        host.dispatchEvent(new CustomEvent("aiops-ticket-update", { detail: { id: btn.dataset.ticketResolve, status: "resolved" } }));
      });
    });
  }

  async function renderAiOpsPanel(root, callbacks) {
    if (!root) return;
    aiOpsPanelMounted = true;
    const cb = callbacks || {};
    const lastErr = cb.getLastError ? cb.getLastError() : null;
    const showOutageBanner = lastErr && !isClientBugError(lastErr);
    const cachedOverview = cb.getLastOverview ? cb.getLastOverview() : null;
    if (!lastOutageState?.error && showOutageBanner) {
      lastOutageState = { overview: cachedOverview, error: lastErr, at: Date.now() };
    } else if (cachedOverview && !lastOutageState?.overview) {
      lastOutageState = Object.assign({}, lastOutageState || {}, { overview: cachedOverview, at: Date.now() });
    }

    root.innerHTML =
      (showOutageBanner
        ? '<div class="em-panel em-panel--alert em-empty--warn" id="emAiOpsOutageBanner">' +
          "<strong>🚨 Panne active détectée</strong><p>" +
          esc(lastErr.message || "API inaccessible") +
          "</p></div>"
        : lastErr && isClientBugError(lastErr)
          ? '<div class="em-panel em-panel--alert" style="border-color:rgba(245,158,11,.4)">' +
            "<strong>ℹ️ Correctif disponible</strong><p>Rechargez avec <strong>Ctrl+F5</strong> — bug assignee corrigé.</p></div>"
          : "") +
      '<div class="em-aiops-grid">' +
      '<div class="em-panel" id="emAiOpsStatus"><p class="em-empty">Chargement du Centre IA…</p></div>' +
      '<div id="emAiOpsPredictions"></div>' +
      '<div class="em-panel em-panel--wide">' +
      "<h3>🔍 Analyseur d'erreurs</h3>" +
      '<p class="em-hint">Collez un message d\'erreur, une stack trace ou sélectionnez une prédiction.</p>' +
      '<div class="em-ai-form">' +
      '<label>Service <select class="fi" id="emAiService"><option value="api">API</option><option value="database">Base de données</option><option value="network">Réseau</option><option value="security">Sécurité</option><option value="storage">Storage</option><option value="auth">Auth</option></select></label>' +
      '<label>Code HTTP <input class="fi" id="emAiErrorCode" placeholder="403, 500…" /></label>' +
      '<label>Message d\'erreur <textarea class="fi" id="emAiErrorMsg" rows="4" placeholder="Ex. Accès refusé lors de la publication…"></textarea></label>' +
      '<label>Stack / logs (optionnel) <textarea class="fi" id="emAiStack" rows="3" placeholder="Trace ou extrait de log"></textarea></label>' +
      '<div class="em-heal-actions">' +
      '<button type="button" class="btn btn--role" id="emAiAnalyzeBtn">🤖 Analyser avec l\'IA</button>' +
      '<button type="button" class="btn btn--ghost" id="emAiFromLastLog">Depuis dernier log erreur</button>' +
      "</div></div>" +
      '<div id="emAiAnalysisResult" class="em-ai-analysis-host"></div></div>' +
      '<div class="em-panel em-panel--wide"><h3>🎫 Tickets développeurs</h3>' +
      '<p class="em-hint">Les tickets sont centralisés dans le <a href="../devcenter/" target="_blank" rel="noopener">Dev Center</a>.</p>' +
      '<div class="em-heal-actions"><button type="button" class="btn btn--ghost btn--xs" id="emAiTicketsRefresh">Actualiser</button></div>' +
      '<div id="emAiTicketsList"><p class="em-empty">Chargement…</p></div></div></div>';

    const statusEl = root.querySelector("#emAiOpsStatus");
    const predEl = root.querySelector("#emAiOpsPredictions");
    const analysisEl = root.querySelector("#emAiAnalysisResult");
    const ticketsEl = root.querySelector("#emAiTicketsList");

    try {
      const status = await fetchStatus();
      statusEl.innerHTML =
        '<div class="em-ai-status">' +
        "<h2>🤖 Centre IA (AI Ops)</h2>" +
        sourceBadge(status.mode === "llm" ? "llm" : "rules") +
        '<p class="em-ai-capabilities">L\'IA peut : expliquer les erreurs · proposer des corrections · générer le code correctif · créer des tickets dev · prédire les pannes.</p>' +
        (status.llmAvailable
          ? '<p class="em-meta">Modèle : ' + esc(status.model || "OpenAI") + "</p>"
          : '<p class="em-meta em-meta--warn">OPENAI_API_KEY non configurée — mode règles actif (toujours fonctionnel).</p>') +
        "</div>";
    } catch {
      statusEl.innerHTML = "<p class='em-empty'>Statut IA indisponible.</p>";
    }

    try {
      const preds = await fetchPredictions(
        lastOutageState?.overview || cachedOverview,
        lastOutageState?.error || lastErr
      );
      renderPredictions(predEl, preds);
    } catch (err) {
      renderPredictions(
        predEl,
        buildLocalPredictions(lastOutageState?.overview || cachedOverview, err || lastErr)
      );
    }

    if (root.querySelector("#emAiErrorMsg") && lastErr && !isClientBugError(lastErr)) {
      root.querySelector("#emAiErrorMsg").value = lastErr.message || "";
      if (root.querySelector("#emAiService")) root.querySelector("#emAiService").value = "api";
    }

    try {
      const tickets = await fetchTickets();
      renderTickets(ticketsEl, tickets);
    } catch {
      ticketsEl.innerHTML = "<p class='em-empty'>Tickets indisponibles.</p>";
    }

    root.querySelector("#emAiAnalyzeBtn")?.addEventListener("click", async function () {
      const btn = root.querySelector("#emAiAnalyzeBtn");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Analyse en cours…";
      }
      analysisEl.innerHTML = '<p class="em-empty">Analyse IA en cours…</p>';
      try {
        const context = {
          service: root.querySelector("#emAiService")?.value || "api",
          errorCode: root.querySelector("#emAiErrorCode")?.value || "",
          errorMessage: root.querySelector("#emAiErrorMsg")?.value || "",
          stackTrace: root.querySelector("#emAiStack")?.value || "",
        };
        const analysis = await analyze(context);
        renderAnalysis(analysisEl, analysis);
        if (cb.onToast) cb.onToast("Analyse terminée.");
      } catch (err) {
        analysisEl.innerHTML = '<p class="em-empty" style="color:#b91c1c;">' + esc(err.message) + "</p>";
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "🤖 Analyser avec l'IA";
        }
      }
    });

    root.querySelector("#emAiFromLastLog")?.addEventListener("click", function () {
      if (cb.getLastErrorLog) {
        const log = cb.getLastErrorLog();
        if (log) {
          if (root.querySelector("#emAiErrorMsg")) root.querySelector("#emAiErrorMsg").value = log.message || log.action || "";
          if (root.querySelector("#emAiStack")) root.querySelector("#emAiStack").value = log.detail || log.meta || "";
          if (cb.onToast) cb.onToast("Log erreur chargé.");
        } else if (cb.onToast) cb.onToast("Aucun log erreur récent.");
      }
    });

    root.querySelector("#emAiTicketsRefresh")?.addEventListener("click", async function () {
      ticketsEl.innerHTML = '<p class="em-empty">Chargement…</p>';
      try {
        renderTickets(ticketsEl, await fetchTickets());
        if (cb.onToast) cb.onToast("Tickets actualisés.");
      } catch (err) {
        ticketsEl.innerHTML = '<p class="em-empty">' + esc(err.message) + "</p>";
      }
    });

    analysisEl.addEventListener("aiops-create-ticket", async function (e) {
      const analysis = e.detail || lastAnalysis;
      if (!analysis) return;
      const msgEl = root.querySelector("#emAiErrorMsg");
      try {
        const ticket = await createTicket({
          title: analysis.title || "Incident EvoMonitor",
          description: analysis.explanation,
          severity: analysis.severity,
          service: analysis.service,
          analysis: analysis,
          correctiveCode: analysis.correctiveCode,
          errorContext: {
            errorMessage: msgEl?.value || "",
            service: analysis.service,
          },
        });
        if (cb.onToast) cb.onToast("Ticket " + (ticket.ticketNumber || "") + " créé.");
        renderTickets(ticketsEl, await fetchTickets());
      } catch (err) {
        if (cb.onToast) cb.onToast(err.message || "Échec création ticket.");
      }
    });

    analysisEl.addEventListener("aiops-toast", function (e) {
      if (cb.onToast) cb.onToast(e.detail);
    });

    root.addEventListener("aiops-prefill", function (e) {
      const d = e.detail || {};
      if (root.querySelector("#emAiService") && d.service) root.querySelector("#emAiService").value = d.service;
      if (root.querySelector("#emAiErrorMsg")) root.querySelector("#emAiErrorMsg").value = d.errorMessage || d.title || "";
      if (root.querySelector("#emAiStack")) root.querySelector("#emAiStack").value = "";
      root.querySelector("#emAiAnalyzeBtn")?.click();
    });

    ticketsEl.addEventListener("aiops-ticket-update", async function (e) {
      const { id, status } = e.detail || {};
      if (!id || typeof SAC_API?.updateAiOpsTicket !== "function") return;
      try {
        await SAC_API.updateAiOpsTicket(id, { status: status });
        if (cb.onToast) cb.onToast("Ticket mis à jour.");
        renderTickets(ticketsEl, await fetchTickets());
      } catch (err) {
        if (cb.onToast) cb.onToast(err.message);
      }
    });
  }

  return {
    renderAiOpsPanel,
    syncFromOverview,
    runWatchdog,
    restoreState,
    clearOutageState,
    isClientBugError,
    analyze,
    fetchPredictions,
    fetchTickets,
    createTicket,
    detectOutageFromError,
    getLastAnalysis: function () {
      return lastAnalysis;
    },
    getLastPredictions: function () {
      return lastPredictions;
    },
  };
})();

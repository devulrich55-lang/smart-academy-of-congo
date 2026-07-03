/**
 * EvoMonitor AI Ops — Centre IA : analyse erreurs, correctifs, tickets dev, prédiction
 */
const SAC_EVOMONITOR_AIOPS = (function () {
  "use strict";

  let lastAnalysis = null;
  let lastPredictions = null;
  let ticketsCache = [];

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

  async function fetchPredictions() {
    if (typeof SAC_API !== "undefined" && SAC_API.getAiOpsPredictions) {
      return await SAC_API.getAiOpsPredictions();
    }
    return { predictions: [], summary: "Prédictions indisponibles (API hors ligne)." };
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
                '">Analyser avec l\'IA</button></article>"
            )
            .join("") +
          "</div>"
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
    const cb = callbacks || {};
    root.innerHTML =
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
      const preds = await fetchPredictions();
      renderPredictions(predEl, preds);
    } catch {
      predEl.innerHTML = "<p class='em-empty'>Prédictions indisponibles.</p>";
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
    analyze,
    fetchPredictions,
    fetchTickets,
    createTicket,
    getLastAnalysis: function () {
      return lastAnalysis;
    },
  };
})();

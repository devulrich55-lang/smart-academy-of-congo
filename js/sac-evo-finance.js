/**
 * Evo Finance — hub financier plateforme (Super Admin uniquement, portail /evofinance/)
 */
const SAC_EVO_FINANCE = (function () {
  "use strict";

  const PERIODS = [
    { id: "day", label: "Revenu du jour" },
    { id: "week", label: "Cette semaine" },
    { id: "month", label: "Ce mois" },
    { id: "year", label: "Cette année" },
    { id: "all", label: "Total plateforme" },
  ];

  const NAV = [
    { id: "revenus", icon: "💰", label: "Revenus" },
    { id: "tresorerie", icon: "🏦", label: "Trésorerie" },
    { id: "employes", icon: "👥", label: "Paiement employés" },
    { id: "transferts", icon: "↔️", label: "Transferts" },
    { id: "rapports", icon: "📄", label: "Rapports" },
    { id: "stats", icon: "📊", label: "Statistiques" },
    { id: "comptabilite", icon: "📒", label: "Comptabilité" },
    { id: "securite", icon: "🔒", label: "Sécurité financière" },
  ];

  let state = {
    session: null,
    scope: "platform",
    data: null,
    panel: "revenus",
  };

  function esc(s) {
    const el = document.createElement("div");
    el.textContent = String(s ?? "");
    return el.innerHTML;
  }

  function fmtMoney(amount, currency) {
    const n = Number(amount) || 0;
    const cur = String(currency || "USD").toUpperCase();
    if (cur === "CDF") return n.toLocaleString("fr-FR") + " FC";
    return (
      n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + cur
    );
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return String(iso).slice(0, 16);
    }
  }

  function uniLabel(code) {
    if (!code) return "Plateforme";
    if (typeof SAC_UNIVERSITIES !== "undefined" && SAC_UNIVERSITIES.getName) {
      return SAC_UNIVERSITIES.getName(code) || code;
    }
    return code;
  }

  function periodStart(periodId) {
    const now = new Date();
    const d = new Date(now);
    if (periodId === "day") {
      d.setHours(0, 0, 0, 0);
      return d;
    }
    if (periodId === "week") {
      const day = d.getDay();
      const diff = day === 0 ? 6 : day - 1;
      d.setDate(d.getDate() - diff);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    if (periodId === "month") {
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    if (periodId === "year") {
      d.setMonth(0, 1);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    return new Date(0);
  }

  function txAmountUsd(tx) {
    const cur = String(tx.currency || "USD").toUpperCase();
    const amt = Number(tx.amount) || 0;
    if (cur === "USD") return amt;
    if (cur === "CDF") return Math.round((amt / 2800) * 100) / 100;
    return amt;
  }

  function confirmedTx(list) {
    return (list || []).filter((t) => t.status === "confirmed");
  }

  function txInPeriod(list, periodId) {
    const start = periodStart(periodId);
    return confirmedTx(list).filter((t) => {
      const d = new Date(t.createdAt || 0);
      return d >= start;
    });
  }

  function sumUsd(list) {
    return list.reduce((s, t) => s + txAmountUsd(t), 0);
  }

  function classifyRevenue(tx) {
    const hay = [
      tx.purpose,
      tx.category,
      tx.feeLabel,
      tx.kind,
      tx.metadata && tx.metadata.purpose,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (/inscription|registration|inscri/.test(hay)) return "inscription";
    if (/evodigital|edb|livre|ebook|digitalbook/.test(hay)) return "ebooks";
    if (/premium|abonnement/.test(hay)) return "premium";
    if (tx.universite && /academic|frais|scolar/.test(hay)) return "universities";
    if (/commission|platform|plateforme/.test(hay)) return "commissions";
    if (/auteur|author/.test(hay)) return "authors";
    return "other";
  }

  const REVENUE_LABELS = {
    inscription: "Frais d'inscription étudiants",
    ebooks: "Commissions ventes livres numériques",
    premium: "Abonnements premium",
    commissions: "Commissions sur les paiements",
    universities: "Revenus universités partenaires",
    authors: "Flux auteurs (versements)",
    other: "Autres revenus",
  };

  function revenueBreakdown(list) {
    const buckets = {};
    Object.keys(REVENUE_LABELS).forEach((k) => {
      buckets[k] = 0;
    });
    confirmedTx(list).forEach((t) => {
      const k = classifyRevenue(t);
      buckets[k] = (buckets[k] || 0) + txAmountUsd(t);
    });
    return buckets;
  }

  async function loadData(session) {
    if (typeof SAC_API === "undefined") throw new Error("API indisponible.");
    const online = await SAC_API.ensureOnline(true, { maxWaitMs: 35000 });
    if (!online) {
      throw new Error(
        "Serveur injoignable — l'API Render démarre (attendez 1 minute puis actualisez)."
      );
    }
    if (SAC_API.ensureWritableApiSession) {
      await SAC_API.ensureWritableApiSession({ soft: true, timeoutMs: 12000 });
    }
    if (!SAC_API.getPlatformPaymentAggregator) {
      throw new Error("Route agrégateur plateforme absente — redéployez l'API.");
    }
    const data = await SAC_API.getPlatformPaymentAggregator();
    return data;
  }

  function treasuryFromData(data) {
    const all = data.transactions || [];
    const confirmed = confirmedTx(all);
    const pending = all.filter((t) => t.status === "pending");
    const available = sumUsd(confirmed);
    const pendingAmt = sumUsd(pending);
    const reserve = Math.round(available * 0.1 * 100) / 100;
    return {
      available: Math.max(0, available - pendingAmt * 0.5 - reserve),
      pending: pendingAmt,
      inProgress: pending.length,
      reserves: reserve,
      movements: all.slice(0, 40),
    };
  }

  function renderPeriodCards(list) {
    return (
      '<div class="ef-periods">' +
      PERIODS.map((p) => {
        const total = sumUsd(txInPeriod(list, p.id));
        return (
          '<div class="ef-period"><em>' +
          esc(p.label) +
          "</em><strong>" +
          esc(fmtMoney(total, "USD")) +
          "</strong></div>"
        );
      }).join("") +
      "</div>"
    );
  }

  function renderRevenuePanel(list) {
    const buckets = revenueBreakdown(list);
    const items = Object.keys(REVENUE_LABELS)
      .map((k) => ({
        key: k,
        label: REVENUE_LABELS[k],
        amount: buckets[k] || 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return (
      renderPeriodCards(list) +
      '<div class="ef-grid-2">' +
      '<div class="ef-card"><h2>Sources de revenus</h2><ul class="ef-revenue-list">' +
      items
        .map(
          (i) =>
            "<li><span>" +
            esc(i.label) +
            '</span><strong>' +
            esc(fmtMoney(i.amount, "USD")) +
            "</strong></li>"
        )
        .join("") +
      "</ul></div>" +
      '<div class="ef-card"><h2>Transactions récentes</h2>' +
      renderTxTable(list.slice(0, 12), { short: true }) +
      "</div></div>"
    );
  }

  function renderTreasuryPanel(data) {
    const t = treasuryFromData(data);
    return (
      '<div class="ef-grid-3">' +
      '<div class="ef-card"><h3>Solde disponible</h3><p style="font-size:1.5rem;font-weight:700;color:#0f766e;margin:0">' +
      esc(fmtMoney(t.available, "USD")) +
      "</p></div>" +
      '<div class="ef-card"><h3>En attente</h3><p style="font-size:1.35rem;font-weight:700;color:#b45309;margin:0">' +
      esc(fmtMoney(t.pending, "USD")) +
      '<span style="display:block;font-size:0.82rem;font-weight:500;color:#64748b;margin-top:0.25rem">' +
      esc(t.inProgress) +
      " paiement(s) en cours</span></p></div>" +
      '<div class="ef-card"><h3>Réserves</h3><p style="font-size:1.35rem;font-weight:700;color:#0c4a6e;margin:0">' +
      esc(fmtMoney(t.reserves, "USD")) +
      "</p></div></div>" +
      '<div class="ef-card"><h2>Historique des mouvements</h2>' +
      renderTxTable(t.movements) +
      "</div>"
    );
  }

  function renderEmployeesPanel() {
    return (
      '<div class="ef-alert ef-alert--warn">Module RH en préparation — configuration des salaires et paiements automatiques à venir.</div>' +
      '<div class="ef-card"><h2>Liste des employés</h2>' +
      '<div class="ef-table-wrap"><table class="ef-table"><thead><tr>' +
      "<th>Nom</th><th>Rôle</th><th>Salaire mensuel</th><th>Prime</th><th>Retenue</th><th>Paiement auto</th>" +
      "</tr></thead><tbody>" +
      "<tr><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td><span class=\"ef-tag ef-tag--wait\">À configurer</span></td></tr>" +
      "</tbody></table></div>" +
      '<p class="ef-placeholder" style="margin-top:1rem">Historique des paiements employés — disponible après connexion au module paie EvoSU.</p></div>'
    );
  }

  function renderTransfersPanel(list) {
    const edb = confirmedTx(list).filter((t) => classifyRevenue(t) === "ebooks");
    const uni = confirmedTx(list).filter((t) => t.universite);
    const authorTotal = edb.reduce((s, t) => {
      const meta = t.metadata || {};
      return s + Number(meta.authorShare || meta.author_share || txAmountUsd(t) * 0.75);
    }, 0);
    const platformTotal = edb.reduce((s, t) => {
      const meta = t.metadata || {};
      return s + Number(meta.platformFee || meta.platform_fee || txAmountUsd(t) * 0.25);
    }, 0);

    return (
      '<div class="ef-grid-2">' +
      '<div class="ef-card"><h3>Vers les auteurs (EvoDigitalBooks)</h3>' +
      '<p class="ef-treasury-row"><span>Volume estimé 75 %</span><strong>' +
      esc(fmtMoney(authorTotal, "USD")) +
      "</strong></p>" +
      '<p style="font-size:0.82rem;color:#64748b">Basé sur les ventes de livres confirmées.</p></div>' +
      '<div class="ef-card"><h3>Commission plateforme livres</h3>' +
      '<p class="ef-treasury-row"><span>Part 25 %</span><strong>' +
      esc(fmtMoney(platformTotal, "USD")) +
      "</strong></p></div>" +
      '<div class="ef-card"><h3>Vers les universités</h3>' +
      '<p class="ef-treasury-row"><span>Frais académiques campus</span><strong>' +
      esc(fmtMoney(sumUsd(uni), "USD")) +
      "</strong></p></div>" +
      '<div class="ef-card"><h3>Partenaires</h3>' +
      '<p class="ef-placeholder">Virements partenaires — suivi détaillé à activer avec les comptes bancaires campus.</p></div></div>' +
      '<div class="ef-card"><h2>Historique des transferts (transactions)</h2>' +
      renderTxTable(list.filter((t) => t.status === "confirmed").slice(0, 25)) +
      "</div>"
    );
  }

  function renderReportsPanel(list) {
    return (
      '<div class="ef-card"><h2>Rapports financiers</h2>' +
      "<p>Générez un export à partir des transactions chargées.</p>" +
      '<div class="ef-actions">' +
      '<button type="button" class="ef-btn" data-ef-export="day">Quotidien (CSV)</button>' +
      '<button type="button" class="ef-btn" data-ef-export="week">Hebdomadaire (CSV)</button>' +
      '<button type="button" class="ef-btn" data-ef-export="month">Mensuel (CSV)</button>' +
      '<button type="button" class="ef-btn" data-ef-export="year">Annuel (CSV)</button>' +
      '<button type="button" class="ef-btn" data-ef-export="all">Complet (CSV)</button>' +
      '<button type="button" class="ef-btn ef-btn--ghost" disabled title="Bientôt">Export PDF</button>' +
      '<button type="button" class="ef-btn ef-btn--ghost" disabled title="Bientôt">Export Excel</button>' +
      "</div>" +
      '<p class="ef-placeholder" style="margin-top:1rem">Les exports PDF/Excel seront disponibles dans une prochaine version. Le CSV contient toutes les colonnes de transaction.</p></div>'
    );
  }

  function renderStatsPanel(list) {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        label: d.toLocaleDateString("fr-FR", { month: "short" }),
        total: sumUsd(
          confirmedTx(list).filter((t) => {
            const td = new Date(t.createdAt);
            return td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear();
          })
        ),
      });
    }
    const max = Math.max(1, ...months.map((m) => m.total));
    const buckets = revenueBreakdown(list);
    const colors = ["#0f766e", "#7c3aed", "#ea580c", "#2563eb", "#16a34a", "#64748b", "#db2777"];
    const bucketEntries = Object.keys(REVENUE_LABELS).map((k, i) => ({
      key: k,
      label: REVENUE_LABELS[k],
      amount: buckets[k] || 0,
      color: colors[i % colors.length],
    }));

    const totalRev = sumUsd(confirmedTx(list));
    const expenses = bucketEntries
      .filter((b) => b.key === "authors")
      .reduce((s, b) => s + b.amount, 0);
    const net = totalRev - expenses;

    return (
      '<div class="ef-grid-2">' +
      '<div class="ef-card"><h2>Évolution des revenus (6 mois)</h2><div class="ef-chart">' +
      months
        .map(
          (m) =>
            '<span class="ef-chart__bar" style="height:' +
            Math.round((m.total / max) * 100) +
            '%" title="' +
            esc(m.label) +
            ": " +
            esc(fmtMoney(m.total, "USD")) +
            '"></span>'
        )
        .join("") +
      '</div><div class="ef-chart__legend">' +
      months.map((m) => "<span>" + esc(m.label) + "</span>").join("") +
      "</div></div>" +
      '<div class="ef-card"><h2>Répartition par service</h2><div class="ef-donut-legend">' +
      bucketEntries
        .filter((b) => b.amount > 0)
        .map(
          (b) =>
            "<div><span class=\"ef-dot\" style=\"background:" +
            b.color +
            '"></span>' +
            esc(b.label) +
            " — <strong>" +
            esc(fmtMoney(b.amount, "USD")) +
            "</strong></div>"
        )
        .join("") +
      (bucketEntries.every((b) => !b.amount)
        ? '<p class="ef-placeholder">Aucune transaction confirmée.</p>'
        : "") +
      "</div></div></div>" +
      '<div class="ef-grid-3">' +
      '<div class="ef-card"><h3>Revenus totaux</h3><strong style="font-size:1.25rem;color:#0f766e">' +
      esc(fmtMoney(totalRev, "USD")) +
      "</strong></div>" +
      '<div class="ef-card"><h3>Dépenses (flux auteurs)</h3><strong style="font-size:1.25rem;color:#b45309">' +
      esc(fmtMoney(expenses, "USD")) +
      "</strong></div>" +
      '<div class="ef-card"><h3>Bénéfice net estimé</h3><strong style="font-size:1.25rem;color:#16a34a">' +
      esc(fmtMoney(net, "USD")) +
      "</strong></div></div>" +
      '<div class="ef-card"><h3>Nombre de transactions</h3><strong>' +
      esc(confirmedTx(list).length) +
      " confirmées / " +
      esc((list || []).length) +
      " total</strong></div>"
    );
  }

  function renderAccountingPanel(list) {
    return (
      '<div class="ef-grid-2">' +
      '<div class="ef-card"><h2>Journal comptable</h2>' +
      renderTxTable(list.slice(0, 30)) +
      "</div>" +
      '<div class="ef-card"><h2>Factures & reçus</h2>' +
      '<p class="ef-placeholder">Émission automatique de reçus étudiants et factures campus — module comptable en cours d\'intégration.</p>' +
      '<h3 style="margin-top:1rem">Taxes & audit</h3>' +
      '<p class="ef-placeholder">Consolidation TVA et piste d\'audit complète — réservée Super Admin.</p></div></div>'
    );
  }

  function renderSecurityPanel() {
    return (
      '<div class="ef-alert">Accès Super Admin — portail Evo Finance. MFA recommandé à chaque connexion institutionnelle.</div>' +
      '<div class="ef-card"><h2>Sécurité financière</h2><ul class="ef-security-list">' +
      "<li>✅ Journal de toutes les opérations (transactions ci-dessous)</li>" +
      "<li>✅ Validation 2FA Super Admin (connexion /superadmin/ et /evofinance/)</li>" +
      "<li>⏳ Double validation pour les gros transferts (&gt; 500 USD) — à activer</li>" +
      "<li>⏳ Alertes activité inhabituelle — liaison EvoMonitor</li>" +
      "</ul>" +
      '<div class="ef-actions">' +
      '<a class="ef-btn ef-btn--ghost" href="dashboard-evomonitor.html">Ouvrir EvoMonitor</a>' +
      '<a class="ef-btn ef-btn--ghost" href="evofinance/">Portail Evo Finance</a>' +
      "</div></div>" +
      '<div class="ef-card"><h2>Dernières opérations (audit)</h2>' +
      renderTxTable((state.data?.transactions || []).slice(0, 20)) +
      "</div>"
    );
  }

  function statusTag(status) {
    if (status === "confirmed") return '<span class="ef-tag ef-tag--ok">Confirmé</span>';
    if (status === "rejected") return '<span class="ef-tag ef-tag--bad">Rejeté</span>';
    return '<span class="ef-tag ef-tag--wait">En attente</span>';
  }

  function renderTxTable(list, opts) {
    const rows = Array.isArray(list) ? list : [];
    if (!rows.length) return '<p class="ef-placeholder">Aucune transaction.</p>';
    const showUni = !opts?.short;
    return (
      '<div class="ef-table-wrap"><table class="ef-table"><thead><tr>' +
      (showUni ? "<th>Université</th>" : "") +
      "<th>Date</th><th>Libellé</th><th>Montant</th><th>Mode</th><th>Statut</th></tr></thead><tbody>" +
      rows
        .map((t) => {
          const label =
            t.category || t.feeLabel || t.purpose || t.studentNom || t.studentEmail || "—";
          return (
            "<tr>" +
            (showUni ? "<td>" + esc(uniLabel(t.universite)) + "</td>" : "") +
            "<td>" +
            esc(fmtDate(t.createdAt)) +
            "</td><td>" +
            esc(label) +
            (t.studentEmail ? "<br><small>" + esc(t.studentEmail) + "</small>" : "") +
            "</td><td>" +
            esc(fmtMoney(t.amount, t.currency)) +
            "</td><td>" +
            esc(t.method || t.kind || "—") +
            "</td><td>" +
            statusTag(t.status) +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div>"
    );
  }

  function exportCsv(periodId) {
    const list = txInPeriod(state.data?.transactions || [], periodId);
    const headers = [
      "date",
      "universite",
      "email",
      "categorie",
      "montant",
      "devise",
      "statut",
      "mode",
      "reference",
    ];
    const lines = [headers.join(";")];
    list.forEach((t) => {
      lines.push(
        [
          t.createdAt || "",
          t.universite || "",
          t.studentEmail || "",
          (t.category || t.feeLabel || t.purpose || "").replace(/;/g, ","),
          t.amount || "",
          t.currency || "",
          t.status || "",
          t.method || t.kind || "",
          t.reference || t.id || "",
        ].join(";")
      );
    });
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "evo-finance-" + periodId + "-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function renderPanel(panelId) {
    const list = state.data?.transactions || [];
    switch (panelId) {
      case "revenus":
        return renderRevenuePanel(list);
      case "tresorerie":
        return renderTreasuryPanel(state.data || { transactions: [] });
      case "employes":
        return renderEmployeesPanel();
      case "transferts":
        return renderTransfersPanel(list);
      case "rapports":
        return renderReportsPanel(list);
      case "stats":
        return renderStatsPanel(list);
      case "comptabilite":
        return renderAccountingPanel(list);
      case "securite":
        return renderSecurityPanel();
      default:
        return "";
    }
  }

  function showPanel(root, panelId) {
    state.panel = panelId;
    root.querySelectorAll(".ef-nav button").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.efPanel === panelId);
    });
    const host = root.querySelector("#efPanelHost");
    if (host) host.innerHTML = renderPanel(panelId);
    const title = root.querySelector("#efPanelTitle");
    const navItem = NAV.find((n) => n.id === panelId);
    if (title && navItem) title.textContent = navItem.label;

    host?.querySelectorAll("[data-ef-export]").forEach((btn) => {
      btn.addEventListener("click", () => exportCsv(btn.dataset.efExport || "all"));
    });
  }

  function shellHtml(session) {
    return (
      '<div class="ef-shell">' +
      '<aside class="ef-sidebar">' +
      '<div class="ef-brand"><span class="ef-brand__icon">💎</span><div><strong>Evo Finance</strong><span>Trésorerie Evo-smartUni</span></div></div>' +
      '<p class="ef-scope-badge">🛡️ Vue plateforme — accès Super Admin uniquement</p>' +
      '<nav class="ef-nav" id="efNav">' +
      NAV.map(
        (n) =>
          '<button type="button" data-ef-panel="' +
          n.id +
          '" class="' +
          (n.id === "revenus" ? "is-active" : "") +
          '">' +
          n.icon +
          " " +
          esc(n.label) +
          "</button>"
      ).join("") +
      "</nav>" +
      '<div class="ef-sidebar__foot">' +
      '<button type="button" id="efRefresh">↻ Actualiser</button>' +
      '<a href="evofinance/">← Portail Evo Finance</a>' +
      '<a href="superadmin/">🛡️ Super Admin</a>' +
      '<button type="button" id="efLogout">Déconnexion</button>' +
      "</div></aside>" +
      '<main class="ef-main">' +
      '<header class="ef-header"><div><h1 id="efPanelTitle">Revenus</h1>' +
      "<p>Tableaux de bord financiers — données synchronisées depuis l'agrégateur de paiements.</p></div>" +
      '<div class="ef-header__meta"><div>' +
      esc(session.displayName || session.identifiant) +
      "</div><div>" +
      esc(fmtDate(new Date().toISOString())) +
      "</div></div></header>" +
      '<div id="efPanelHost" class="ef-panel is-active"></div>' +
      "</main></div>"
    );
  }

  function renderLoadingPanel(message, withRetry) {
    return (
      '<div class="ef-card ef-card--loading">' +
      '<p class="ef-loading-inline">' +
      esc(message || "Chargement des données financières…") +
      "</p>" +
      (withRetry
        ? '<button type="button" class="ef-btn" id="efRetryLoad">↻ Réessayer</button>'
        : "") +
      "</div>"
    );
  }

  async function mount(rootId, session) {
    const root = document.getElementById(rootId);
    if (!root || !session) return;
    if (session.role !== "superadmin") {
      root.innerHTML =
        '<p class="ef-loading" style="color:#b91c1c">Accès refusé — Evo Finance est réservé au Super Admin.</p>';
      return;
    }

    state.session = session;
    state.scope = "platform";
    root.innerHTML =
      shellHtml(session).replace(
        '<div id="efPanelHost" class="ef-panel is-active"></div>',
        '<div id="efPanelHost" class="ef-panel is-active">' +
          renderLoadingPanel("Réveil du serveur et chargement des finances…", false) +
          "</div>"
      );

    root.querySelectorAll(".ef-nav button").forEach((btn) => {
      btn.addEventListener("click", () => showPanel(root, btn.dataset.efPanel));
    });
    root.querySelector("#efRefresh")?.addEventListener("click", () => mount(rootId, session));
    root.querySelector("#efLogout")?.addEventListener("click", () => {
      const target =
        typeof SAC_PORTAL !== "undefined"
          ? SAC_PORTAL.loginUrlForRole("superadmin")
          : "evofinance/";
      if (typeof SAC_SESSION !== "undefined") SAC_SESSION.logout(target);
    });

    const host = root.querySelector("#efPanelHost");
    if (host) host.innerHTML = renderLoadingPanel("Chargement des données financières…", false);

    try {
      state.data = await loadData(session);
      if (!state.data.transactions && state.data.byUniversity) {
        state.data.transactions = [];
        (state.data.byUniversity || []).forEach((g) => {
          (g.transactions || []).forEach((t) => state.data.transactions.push(t));
        });
      }
      state.data.transactions = state.data.transactions || [];
    } catch (err) {
      if (host) {
        host.innerHTML =
          '<div class="ef-card ef-card--loading">' +
          '<p class="ef-loading-inline" style="color:#b91c1c">' +
          esc(err.message || "Erreur de chargement") +
          "</p>" +
          '<button type="button" class="ef-btn" id="efRetryLoad">↻ Réessayer</button>' +
          '<a class="ef-btn ef-btn--ghost" href="evofinance/" style="margin-left:0.5rem">Portail Evo Finance</a>' +
          "</div>";
        host.querySelector("#efRetryLoad")?.addEventListener("click", () => mount(rootId, session));
      }
      return;
    }

    showPanel(root, "revenus");
  }

  return { mount, loadData };
})();

if (typeof window !== "undefined") {
  window.SAC_EVO_FINANCE = SAC_EVO_FINANCE;
}

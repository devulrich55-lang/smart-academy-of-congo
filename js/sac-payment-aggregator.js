/**
 * Agrégateur de paiements — campus (Admin université) et plateforme (EvoMonitor / techniciens).
 */
const SAC_PAYMENT_AGGREGATOR = (function () {
  "use strict";

  const METHOD_LABELS = {
    bank_usd: "Banque USD",
    bank_cdf: "Banque CDF",
    orange: "Orange Money",
    mpesa: "M-Pesa",
    mobile: "Mobile Money",
  };

  const STATUS_LABELS = {
    confirmed: "Confirmé",
    pending: "En attente",
    rejected: "Rejeté / échoué",
  };

  function esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDate(iso) {
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

  function formatAmount(amount, currency) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return "—";
    const cur = String(currency || "USD").toUpperCase();
    if (cur === "CDF") return n.toLocaleString("fr-FR") + " FC";
    return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + cur;
  }

  function methodLabel(method) {
    if (typeof SAC_PAYMENTS !== "undefined" && SAC_PAYMENTS.methodLabel) {
      return SAC_PAYMENTS.methodLabel(method);
    }
    return METHOD_LABELS[method] || method || "—";
  }

  function uniLabel(code) {
    if (!code) return "Plateforme (inscription)";
    if (typeof SAC_UNIVERSITIES !== "undefined" && SAC_UNIVERSITIES.getName) {
      return SAC_UNIVERSITIES.getName(code) || code;
    }
    return code;
  }

  function statusClass(status) {
    if (status === "confirmed") return "pay-agg-status pay-agg-status--ok";
    if (status === "rejected") return "pay-agg-status pay-agg-status--bad";
    return "pay-agg-status pay-agg-status--wait";
  }

  function statusLabel(status) {
    return STATUS_LABELS[status] || status || "—";
  }

  function renderSummaryCards(summary) {
    if (!summary) return "";
    const usd = Number(summary.totalAmountUsd || 0);
    const cdf = Number(summary.totalAmountCdf || 0);
    return (
      '<div class="pay-agg-stats">' +
      '<div class="pay-agg-stat"><strong>' +
      esc(summary.totalCount || 0) +
      "</strong><span>Transactions</span></div>" +
      '<div class="pay-agg-stat pay-agg-stat--ok"><strong>' +
      esc(summary.confirmedCount || 0) +
      "</strong><span>Confirmées</span></div>" +
      '<div class="pay-agg-stat pay-agg-stat--wait"><strong>' +
      esc(summary.pendingCount || 0) +
      "</strong><span>En attente</span></div>" +
      '<div class="pay-agg-stat"><strong>' +
      esc(usd.toLocaleString("fr-FR")) +
      " $</strong><span>Volume USD</span></div>" +
      (cdf > 0
        ? '<div class="pay-agg-stat"><strong>' +
          esc(cdf.toLocaleString("fr-FR")) +
          " FC</strong><span>Volume CDF</span></div>"
        : "") +
      "</div>"
    );
  }

  function renderCategoryChips(summary) {
    const cats = summary?.byCategory || {};
    const entries = Object.keys(cats).sort((a, b) => cats[b] - cats[a]);
    if (!entries.length) return "";
    return (
      '<div class="pay-agg-chips">' +
      entries
        .map(
          (c) =>
            '<span class="pay-agg-chip">' +
            esc(c) +
            " <strong>" +
            esc(cats[c]) +
            "</strong></span>"
        )
        .join("") +
      "</div>"
    );
  }

  function renderTransactionsTable(transactions, options) {
    const rows = Array.isArray(transactions) ? transactions : [];
    const showUni = !!(options && options.showUniversity);
    if (!rows.length) {
      return '<p class="pay-agg-empty">Aucune transaction pour ce filtre.</p>';
    }
    return (
      '<div class="pay-agg-table-wrap"><table class="pay-agg-table"><thead><tr>' +
      (showUni ? "<th>Université</th>" : "") +
      "<th>Date</th><th>Étudiant</th><th>Catégorie</th><th>Montant</th><th>Mode</th><th>Statut</th><th>Réf.</th>" +
      "</tr></thead><tbody>" +
      rows
        .map((tx) => {
          const name = tx.studentNom || tx.studentEmail || "—";
          return (
            "<tr>" +
            (showUni ? "<td>" + esc(uniLabel(tx.universite)) + "</td>" : "") +
            "<td>" +
            esc(formatDate(tx.createdAt)) +
            "</td>" +
            "<td><strong>" +
            esc(name) +
            "</strong>" +
            (tx.studentEmail && tx.studentNom
              ? '<br><small style="color:var(--muted);">' + esc(tx.studentEmail) + "</small>"
              : "") +
            "</td>" +
            "<td>" +
            esc(tx.category || tx.feeLabel || "—") +
            (tx.kind === "mobile"
              ? ' <span class="pay-agg-kind">MM</span>'
              : ' <span class="pay-agg-kind pay-agg-kind--acad">Acad.</span>') +
            "</td>" +
            "<td>" +
            esc(formatAmount(tx.amount, tx.currency)) +
            "</td>" +
            "<td>" +
            esc(methodLabel(tx.method)) +
            "</td>" +
            '<td><span class="' +
            statusClass(tx.status) +
            '">' +
            esc(statusLabel(tx.status)) +
            "</span></td>" +
            "<td><code>" +
            esc(tx.reference || tx.id || "—") +
            "</code></td>" +
            "</tr>"
          );
        })
        .join("") +
      "</tbody></table></div>"
    );
  }

  function renderUniversityGroups(groups) {
    const list = Array.isArray(groups) ? groups : [];
    if (!list.length) {
      return '<p class="pay-agg-empty">Aucune transaction enregistrée sur la plateforme.</p>';
    }
    return list
      .map((g) => {
        const s = g.summary || {};
        return (
          '<details class="pay-agg-uni-group" open>' +
          '<summary class="pay-agg-uni-head">' +
          "<div><strong>" +
          esc(uniLabel(g.universite)) +
          "</strong>" +
          '<span class="pay-agg-uni-meta">' +
          esc(g.transactionCount || 0) +
          " transaction(s) · " +
          esc(s.confirmedCount || 0) +
          " confirmée(s) · " +
          esc(Number(s.totalAmountUsd || 0).toLocaleString("fr-FR")) +
          " $</span></div>" +
          '<span class="pay-agg-uni-toggle">Voir détail</span>' +
          "</summary>" +
          '<div class="pay-agg-uni-body">' +
          renderCategoryChips(s) +
          renderTransactionsTable(g.transactions || [], { showUniversity: false }) +
          "</div></details>"
        );
      })
      .join("");
  }

  async function loadCampus(session) {
    if (typeof SAC_API === "undefined" || !SAC_API.getCampusPaymentAggregator) {
      throw new Error("API agrégateur indisponible — actualisez la page (Ctrl+F5).");
    }
    await SAC_API.ensureOnline(true);
    return SAC_API.getCampusPaymentAggregator();
  }

  async function loadPlatform(session) {
    if (typeof SAC_API === "undefined" || !SAC_API.getPlatformPaymentAggregator) {
      throw new Error("API agrégateur indisponible — actualisez la page (Ctrl+F5).");
    }
    await SAC_API.ensureOnline(true);
    if (SAC_API.ensureWritableApiSession) {
      await SAC_API.ensureWritableApiSession({ soft: true });
    }
    return SAC_API.getPlatformPaymentAggregator();
  }

  function bindFilters(root, data, mode) {
    const search = root.querySelector(".pay-agg-search");
    const statusSel = root.querySelector(".pay-agg-filter-status");
    const catSel = root.querySelector(".pay-agg-filter-category");
    const uniSel = root.querySelector(".pay-agg-filter-university");
    const tableHost = root.querySelector(".pay-agg-table-host");
    const groupsHost = root.querySelector(".pay-agg-groups-host");

    const allTx = Array.isArray(data.transactions) ? data.transactions.slice() : [];
    const categories = [
      ...new Set(allTx.map((t) => t.category || t.feeLabel).filter(Boolean)),
    ].sort();
    if (catSel) {
      catSel.innerHTML =
        '<option value="">Toutes catégories</option>' +
        categories.map((c) => '<option value="' + esc(c) + '">' + esc(c) + "</option>").join("");
    }
    if (uniSel && mode === "platform") {
      const unis = (data.byUniversity || []).map((g) => g.universite || "");
      uniSel.innerHTML =
        '<option value="">Toutes universités</option>' +
        unis
          .map(
            (u) =>
              '<option value="' +
              esc(u) +
              '">' +
              esc(uniLabel(u)) +
              "</option>"
          )
          .join("");
    }

    function applyFilters() {
      const q = (search?.value || "").trim().toLowerCase();
      const st = statusSel?.value || "";
      const cat = catSel?.value || "";
      const uni = uniSel?.value || "";
      let filtered = allTx.slice();
      if (st) filtered = filtered.filter((t) => t.status === st);
      if (cat) filtered = filtered.filter((t) => (t.category || t.feeLabel) === cat);
      if (uni !== "") filtered = filtered.filter((t) => (t.universite || "") === uni);
      if (q) {
        filtered = filtered.filter((t) => {
          const hay = [
            t.id,
            t.reference,
            t.studentEmail,
            t.studentNom,
            t.category,
            t.feeLabel,
            t.universite,
            uniLabel(t.universite),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        });
      }
      if (tableHost) {
        tableHost.innerHTML = renderTransactionsTable(filtered, {
          showUniversity: mode === "platform",
        });
      }
      if (groupsHost && mode === "platform") {
        const grouped = {};
        filtered.forEach((tx) => {
          const key = tx.universite || "";
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(tx);
        });
        const groups = Object.keys(grouped).map((u) => ({
          universite: u,
          transactionCount: grouped[u].length,
          summary: {
            confirmedCount: grouped[u].filter((t) => t.status === "confirmed").length,
            totalAmountUsd: grouped[u]
              .filter((t) => String(t.currency).toUpperCase() === "USD")
              .reduce((s, t) => s + Number(t.amount || 0), 0),
          },
          transactions: grouped[u],
        }));
        groupsHost.innerHTML = renderUniversityGroups(groups);
      }
    }

    [search, statusSel, catSel, uniSel].forEach((el) => {
      el?.addEventListener("input", applyFilters);
      el?.addEventListener("change", applyFilters);
    });
    applyFilters();
  }

  async function mount(rootId, session, mode) {
    const root = document.getElementById(rootId);
    if (!root) return;
    const isPlatform = mode === "platform";
    root.innerHTML =
      '<div class="pay-agg-loading">Chargement de l\'agrégateur de paiements…</div>';

    try {
      const data = isPlatform ? await loadPlatform(session) : await loadCampus(session);
      root.innerHTML =
        '<div class="pay-agg-panel">' +
        '<div class="pay-agg-toolbar">' +
        '<input type="search" class="fi pay-agg-search" placeholder="Rechercher étudiant, référence, e-mail…" />' +
        '<select class="fi pay-agg-filter-status"><option value="">Tous statuts</option>' +
        '<option value="confirmed">Confirmé</option><option value="pending">En attente</option>' +
        '<option value="rejected">Rejeté / échoué</option></select>' +
        '<select class="fi pay-agg-filter-category"></select>' +
        (isPlatform
          ? '<select class="fi pay-agg-filter-university"></select>'
          : "") +
        '<button type="button" class="btn btn--ghost btn--sm pay-agg-refresh">Actualiser</button>' +
        "</div>" +
        renderSummaryCards(data.summary) +
        renderCategoryChips(data.summary) +
        (isPlatform
          ? '<h3 class="pay-agg-subtitle">Par université</h3><div class="pay-agg-groups-host"></div>' +
            '<h3 class="pay-agg-subtitle">Toutes les transactions</h3>'
          : "") +
        '<div class="pay-agg-table-host"></div>' +
        '<p class="pay-agg-foot">Dernière actualisation : ' +
        esc(formatDate(new Date().toISOString())) +
        (isPlatform
          ? " · Vue plateforme EvoMonitor (toutes universités)"
          : " · Vue campus " + esc(uniLabel(data.universite))) +
        "</p></div>";

      bindFilters(root, data, isPlatform ? "platform" : "campus");
      root.querySelector(".pay-agg-refresh")?.addEventListener("click", () => {
        mount(rootId, session, mode);
      });
    } catch (err) {
      root.innerHTML =
        '<p class="pay-agg-error">' +
        esc(err.message || "Impossible de charger l'agrégateur.") +
        (isPlatform
          ? "<br><small>Redéployez l'API (backend-python) si la route /payments/platform/aggregator est absente.</small>"
          : "") +
        "</p>";
    }
  }

  return {
    mount,
    loadCampus,
    loadPlatform,
    formatAmount,
    uniLabel,
  };
})();

if (typeof window !== "undefined") {
  window.SAC_PAYMENT_AGGREGATOR = SAC_PAYMENT_AGGREGATOR;
}

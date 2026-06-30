/**
 * Journal d'activités — espaces admin (API)
 */
const SAC_ADMIN_ACTIVITIES = (function () {
  let cache = [];
  let summaryCache = null;
  const selectedIds = new Set();

  const ROLE_BADGE = {
    superadmin: '<span class="badge-super">Super Admin</span>',
    ministere: '<span class="badge-min">Ministère</span>',
    universite: '<span class="badge-uni">Admin Uni</span>',
    etudiant: '<span style="font-size:0.7rem;color:var(--muted);">Étudiant</span>',
    professeur: '<span style="font-size:0.7rem;color:var(--muted);">Professeur</span>',
    assistant: '<span style="font-size:0.7rem;color:var(--muted);">Assistant</span>',
  };

  function formatDate(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleString("fr-FR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  function metaLine(item) {
    const m = item.meta || {};
    const parts = [];
    if (m.email) parts.push(m.email);
    if (m.role) parts.push(m.role);
    if (item.universite) parts.push(item.universite);
    return parts.join(" · ") || "—";
  }

  function clearSelection() {
    selectedIds.clear();
    syncToolbarState();
  }

  function getSelectedIds() {
    return Array.from(selectedIds);
  }

  function syncToolbarState(toolbarIds) {
    const cfg = toolbarIds || boundToolbar;
    if (!cfg) return;

    const selectAll = document.getElementById(cfg.selectAllId);
    const deleteBtn = document.getElementById(cfg.deleteBtnId);
    const timeline = document.getElementById(cfg.timelineId);
    const checks = timeline ? timeline.querySelectorAll(".act-row-check") : [];
    const visibleIds = Array.from(checks).map((c) => c.value);
    const selectedVisible = visibleIds.filter((id) => selectedIds.has(id)).length;

    if (selectAll) {
      selectAll.checked = visibleIds.length > 0 && selectedVisible === visibleIds.length;
      selectAll.indeterminate =
        selectedVisible > 0 && selectedVisible < visibleIds.length;
    }
    if (deleteBtn) {
      deleteBtn.disabled = selectedIds.size === 0;
      deleteBtn.textContent =
        selectedIds.size > 0
          ? "Supprimer la sélection (" + selectedIds.size + ")"
          : "Supprimer la sélection";
    }
  }

  let boundToolbar = null;

  async function load() {
    if (typeof SAC_API === "undefined" || !SAC_API.listAdminActivities) {
      return { activities: [], summary: null, offline: true };
    }
    try {
      const online = await SAC_API.ensureOnline(false, { maxWaitMs: 18000 });
      const hasTokens =
        typeof SAC_API.hasAuthTokens === "function" && SAC_API.hasAuthTokens();
      if (!online && !hasTokens) return { activities: cache, summary: summaryCache, offline: true };
      const [summary, activities] = await Promise.all([
        SAC_API.getAdminActivitiesSummary(),
        SAC_API.listAdminActivities(),
      ]);
      summaryCache = summary;
      cache = Array.isArray(activities) ? activities : [];
      return { activities: cache, summary: summaryCache, offline: false };
    } catch (err) {
      console.warn("[SAC_ADMIN_ACTIVITIES]", err.message || err);
      return {
        activities: cache,
        summary: summaryCache,
        offline: false,
        error: err.message || String(err),
      };
    }
  }

  function renderTimeline(activities, containerId, options = {}) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const toolbar = options.toolbar || null;
    const selectable = options.selectable !== false && !!toolbar;

    const visibleIds = new Set(activities.map((a) => a.id));
    selectedIds.forEach((id) => {
      if (!visibleIds.has(id)) selectedIds.delete(id);
    });

    if (!activities.length) {
      clearSelection();
      el.innerHTML =
        '<p class="empty" style="padding:1.5rem;text-align:center;color:var(--muted);">Aucune activité enregistrée pour le moment. Les connexions et actions admin apparaîtront ici.</p>';
      syncToolbarState(toolbar);
      return;
    }

    el.innerHTML = activities
      .map((a) => {
        const checked = selectedIds.has(a.id) ? " checked" : "";
        const checkCol = selectable
          ? `<label class="ws-activity-row__check"><input type="checkbox" class="act-row-check" value="${a.id}"${checked} aria-label="Sélectionner" /></label>`
          : "";
        const dotCol = selectable
          ? ""
          : '<div class="ws-activity-row__dot" aria-hidden="true"></div>';
        return `
      <div class="ws-activity-row${selectable ? " ws-activity-row--selectable" : ""}" data-act-id="${a.id}">
        ${checkCol}${dotCol}
        <div class="ws-activity-row__body">
          <div class="ws-activity-row__head">
            <strong>${a.actionLabel || a.action}</strong>
            ${ROLE_BADGE[a.actorRole] || `<span class="ws-activity-role">${a.actorRole || "—"}</span>`}
          </div>
          <div class="ws-activity-row__meta">
            <span>${a.actorEmail || "—"}</span>
            ${metaLine(a) !== "—" ? " · " + metaLine(a) : ""}
          </div>
        </div>
        <time class="ws-activity-row__time">${formatDate(a.createdAt)}</time>
      </div>`;
      })
      .join("");

    if (selectable) {
      bindTimelineSelection(containerId, toolbar);
    }
    syncToolbarState(toolbar);
  }

  function bindTimelineSelection(timelineId, toolbar) {
    const el = document.getElementById(timelineId);
    if (!el) return;

    el.querySelectorAll(".act-row-check").forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) selectedIds.add(input.value);
        else selectedIds.delete(input.value);
        syncToolbarState(toolbar);
      });
    });
  }

  function bindToolbar(toolbar) {
    if (!toolbar || !toolbar.timelineId) return;
    boundToolbar = toolbar;

    const selectAll = document.getElementById(toolbar.selectAllId);
    const deleteBtn = document.getElementById(toolbar.deleteBtnId);

    if (selectAll && !selectAll.dataset.bound) {
      selectAll.dataset.bound = "1";
      selectAll.addEventListener("change", () => {
        const el = document.getElementById(toolbar.timelineId);
        const checks = el ? el.querySelectorAll(".act-row-check") : [];
        checks.forEach((input) => {
          input.checked = selectAll.checked;
          if (selectAll.checked) selectedIds.add(input.value);
          else selectedIds.delete(input.value);
        });
        syncToolbarState(toolbar);
      });
    }

    if (deleteBtn && !deleteBtn.dataset.bound) {
      deleteBtn.dataset.bound = "1";
      deleteBtn.addEventListener("click", async () => {
        const ids = getSelectedIds();
        if (!ids.length) return;
        const msg =
          ids.length === 1
            ? "Supprimer 1 entrée de l'historique ?"
            : "Supprimer " + ids.length + " entrées de l'historique ?";
        if (!confirm(msg)) return;

        if (typeof SAC_API === "undefined" || !SAC_API.deleteAdminActivities) {
          alert("API indisponible.");
          return;
        }

        deleteBtn.disabled = true;
        try {
          const result = await SAC_API.deleteAdminActivities({ ids });
          clearSelection();
          if (typeof toolbar.onDeleted === "function") {
            await toolbar.onDeleted(result);
          }
        } catch (err) {
          alert(err.message || "Suppression impossible.");
        } finally {
          syncToolbarState(toolbar);
        }
      });
    }
  }

  function renderSummary(summary, prefix) {
    if (!summary) return;
    const p = prefix || "act";
    const total = document.getElementById(p + "StatTotal");
    const logins = document.getElementById(p + "StatLogins");
    const last = document.getElementById(p + "StatLast");
    if (total) total.textContent = summary.total || 0;
    if (logins) logins.textContent = (summary.byAction && summary.byAction.login) || 0;
    if (last) last.textContent = summary.lastAt ? formatDate(summary.lastAt) : "—";
  }

  return {
    load,
    renderTimeline,
    renderSummary,
    bindToolbar,
    clearSelection,
    getActivities: () => cache.slice(),
  };
})();

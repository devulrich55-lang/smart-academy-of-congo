/**
 * Journal d'activités — espaces admin (API)
 */
const SAC_ADMIN_ACTIVITIES = (function () {
  let cache = [];
  let summaryCache = null;

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

  async function load() {
    if (typeof SAC_API === "undefined" || !SAC_API.listAdminActivities) {
      return { activities: [], summary: null };
    }
    try {
      const online = await SAC_API.ensureOnline();
      if (!online) return { activities: cache, summary: summaryCache };
      const [summary, activities] = await Promise.all([
        SAC_API.getAdminActivitiesSummary(),
        SAC_API.listAdminActivities(),
      ]);
      summaryCache = summary;
      cache = Array.isArray(activities) ? activities : [];
      return { activities: cache, summary: summaryCache };
    } catch (err) {
      console.warn("[SAC_ADMIN_ACTIVITIES]", err.message || err);
      return { activities: cache, summary: summaryCache };
    }
  }

  function renderTimeline(activities, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!activities.length) {
      el.innerHTML =
        '<p class="empty" style="padding:1.5rem;text-align:center;color:var(--muted);">Aucune activité enregistrée pour le moment. Les connexions et actions admin apparaîtront ici.</p>';
      return;
    }
    el.innerHTML = activities
      .map(
        (a) => `
      <div class="ws-activity-row">
        <div class="ws-activity-row__dot" aria-hidden="true"></div>
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
      </div>`
      )
      .join("");
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
    getActivities: () => cache.slice(),
  };
})();

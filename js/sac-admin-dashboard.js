/**
 * Tableau de bord institutionnel — Ministère / Super Admin
 */
const SAC_ADMIN_DASHBOARD = (function () {
  const ROLE_LABELS = {
    superadmin: { label: "Super Admin", icon: "🛡️" },
    ministere: { label: "Ministère", icon: "🏛️" },
    universite: { label: "Admin université", icon: "🎓" },
  };

  function initials(name, email) {
    const src = (name || email || "?").trim();
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return src.slice(0, 2).toUpperCase();
  }

  function roleBadge(role) {
    if (role === "superadmin") return '<span class="badge-super">Super Admin</span>';
    if (role === "ministere") return '<span class="badge-min">Ministère</span>';
    return '<span class="badge-uni">Admin Uni</span>';
  }

  function toast(msg) {
    const el = document.getElementById("wsToast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 3500);
  }

  function showSection(id) {
    document.querySelectorAll(".page-section").forEach((s) => s.classList.remove("active"));
    document.getElementById("section-" + id)?.classList.add("active");
    document.querySelectorAll(".nav-tab[data-section]").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.section === id);
    });
    if (id === "activites") reloadActivities();
    if (id === "live" && typeof SAC_MINISTRY_LIVE !== "undefined") {
      const session = SAC_SESSION.getSession();
      SAC_MINISTRY_LIVE.mountMinistryUI(document.getElementById("ministryLiveRoot"), session);
    }
    if (id === "publier" && typeof SAC_HOME_NEWS !== "undefined") {
      const session = SAC_SESSION.getSession();
      if (session?.role === "ministere") {
        SAC_HOME_NEWS.initMinistryPublisher(session, "ministryPublisherRoot", {
          onChange: () => SAC_HOME_NEWS.renderPublicPreview("ministryPublicPreview"),
        });
        SAC_HOME_NEWS.renderPublicPreview("ministryPublicPreview");
      }
    }
    if (id === "registry" && typeof SAC_PLATFORM_REGISTRY !== "undefined") {
      const session = SAC_SESSION.getSession();
      if (session?.role === "superadmin") {
        SAC_PLATFORM_REGISTRY.unlock();
        SAC_PLATFORM_REGISTRY.load(session).then(() => {
          SAC_PLATFORM_REGISTRY.mount(document.getElementById("platformRegistryRoot"), session);
        });
      }
    }
  }

  async function reloadActivities() {
    if (typeof SAC_ADMIN_ACTIVITIES === "undefined") return;
    const { activities, summary } = await SAC_ADMIN_ACTIVITIES.load();
    SAC_ADMIN_ACTIVITIES.renderSummary(summary, "act");
    SAC_ADMIN_ACTIVITIES.renderTimeline(activities, "activitiesTimeline");
    const preview = document.getElementById("recentActivitiesPreview");
    if (preview) SAC_ADMIN_ACTIVITIES.renderTimeline(activities.slice(0, 5), "recentActivitiesPreview");
  }

  function filterAdmins(admins, q, roleFilter) {
    return admins.filter((a) => {
      if (roleFilter && a.role !== roleFilter) return false;
      if (!q) return true;
      const hay = [a.email, a.displayName, a.nomUniversite, a.responsable, a.sigle, a.ville]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  function renderKpis(summary) {
    if (!summary) return;
    const br = summary.byRole || {};
    const map = {
      statTotal: summary.total || 0,
      statSuper: br.superadmin || 0,
      statMin: br.ministere || 0,
      statUni: br.universite || 0,
    };
    Object.keys(map).forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = map[id];
    });
  }

  function renderPreviewCards(admins, limit) {
    const el = document.getElementById("recentAdmins");
    if (!el) return;
    const slice = admins.slice(0, limit || 5);
    if (!slice.length) {
      el.innerHTML = '<p class="empty">Aucun administrateur enregistré.</p>';
      return;
    }
    el.innerHTML = slice
      .map(
        (a) => `
      <div class="ws-admin-card">
        <div class="ws-admin-card__avatar">${initials(a.displayName, a.email)}</div>
        <div>
          <div class="ws-admin-card__title">${a.displayName || a.email}</div>
          <div class="ws-admin-card__sub">${a.email} · ${roleBadge(a.role)}</div>
        </div>
        <span style="font-size:0.78rem;color:var(--muted);">${a.nomUniversite || a.ville || "—"}</span>
      </div>`
      )
      .join("");
  }

  function renderTable(admins, session, isSuper) {
    const body = document.getElementById("adminsBody");
    if (!body) return;
    if (!admins.length) {
      body.innerHTML =
        '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:2rem;">Aucun administrateur trouvé.</td></tr>';
      return;
    }
    body.innerHTML = admins
      .map((a) => {
        const campus = a.nomUniversite || a.sigle || a.universite || a.ville || "—";
        const actions =
          isSuper && String(a.email).toLowerCase() !== String(session.identifiant).toLowerCase()
            ? `<button type="button" class="btn btn--ghost btn--xs" data-del="${encodeURIComponent(a.email)}">Supprimer</button>`
            : "—";
        return `<tr>
          <td>${roleBadge(a.role)}</td>
          <td>
            <div style="display:flex;align-items:center;gap:0.65rem;">
              <div class="ws-admin-card__avatar" style="width:36px;height:36px;font-size:0.8rem;">${initials(a.displayName, a.email)}</div>
              <div>
                <strong>${a.displayName || "—"}</strong>
                ${a.responsable ? `<br><small style="color:var(--muted)">${a.responsable}</small>` : ""}
              </div>
            </div>
          </td>
          <td>${a.email}</td>
          <td>${campus}</td>
          <td class="col-actions" style="${isSuper ? "" : "display:none"}">${actions}</td>
        </tr>`;
      })
      .join("");

    body.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const email = decodeURIComponent(btn.getAttribute("data-del"));
        if (!confirm("Supprimer le compte " + email + " ?")) return;
        try {
          await SAC_INSTITUTIONAL.remove(session, email);
          toast("Compte supprimé.");
          await refresh(session, isSuper);
          await reloadActivities();
        } catch (err) {
          alert(err.message || "Suppression impossible.");
        }
      });
    });
  }

  async function refresh(session, isSuper) {
    const { summary, admins } = await SAC_INSTITUTIONAL.load(session);
    renderKpis(summary);
    const q = document.getElementById("searchAdmins")?.value.trim().toLowerCase() || "";
    const roleFilter = document.getElementById("filterRole")?.value || "";
    const filtered = filterAdmins(admins, q, roleFilter);
    renderTable(filtered, session, isSuper);
    renderPreviewCards(admins, 5);
    const countEl = document.getElementById("tableCount");
    if (countEl) countEl.textContent = filtered.length + " compte(s)";
  }

  async function init() {
    const session = await SAC_SESSION.guard();
    if (!session) return null;
    if (session.role !== "ministere" && session.role !== "superadmin") {
      window.location.replace(
        typeof SAC_PORTAL !== "undefined"
          ? SAC_PORTAL.dashboardUrl(session.role)
          : SAC_SESSION.dashboardUrl(session.role)
      );
      return null;
    }

    const isSuper = session.role === "superadmin";
    const isMinistere = session.role === "ministere";
    const meta = ROLE_LABELS[session.role] || { label: session.role, icon: "🏛️" };

    document.body.dataset.wsRole = session.role;

    if (typeof SAC_PORTAL !== "undefined") {
      SAC_PORTAL.applyBranding(session.role);
      document.querySelector(".portal-logo-text")?.style && (document.querySelector(".portal-logo-text").style.display = "none");
      const home = document.getElementById("portalHomeLink");
      if (home) home.href = SAC_PORTAL.loginUrlForRole(session.role);
    }

    document.getElementById("roleBadge").textContent = meta.icon + " " + meta.label;
    document.getElementById("userName").textContent = session.displayName || session.identifiant;
    document.getElementById("profileName").textContent = session.displayName || meta.label;
    document.getElementById("profileMeta").textContent = session.identifiant;
    document.getElementById("heroRoleBadge").textContent = meta.icon + " " + meta.label;
    document.getElementById("heroDate").textContent = new Date().toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    if (isSuper) {
      document.getElementById("tabCreate")?.removeAttribute("hidden");
      document.getElementById("section-create")?.classList.remove("ws-only-super-hidden");
      document.querySelectorAll(".ws-only-super-hidden").forEach((el) => el.classList.remove("ws-only-super-hidden"));
      document.querySelectorAll(".col-actions").forEach((c) => (c.style.display = ""));
      const hint = document.getElementById("listHint");
      if (hint) hint.textContent = "En tant que Super Admin, vous gérez tous les comptes institutionnels.";
    } else {
      document.getElementById("tabCreate")?.setAttribute("hidden", "hidden");
      document.querySelector('#filterRole option[value="superadmin"]')?.remove();
      const hint = document.getElementById("listHint");
      if (hint) hint.textContent = "En tant que Ministère, consultation des administrateurs (lecture seule).";
    }

    if (isMinistere) {
      document.getElementById("tabLive")?.removeAttribute("hidden");
      document.getElementById("tabPublier")?.removeAttribute("hidden");
      document.querySelectorAll(".ws-only-ministere-hidden").forEach((el) => {
        el.classList.remove("ws-only-ministere-hidden");
      });
    }

    document.getElementById("btnLogout")?.addEventListener("click", () => {
      const target =
        typeof SAC_PORTAL !== "undefined"
          ? SAC_PORTAL.logoutUrl(session.role)
          : SAC_SESSION.loginUrl(session.role);
      SAC_SESSION.logout(target);
    });

    document.querySelectorAll(".nav-tab[data-section]").forEach((tab) => {
      tab.addEventListener("click", () => showSection(tab.dataset.section));
    });
    document.querySelectorAll("[data-goto]").forEach((btn) => {
      btn.addEventListener("click", () => showSection(btn.dataset.goto));
    });

    const onFilter = () => refresh(session, isSuper);
    document.getElementById("searchAdmins")?.addEventListener("input", onFilter);
    document.getElementById("filterRole")?.addEventListener("change", onFilter);

    const newRole = document.getElementById("newRole");
    const uniFields = document.getElementById("uniFields");
    newRole?.addEventListener("change", () => {
      if (uniFields) uniFields.hidden = newRole.value !== "universite";
      const logoInput = document.getElementById("newLogoUniversite");
      if (logoInput) logoInput.required = newRole.value === "universite";
    });

    if (typeof SAC_UNIVERSITY_LOGO !== "undefined") {
      SAC_UNIVERSITY_LOGO.bindPreviewInput(
        document.getElementById("newLogoUniversite"),
        document.getElementById("newLogoPreview")
      );
    }

    document.getElementById("formCreateAdmin")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!isSuper) return;
      const role = newRole.value;
      const payload = {
        role,
        email: document.getElementById("newEmail").value.trim(),
        prenom: document.getElementById("newPrenom").value.trim(),
        nom: document.getElementById("newNom").value.trim(),
        telephone: document.getElementById("newTel").value.trim(),
        password: document.getElementById("newPassword").value,
      };
      if (role === "universite") {
        payload.nomUniversite = document.getElementById("newNomUniversite").value.trim();
        payload.responsable = document.getElementById("newResponsable").value.trim();
        payload.codeUni = document.getElementById("newCodeUni").value.trim();
        payload.sigle = document.getElementById("newSigle").value.trim();
        payload.universite = payload.sigle || payload.codeUni;
        const logoFile = document.getElementById("newLogoUniversite")?.files?.[0];
        if (!logoFile) {
          alert("Importez le logo de l'université.");
          return;
        }
        try {
          payload.logoUrl = await SAC_UNIVERSITY_LOGO.fileToDataUrl(logoFile);
        } catch (logoErr) {
          alert(logoErr.message || "Logo invalide.");
          return;
        }
      }
      try {
        await SAC_INSTITUTIONAL.create(session, payload);
        toast("Compte créé avec succès.");
        e.target.reset();
        if (uniFields) uniFields.hidden = true;
        const logoPreview = document.getElementById("newLogoPreview");
        if (logoPreview) {
          logoPreview.innerHTML = "";
          logoPreview.hidden = true;
        }
        showSection("administrateurs");
        await refresh(session, isSuper);
        await reloadActivities();
      } catch (err) {
        alert(err.message || "Création impossible.");
      }
    });

    await refresh(session, isSuper);
    await reloadActivities();

    if (isSuper && typeof SAC_PLATFORM_REGISTRY !== "undefined") {
      SAC_PLATFORM_REGISTRY.bindUnlock(session, showSection, toast);
    }

    return session;
  }

  return { init, showSection, toast };
})();

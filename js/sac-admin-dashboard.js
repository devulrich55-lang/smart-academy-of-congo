/**
 * Tableau de bord institutionnel — Ministère / Super Admin
 */
const SAC_ADMIN_DASHBOARD = (function () {
  const PRESENCE_REFRESH_MS = 20000;
  const PRESENCE_ROLE_LABELS = {
    etudiant: "Étudiants",
    professeur: "Professeurs",
    assistant: "Assistants",
    section: "Chefs de section",
    universite: "Admin université",
  };
  let presenceTimer = null;

  const ROLE_LABELS = {
    superadmin: { label: "Super Admin", icon: "🛡️" },
    ministere: { label: "Ministère", icon: "🏛️" },
    universite: { label: "Admin université", icon: "🎓" },
  };
  const MAX_SUPERADMIN_ACCOUNTS = 2;
  let institutionalSummaryCache = null;
  let onCreateFormRoleChange = null;

  function getSuperadminCount() {
    if (institutionalSummaryCache?.superadminCount != null) {
      return institutionalSummaryCache.superadminCount;
    }
    return institutionalSummaryCache?.byRole?.superadmin || 0;
  }

  function applySuperadminCreateLimit() {
    const newRole = document.getElementById("newRole");
    if (!newRole) return;
    const count = getSuperadminCount();
    const remaining = Math.max(0, MAX_SUPERADMIN_ACCOUNTS - count);
    const limitReached = remaining <= 0;
    const limitMsg = document.getElementById("superadminLimitMsg");
    const superHint = document.getElementById("superadminFirstHint");
    const formFields = document.getElementById("superadminFormFields");
    const superOption = newRole.querySelector('option[value="superadmin"]');
    const submitBtn = document.getElementById("btnCreateAdminSubmit");

    if (superOption) {
      superOption.disabled = limitReached;
      if (limitReached && newRole.value === "superadmin") {
        newRole.value = "ministere";
        if (onCreateFormRoleChange) onCreateFormRoleChange();
        return;
      }
    }

    if (limitMsg) {
      limitMsg.hidden = !limitReached;
      if (limitReached) {
        limitMsg.textContent =
          "Limite atteinte : " +
          MAX_SUPERADMIN_ACCOUNTS +
          " comptes Super Admin maximum (" +
          count +
          "/" +
          MAX_SUPERADMIN_ACCOUNTS +
          "). Supprimez un compte existant pour en créer un autre.";
      }
    }

    if (superHint && !limitReached) {
      superHint.hidden = false;
      superHint.innerHTML =
        "Maximum <strong>" +
        MAX_SUPERADMIN_ACCOUNTS +
        " comptes Super Admin</strong> — <strong>" +
        count +
        "</strong> existant(s), <strong>" +
        remaining +
        "</strong> place(s) restante(s). Compte principal : <code>djemcibamba@gmail.com</code>. " +
        'Pour changer le mot de passe : <a href="../mot-de-passe-oublie.html?portal=superadmin">Mot de passe oublié</a>.';
    } else if (superHint) {
      superHint.hidden = limitReached;
    }

    const blockSuperForm = limitReached && newRole.value === "superadmin";
    if (formFields) {
      formFields.style.opacity = blockSuperForm ? "0.55" : "";
      formFields.style.pointerEvents = blockSuperForm ? "none" : "";
    }
    if (submitBtn) {
      submitBtn.disabled = blockSuperForm;
    }
  }

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
    if (id === "bibliotheque" && typeof SAC_LIBRARY !== "undefined") {
      const session = SAC_SESSION.getSession();
      if (session?.role === "ministere") {
        SAC_LIBRARY.initMinistryPublisher(session, "libraryPublisherRoot", { showList: true });
      }
    }
    if (id === "stages" && typeof SAC_CAREERS !== "undefined") {
      const session = SAC_SESSION.getSession();
      if (session?.role === "ministere") {
        SAC_CAREERS.mountManageUI(document.getElementById("careerNationalRoot"), session, { national: true });
      }
    }
    if (id === "accueil" && typeof SAC_LIBRARY !== "undefined") {
      const session = SAC_SESSION.getSession();
      if (session?.role === "ministere") {
        SAC_LIBRARY.initMinistryPublisher(session, "libraryPublisherAccueil", { showList: false });
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
    if (id === "tarifs") {
      const session = SAC_SESSION.getSession();
      if (session?.role === "superadmin") loadPlatformTariffForm(session);
    }
    if (id === "validations") {
      renderPlatformValidations();
    }
  }

  function escHtml(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function uniLabel(code) {
    if (typeof SAC_UNIVERSITIES !== "undefined" && SAC_UNIVERSITIES.getName) {
      return SAC_UNIVERSITIES.getName(code) || code || "—";
    }
    return code || "—";
  }

  async function renderPlatformValidations() {
    const tbody = document.getElementById("platformValidTable");
    const empty = document.getElementById("platformValidEmpty");
    const countEl = document.getElementById("platformValidCount");
    if (!tbody || typeof SAC_API === "undefined" || !SAC_API.listPlatformPendingStudents) return;

    const status = document.getElementById("validStatusFilter")?.value || "pending";
    const campus = document.getElementById("validCampusFilter")?.value || "";
    tbody.innerHTML =
      '<tr><td colspan="7" style="color:var(--muted);padding:1.5rem;text-align:center;">Chargement…</td></tr>';

    try {
      const online = await SAC_API.ensureOnline();
      if (!online) throw new Error("Serveur hors ligne");
      const students = await SAC_API.listPlatformPendingStudents({
        status,
        universite: campus || undefined,
      });
      if (countEl) countEl.textContent = students.length + " étudiant(s)";
      if (!students.length) {
        tbody.innerHTML = "";
        if (empty) empty.style.display = "block";
        return;
      }
      if (empty) empty.style.display = "none";
      tbody.innerHTML = students
        .map((u) => {
          const name = [u.prenom, u.nom].filter(Boolean).join(" ") || u.displayName || u.identifiant;
          const st = u.sectionApproval || "pending";
          const stCls =
            st === "approved" ? "pay-status--ok" : st === "rejected" ? "pay-status--bad" : "pay-status--wait";
          const stLabel =
            st === "approved" ? "Validé" : st === "rejected" ? "Refusé" : "En attente";
          const actions =
            st === "pending"
              ? `<button type="button" class="btn btn--role btn--sm" data-sa-approve="${escHtml(u.identifiant || u.email)}">Valider</button> ` +
                `<button type="button" class="btn btn--ghost btn--sm" data-sa-reject="${escHtml(u.identifiant || u.email)}">Refuser</button>`
              : st === "approved"
                ? '<span style="color:var(--muted);font-size:0.8rem;">—</span>'
                : `<button type="button" class="btn btn--ghost btn--sm" data-sa-approve="${escHtml(u.identifiant || u.email)}">Réactiver</button>`;
          return `<tr>
            <td><strong>${escHtml(name)}</strong></td>
            <td>${escHtml(u.identifiant || u.email)}</td>
            <td><code>${escHtml(u.matricule || "—")}</code></td>
            <td>${escHtml(uniLabel(u.universite))}</td>
            <td>${escHtml(u.filiere || "—")}</td>
            <td><span class="${stCls}">${stLabel}</span></td>
            <td style="white-space:nowrap;">${actions}</td>
          </tr>`;
        })
        .join("");

      tbody.querySelectorAll("[data-sa-approve]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const email = btn.getAttribute("data-sa-approve");
          if (!confirm("Valider l'inscription de " + email + " ?")) return;
          try {
            await SAC_API.approvePlatformStudent(email, { status: "approved" });
            toast("Étudiant validé — accès actif sur tous les appareils.");
            await renderPlatformValidations();
          } catch (err) {
            alert(err.message || "Validation impossible.");
          }
        });
      });
      tbody.querySelectorAll("[data-sa-reject]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const email = btn.getAttribute("data-sa-reject");
          const reason = window.prompt("Motif du refus (optionnel) :") || "";
          if (!confirm("Refuser l'inscription de " + email + " ?")) return;
          try {
            await SAC_API.approvePlatformStudent(email, { status: "rejected", reason });
            toast("Inscription refusée.");
            await renderPlatformValidations();
          } catch (err) {
            alert(err.message || "Refus impossible.");
          }
        });
      });
    } catch (err) {
      tbody.innerHTML =
        '<tr><td colspan="7" style="color:#b45309;padding:1rem;">' +
        escHtml(err.message || "Chargement impossible.") +
        "</td></tr>";
    }
  }

  function updatePlatformTariffHints() {
    if (typeof SAC_TARIFFS === "undefined") return;
    const rate = parseFloat(document.getElementById("platformCdfRate")?.value);
    const pairs = [
      ["platformFeeEtu", "platformFeeEtuFc"],
      ["platformFeeAssist", "platformFeeAssistFc"],
      ["platformFeeProf", "platformFeeProfFc"],
      ["platformFeeUni", "platformFeeUniFc"],
    ];
    pairs.forEach(([inpId, hintId]) => {
      const v = parseFloat(document.getElementById(inpId)?.value);
      const el = document.getElementById(hintId);
      if (!el) return;
      el.textContent =
        Number.isFinite(v) && v > 0 && Number.isFinite(rate) && rate > 0
          ? "≈ " + Math.round(v * rate).toLocaleString("fr-FR") + " FC"
          : "";
    });
  }

  async function loadPlatformTariffForm(session) {
    if (typeof SAC_TARIFFS === "undefined") return;
    await SAC_TARIFFS.loadPlatformSettings(true);
    const settings = SAC_TARIFFS.getPlatformSettings();
    const fees = settings.fees;
    document.getElementById("platformCdfRate").value = settings.cdfPerUsd;
    document.getElementById("platformFeeEtu").value = fees.etudiant.amount;
    document.getElementById("platformFeeAssist").value = fees.assistant.amount;
    document.getElementById("platformFeeProf").value = fees.professeur.amount;
    document.getElementById("platformFeeUni").value = fees.universite.amount;
    updatePlatformTariffHints();
    const meta = document.getElementById("platformTariffUpdated");
    if (meta) {
      meta.textContent = settings.updatedAt
        ? "Dernière mise à jour : " +
          new Date(settings.updatedAt).toLocaleString("fr-FR") +
          (settings.updatedBy ? " · " + settings.updatedBy : "")
        : "Tarifs par défaut plateforme";
    }
  }

  async function reloadActivities() {
    if (typeof SAC_ADMIN_ACTIVITIES === "undefined") return;
    const { activities, summary } = await SAC_ADMIN_ACTIVITIES.load();
    SAC_ADMIN_ACTIVITIES.renderSummary(summary, "act");
    SAC_ADMIN_ACTIVITIES.renderTimeline(activities, "activitiesTimeline", {
      selectable: true,
      toolbar: {
        timelineId: "activitiesTimeline",
        selectAllId: "actSelectAll",
        deleteBtnId: "actDeleteSelected",
      },
    });
    const preview = document.getElementById("recentActivitiesPreview");
    if (preview) {
      SAC_ADMIN_ACTIVITIES.renderTimeline(activities.slice(0, 5), "recentActivitiesPreview", {
        selectable: false,
      });
    }
  }

  function filterAdmins(admins, q, roleFilter) {
    return admins.filter((a) => {
      if (roleFilter && a.role !== roleFilter) return false;
      if (!q) return true;
      const cc =
        typeof SAC_AFRICA_COUNTRIES !== "undefined"
          ? SAC_AFRICA_COUNTRIES.adminCountryCode(a)
          : a.countryCode || "";
      const hay = [a.email, a.displayName, a.nomUniversite, a.responsable, a.sigle, a.ville, cc]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  function scopeAdminsForSession(admins, session) {
    if (!session || session.role === "superadmin") return admins;
    if (session.role !== "ministere") return admins;
    const cc = String(session.countryCode || "").toUpperCase();
    if (!cc || typeof SAC_AFRICA_COUNTRIES === "undefined") return admins;
    return admins.filter((a) => {
      const ac = SAC_AFRICA_COUNTRIES.adminCountryCode(a);
      if (a.role === "ministere" || a.role === "universite") return ac === cc;
      return false;
    });
  }

  function countryCell(admin) {
    if (typeof SAC_AFRICA_COUNTRIES === "undefined") return admin.countryCode || "—";
    const cc = SAC_AFRICA_COUNTRIES.adminCountryCode(admin);
    return cc ? SAC_AFRICA_COUNTRIES.label(cc) : "—";
  }

  function formatPresenceTime(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return "—";
    }
  }

  function renderPresenceSummary(summary) {
    const countEl = document.getElementById("statOnlineUsers");
    const roleGrid = document.getElementById("presenceRoleGrid");
    const body = document.getElementById("onlineUsersBody");
    const hint = document.getElementById("presenceSummaryHint");
    if (!countEl || !roleGrid || !body) return;

    const total = summary?.onlineCount || 0;
    countEl.textContent = String(total);

    const byRole = summary?.byRole || {};
    const roleEntries = Object.keys(byRole)
      .filter((role) => byRole[role] > 0)
      .sort((a, b) => byRole[b] - byRole[a]);

    roleGrid.innerHTML = roleEntries.length
      ? roleEntries
          .map(
            (role) => `
        <div class="ws-kpi">
          <strong>${byRole[role]}</strong>
          <span>${PRESENCE_ROLE_LABELS[role] || role}</span>
        </div>`
          )
          .join("")
      : '<p class="empty" style="margin:0;">Aucun utilisateur en ligne pour le moment.</p>';

    const users = Array.isArray(summary?.users) ? summary.users : [];
    if (!users.length) {
      body.innerHTML =
        '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:2rem;">Aucun utilisateur connecté actuellement.</td></tr>';
    } else {
      body.innerHTML = users
        .map((u) => {
          const campus = u.universite || "—";
          const section = [u.classe, u.filiere, u.sectionId].filter(Boolean).join(" · ") || "—";
          return `<tr>
            <td>${u.email || "—"}</td>
            <td>${u.roleLabel || u.role || "—"}</td>
            <td>${campus}</td>
            <td>${section}</td>
            <td>${formatPresenceTime(u.lastSeenAt)}</td>
          </tr>`;
        })
        .join("");
    }

    if (hint && summary?.updatedAt) {
      hint.textContent =
        total +
        " utilisateur(s) actif(s) sur la plateforme (signal reçu dans les " +
        (summary.windowSeconds || 90) +
        " dernières secondes). Dernière mise à jour : " +
        formatPresenceTime(summary.updatedAt) +
        ".";
    }
  }

  async function reloadPresence() {
    if (typeof SAC_API === "undefined" || typeof SAC_API.getAdminPresenceSummary !== "function") {
      return;
    }
    try {
      const online = await SAC_API.ensureOnline();
      if (!online) return;
      const summary = await SAC_API.getAdminPresenceSummary();
      renderPresenceSummary(summary);
    } catch (err) {
      console.warn("[SAC_ADMIN_PRESENCE]", err.message || err);
    }
  }

  function startPresencePolling() {
    stopPresencePolling();
    reloadPresence();
    presenceTimer = window.setInterval(reloadPresence, PRESENCE_REFRESH_MS);
  }

  function stopPresencePolling() {
    if (presenceTimer) {
      window.clearInterval(presenceTimer);
      presenceTimer = null;
    }
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
    const statSuperEl = document.getElementById("statSuper");
    if (statSuperEl && summary.superadminLimit != null) {
      statSuperEl.title =
        (summary.superadminCount ?? br.superadmin ?? 0) +
        " / " +
        summary.superadminLimit +
        " comptes Super Admin autorisés";
    }
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
        '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:2rem;">Aucun administrateur trouvé.</td></tr>';
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
          <td>${countryCell(a)}</td>
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
    institutionalSummaryCache = summary;
    renderKpis(summary);
    const q = document.getElementById("searchAdmins")?.value.trim().toLowerCase() || "";
    const roleFilter = document.getElementById("filterRole")?.value || "";
    const scoped = scopeAdminsForSession(admins, session);
    const filtered = filterAdmins(scoped, q, roleFilter);
    renderTable(filtered, session, isSuper);
    renderPreviewCards(admins, 5);
    const countEl = document.getElementById("tableCount");
    if (countEl) countEl.textContent = filtered.length + " compte(s)";
    applySuperadminCreateLimit();
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
      document.getElementById("tabTarifs")?.removeAttribute("hidden");
      document.getElementById("tabValidations")?.removeAttribute("hidden");
      document.getElementById("btnQuickTarifs")?.removeAttribute("hidden");
      document.getElementById("btnQuickValidations")?.removeAttribute("hidden");
      document.getElementById("section-create")?.classList.remove("ws-only-super-hidden");
      document.getElementById("section-tarifs")?.classList.remove("ws-only-super-hidden");
      document.getElementById("section-validations")?.classList.remove("ws-only-super-hidden");
      document.querySelectorAll(".ws-only-super-hidden").forEach((el) => el.classList.remove("ws-only-super-hidden"));
      document.querySelectorAll(".col-actions").forEach((c) => (c.style.display = ""));
      const hint = document.getElementById("listHint");
      if (hint) hint.textContent = "En tant que Super Admin, vous gérez tous les comptes institutionnels.";
    } else {
      document.getElementById("tabCreate")?.setAttribute("hidden", "hidden");
      document.querySelector('#filterRole option[value="superadmin"]')?.remove();
      const hint = document.getElementById("listHint");
      if (hint) {
        const countryLabel =
          session.countryCode && typeof SAC_AFRICA_COUNTRIES !== "undefined"
            ? SAC_AFRICA_COUNTRIES.label(session.countryCode)
            : "";
        hint.textContent = countryLabel
          ? "Ministère — " + countryLabel + " : comptes et campus de votre pays uniquement (lecture seule)."
          : "En tant que Ministère, consultation des administrateurs de votre pays (lecture seule).";
      }
    }

    if (isMinistere && session.countryCode && typeof SAC_AFRICA_COUNTRIES !== "undefined") {
      const profileMeta = document.getElementById("profileMeta");
      if (profileMeta) {
        profileMeta.textContent =
          session.identifiant + " · " + SAC_AFRICA_COUNTRIES.label(session.countryCode);
      }
    }

    if (isMinistere) {
      document.getElementById("tabLive")?.removeAttribute("hidden");
      document.getElementById("tabPublier")?.removeAttribute("hidden");
      document.getElementById("tabBibliotheque")?.removeAttribute("hidden");
      document.querySelectorAll(".ws-only-ministere-hidden").forEach((el) => {
        el.classList.remove("ws-only-ministere-hidden");
      });
      if (typeof SAC_LIBRARY !== "undefined") {
        SAC_LIBRARY.initMinistryPublisher(session, "libraryPublisherAccueil", { showList: false });
      }
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
    const ministereFields = document.getElementById("ministereFields");
    const superadminFields = document.getElementById("superadminFields");

    function splitFullName(full) {
      const parts = String(full || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (!parts.length) return { prenom: "", nom: "" };
      if (parts.length === 1) return { prenom: parts[0], nom: parts[0] };
      return { prenom: parts[0], nom: parts.slice(1).join(" ") };
    }

    function validateInstitutionalCreate(role, payload) {
      if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
        alert("Indiquez un e-mail valide.");
        return false;
      }
      if (typeof SAC_IDENTITY !== "undefined") {
        const pwdCheck = SAC_IDENTITY.validatePassword(payload.password);
        if (!pwdCheck.ok) {
          alert(pwdCheck.message);
          return false;
        }
      } else if (!payload.password || payload.password.length < 8) {
        alert("Mot de passe : minimum 8 caractères.");
        return false;
      }
      if (!payload.prenom || !payload.nom) {
        alert("Indiquez un nom complet (au moins 2 caractères).");
        return false;
      }
      if (payload.prenom.length < 2 || payload.nom.length < 2) {
        alert("Le nom du responsable doit contenir au moins 2 caractères.");
        return false;
      }
      if (payload.telephone && typeof SAC_IDENTITY !== "undefined") {
        const telCheck = SAC_IDENTITY.validatePhone(payload.telephone);
        if (!telCheck.ok) {
          alert(telCheck.message);
          return false;
        }
        payload.telephone = telCheck.value || payload.telephone;
      }
      return true;
    }

    function institutionalCreateErrorMessage(err) {
      const code = err?.code || "";
      const map = {
        INVALID_PHONE: "Numéro de téléphone invalide.",
        INVALID_PASSWORD: "Mot de passe : 8 caractères minimum, une lettre et un chiffre, sans espace.",
        INVALID_PROFILE: "Nom invalide — utilisez des lettres (prénom et nom).",
        EMAIL_EXISTS: "Cet e-mail est déjà utilisé. Connectez-vous ou utilisez « Mot de passe oublié ».",
        PHONE_EXISTS: "Ce numéro de téléphone est déjà lié à un compte.",
        IDENTITY_CONFLICT: "Cette identité est déjà enregistrée avec un autre rôle.",
        MULTI_ROLE: "Cette identité est déjà liée à un autre type de compte (étudiant, professeur…).",
        FORBIDDEN: "Accès refusé — connectez-vous en tant que Super Admin.",
        SUPERADMIN_LIMIT:
          "Limite atteinte : maximum 2 comptes Super Admin autorisés. Supprimez un compte existant pour en créer un autre.",
      };
      return map[code] || err?.message || "Création impossible.";
    }

    function setFieldRequired(ids, required) {
      ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.required = !!required;
      });
    }

    function syncRolePanelFields(role) {
      const panels = [
        { el: ministereFields, active: role === "ministere" },
        { el: superadminFields, active: role === "superadmin" },
        { el: uniFields, active: role === "universite" },
      ];
      panels.forEach(({ el, active }) => {
        if (!el) return;
        el.querySelectorAll("input, select, textarea").forEach((field) => {
          if (!active) {
            field.removeAttribute("required");
            field.disabled = true;
          } else {
            field.disabled = false;
          }
        });
      });
      setFieldRequired(["minEmail", "minPassword", "minNomComplet", "minCountry"], role === "ministere");
      setFieldRequired(["saEmail", "saPassword", "saNomComplet"], role === "superadmin");
      setFieldRequired(
        ["newEmail", "newPassword", "newPrenom", "newNom", "newTel", "newResponsable", "newCampusCatalog", "newCountry"],
        role === "universite"
      );
      const logoInput = document.getElementById("newLogoUniversite");
      if (logoInput) {
        logoInput.required = role === "universite";
        logoInput.disabled = role !== "universite";
      }
    }

    function updateCreateFormForRole() {
      const role = newRole?.value || "ministere";
      if (ministereFields) ministereFields.hidden = role !== "ministere";
      if (superadminFields) superadminFields.hidden = role !== "superadmin";
      if (uniFields) uniFields.hidden = role !== "universite";

      const logoInput = document.getElementById("newLogoUniversite");

      const pageDesc = document.getElementById("createPageDesc");
      const panelTitle = document.getElementById("createPanelTitle");
      const submitBtn = document.getElementById("btnCreateAdminSubmit");
      const copy = {
        ministere: {
          desc: "Compte portail ministère par pays — e-mail, mot de passe, pays et responsable habilité.",
          title: "Nouveau compte Ministère",
          submit: "Créer le compte Ministère",
        },
        superadmin: {
          desc: "Compte Super Admin SAC — gestion centrale de la plateforme.",
          title: "Nouveau compte Super Admin",
          submit: "Créer le compte Super Admin",
        },
        universite: {
          desc: "Compte DG / recteur — campus, sections faculté, logo et coordonnées.",
          title: "Nouveau compte Admin université",
          submit: "Créer le compte campus",
        },
      };
      const c = copy[role] || copy.ministere;
      if (pageDesc) pageDesc.textContent = c.desc;
      if (panelTitle) panelTitle.textContent = c.title;
      if (submitBtn) submitBtn.textContent = c.submit;

      if (role === "universite") {
        if (typeof SAC_UNIVERSITIES !== "undefined") {
          SAC_UNIVERSITIES.populateAll("#newCampusCatalog");
        }
        ensureAdminFacultySectionsList();
      } else {
        const list = document.getElementById("adminFacultySectionsList");
        if (list) list.innerHTML = "";
      }
      syncRolePanelFields(role);
      applySuperadminCreateLimit();
    }
    onCreateFormRoleChange = updateCreateFormForRole;

    function createAdminFacultySectionRow() {
      const row = document.createElement("div");
      row.className = "ws-section-row";
      row.innerHTML = `
        <input type="text" class="fi" data-sec="name" placeholder="Nom section / faculté *" />
        <input type="text" class="fi" data-sec="filiere" placeholder="Filière couverte *" />
        <input type="text" class="fi" data-sec="responsable" placeholder="Responsable *" />
        <button type="button" class="btn-remove-row" title="Supprimer">✕</button>`;
      row.querySelector(".btn-remove-row").addEventListener("click", () => {
        const list = document.getElementById("adminFacultySectionsList");
        if (list && list.children.length > 1) row.remove();
        else {
          row.querySelectorAll("input").forEach((inp) => {
            inp.value = "";
          });
        }
        validateAdminFacultySections();
      });
      row.querySelectorAll("input").forEach((inp) => {
        inp.addEventListener("input", validateAdminFacultySections);
      });
      return row;
    }

    function ensureAdminFacultySectionsList() {
      const list = document.getElementById("adminFacultySectionsList");
      if (list && !list.children.length) list.appendChild(createAdminFacultySectionRow());
    }

    function collectAdminFacultySections() {
      const list = document.getElementById("adminFacultySectionsList");
      if (!list) return [];
      return Array.from(list.querySelectorAll(".ws-section-row"))
        .map((row) => ({
          name: row.querySelector('[data-sec="name"]')?.value.trim() || "",
          filiere: row.querySelector('[data-sec="filiere"]')?.value.trim() || "",
          responsableNom: row.querySelector('[data-sec="responsable"]')?.value.trim() || "",
        }))
        .filter((s) => s.name && s.filiere && s.responsableNom);
    }

    function validateAdminFacultySections() {
      const sections = collectAdminFacultySections();
      let ok =
        sections.length > 0 &&
        sections.every((s) => s.responsableNom && s.responsableNom.length >= 2);
      let message = ok
        ? ""
        : sections.length
          ? "Chaque section doit avoir un nom, un domaine et un responsable nommé."
          : "Au moins une section est requise (un domaine = une section).";
      if (ok && typeof SAC_SECTIONS !== "undefined" && SAC_SECTIONS.validateUniqueDomains) {
        const domainCheck = SAC_SECTIONS.validateUniqueDomains(sections);
        if (!domainCheck.ok) {
          ok = false;
          message = domainCheck.message;
        }
      }
      const err = document.getElementById("adminFacultySectionsError");
      if (err) {
        err.hidden = ok;
        err.textContent = message;
      }
      return ok;
    }

    function resetAdminFacultySectionsList() {
      const list = document.getElementById("adminFacultySectionsList");
      if (!list) return;
      list.innerHTML = "";
      ensureAdminFacultySectionsList();
      validateAdminFacultySections();
    }

    document.getElementById("btnAddAdminFacultySection")?.addEventListener("click", () => {
      document.getElementById("adminFacultySectionsList")?.appendChild(createAdminFacultySectionRow());
    });

    newRole?.addEventListener("change", updateCreateFormForRole);

    function fillAdminCampusFromCatalog() {
      const sel = document.getElementById("newCampusCatalog");
      if (!sel || typeof SAC_UNIVERSITIES === "undefined") return;
      const id = sel.value;
      const u = SAC_UNIVERSITIES.getById(id);
      if (!u) {
        document.getElementById("newNomUniversite").value = "";
        document.getElementById("newSigle").value = "";
        document.getElementById("newCodeUni").value = "";
        return;
      }
      const year = new Date().getFullYear();
      document.getElementById("newNomUniversite").value = u.name;
      document.getElementById("newSigle").value = u.sigle;
      document.getElementById("newCodeUni").value = "SAC-" + u.sigle + "-" + year;
    }

    document.getElementById("newCampusCatalog")?.addEventListener("change", fillAdminCampusFromCatalog);

    if (typeof SAC_AFRICA_COUNTRIES !== "undefined") {
      const minCountry = document.getElementById("minCountry");
      const newCountry = document.getElementById("newCountry");
      if (minCountry) {
        minCountry.innerHTML = SAC_AFRICA_COUNTRIES.buildInstitutionCountrySelect("CD");
      }
      if (newCountry) {
        newCountry.innerHTML = SAC_AFRICA_COUNTRIES.buildInstitutionCountrySelect("CD");
        newCountry.addEventListener("change", () => {
          if (typeof SAC_UNIVERSITIES !== "undefined") {
            SAC_UNIVERSITIES.populateForCountry("#newCampusCatalog", newCountry.value);
          }
          fillAdminCampusFromCatalog();
        });
      }
    }

    if (typeof SAC_UNIVERSITIES !== "undefined") {
      const bootCountry = document.getElementById("newCountry")?.value || "CD";
      if (typeof SAC_UNIVERSITIES.populateForCountry === "function") {
        SAC_UNIVERSITIES.populateForCountry("#newCampusCatalog", bootCountry);
      } else {
        SAC_UNIVERSITIES.populateAll("#newCampusCatalog");
      }
    }

    if (typeof SAC_UNIVERSITY_LOGO !== "undefined") {
      SAC_UNIVERSITY_LOGO.bindPreviewInput(
        document.getElementById("newLogoUniversite"),
        document.getElementById("newLogoPreview")
      );
    }

    updateCreateFormForRole();

    const adminCatLegend = document.getElementById("adminSectionCategoriesLegend");
    if (adminCatLegend && typeof SAC_SECTIONS !== "undefined" && SAC_SECTIONS.sectionCategoriesLegendHtml) {
      adminCatLegend.innerHTML = SAC_SECTIONS.sectionCategoriesLegendHtml();
    }

    document.getElementById("formCreateAdmin")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!isSuper) {
        alert("Seul le Super Admin peut créer des comptes institutionnels.");
        return;
      }
      const role = newRole.value;
      let payload = { role };

      if (role === "ministere") {
        const full = document.getElementById("minNomComplet")?.value.trim() || "";
        const { prenom, nom } = splitFullName(full);
        if (!full || full.length < 3) {
          alert("Indiquez le nom complet du responsable.");
          return;
        }
        const countryCode = document.getElementById("minCountry")?.value?.trim() || "";
        if (!countryCode) {
          alert("Choisissez le pays du ministère.");
          return;
        }
        payload = {
          role,
          email: document.getElementById("minEmail")?.value.trim() || "",
          password: document.getElementById("minPassword")?.value || "",
          prenom,
          nom,
          telephone: "",
          fonction: document.getElementById("minFonction")?.value.trim() || "",
          countryCode,
        };
      } else if (role === "superadmin") {
        if (getSuperadminCount() >= MAX_SUPERADMIN_ACCOUNTS) {
          alert(
            "Limite atteinte : maximum " +
              MAX_SUPERADMIN_ACCOUNTS +
              " comptes Super Admin autorisés."
          );
          return;
        }
        const full = document.getElementById("saNomComplet")?.value.trim() || "";
        const { prenom, nom } = splitFullName(full);
        if (!full || full.length < 3) {
          alert("Indiquez le nom complet.");
          return;
        }
        payload = {
          role,
          email: document.getElementById("saEmail")?.value.trim() || "",
          password: document.getElementById("saPassword")?.value || "",
          prenom,
          nom,
          telephone: "",
        };
      } else if (role === "universite") {
        payload = {
          role,
          email: document.getElementById("newEmail").value.trim(),
          prenom: document.getElementById("newPrenom").value.trim(),
          nom: document.getElementById("newNom").value.trim(),
          telephone: SAC_IDENTITY.readPhone("newTel"),
          password: document.getElementById("newPassword").value,
        };
      }
      if (!validateInstitutionalCreate(role, payload)) return;
      if (role === "universite") {
        const catalogId = document.getElementById("newCampusCatalog")?.value;
        const uniCountry = document.getElementById("newCountry")?.value?.trim() || "";
        if (!uniCountry) {
          alert("Choisissez le pays de l'établissement.");
          return;
        }
        if (!catalogId) {
          alert("Choisissez l'établissement dans le catalogue SAC.");
          return;
        }
        if (typeof SAC_UNIVERSITIES !== "undefined") {
          const campusCountry = SAC_UNIVERSITIES.getCountryCode(catalogId);
          if (campusCountry && campusCountry !== uniCountry) {
            alert("L'établissement sélectionné n'appartient pas au pays choisi.");
            return;
          }
        }
        if (!validateAdminFacultySections()) {
          document.getElementById("adminFacultySectionsError")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          return;
        }
        const facultySections = collectAdminFacultySections();
        const campus = SAC_UNIVERSITIES.buildAdminCampusPayload(
          catalogId,
          document.getElementById("newResponsable").value.trim()
        );
        Object.assign(payload, campus, { facultySections, countryCode: uniCountry || campus.countryCode });
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
        const created = await SAC_INSTITUTIONAL.create(session, payload);
        if (
          role === "universite" &&
          payload.facultySections?.length &&
          typeof SAC_SECTIONS !== "undefined"
        ) {
          const uniCtx = {
            ...payload,
            ...created,
            email: payload.email,
            identifiant: payload.email,
            userId: created?.id || created?.email || payload.email,
          };
          SAC_SECTIONS.importSectionsForUniversity(uniCtx);
          if (typeof SAC_API !== "undefined" && SAC_API.seedInstitutionalFacultySections) {
            try {
              await SAC_API.seedInstitutionalFacultySections({
                universite: payload.universite || campus.universite,
                facultySections: payload.facultySections,
              });
            } catch (seedErr) {
              console.warn("[SAC_ADMIN] seedFacultySections:", seedErr.message || seedErr);
            }
          }
          if (typeof SAC_IDENTITY !== "undefined") {
            const users = SAC_IDENTITY.getLocalUsers();
            const key = SAC_IDENTITY.normalizeEmail(payload.email);
            const idx = users.findIndex(
              (u) => SAC_IDENTITY.normalizeEmail(u.email) === key && u.role === "universite"
            );
            if (idx >= 0) {
              users[idx].facultySections = payload.facultySections;
              localStorage.setItem("sac_users", JSON.stringify(users));
            }
          }
        }
        toast("Compte créé avec succès.");
        e.target.reset();
        updateCreateFormForRole();
        resetAdminFacultySectionsList();
        const logoPreview = document.getElementById("newLogoPreview");
        if (logoPreview) {
          logoPreview.innerHTML = "";
          logoPreview.hidden = true;
        }
        showSection("administrateurs");
        await refresh(session, isSuper);
        await reloadActivities();
      } catch (err) {
        alert(institutionalCreateErrorMessage(err));
      }
    });

    [
      "platformCdfRate",
      "platformFeeEtu",
      "platformFeeAssist",
      "platformFeeProf",
      "platformFeeUni",
    ].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", updatePlatformTariffHints);
    });

    document.getElementById("formPlatformTariffs")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!isSuper || typeof SAC_TARIFFS === "undefined") return;
      try {
        await SAC_TARIFFS.savePlatformSettings(session, {
          cdfPerUsd: parseFloat(document.getElementById("platformCdfRate").value),
          fees: {
            etudiant: { amount: parseFloat(document.getElementById("platformFeeEtu").value) },
            assistant: { amount: parseFloat(document.getElementById("platformFeeAssist").value) },
            professeur: { amount: parseFloat(document.getElementById("platformFeeProf").value) },
            universite: { amount: parseFloat(document.getElementById("platformFeeUni").value) },
          },
        });
        const msg = document.getElementById("platformTariffMsg");
        if (msg) {
          msg.textContent = "Tarifs enregistrés — visibles sur inscription et tous les profils.";
          msg.style.display = "inline";
          setTimeout(() => {
            msg.style.display = "none";
          }, 6000);
        }
        toast("Tarifs plateforme enregistrés.");
        await loadPlatformTariffForm(session);
      } catch (err) {
        alert(err.message || "Enregistrement impossible.");
      }
    });

    await refresh(session, isSuper);
    await reloadActivities();

    SAC_ADMIN_ACTIVITIES.bindToolbar({
      timelineId: "activitiesTimeline",
      selectAllId: "actSelectAll",
      deleteBtnId: "actDeleteSelected",
      onDeleted: async () => {
        await reloadActivities();
        toast("Entrée(s) supprimée(s) de l'historique.");
      },
    });

    if (isSuper) {
      startPresencePolling();
      loadPlatformTariffForm(session);
      if (typeof SAC_UNIVERSITIES !== "undefined") {
        SAC_UNIVERSITIES.populateAll("#validCampusFilter");
      }
      document.getElementById("validStatusFilter")?.addEventListener("change", renderPlatformValidations);
      document.getElementById("validCampusFilter")?.addEventListener("change", renderPlatformValidations);
      document.getElementById("btnRefreshValidations")?.addEventListener("click", renderPlatformValidations);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) stopPresencePolling();
        else startPresencePolling();
      });
    }

    if (isSuper && typeof SAC_PLATFORM_REGISTRY !== "undefined") {
      SAC_PLATFORM_REGISTRY.bindUnlock(session, showSection, toast);
    }

    return session;
  }

  return { init, showSection, toast };
})();

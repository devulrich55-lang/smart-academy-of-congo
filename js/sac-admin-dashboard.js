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
    developpeur: { label: "Développeur", icon: "👨‍💻" },
    techmanager: { label: "Tech Manager", icon: "🎯" },
  };
  const MAX_SUPERADMIN_ACCOUNTS = 2;
  let institutionalSummaryCache = null;
  /** Sync UI formulaire création — ne doit jamais rappeler applySuperadminCreateLimit. */
  let syncCreateFormUi = null;
  let createAdminFormHandler = null;
  let createFormBootstrapped = false;
  let createFormBootstrapFn = null;
  let suppressCreateFormRoleChange = false;
  let applySuperadminLimitDepth = 0;
  let updateCreateFormForRoleDepth = 0;

  function withSuppressedCreateFormRoleChange(fn) {
    suppressCreateFormRoleChange = true;
    try {
      return fn();
    } finally {
      suppressCreateFormRoleChange = false;
    }
  }

  function registerCreateAdminFormHandler(handler) {
    createAdminFormHandler = handler;
  }

  function bindCreateAdminFormEarly() {
    const form = document.getElementById("formCreateAdmin");
    const btn = document.getElementById("btnCreateAdminSubmit");
    const invokeCreate = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof createAdminFormHandler !== "function") {
        alert(
          "Le tableau de bord se charge encore…\n\nAttendez 2–3 secondes puis réessayez."
        );
        return;
      }
      await createAdminFormHandler(e);
    };
    if (form && !form.dataset.sacEarlyCreate) {
      form.dataset.sacEarlyCreate = "1";
      form.addEventListener("submit", invokeCreate, true);
    }
    if (btn) {
      btn.type = "button";
      if (!btn.dataset.sacEarlyCreate) {
        btn.dataset.sacEarlyCreate = "1";
        btn.addEventListener("click", invokeCreate);
      }
      if (btn.disabled && document.getElementById("newRole")?.value !== "superadmin") {
        btn.disabled = false;
      }
    }
  }

  function getSuperadminCount() {
    if (institutionalSummaryCache?.superadminCount != null) {
      return institutionalSummaryCache.superadminCount;
    }
    return institutionalSummaryCache?.byRole?.superadmin || 0;
  }

  function applySuperadminCreateLimit() {
    if (applySuperadminLimitDepth > 4) return;
    applySuperadminLimitDepth += 1;
    try {
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

    if (limitReached && newRole.value === "superadmin") {
      withSuppressedCreateFormRoleChange(() => {
        newRole.value = "ministere";
        if (typeof syncCreateFormUi === "function") {
          syncCreateFormUi("ministere");
        }
      });
    }

    withSuppressedCreateFormRoleChange(() => {
      if (superOption) superOption.disabled = limitReached;
    });

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
      if (newRole.value === "superadmin") {
        submitBtn.disabled = blockSuperForm;
      } else {
        submitBtn.disabled = false;
      }
    }
    } finally {
      applySuperadminLimitDepth -= 1;
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
    if (role === "developpeur") return '<span class="badge-dev">Développeur</span>';
    if (role === "techmanager") return '<span class="badge-tm">Tech Manager</span>';
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
      if (session?.role === "ministere" || session?.role === "superadmin") {
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
      if (session?.role === "ministere" || session?.role === "superadmin") {
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
    if (id === "sauvegarde") {
      loadBackupPanel();
    }
    if (id === "create" && typeof createFormBootstrapFn === "function") {
      createFormBootstrapFn();
    }
  }

  async function loadBackupPanel() {
    const statusHost = document.getElementById("backupStatusPanel");
    const tbody = document.getElementById("backupListBody");
    const countEl = document.getElementById("backupListCount");
    if (!statusHost || !tbody || typeof SAC_API.listBackups !== "function") return;

    statusHost.innerHTML = "<p class=\"page-desc\">Chargement…</p>";
    tbody.innerHTML =
      '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:2rem;">Chargement…</td></tr>';

    try {
      await SAC_API.ensureOnline(true);
      const data = await SAC_API.listBackups();
      const st = data.status || {};
      const backups = data.backups || [];
      const latest = st.latest;

      statusHost.innerHTML =
        "<ul class=\"ws-guide\">" +
        "<li><strong>Automatique</strong> — toutes les " +
        escHtml(st.intervalHours || 6) +
        " h</li>" +
        "<li><strong>Rétention</strong> — " +
        escHtml(st.retentionHours || 24) +
        " h (suppression auto)</li>" +
        "<li><strong>Archives</strong> — " +
        escHtml(st.totalBackups || 0) +
        " (" +
        escHtml(st.totalLabel || "0 o") +
        ")</li>" +
        "<li><strong>Base</strong> — " +
        escHtml(st.databaseBackend || "sqlite") +
        "</li>" +
        (latest
          ? "<li><strong>Dernière</strong> — " +
            escHtml((latest.createdAt || "").replace("T", " ").slice(0, 19)) +
            " (" +
            escHtml(latest.trigger === "auto" ? "auto" : "manuelle") +
            ")</li>"
          : "<li><strong>Dernière</strong> — aucune</li>") +
        (st.nextScheduledInHours != null
          ? "<li><strong>Prochaine auto</strong> — ~" + escHtml(st.nextScheduledInHours) + " h</li>"
          : "") +
        "</ul>";

      if (countEl) countEl.textContent = backups.length + " archive(s)";

      if (!backups.length) {
        tbody.innerHTML =
          '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:2rem;">Aucune sauvegarde — lancez une sauvegarde immédiate.</td></tr>';
        return;
      }

      tbody.innerHTML = backups
        .map(function (b) {
          const triggerLabel =
            b.trigger === "auto"
              ? "🔄 Auto"
              : b.trigger === "pre_restore"
                ? "🛡️ Pré-restauration"
                : "⚡ Manuelle";
          return (
            "<tr data-backup-id=\"" +
            escHtml(b.id) +
            "\">" +
            "<td>" +
            escHtml((b.createdAt || "").replace("T", " ").slice(0, 19)) +
            "</td>" +
            "<td>" +
            triggerLabel +
            "</td>" +
            "<td>" +
            escHtml(b.sizeLabel || "—") +
            "</td>" +
            "<td>" +
            escHtml(b.ageHours) +
            " h</td>" +
            "<td class=\"col-actions\">" +
            '<button type="button" class="btn btn--ghost btn--xs btn-backup-dl" data-id="' +
            escHtml(b.id) +
            '">⬇️</button> ' +
            '<button type="button" class="btn btn--role btn--xs btn-backup-restore" data-id="' +
            escHtml(b.id) +
            '">♻️ Restaurer</button>' +
            "</td></tr>"
          );
        })
        .join("");

      tbody.querySelectorAll(".btn-backup-dl").forEach(function (btn) {
        btn.addEventListener("click", function () {
          downloadBackupFile(btn.dataset.id);
        });
      });
      tbody.querySelectorAll(".btn-backup-restore").forEach(function (btn) {
        btn.addEventListener("click", function () {
          restoreBackupPrompt(btn.dataset.id);
        });
      });
    } catch (err) {
      statusHost.innerHTML =
        '<p class="page-desc" style="color:var(--danger,#b91c1c);">' + escHtml(err.message || "Erreur") + "</p>";
      tbody.innerHTML =
        '<tr><td colspan="5" style="text-align:center;color:var(--muted);">Impossible de charger les sauvegardes.</td></tr>';
    }
  }

  async function downloadBackupFile(backupId) {
    if (!backupId || typeof SAC_API.downloadBackup !== "function") return;
    try {
      toast("Téléchargement…");
      await SAC_API.downloadBackup(backupId);
    } catch (err) {
      alert(err.message || "Téléchargement impossible.");
    }
  }

  async function restoreBackupPrompt(backupId) {
    if (!backupId) return;
    const phrase = "RESTAURER-" + backupId;
    const typed = prompt(
      "ATTENTION — Cette action remplace la base et les fichiers uploads.\n\n" +
        "Saisissez exactement :\n" +
        phrase
    );
    if (typed !== phrase) {
      if (typed !== null) alert("Confirmation incorrecte — restauration annulée.");
      return;
    }
    if (
      !confirm(
        "Confirmer la restauration ? L'application reviendra à l'état de cette archive. Une sauvegarde de sécurité sera créée avant."
      )
    ) {
      return;
    }
    try {
      toast("Restauration en cours…");
      const result = await SAC_API.restoreBackup(backupId, phrase);
      alert(
        "Restauration terminée.\nSauvegarde de sécurité : " +
          (result.preRestoreBackupId || "—") +
          "\n\nRechargez la page."
      );
      loadBackupPanel();
    } catch (err) {
      alert(err.message || "Restauration impossible.");
    }
  }

  async function createBackupNow() {
    const btn = document.getElementById("btnBackupNow");
    if (typeof SAC_API.createBackupNow !== "function") {
      alert("Module sauvegarde absent — videz le cache (Ctrl+F5) puis réessayez.");
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Sauvegarde en cours…";
    }
    try {
      await SAC_API.ensureOnline(true);
      toast("Sauvegarde en cours — patientez…");
      const result = await SAC_API.createBackupNow();
      toast("Sauvegarde créée : " + (result.backup && result.backup.sizeLabel ? result.backup.sizeLabel : "OK"));
      await loadBackupPanel();
    } catch (err) {
      alert(err.message || "Sauvegarde impossible.");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "⚡ Sauvegarde immédiate";
      }
    }
  }

  async function purgeOldBackups() {
    if (!confirm("Supprimer toutes les archives de plus de 24 h ?")) return;
    try {
      const r = await SAC_API.purgeOldBackups();
      toast((r.count || 0) + " archive(s) supprimée(s).");
      loadBackupPanel();
    } catch (err) {
      alert(err.message || "Purge impossible.");
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

  function renderInstitutionalUnavailable(message) {
    const msg =
      message ||
      "Connexion au serveur en cours… Réessayez dans un instant ou vérifiez votre réseau.";
    const recent = document.getElementById("recentAdmins");
    if (recent && /Chargement/i.test(recent.textContent)) {
      recent.innerHTML = '<p class="empty" style="text-align:center;color:var(--muted);">' + msg + "</p>";
    }
    const body = document.getElementById("adminsBody");
    if (body && /Chargement/i.test(body.textContent)) {
      body.innerHTML =
        '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:2rem;">' +
        msg +
        "</td></tr>";
    }
  }

  function renderPresenceUnavailable(message) {
    const body = document.getElementById("onlineUsersBody");
    if (!body) return;
    body.innerHTML =
      '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:2rem;">' +
      (message || "Présence indisponible pour le moment.") +
      "</td></tr>";
  }

  async function loadDashboardData(session, isSuper) {
    try {
      await Promise.all([refresh(session, isSuper), reloadActivities()]);
      if (
        typeof SAC_ADMIN_ACTIVITIES !== "undefined" &&
        !SAC_ADMIN_ACTIVITIES.getActivities().length
      ) {
        await reloadActivities();
      }
    } catch (err) {
      console.warn("[SAC_ADMIN_DASHBOARD] load:", err.message || err);
      renderInstitutionalUnavailable(
        "Impossible de charger les données : " + (err.message || "erreur réseau") + "."
      );
    }
  }

  function renderActivitiesUnavailable(message, containerIds) {
    const html =
      '<p class="empty" style="padding:1.5rem;text-align:center;color:var(--muted);">' +
      message +
      "</p>";
    (containerIds || []).forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    });
  }

  async function reloadActivities() {
    if (typeof SAC_ADMIN_ACTIVITIES === "undefined") return;
    const { activities, summary, offline, error } = await SAC_ADMIN_ACTIVITIES.load();
    SAC_ADMIN_ACTIVITIES.renderSummary(summary, "act");
    const previewIds = ["recentActivitiesPreview"];
    if (offline && !activities.length) {
      renderActivitiesUnavailable(
        "Connexion au serveur en cours… Les activités s'afficheront dès que l'API sera disponible.",
        previewIds.concat(["activitiesTimeline"])
      );
      return;
    }
    if (error && !activities.length) {
      renderActivitiesUnavailable(
        "Impossible de charger le journal : " + error + ". Réessayez dans un instant.",
        previewIds.concat(["activitiesTimeline"])
      );
      return;
    }
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
      renderPresenceUnavailable("Service de présence indisponible.");
      return;
    }
    try {
      const online = await SAC_API.ensureOnline(false, { maxWaitMs: 15000 });
      const hasTokens =
        typeof SAC_API.hasAuthTokens === "function" && SAC_API.hasAuthTokens();
      if (!online && !hasTokens) {
        renderPresenceUnavailable(
          "Serveur en réveil… La présence s'affichera dès que l'API sera disponible."
        );
        return;
      }
      const summary = await SAC_API.getAdminPresenceSummary();
      renderPresenceSummary(summary);
    } catch (err) {
      console.warn("[SAC_ADMIN_PRESENCE]", err.message || err);
      renderPresenceUnavailable(
        "Impossible de charger la présence : " + (err.message || "erreur réseau") + "."
      );
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
      statDev: br.developpeur || 0,
      statTm: br.techmanager || 0,
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
    try {
      const { summary, admins, offline, error } = await SAC_INSTITUTIONAL.load(session);
      institutionalSummaryCache = summary;
      renderKpis(summary);
      const q = document.getElementById("searchAdmins")?.value.trim().toLowerCase() || "";
      const roleFilter = document.getElementById("filterRole")?.value || "";
      const scoped = scopeAdminsForSession(admins || [], session);
      const filtered = filterAdmins(scoped, q, roleFilter);
      renderTable(filtered, session, isSuper);
      renderPreviewCards(admins || [], 5);
      const countEl = document.getElementById("tableCount");
      if (countEl) countEl.textContent = filtered.length + " compte(s)";
      if (createFormBootstrapped) {
        queueMicrotask(() => applySuperadminCreateLimit());
      }
      if (offline && !(admins || []).length && !summary) {
        renderInstitutionalUnavailable();
      } else if (error && !(admins || []).length) {
        renderInstitutionalUnavailable("Erreur serveur : " + error + ".");
      }
    } catch (err) {
      console.warn("[SAC_ADMIN_DASHBOARD] refresh:", err.message || err);
      renderInstitutionalUnavailable("Erreur : " + (err.message || "chargement impossible") + ".");
    }
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

    function blockNativeCreateFormReload() {
      const form = document.getElementById("formCreateAdmin");
      const btn = document.getElementById("btnCreateAdminSubmit");
      if (form && !form.dataset.sacBound) {
        form.dataset.sacBound = "1";
        form.addEventListener(
          "submit",
          (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
          },
          true
        );
      }
      if (btn) btn.type = "button";
    }
    blockNativeCreateFormReload();
    bindCreateAdminFormEarly();

    if (
      isSuper &&
      typeof SAC_API !== "undefined" &&
      SAC_API.ensureWritableApiSession &&
      (SAC_API.isRenderFrontend?.() || SAC_API.isCrossOriginApi?.())
    ) {
      SAC_API.ensureWritableApiSession()
        .then((apiReady) => {
          if (apiReady) return;
          const banner = document.getElementById("apiStorageBanner");
          if (banner) {
            banner.hidden = false;
            banner.textContent =
              "Session API expirée — reconnectez-vous via le portail Super Admin pour créer des comptes.";
          }
        })
        .catch(() => {});
    }

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

    const dashboardDataReady = loadDashboardData(session, isSuper);
    if (isSuper) startPresencePolling();

    if (isSuper && typeof SAC_API !== "undefined" && SAC_API.getApiStorageHealth) {
      SAC_API.getApiStorageHealth()
        .then((storage) => {
          const banner = document.getElementById("apiStorageBanner");
          if (!banner || !storage) return;
          const ephemeral =
            storage.mode === "sqlite-ephemeral" ||
            storage.persistentOnRenderDisk === false;
          if (ephemeral) banner.hidden = false;
        })
        .catch(() => {});
    }

    if (isSuper) {
      document.getElementById("tabCreate")?.removeAttribute("hidden");
      document.getElementById("tabTarifs")?.removeAttribute("hidden");
      document.getElementById("tabValidations")?.removeAttribute("hidden");
      document.getElementById("tabSauvegarde")?.removeAttribute("hidden");
      document.getElementById("btnQuickTarifs")?.removeAttribute("hidden");
      document.getElementById("btnQuickValidations")?.removeAttribute("hidden");
      document.getElementById("btnQuickSauvegarde")?.removeAttribute("hidden");
      document.getElementById("section-create")?.classList.remove("ws-only-super-hidden");
      document.getElementById("section-tarifs")?.classList.remove("ws-only-super-hidden");
      document.getElementById("section-validations")?.classList.remove("ws-only-super-hidden");
      document.getElementById("section-sauvegarde")?.classList.remove("ws-only-super-hidden");
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

    if (isMinistere || isSuper) {
      document.getElementById("tabBibliotheque")?.removeAttribute("hidden");
      document.getElementById("btnQuickBibliotheque")?.removeAttribute("hidden");
      document.getElementById("section-bibliotheque")?.classList.remove("ws-only-ministere-hidden");
      document.getElementById("ministryLibraryAccueil")?.classList.remove("ws-only-ministere-hidden");
    }

    if (isMinistere) {
      document.getElementById("tabLive")?.removeAttribute("hidden");
      document.getElementById("tabPublier")?.removeAttribute("hidden");
      document.getElementById("btnQuickPublier")?.removeAttribute("hidden");
      document.getElementById("btnQuickLive")?.removeAttribute("hidden");
      document.querySelectorAll(".ws-only-ministere-hidden").forEach((el) => {
        el.classList.remove("ws-only-ministere-hidden");
      });
    }

    if (isMinistere || isSuper) {
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

    if (isSuper && typeof SAC_PLATFORM_REGISTRY !== "undefined") {
      SAC_PLATFORM_REGISTRY.bindUnlock(session, showSection, toast);
    }

    const onFilter = () => refresh(session, isSuper);
    document.getElementById("searchAdmins")?.addEventListener("input", onFilter);
    document.getElementById("filterRole")?.addEventListener("change", onFilter);

    const newRole = document.getElementById("newRole");
    const uniFields = document.getElementById("uniFields");
    const ministereFields = document.getElementById("ministereFields");
    const superadminFields = document.getElementById("superadminFields");
    const developpeurFields = document.getElementById("developpeurFields");
    const techmanagerFields = document.getElementById("techmanagerFields");

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
        INVALID_EMAIL:
          "E-mail institutionnel invalide. Utilisez une adresse réelle (ex. agent@mesu.gouv.cd). Les adresses jetables sont refusées.",
        EMAIL_EXISTS: "Cet e-mail est déjà utilisé. Connectez-vous ou utilisez « Mot de passe oublié ».",
        MINISTRY_COUNTRY_EXISTS:
          "Un compte Ministère existe déjà pour ce pays. Supprimez l'ancien compte ou réessayez (mise à jour automatique si l'API est à jour).",
        UNIVERSITY_CAMPUS_EXISTS:
          "Un administrateur existe déjà pour cet établissement. Supprimez-le dans la liste des administrateurs avant d'en créer un nouveau.",
        INVALID_COUNTRY: "Pays invalide — choisissez un pays partenaire dans la liste.",
        AUTH_REQUIRED: "Session expirée — reconnectez-vous via le portail Super Admin puis réessayez.",
        PHONE_EXISTS: "Ce numéro de téléphone est déjà lié à un compte.",
        IDENTITY_CONFLICT: "Cette identité est déjà enregistrée avec un autre rôle.",
        MULTI_ROLE: "Cette identité est déjà liée à un autre type de compte (étudiant, professeur…).",
        FORBIDDEN: "Accès refusé — connectez-vous en tant que Super Admin.",
        SUPERADMIN_LIMIT:
          "Limite atteinte : maximum 2 comptes Super Admin autorisés. Supprimez un compte existant pour en créer un autre.",
        DB_ROLE_CONSTRAINT:
          "La base de données n'accepte pas encore ce rôle — redéployez l'API (API-1 sur Render) puis réessayez.",
        CREATE_FAILED: "Le serveur n'a pas confirmé la création du compte. Vérifiez les logs API.",
        CREATE_NOT_PERSISTED:
          "Le compte n'apparaît pas sur le serveur — l'API Render doit utiliser un disque persistant (/data). Reconnectez-vous puis réessayez.",
        PAYLOAD_TOO_LARGE:
          "Données trop volumineuses (logo) — réduisez l'image ou créez le compte sans logo.",
        RATE_LIMITED: "Trop de tentatives — attendez quelques minutes puis réessayez.",
        THROTTLED: "Trafic ralenti — attendez 30 secondes puis réessayez.",
        IP_BLOCKED: "Accès bloqué temporairement par le bouclier sécurité — réessayez plus tard.",
        INVALID_PAYLOAD: "Données rejetées — évitez les caractères spéciaux dans le mot de passe.",
      };
      const base = map[code] || err?.message || "Création impossible.";
      if (err?.status && !map[code] && err?.message) {
        return base + " (HTTP " + err.status + ")";
      }
      return base;
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
        { el: developpeurFields, active: role === "developpeur" },
        { el: techmanagerFields, active: role === "techmanager" },
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
      setFieldRequired(["devEmail", "devPassword", "devNomComplet"], role === "developpeur");
      setFieldRequired(["tmEmail", "tmPassword", "tmNomComplet"], role === "techmanager");
      setFieldRequired(
        ["newEmail", "newPassword", "newPrenom", "newNom", "newResponsable", "newCampusCatalog", "newCountry"],
        role === "universite"
      );
      const telInput = document.getElementById("newTel");
      if (telInput) {
        telInput.required = false;
        telInput.disabled = role !== "universite";
      }
      const logoInput = document.getElementById("newLogoUniversite");
      if (logoInput) {
        logoInput.required = false;
        logoInput.disabled = role !== "universite";
      }
    }

    function syncCreateFormForRole(forcedRole) {
      const role = forcedRole || newRole?.value || "ministere";
      if (ministereFields) ministereFields.hidden = role !== "ministere";
      if (superadminFields) superadminFields.hidden = role !== "superadmin";
      if (developpeurFields) developpeurFields.hidden = role !== "developpeur";
      if (techmanagerFields) techmanagerFields.hidden = role !== "techmanager";
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
          desc: "Compte Super Admin EvoSU — gestion centrale de la plateforme.",
          title: "Nouveau compte Super Admin",
          submit: "Créer le compte Super Admin",
        },
        universite: {
          desc: "Compte DG / recteur — pays, campus, sections faculté, logo et coordonnées.",
          title: "Nouveau compte Admin université",
          submit: "Créer le compte campus",
        },
        developpeur: {
          desc: "Compte Dev Center — accès tickets AI Ops et espace de travail développeur.",
          title: "Nouveau compte Développeur",
          submit: "Créer le compte développeur",
        },
        techmanager: {
          desc: "Responsable technique — attribution, validation et stats équipe via Tech Manager.",
          title: "Nouveau compte Tech Manager",
          submit: "Créer le compte Tech Manager",
        },
      };
      const c = copy[role] || copy.ministere;
      if (pageDesc) pageDesc.textContent = c.desc;
      if (panelTitle) panelTitle.textContent = c.title;
      if (submitBtn) submitBtn.textContent = c.submit;

      if (role === "universite") {
        const country = document.getElementById("newCountry")?.value || "CD";
        if (typeof SAC_UNIVERSITIES !== "undefined") {
          if (typeof SAC_UNIVERSITIES.populateForCountry === "function") {
            SAC_UNIVERSITIES.populateForCountry("#newCampusCatalog", country);
          } else {
            SAC_UNIVERSITIES.populateAll("#newCampusCatalog");
          }
        }
        ensureAdminFacultySectionsList();
      } else {
        const list = document.getElementById("adminFacultySectionsList");
        if (list) list.innerHTML = "";
      }
      syncRolePanelFields(role);
    }

    function updateCreateFormForRole() {
      if (suppressCreateFormRoleChange) return;
      if (updateCreateFormForRoleDepth > 4) return;
      updateCreateFormForRoleDepth += 1;
      try {
        syncCreateFormForRole();
        applySuperadminCreateLimit();
      } finally {
        updateCreateFormForRoleDepth -= 1;
      }
    }
    syncCreateFormUi = syncCreateFormForRole;
    createFormBootstrapFn = function bootstrapCreateFormIfNeeded() {
      if (createFormBootstrapped) {
        queueMicrotask(() => applySuperadminCreateLimit());
        return;
      }
      createFormBootstrapped = true;
      queueMicrotask(() => updateCreateFormForRole());
    };

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
      let ok = true;
      let message = "";
      if (sections.length) {
        ok = sections.every((s) => s.responsableNom && s.responsableNom.length >= 2);
        message = ok
          ? ""
          : "Chaque section doit avoir un nom, un domaine et un responsable nommé.";
        if (ok && typeof SAC_SECTIONS !== "undefined" && SAC_SECTIONS.validateUniqueDomains) {
          const domainCheck = SAC_SECTIONS.validateUniqueDomains(sections);
          if (!domainCheck.ok) {
            ok = false;
            message = domainCheck.message;
          }
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
      document.getElementById("newCodeUni").value = "EvoSU-" + u.sigle + "-" + year;
    }

    function initInstitutionCountrySelects() {
      if (typeof SAC_AFRICA_COUNTRIES === "undefined") return;
      const minCountry = document.getElementById("minCountry");
      const newCountry = document.getElementById("newCountry");
      if (minCountry && !minCountry.dataset.sacReady) {
        minCountry.innerHTML = SAC_AFRICA_COUNTRIES.buildInstitutionCountrySelect("CD");
        minCountry.dataset.sacReady = "1";
      }
      if (newCountry && !newCountry.dataset.sacReady) {
        newCountry.innerHTML = SAC_AFRICA_COUNTRIES.buildInstitutionCountrySelect("CD");
        newCountry.dataset.sacReady = "1";
        newCountry.addEventListener("change", () => {
          if (typeof SAC_UNIVERSITIES !== "undefined" && typeof SAC_UNIVERSITIES.populateForCountry === "function") {
            SAC_UNIVERSITIES.populateForCountry("#newCampusCatalog", newCountry.value);
          }
          fillAdminCampusFromCatalog();
        });
      }
    }

    document.getElementById("newCampusCatalog")?.addEventListener("change", fillAdminCampusFromCatalog);

    initInstitutionCountrySelects();

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

    const adminCatLegend = document.getElementById("adminSectionCategoriesLegend");
    if (adminCatLegend && typeof SAC_SECTIONS !== "undefined" && SAC_SECTIONS.sectionCategoriesLegendHtml) {
      adminCatLegend.innerHTML = SAC_SECTIONS.sectionCategoriesLegendHtml();
    }

    async function handleCreateAdminFormSubmit(e, session, isSuper) {
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
          country_code: countryCode,
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
      } else if (role === "developpeur") {
        const full = document.getElementById("devNomComplet")?.value.trim() || "";
        const { prenom, nom } = splitFullName(full);
        if (!full || full.length < 3) {
          alert("Indiquez le nom complet du développeur.");
          return;
        }
        payload = {
          role,
          email: document.getElementById("devEmail")?.value.trim() || "",
          password: document.getElementById("devPassword")?.value || "",
          prenom,
          nom,
          telephone: "",
          fonction: document.getElementById("devFonction")?.value.trim() || "Développeur EvoSU",
        };
      } else if (role === "techmanager") {
        const full = document.getElementById("tmNomComplet")?.value.trim() || "";
        const { prenom, nom } = splitFullName(full);
        if (!full || full.length < 3) {
          alert("Indiquez le nom complet du responsable technique.");
          return;
        }
        payload = {
          role,
          email: document.getElementById("tmEmail")?.value.trim() || "",
          password: document.getElementById("tmPassword")?.value || "",
          prenom,
          nom,
          telephone: "",
          fonction: "Responsable technique EvoSU",
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
      } else {
        alert("Type de compte non pris en charge.");
        return;
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
          alert("Choisissez l'établissement dans le catalogue EvoSU.");
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
        let facultySections = collectAdminFacultySections();
        const responsable = document.getElementById("newResponsable").value.trim();
        if (!facultySections.length && responsable.length >= 3) {
          facultySections = [
            {
              name: "Administration générale",
              filiere: "Général",
              responsableNom: responsable,
            },
          ];
        }
        const campus = SAC_UNIVERSITIES.buildAdminCampusPayload(
          catalogId,
          responsable
        );
        Object.assign(payload, campus, {
          facultySections,
          countryCode: uniCountry || campus.countryCode,
          country_code: uniCountry || campus.countryCode,
        });
        const logoFile = document.getElementById("newLogoUniversite")?.files?.[0];
        if (logoFile) {
          try {
            const dataUrl = await SAC_UNIVERSITY_LOGO.fileToDataUrl(logoFile);
            if (dataUrl.length > 480000) {
              const skipLogo = confirm(
                "Le logo est trop volumineux pour l'envoi en une fois.\n\n" +
                  "Créer le compte sans logo maintenant ? (vous pourrez l'ajouter plus tard)"
              );
              if (!skipLogo) return;
            } else {
              payload.logoUrl = dataUrl;
            }
          } catch (logoErr) {
            alert(logoErr.message || "Logo invalide.");
            return;
          }
        }
      }
      const submitBtn = document.getElementById("btnCreateAdminSubmit");
      const submitBusy = submitBtn?.textContent || "Créer";
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Enregistrement…";
      }
      try {
        if (typeof SAC_API !== "undefined") {
          if (SAC_API.ensureOnline) {
            const online = await SAC_API.ensureOnline(true, { maxWaitMs: 60000 });
            if (!online && !(typeof SAC_API.hasAuthTokens === "function" && SAC_API.hasAuthTokens())) {
              throw new Error("Serveur injoignable — attendez le réveil de l'API puis réessayez.");
            }
          }
          if (SAC_API.ensureWritableApiSession) {
            const sessionOk = await SAC_API.ensureWritableApiSession();
            if (!sessionOk) {
              const err = new Error("Session expirée — reconnectez-vous via le portail Super Admin.");
              err.code = "AUTH_REQUIRED";
              throw err;
            }
          }
        }
        const created = await SAC_INSTITUTIONAL.create(session, payload);
        if (!created?.email || !created?.verified) {
          throw new Error("Le compte n'a pas été enregistré sur le serveur.");
        }
        const createdEmail = created.email;
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
        toast(
          created?.logoOmitted
            ? "Compte créé (logo omis — image trop volumineuse)."
            : created?.updated
              ? "Compte mis à jour."
              : "Compte créé avec succès."
        );
        document.getElementById("formCreateAdmin")?.reset();
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
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = submitBusy;
        }
      }
    }

    registerCreateAdminFormHandler((e) => handleCreateAdminFormSubmit(e, session, isSuper));
    bindCreateAdminFormEarly();

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

    await dashboardDataReady;

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
      loadPlatformTariffForm(session);
      if (typeof SAC_UNIVERSITIES !== "undefined") {
        SAC_UNIVERSITIES.populateAll("#validCampusFilter");
      }
      document.getElementById("validStatusFilter")?.addEventListener("change", renderPlatformValidations);
      document.getElementById("validCampusFilter")?.addEventListener("change", renderPlatformValidations);
      document.getElementById("btnRefreshValidations")?.addEventListener("click", renderPlatformValidations);
      document.getElementById("btnBackupNow")?.addEventListener("click", createBackupNow);
      document.getElementById("btnBackupPurge")?.addEventListener("click", purgeOldBackups);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) stopPresencePolling();
        else startPresencePolling();
      });
    }

    return session;
  }

  return { init, showSection, toast, bindCreateAdminFormEarly };
})();

if (typeof document !== "undefined") {
  const bootCreateForm = () => SAC_ADMIN_DASHBOARD.bindCreateAdminFormEarly();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootCreateForm);
  } else {
    bootCreateForm();
  }
}

/**
 * Validation des inscriptions étudiant / professeur / assistant — délai 24 h.
 */
const SAC_SECTION_APPROVAL = (function () {
  const ROLES = ["etudiant", "professeur", "assistant"];
  const STUDENT_ROLES = ["etudiant"];
  const STAFF_ROLES = ["professeur", "assistant"];
  const WAIT_HOURS = 24;

  const STATUS = {
    pending: "pending",
    approved: "approved",
    rejected: "rejected",
  };

  const GRADE_LABELS = {
    professeur: "Professeur ordinaire",
    professeur_ordinaire: "Professeur ordinaire",
    associe: "Professeur associé",
    professeur_associe: "Professeur associé",
  };

  const FONCTION_LABELS = {
    assistant: "Assistant",
    chef_travaux: "Chef de travaux",
  };

  function requiresApproval(role) {
    return ROLES.includes(String(role || "").trim());
  }

  function getStatus(userOrSession) {
    if (!userOrSession) return STATUS.approved;
    if (!requiresApproval(userOrSession.role)) return STATUS.approved;
    const raw = userOrSession.sectionApproval;
    if (raw === STATUS.approved || raw === STATUS.rejected || raw === STATUS.pending) {
      return raw;
    }
    if (userOrSession.sectionApprovalRequestedAt) return STATUS.pending;
    if (userOrSession.payment) return STATUS.pending;
    return STATUS.approved;
  }

  function isApproved(userOrSession) {
    return getStatus(userOrSession) === STATUS.approved;
  }

  function isPending(userOrSession) {
    return getStatus(userOrSession) === STATUS.pending;
  }

  function isRejected(userOrSession) {
    return getStatus(userOrSession) === STATUS.rejected;
  }

  function markPending(profile) {
    if (!requiresApproval(profile?.role)) return profile;
    profile.sectionApproval = STATUS.pending;
    profile.sectionApprovalRequestedAt =
      profile.sectionApprovalRequestedAt || new Date().toISOString();
    return profile;
  }

  function markApproved(profile, sectionSession) {
    profile.sectionApproval = STATUS.approved;
    profile.sectionApprovedAt = new Date().toISOString();
    profile.sectionApprovedBy =
      sectionSession?.identifiant || sectionSession?.userId || null;
    if (sectionSession?.sectionId && !profile.sectionId) {
      profile.sectionId = sectionSession.sectionId;
    }
    if (sectionSession?.sectionName && !profile.sectionName) {
      profile.sectionName = sectionSession.sectionName;
    }
    if (
      profile.role === "etudiant" &&
      typeof SAC_SECTIONS !== "undefined" &&
      SAC_SECTIONS.linkStudentToSection
    ) {
      SAC_SECTIONS.linkStudentToSection(profile);
    }
    return profile;
  }

  function userFilieres(user) {
    const out = [];
    if (user?.filiere) out.push(String(user.filiere).trim().toLowerCase());
    (user?.coursClasses || []).forEach((c) => {
      if (c?.filiere) out.push(String(c.filiere).trim().toLowerCase());
    });
    return [...new Set(out.filter(Boolean))];
  }

  function filiereMatches(a, b) {
    if (typeof SAC_SECTIONS !== "undefined" && SAC_SECTIONS.filiereMatches) {
      return SAC_SECTIONS.filiereMatches(a, b);
    }
    if (!a || !b) return false;
    const na = String(a).trim().toLowerCase();
    const nb = String(b).trim().toLowerCase();
    return na === nb || na.includes(nb) || nb.includes(na);
  }

  function universiteMatches(a, b) {
    if (typeof SAC_SECTIONS !== "undefined" && SAC_SECTIONS.universiteMatches) {
      return SAC_SECTIONS.universiteMatches(a, b);
    }
    return String(a || "") === String(b || "");
  }

  function isRector(session) {
    return (
      session?.role === "section" &&
      (session.sectionKind === "recteur" || session.isRector === true)
    );
  }

  function resolveSectionActor(sectionSession) {
    if (!sectionSession) return sectionSession;
    const actor = { ...sectionSession };
    if (typeof SAC_NOMINATIONS !== "undefined" && SAC_NOMINATIONS.buildSectionHeadActor) {
      const built = SAC_NOMINATIONS.buildSectionHeadActor(sectionSession);
      if (built) return built;
    }
    if (typeof SAC_SECTIONS === "undefined") return actor;
    let meta = actor.sectionId ? SAC_SECTIONS.getSectionById(actor.sectionId) : null;
    if (!meta && SAC_SECTIONS.getSectionsByUniversity) {
      const list = SAC_SECTIONS.getSectionsByUniversity(actor).filter((s) => s.active !== false);
      meta =
        list.find((s) => s.filiere && actor.filiere && filiereMatches(s.filiere, actor.filiere)) ||
        list[0] ||
        null;
      if (meta && !actor.sectionId) {
        actor.sectionId = meta.id;
        actor.sectionName = meta.name;
      }
    }
    if (meta) {
      actor.filiere = actor.filiere || meta.filiere;
      actor.sectionName = actor.sectionName || meta.name;
      actor.universite = actor.universite || meta.universite;
    }
    return actor;
  }

  function repairStudentCampus(user) {
    if (
      user?.role === "etudiant" &&
      typeof SAC_IDENTITY !== "undefined" &&
      SAC_IDENTITY.repairUserCampus
    ) {
      return SAC_IDENTITY.repairUserCampus(user);
    }
    return user;
  }

  async function syncPendingStudentsFromApi(sectionSession) {
    if (typeof SAC_API === "undefined" || typeof SAC_SECTION_ACCOUNTS === "undefined") return;
    let online = false;
    try {
      online = await SAC_API.ensureOnline();
    } catch {
      return;
    }
    if (!online) return;
    try {
      const apiStudents = await SAC_API.listSectionStudents();
      const actor = resolveSectionActor(sectionSession);
      (apiStudents || []).forEach((raw) => {
        let u = repairStudentCampus({ ...raw });
        if (u.role !== "etudiant") return;
        if (!matchesStudentSection(u, actor)) return;
        if (getStatus(u) !== STATUS.pending) return;
        mirrorLocalUser({
          ...u,
          sectionApproval: STATUS.pending,
          sectionApprovalRequestedAt:
            u.sectionApprovalRequestedAt || u.createdAt || new Date().toISOString(),
        });
      });
    } catch (err) {
      console.warn("[SAC_SECTION_APPROVAL] sync API étudiants:", err.message || err);
    }
  }

  async function syncPendingStaffFromApi() {
    /* réservé — pas d'endpoint staff dédié pour l'instant */
  }

  function matchesStudentSection(user, sectionSession) {
    if (typeof SAC_SECTIONS !== "undefined" && SAC_SECTIONS.studentMatchesSection) {
      return SAC_SECTIONS.studentMatchesSection(user, sectionSession);
    }
    if (!user || user.role !== "etudiant" || !sectionSession) return false;
    if (!universiteMatches(user.universite, sectionSession.universite)) return false;
    const sectionId = sectionSession.sectionId;
    if (sectionId && user.sectionId === sectionId) return true;
    const sf = String(sectionSession.filiere || "")
      .trim()
      .toLowerCase();
    if (!sf) return false;
    return userFilieres(user).some((uf) => filiereMatches(uf, sf));
  }

  function matchesStaffSection(user, sectionSession) {
    if (!user || !STAFF_ROLES.includes(user.role) || !sectionSession) return false;
    if (!universiteMatches(user.universite, sectionSession.universite)) return false;
    if (user.role === "assistant") {
      const sf = String(sectionSession.filiere || "")
        .trim()
        .toLowerCase();
      const ufs = userFilieres(user);
      if (!sf || !ufs.length) return true;
      return ufs.some((uf) => filiereMatches(uf, sf));
    }
    const sectionId = sectionSession.sectionId;
    if (sectionId && user.sectionId === sectionId) return true;
    const sf = String(sectionSession.filiere || "")
      .trim()
      .toLowerCase();
    if (!sf) return false;
    return userFilieres(user).some((uf) => filiereMatches(uf, sf));
  }

  function matchesSection(user, sectionSession) {
    if (user?.role === "etudiant") return matchesStudentSection(user, sectionSession);
    if (STAFF_ROLES.includes(user?.role)) return matchesStaffSection(user, sectionSession);
    return false;
  }

  function requestedAt(user) {
    const raw =
      user?.sectionApprovalRequestedAt ||
      user?.createdAt ||
      user?.sectionApprovalAt ||
      null;
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function deadlineAt(user) {
    const start = requestedAt(user);
    if (!start) return null;
    return new Date(start.getTime() + WAIT_HOURS * 60 * 60 * 1000);
  }

  function hoursSinceRequest(user) {
    const start = requestedAt(user);
    if (!start) return null;
    return (Date.now() - start.getTime()) / (60 * 60 * 1000);
  }

  function hoursRemaining(user) {
    const h = hoursSinceRequest(user);
    if (h == null) return WAIT_HOURS;
    return Math.max(0, WAIT_HOURS - h);
  }

  function formatHoursRemaining(user) {
    const left = hoursRemaining(user);
    if (left <= 0) return "délai de 24 h dépassé";
    const hours = Math.floor(left);
    const mins = Math.floor((left - hours) * 60);
    if (hours <= 0) return mins + " min restante(s)";
    return hours + " h " + (mins ? mins + " min" : "") + " restante(s)";
  }

  function getWaitPageContent(role, opts) {
    const status = opts?.status || "pending";
    const source = opts?.source || "register";
    const r = String(role || "etudiant").trim();

    if (status === "rejected") {
      return {
        icon: "✕",
        title: "Inscription refusée",
        lead:
          r === "etudiant"
            ? "Votre inscription étudiant n'a pas été acceptée par votre section."
            : r === "professeur"
              ? "Votre inscription professeur n'a pas été acceptée par votre section."
              : "Votre inscription assistant n'a pas été acceptée.",
        detailHtml:
          "Contactez le <strong>chef de section de votre filière</strong> ou l'administration de votre université pour plus d'informations.",
        hint:
          "Si vous pensez qu'il s'agit d'une erreur, présentez-vous à la section avec votre dossier ou contactez le support.",
        showDossier: false,
      };
    }

    if (r === "etudiant") {
      const dossierHtml =
        "<ul style=\"margin:0.75rem 0 0;padding-left:1.2rem;line-height:1.6;\">" +
        "<li>Pièce d'identité ou passeport</li>" +
        "<li>Attestation ou bulletins de l'année précédente</li>" +
        "<li>Reçu ou preuve de paiement des frais d'inscription</li>" +
        "<li>Tout document exigé par votre faculté / filière</li>" +
        "</ul>";
      if (source === "login") {
        return {
          icon: "📋",
          title: "Compte non activé — action requise",
          lead:
            "Votre compte étudiant est enregistré mais vous ne pouvez pas encore accéder à votre espace.",
          detailHtml:
            "Vous devez vous <strong>présenter physiquement à la section de votre filière</strong> avec votre " +
            "<strong>dossier complet</strong> pour la validation de votre inscription, " +
            "<strong>dans un délai de 24 heures</strong> à compter de votre demande." +
            dossierHtml,
          hint:
            "Le chef de section vérifiera votre dossier puis activera votre compte. Reconnectez-vous ensuite avec votre e-mail et mot de passe.",
          showDossier: true,
        };
      }
      return {
        icon: "✅",
        title: "Inscription enregistrée — prochaine étape",
        lead: "Merci ! Votre inscription étudiant et votre paiement ont bien été enregistrés.",
        detailHtml:
          "Présentez-vous à la <strong>section de votre filière</strong> avec votre " +
          "<strong>dossier complet</strong> sous <strong>24 heures</strong> pour finaliser la validation." +
          dossierHtml,
        hint:
          "Sans validation par le chef de section dans ce délai, votre accès au tableau de bord restera fermé.",
        showDossier: true,
      };
    }

    if (r === "professeur") {
      const waitDetail =
        source === "login"
          ? "Votre compte professeur est enregistré mais pas encore activé."
          : "Votre inscription professeur et votre paiement ont bien été enregistrés.";
      return {
        icon: "⏳",
        title: source === "login" ? "Compte en attente de validation" : "Inscription enregistrée — en attente",
        lead: waitDetail,
        detailHtml:
          "Le <strong>chef de section de votre filière</strong> doit valider votre inscription. " +
          "Il vous suffit d'<strong>attendre</strong> : <strong>aucune présentation de dossier</strong> n'est requise de votre part. " +
          "La validation intervient en principe <strong>sous 24 heures</strong>.",
        hint: "Vous pourrez vous connecter dès que votre compte sera activé par la section.",
        showDossier: false,
      };
    }

    if (r === "assistant") {
      const waitDetail =
        source === "login"
          ? "Votre compte assistant est enregistré mais pas encore activé."
          : "Votre inscription assistant et votre paiement ont bien été enregistrés.";
      return {
        icon: "⏳",
        title: source === "login" ? "Compte en attente de validation" : "Inscription enregistrée — en attente",
        lead: waitDetail,
        detailHtml:
          "Votre validation sera effectuée par l'<strong>administration de votre université</strong>. " +
          "Il vous suffit d'<strong>attendre</strong> — la validation intervient en principe " +
          "<strong>sous 24 heures</strong>. Aucune démarche supplémentaire n'est demandée.",
        hint: "Reconnectez-vous ultérieurement avec votre e-mail et mot de passe.",
        showDossier: false,
      };
    }

    return {
      icon: "⏳",
      title: "Compte en attente",
      lead: "Votre compte n'est pas encore activé.",
      detailHtml: "Veuillez patienter ou contactez l'administration de votre établissement.",
      hint: "",
      showDossier: false,
    };
  }

  function displayFiliere(user) {
    if (user?.filiere) return user.filiere;
    const cc = user?.coursClasses || [];
    if (cc.length && cc[0].filiere) return cc[0].filiere;
    return "—";
  }

  function findLocalUser(email) {
    if (typeof SAC_IDENTITY === "undefined") return null;
    return SAC_IDENTITY.findUserByLoginId(
      SAC_IDENTITY.getLocalUsers(),
      email || ""
    );
  }

  function enrichSession(session) {
    if (!session?.identifiant) return session;
    const local = findLocalUser(session.identifiant);
    if (!local?.sectionApproval) return session;
    return {
      ...session,
      sectionApproval: local.sectionApproval,
      sectionRejectionReason: local.sectionRejectionReason || null,
      sectionApprovedAt: local.sectionApprovedAt || session.sectionApprovedAt || null,
    };
  }

  function shouldBlockDashboard(session) {
    const s = enrichSession(session);
    return requiresApproval(s?.role) && !isApproved(s);
  }

  function pendingPageUrl(role, email, extra) {
    const q = new URLSearchParams();
    if (role) q.set("role", role);
    if (email) q.set("email", email);
    if (extra?.status) q.set("status", extra.status);
    if (extra?.source) q.set("source", extra.source);
    const qs = q.toString();
    return "attente-validation.html" + (qs ? "?" + qs : "");
  }

  function redirectPending(session) {
    const s = enrichSession(session);
    if (isRejected(s)) {
      window.location.replace(
        pendingPageUrl(s.role, s.identifiant || s.userId, {
          status: "rejected",
          source: "login",
        })
      );
      return;
    }
    window.location.replace(
      pendingPageUrl(s.role, s.identifiant || s.userId, {
        status: "pending_login",
        source: "login",
      })
    );
  }

  function mirrorLocalUser(profile, opts) {
    if (typeof SAC_IDENTITY === "undefined") return;
    if (
      profile?.role === "etudiant" &&
      typeof SAC_SECTIONS !== "undefined" &&
      SAC_SECTIONS.linkStudentToSection
    ) {
      profile = SAC_SECTIONS.linkStudentToSection({ ...profile });
    }
    const users = SAC_IDENTITY.getLocalUsers();
    const email = SAC_IDENTITY.normalizeEmail(profile.email);
    const idx = users.findIndex(
      (u) => SAC_IDENTITY.normalizeEmail(u.email) === email
    );
    const base = idx >= 0 ? users[idx] : {};
    const record = {
      ...base,
      ...profile,
      email,
      sectionApproval: profile.sectionApproval || base.sectionApproval || STATUS.pending,
    };
    delete record.password;
    delete record._pwd;
    if (opts?.passwordHash) record.passwordHash = opts.passwordHash;
    if (idx >= 0) users[idx] = record;
    else users.push(record);
    localStorage.setItem("sac_users", JSON.stringify(users));
  }

  function filterPending(sectionSession, roleFilter) {
    if (typeof SAC_IDENTITY === "undefined") return [];
    const actor = resolveSectionActor(sectionSession);
    return SAC_IDENTITY.getLocalUsers().filter((raw) => {
      const u =
        raw.role === "etudiant" ? repairStudentCampus({ ...raw }) : { ...raw };
      if (!isPending(u)) return false;
      if (roleFilter === "student") {
        if (isRector(sectionSession)) return false;
        return u.role === "etudiant" && matchesStudentSection(u, actor);
      }
      if (roleFilter === "staff") {
        if (!STAFF_ROLES.includes(u.role)) return false;
        if (isRector(sectionSession)) {
          return (
            u.role === "professeur" &&
            universiteMatches(u.universite, actor.universite)
          );
        }
        return matchesStaffSection(u, actor);
      }
      return ROLES.includes(u.role) && matchesSection(u, actor);
    });
  }

  async function refreshPendingStudentsForSection(sectionSession) {
    await syncPendingStudentsFromApi(sectionSession);
    if (typeof SAC_SECTIONS !== "undefined" && SAC_SECTIONS.repairStudentsForSection) {
      SAC_SECTIONS.repairStudentsForSection(resolveSectionActor(sectionSession));
    }
    return getPendingStudentsForSection(sectionSession);
  }

  function getPendingStudentsForSection(sectionSession) {
    return filterPending(sectionSession, "student");
  }

  function getPendingStaffForSection(sectionSession) {
    return filterPending(sectionSession, "staff");
  }

  function getPendingForSection(sectionSession) {
    return filterPending(sectionSession, "all");
  }

  function getApprovedForSection(sectionSession, role) {
    if (typeof SAC_IDENTITY === "undefined") return [];
    return SAC_IDENTITY.getLocalUsers().filter((u) => {
      if (role && u.role !== role) return false;
      if (!requiresApproval(u.role)) return false;
      if (!isApproved(u)) return false;
      return matchesSection(u, sectionSession);
    });
  }

  async function setApproval(email, status, sectionSession, extra) {
    if (!Object.values(STATUS).includes(status)) {
      throw new Error("Statut de validation invalide.");
    }
    const users = SAC_IDENTITY.getLocalUsers();
    const key = SAC_IDENTITY.normalizeEmail(email);
    const user = users.find((u) => SAC_IDENTITY.normalizeEmail(u.email) === key);
    if (!user) throw new Error("Compte introuvable.");
    if (!requiresApproval(user.role)) {
      throw new Error("Ce type de compte ne nécessite pas de validation.");
    }

    const scope = extra?.scope || "all";
    if (scope === "student") {
      if (user.role !== "etudiant") {
        throw new Error("Cette validation concerne uniquement les étudiants.");
      }
      if (!matchesStudentSection(user, sectionSession)) {
        throw new Error("Cet étudiant n'appartient pas à votre section / filière.");
      }
    } else if (scope === "staff") {
      if (!STAFF_ROLES.includes(user.role)) {
        throw new Error("Cette validation concerne uniquement professeurs et assistants.");
      }
      if (isRector(sectionSession)) {
        if (user.role !== "professeur") {
          throw new Error("Le recteur valide uniquement les inscriptions professeur.");
        }
        if (!universiteMatches(user.universite, sectionSession.universite)) {
          throw new Error("Ce professeur n'appartient pas à votre université.");
        }
      } else if (!matchesStaffSection(user, sectionSession)) {
        throw new Error("Ce compte personnel n'appartient pas à votre section / filière.");
      }
    } else if (!matchesSection(user, sectionSession)) {
      throw new Error("Ce compte n'appartient pas à votre section / filière.");
    }

    user.sectionApproval = status;
    user.sectionApprovalAt = new Date().toISOString();
    user.sectionApprovedBy =
      sectionSession.identifiant || sectionSession.userId || null;
    if (status === STATUS.approved) {
      markApproved(user, sectionSession);
    }
    if (status === STATUS.rejected) {
      user.sectionRejectionReason = (extra?.reason || "").trim() || null;
    } else {
      delete user.sectionRejectionReason;
    }

    localStorage.setItem("sac_users", JSON.stringify(users));
    return user;
  }

  async function approve(email, sectionSession, extra) {
    return setApproval(email, STATUS.approved, sectionSession, extra);
  }

  async function reject(email, sectionSession, reason, extra) {
    return setApproval(email, STATUS.rejected, sectionSession, {
      ...(extra || {}),
      reason,
    });
  }

  async function approveStudent(email, sectionSession) {
    return approve(email, sectionSession, { scope: "student" });
  }

  async function rejectStudent(email, sectionSession, reason) {
    return reject(email, sectionSession, reason, { scope: "student" });
  }

  async function approveStaff(email, sectionSession) {
    return approve(email, sectionSession, { scope: "staff" });
  }

  async function rejectStaff(email, sectionSession, reason) {
    return reject(email, sectionSession, reason, { scope: "staff" });
  }

  function roleLabel(role) {
    if (role === "etudiant") return "Étudiant";
    if (role === "professeur") return "Professeur";
    if (role === "assistant") return "Assistant";
    return role || "—";
  }

  return {
    ROLES,
    STUDENT_ROLES,
    STAFF_ROLES,
    WAIT_HOURS,
    STATUS,
    GRADE_LABELS,
    FONCTION_LABELS,
    isRector,
    requiresApproval,
    getStatus,
    isApproved,
    isPending,
    isRejected,
    markPending,
    markApproved,
    matchesSection,
    matchesStudentSection,
    matchesStaffSection,
    displayFiliere,
    enrichSession,
    shouldBlockDashboard,
    pendingPageUrl,
    redirectPending,
    mirrorLocalUser,
    getPendingForSection,
    getPendingStudentsForSection,
    getPendingStaffForSection,
    refreshPendingStudentsForSection,
    syncPendingStudentsFromApi,
    resolveSectionActor,
    getApprovedForSection,
    approve,
    reject,
    approveStudent,
    rejectStudent,
    approveStaff,
    rejectStaff,
    roleLabel,
    requestedAt,
    deadlineAt,
    hoursSinceRequest,
    hoursRemaining,
    formatHoursRemaining,
    getWaitPageContent,
  };
})();

/**
 * Renouvellement annuel d'inscription — annonce J-10, blocage après le 30 juillet.
 */
const SAC_ENROLLMENT_RENEWAL = (function () {
  const ROLES = ["etudiant", "professeur", "assistant"];
  const RENEWAL_MONTH = 7;
  const RENEWAL_DAY = 30;
  const WARNING_DAYS = 10;
  const BANNER_ID = "sac-enrollment-renewal-banner";

  function requiresRenewal(session) {
    return ROLES.includes(String(session?.role || "").trim());
  }

  function todayDate() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function accessRequiredYear(dt) {
    const y = dt.getFullYear();
    const m = dt.getMonth() + 1;
    const day = dt.getDate();
    if (m > RENEWAL_MONTH || (m === RENEWAL_MONTH && day > RENEWAL_DAY)) {
      return y + "-" + (y + 1);
    }
    return y - 1 + "-" + y;
  }

  function renewalTargetYear(dt) {
    const y = dt.getFullYear();
    const m = dt.getMonth() + 1;
    if (m >= RENEWAL_MONTH) return y + "-" + (y + 1);
    return y - 1 + "-" + y;
  }

  function nextDeadline(dt) {
    const y = dt.getFullYear();
    const deadline = new Date(y, RENEWAL_MONTH - 1, RENEWAL_DAY);
    if (dt > deadline) return new Date(y + 1, RENEWAL_MONTH - 1, RENEWAL_DAY);
    return deadline;
  }

  function isPastDeadline(dt) {
    const m = dt.getMonth() + 1;
    const day = dt.getDate();
    return m > RENEWAL_MONTH || (m === RENEWAL_MONTH && day > RENEWAL_DAY);
  }

  function isWarningPeriod(dt) {
    const deadline = nextDeadline(dt);
    if (dt > deadline) return false;
    const days = Math.round((deadline - dt) / 86400000);
    return days >= 0 && days <= WARNING_DAYS;
  }

  function isOnboarded(session) {
    if (typeof SAC_SECTION_APPROVAL !== "undefined") {
      return SAC_SECTION_APPROVAL.isApproved(session);
    }
    const pay = session?.payment;
    return session?.sectionApproval === "approved" || pay?.status === "verified";
  }

  function computeLocalStatus(session) {
    if (!requiresRenewal(session)) return { applies: false };
    const now = todayDate();
    const accessYear = accessRequiredYear(now);
    const targetYear = renewalTargetYear(now);
    const deadline = nextDeadline(now);
    const daysLeft = Math.max(0, Math.round((deadline - now) / 86400000));
    const warning = isWarningPeriod(now);
    const past = isPastDeadline(now);
    const onboarded = isOnboarded(session);

    let accessBlocked = false;
    let message = "";
    if (onboarded && past) {
      accessBlocked = true;
      message =
        "Votre inscription pour l'année " +
        accessYear +
        " doit être renouvelée. Payez pour retrouver l'accès — vos données sont conservées.";
    } else if (onboarded && warning) {
      message =
        "Renouvellement d'inscription : il reste " +
        daysLeft +
        " jour(s) (échéance le 30/07). Régularisez pour l'année " +
        targetYear +
        ".";
    }

    return {
      applies: true,
      accessYear,
      renewalYear: targetYear,
      deadline: deadline.toISOString().slice(0, 10),
      warningActive: warning,
      daysUntilDeadline: daysLeft,
      accessBlocked: accessBlocked,
      needsRenewalPayment: warning && onboarded,
      pendingPayment: false,
      message,
      _local: true,
    };
  }

  function enrichSession(session) {
    if (!session || !requiresRenewal(session)) return session;
    if (session.enrollmentRenewal) return session;
    return Object.assign({}, session, { enrollmentRenewal: computeLocalStatus(session) });
  }

  function shouldBlockDashboard(session) {
    const s = enrichSession(session);
    const r = s?.enrollmentRenewal;
    return !!(r?.applies && r?.accessBlocked);
  }

  function shouldShowBanner(session) {
    const s = enrichSession(session);
    const r = s?.enrollmentRenewal;
    if (!r?.applies || r.accessBlocked) return false;
    return !!(r.warningActive || r.needsRenewalPayment || r.pendingPayment);
  }

  function renewalPageUrl(role) {
    const q = role ? "?role=" + encodeURIComponent(role) : "";
    return "renouvellement-inscription.html" + q;
  }

  function redirectToRenewal(session) {
    window.location.replace(renewalPageUrl(session?.role));
  }

  function formatDeadline(iso) {
    if (!iso) return "30 juillet";
    const p = String(iso).slice(0, 10).split("-");
    if (p.length !== 3) return "30 juillet";
    return p[2] + "/" + p[1] + "/" + p[0];
  }

  function removeBanner() {
    const el = document.getElementById(BANNER_ID);
    if (el) el.remove();
  }

  function mountBanner(session) {
    removeBanner();
    if (!shouldShowBanner(session)) return;
    const r = enrichSession(session).enrollmentRenewal;
    const bar = document.createElement("div");
    bar.id = BANNER_ID;
    bar.setAttribute("role", "alert");
    bar.style.cssText =
      "position:sticky;top:0;z-index:9999;padding:0.75rem 1rem;background:#fff7ed;" +
      "border-bottom:2px solid #f59e0b;color:#92400e;font-size:0.92rem;line-height:1.45;" +
      "display:flex;flex-wrap:wrap;gap:0.65rem;align-items:center;justify-content:space-between;";
    const text = document.createElement("span");
    text.innerHTML =
      "<strong>📢 Renouvellement d'inscription</strong> — " +
      (r.message ||
        "Échéance le " +
          formatDeadline(r.deadline) +
          " (" +
          r.daysUntilDeadline +
          " jour(s)). Vos notes et documents restent enregistrés.");
    const btn = document.createElement("a");
    btn.href = renewalPageUrl(session?.role);
    btn.textContent = "Renouveler maintenant";
    btn.style.cssText =
      "background:#b45309;color:#fff;padding:0.45rem 0.85rem;border-radius:8px;" +
      "text-decoration:none;font-weight:600;white-space:nowrap;";
    bar.appendChild(text);
    bar.appendChild(btn);
    document.body.insertBefore(bar, document.body.firstChild);
  }

  async function refreshFromApi(session) {
    if (typeof SAC_API === "undefined" || typeof SAC_API.getEnrollmentRenewalStatus !== "function") {
      return enrichSession(session);
    }
    try {
      const data = await SAC_API.getEnrollmentRenewalStatus();
      if (data?.renewal) {
        const merged = Object.assign({}, session, { enrollmentRenewal: data.renewal });
        if (typeof SAC_SESSION !== "undefined" && SAC_SESSION.saveSession) {
          SAC_SESSION.saveSession(merged);
        }
        return merged;
      }
    } catch (err) {
      console.warn("[enrollment-renewal]", err);
    }
    return enrichSession(session);
  }

  function getRenewalFee(role) {
    if (typeof SAC_TARIFFS !== "undefined" && SAC_TARIFFS.defaultFor) {
      const base = SAC_TARIFFS.defaultFor(role || "etudiant");
      return {
        amount: Number(base.amount) || 1,
        currency: base.currency || "USD",
        label: "Frais de réinscription annuelle",
      };
    }
    const map = { etudiant: 1, professeur: 10, assistant: 5 };
    return {
      amount: map[role] || 1,
      currency: "USD",
      label: "Frais de réinscription annuelle",
    };
  }

  return {
    ROLES,
    requiresRenewal,
    enrichSession,
    shouldBlockDashboard,
    shouldShowBanner,
    renewalPageUrl,
    redirectToRenewal,
    mountBanner,
    removeBanner,
    refreshFromApi,
    getRenewalFee,
    computeLocalStatus,
    formatDeadline,
  };
})();

if (typeof window !== "undefined") {
  window.SAC_ENROLLMENT_RENEWAL = SAC_ENROLLMENT_RENEWAL;
}

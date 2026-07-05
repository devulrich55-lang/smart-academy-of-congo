/**
 * Étape MFA e-mail — portails staff (superadmin, tech manager, dev center, ministère).
 */
const SAC_STAFF_MFA = (function () {
  "use strict";

  function esc(s) {
    const el = document.createElement("div");
    el.textContent = String(s ?? "");
    return el.innerHTML;
  }

  function findSubmitBtn(form) {
    return form.querySelector('[type="submit"]');
  }

  function showMfaStep(form, meta, verifyFn) {
    if (!form || form.dataset.mfaActive === "1") return;
    form.dataset.mfaActive = "1";
    form.dataset.mfaBackup = form.innerHTML;

    const hint = meta.emailHint || meta.email || "votre e-mail";
    const isPtl = String(form.id || "").indexOf("ptlForm") === 0;
    const fieldCls = isPtl ? "ptl-field" : "portal-field";
    const inputCls = isPtl ? "ptl-input" : "portal-field input";
    const submitCls = isPtl ? "ptl-submit" : "portal-submit";
    const linkCls = isPtl ? "ptl-link" : "portal-forgot";

    form.innerHTML =
      '<div class="sac-mfa-step">' +
      "<p><strong>Vérification e-mail</strong></p>" +
      "<p>Un code à 6 chiffres a été envoyé à <em>" +
      esc(hint) +
      "</em>.</p>" +
      '<label class="' +
      fieldCls +
      '"><span>Code de vérification</span>' +
      '<input class="' +
      inputCls +
      '" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" id="sacMfaCodeInput" placeholder="000000" required /></label>' +
      '<div class="sac-mfa-actions">' +
      '<button type="button" class="' +
      submitCls +
      '" id="sacMfaVerifyBtn">Valider le code</button> ' +
      '<button type="button" class="' +
      linkCls +
      '" id="sacMfaCancelBtn">Retour</button>' +
      "</div></div>";

    const input = form.querySelector("#sacMfaCodeInput");
    const verifyBtn = form.querySelector("#sacMfaVerifyBtn");
    const cancelBtn = form.querySelector("#sacMfaCancelBtn");

    cancelBtn.addEventListener("click", function () {
      form.innerHTML = form.dataset.mfaBackup || "";
      delete form.dataset.mfaActive;
      delete form.dataset.mfaBackup;
    });

    async function submitCode() {
      const code = (input.value || "").trim();
      if (!/^\d{6}$/.test(code)) {
        alert("Saisissez le code à 6 chiffres reçu par e-mail.");
        input.focus();
        return;
      }
      verifyBtn.disabled = true;
      const prev = verifyBtn.textContent;
      verifyBtn.textContent = "Vérification…";
      try {
        await verifyFn(code);
      } catch (err) {
        alert(err.message || "Code invalide ou expiré.");
      } finally {
        verifyBtn.disabled = false;
        verifyBtn.textContent = prev;
      }
    }

    verifyBtn.addEventListener("click", submitCode);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        submitCode();
      }
    });
    input.focus();
  }

  async function completeStaffLogin(loginResult, form, finishFn) {
    if (!loginResult || !loginResult.mfaRequired) {
      return finishFn(loginResult);
    }
    if (typeof SAC_API === "undefined" || !SAC_API.verifyStaffMfa) {
      throw new Error("Vérification MFA indisponible — redeployez l'API.");
    }
    showMfaStep(form, loginResult, async function (code) {
      const session = await SAC_API.verifyStaffMfa(loginResult.mfaChallenge, code);
      await finishFn(session);
    });
  }

  return {
    completeStaffLogin: completeStaffLogin,
  };
})();

if (typeof window !== "undefined") {
  window.SAC_STAFF_MFA = SAC_STAFF_MFA;
}

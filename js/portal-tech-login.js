/**
 * Connexion dual Dev Center / Tech Manager
 */
(function () {
  const SVG_EYE =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  const SVG_EYE_OFF =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  function rememberKey(portalId) {
    return "evosu_remember_" + portalId;
  }

  function rememberStore() {
    var h = (window.location && window.location.hostname) || "";
    var local = h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    return local ? localStorage : sessionStorage;
  }

  function loadRemembered(portalId, emailInput) {
    try {
      var store = rememberStore();
      const raw = store.getItem(rememberKey(portalId));
      if (!raw || !emailInput) return;
      const data = JSON.parse(raw);
      if (data.email) emailInput.value = data.email;
      const chk = document.querySelector('[data-remember="' + portalId + '"]');
      if (chk) chk.checked = true;
    } catch (_) {}
  }

  function saveRemembered(portalId, email, remember) {
    try {
      var store = rememberStore();
      var key = rememberKey(portalId);
      if (remember && email) {
        store.setItem(key, JSON.stringify({ email: email }));
        if (store !== localStorage) localStorage.removeItem(key);
      } else {
        store.removeItem(key);
        localStorage.removeItem(key);
      }
    } catch (_) {}
  }

  async function ensureApiReady(btn) {
    if (typeof SAC_API === "undefined") throw new Error("API indisponible");
    if (btn) btn.textContent = "Connexion au serveur…";
    if (SAC_API.resolveApiBase) await SAC_API.resolveApiBase(true);
    const online = await SAC_API.ensureOnline(true, {
      attempts: 10,
      timeoutMs: 60000,
      delayMs: 6000,
    });
    if (online) return;
    if (SAC_API.probeApiReachability) {
      const probe = await SAC_API.probeApiReachability();
      if (probe.message) throw new Error(probe.message);
    }
    throw new Error(
      "Serveur en démarrage (Render cold start). Attendez 1–2 minutes puis réessayez."
    );
  }

  async function loginSubmit(portalId, form) {
    const def = SAC_PORTAL.DEFS?.[portalId] || SAC_PORTAL.getDef?.(portalId);
    if (!def) throw new Error("Portail inconnu");

    const email = form.querySelector('[name="email"]').value.trim();
    const password = form.querySelector('[name="password"]').value;
    const remember = form.querySelector('[name="remember"]')?.checked;
    const btn = form.querySelector('[type="submit"]');

    if (!email || password.length < 8) {
      alert("E-mail et mot de passe requis (8 caractères minimum).");
      return;
    }

    btn.disabled = true;
    const prev = btn.innerHTML;
    btn.textContent = "Réveil du serveur…";

    try {
      await ensureApiReady(btn);
      btn.textContent = "Connexion…";
      const session = await SAC_API.login(email, password, def.role, { adminPortal: true });
      saveRemembered(portalId, email, remember);
      SAC_SESSION.saveSession(session);
      window.location.replace(SAC_PORTAL.portalDashboardUrl(def));
    } catch (err) {
      alert(err.message || "Identifiant ou mot de passe incorrect.");
    } finally {
      btn.disabled = false;
      btn.innerHTML = prev;
    }
  }

  function bindPasswordToggle(wrap) {
    const input = wrap.querySelector(".ptl-input");
    const btn = wrap.querySelector(".ptl-toggle-pw");
    if (!input || !btn) return;
    btn.addEventListener("click", function () {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.innerHTML = show ? SVG_EYE_OFF : SVG_EYE;
      btn.setAttribute("aria-label", show ? "Masquer le mot de passe" : "Afficher le mot de passe");
    });
  }

  function bindForm(portalId) {
    const form = document.getElementById("ptlForm-" + portalId);
    if (!form) return;
    const emailInput = form.querySelector('[name="email"]');
    loadRemembered(portalId, emailInput);
    form.querySelectorAll(".ptl-input-wrap").forEach(bindPasswordToggle);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      loginSubmit(portalId, form);
    });
  }

  async function init() {
    const def = SAC_PORTAL.current();
    if (!def || (def.id !== "devcenter" && def.id !== "techmanager")) return;

    document.body.classList.add("ptl-page--" + def.id);
    document.title = def.title + " — EvoSmartUni";

    const roleParam = new URLSearchParams(window.location.search).get("role");
    if (await SAC_SESSION.redirectIfAuthenticated(roleParam || def.role)) return;

    if (typeof SAC_API !== "undefined") {
      SAC_API.resolveApiBase(true).catch(function () {});
      SAC_API.wakeServer({ attempts: 6, timeoutMs: 55000, delayMs: 5000 });
    }

    bindForm("devcenter");
    bindForm("techmanager");

    document.querySelectorAll(".ptl-google").forEach(function (btn) {
      btn.addEventListener("click", function () {
        alert("Connexion Google — bientôt disponible. Contactez le Super Admin pour un accès.");
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

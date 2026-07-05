const SAC_PRESENCE = (function () {
  const HEARTBEAT_MS = 25000;
  const REFRESH_MS = 20000;

  function isApiReady() {
    return typeof SAC_API !== "undefined" && typeof SAC_API.pingPresence === "function";
  }

  function safeCall(fn, value) {
    if (typeof fn === "function") fn(value);
  }

  function bindSelfPresence(...ids) {
    const elements = ids
      .flat()
      .map((id) => (typeof id === "string" ? document.getElementById(id) : id))
      .filter(Boolean);
    return (isOnline) => {
      const label = isOnline ? "en ligne" : "hors ligne";
      elements.forEach((el) => {
        el.classList.toggle("is-online", Boolean(isOnline));
        el.textContent = label;
      });
    };
  }

  function bindSelfConnecting(...ids) {
    const elements = ids
      .flat()
      .map((id) => (typeof id === "string" ? document.getElementById(id) : id))
      .filter(Boolean);
    return () => {
      elements.forEach((el) => {
        el.classList.remove("is-online");
        el.textContent = "connexion…";
      });
    };
  }

  function buildPayload(session) {
    const s = session || {};
    return {
      classe: s.classe || null,
      filiere: s.filiere || null,
      sectionId: s.sectionId || null,
      universite: s.universite || s.universiteLocked || s.sigle || null,
    };
  }

  function liveSession(fallback) {
    if (typeof SAC_SESSION !== "undefined" && SAC_SESSION.getSession) {
      return SAC_SESSION.getSession() || fallback;
    }
    return fallback;
  }

  function canFetchSectionPresence(role) {
    return role === "section" || role === "assistant" || role === "universite";
  }

  async function ensureAuthForPresence() {
    if (typeof SAC_API.ensureApiSession === "function") {
      await SAC_API.ensureApiSession({ soft: true });
    }
    if (
      typeof SAC_API.hasAuthTokens === "function" &&
      !SAC_API.hasAuthTokens() &&
      typeof SAC_API.refresh === "function"
    ) {
      await SAC_API.refresh({ soft: true });
    }
  }

  async function tryPing(activeSession) {
    await SAC_API.pingPresence(buildPayload(activeSession));
  }

  async function sessionLooksOnline() {
    if (typeof SAC_API.me !== "function") return false;
    const profile = await SAC_API.me({ soft: true, timeoutMs: 10000 });
    return !!profile;
  }

  async function heartbeat(session, hooks) {
    if (!isApiReady()) return;
    const activeSession = liveSession(session);
    safeCall(hooks?.onSelfConnecting);

    try {
      await ensureAuthForPresence();

      try {
        await tryPing(activeSession);
        safeCall(hooks?.onSelfOnline, true);
        return;
      } catch {
        /* ping échoué — tenter réveil API puis repli /auth/me */
      }

      if (typeof SAC_API.wakeServer === "function") {
        await SAC_API.wakeServer({ attempts: 3, timeoutMs: 22000, delayMs: 3500 });
      } else if (typeof SAC_API.ensureOnline === "function") {
        await SAC_API.ensureOnline(true, { maxWaitMs: 25000 });
      }

      await ensureAuthForPresence();

      try {
        await tryPing(activeSession);
        safeCall(hooks?.onSelfOnline, true);
        return;
      } catch {
        /* repli : session API valide = en ligne pour l'utilisateur */
      }

      if (await sessionLooksOnline()) {
        safeCall(hooks?.onSelfOnline, true);
        return;
      }

      safeCall(hooks?.onSelfOnline, false);
    } catch {
      if (await sessionLooksOnline().catch(function () { return false; })) {
        safeCall(hooks?.onSelfOnline, true);
      } else {
        safeCall(hooks?.onSelfOnline, false);
      }
    }
  }

  async function refreshViews(session, hooks) {
    if (!isApiReady()) return;
    const activeSession = liveSession(session);
    try {
      await ensureAuthForPresence();
      if (
        typeof SAC_API.hasAuthTokens === "function" &&
        !SAC_API.hasAuthTokens()
      ) {
        return;
      }
      if (canFetchSectionPresence(activeSession?.role) && typeof SAC_API.getSectionPresence === "function") {
        const data = await SAC_API.getSectionPresence();
        safeCall(hooks?.onSectionPresence, data);
      }
      if (activeSession?.role === "professeur" && typeof SAC_API.getProfessorPresence === "function") {
        const data = await SAC_API.getProfessorPresence();
        safeCall(hooks?.onProfessorPresence, data);
      }
    } catch {
      // silencieux: la vue continue de fonctionner même sans API.
    }
  }

  function start(session, hooks = {}) {
    if (!session || !isApiReady()) return { stop() {} };
    let stopped = false;
    let hbTimer = null;
    let viewTimer = null;
    const onSelfConnecting = bindSelfConnecting("selfPresence", "profilePresence");
    const mergedHooks = Object.assign({}, hooks, {
      onSelfConnecting: hooks.onSelfConnecting || onSelfConnecting,
    });

    const runHeartbeat = async () => {
      if (stopped) return;
      await heartbeat(session, mergedHooks);
    };
    const runView = async () => {
      if (stopped) return;
      await refreshViews(session, hooks);
    };

    runHeartbeat();
    runView();

    hbTimer = setInterval(runHeartbeat, HEARTBEAT_MS);
    viewTimer = setInterval(runView, REFRESH_MS);

    return {
      stop() {
        stopped = true;
        if (hbTimer) clearInterval(hbTimer);
        if (viewTimer) clearInterval(viewTimer);
      },
    };
  }

  return { start, bindSelfPresence, bindSelfConnecting };
})();

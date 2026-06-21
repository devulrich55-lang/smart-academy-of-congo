/**
 * Signal d'appel live — notification + sonnerie pour rejoindre
 */
const SAC_LIVE_CALL = (function () {
  const SEEN_KEY = "sac_live_call_seen";
  const CHANNEL = "sac-live-call";
  const POLL_MS = 5000;

  let sessionRef = null;
  let pollTimer = null;
  let modalEl = null;
  let ringTimer = null;
  let audioCtx = null;
  let bc = null;

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function displayName(s) {
    if (typeof SAC_IDENTITY !== "undefined") return SAC_IDENTITY.getDisplayName(s);
    return [s?.prenom, s?.nom].filter(Boolean).join(" ") || s?.email || "Participant";
  }

  function getSeen() {
    try {
      return JSON.parse(sessionStorage.getItem(SEEN_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function markSeen(id) {
    const seen = getSeen();
    seen[id] = Date.now();
    const keys = Object.keys(seen);
    if (keys.length > 40) {
      keys.sort((a, b) => seen[a] - seen[b]);
      keys.slice(0, keys.length - 40).forEach((k) => delete seen[k]);
    }
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  }

  function wasRecentlySeen(id) {
    const seen = getSeen();
    const t = seen[id];
    return t && Date.now() - t < 3600000;
  }

  function requestNotifPermission() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  function pushNotif(title, body) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      const n = new Notification(title, {
        body,
        icon: "logos.svg",
        tag: "sac-live-call",
        requireInteraction: true,
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      /* ignore */
    }
  }

  function startRing() {
    stopRing();
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const playTone = () => {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = 880;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.45);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
      };
      playTone();
      ringTimer = setInterval(playTone, 1200);
    } catch {
      /* pas de son */
    }
  }

  function stopRing() {
    if (ringTimer) {
      clearInterval(ringTimer);
      ringTimer = null;
    }
    if (audioCtx) {
      try {
        audioCtx.close();
      } catch {
        /* ignore */
      }
      audioCtx = null;
    }
  }

  function norm(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
  }

  function filiereMatch(a, b) {
    const x = norm(a);
    const y = norm(b);
    if (!x || !y) return true;
    return x === y || x.includes(y) || y.includes(x);
  }

  function isEligible(session, payload) {
    if (!session || !payload?.sessionId) return false;
    if (typeof SAC_WEBRTC_ROOM !== "undefined" && SAC_WEBRTC_ROOM.isActive()) return false;

    const email = (session.identifiant || session.email || "").toLowerCase();
    const role = session.role;

    if (payload.kind === "course") {
      if (role !== "etudiant") return false;
      if (payload.universite && session.universite && payload.universite !== session.universite) {
        return false;
      }
      if (payload.filiere && session.filiere && !filiereMatch(session.filiere, payload.filiere)) {
        return false;
      }
      if (payload.niveau && session.niveau && norm(payload.niveau) !== norm(session.niveau)) {
        return false;
      }
      return true;
    }

    if (payload.kind === "meeting") {
      if (role === "universite") return true;
      const allowed = (payload.allowedEmails || []).map((e) => String(e).toLowerCase());
      if (allowed.includes(email)) return true;
      if ((payload.hostEmail || "").toLowerCase() === email) return true;
      if (role === "professeur" || role === "assistant" || role === "section") return true;
      if (role === "etudiant") {
        if (payload.inviteStudents) {
          if (payload.universite && session.universite && norm(payload.universite) !== norm(session.universite)) {
            return false;
          }
          return filiereMatch(session.filiere, payload.filiere);
        }
        if (payload.filiere || payload.universite) {
          if (payload.universite && session.universite && norm(payload.universite) !== norm(session.universite)) {
            return false;
          }
          return filiereMatch(session.filiere, payload.filiere);
        }
      }
      return false;
    }

    if (payload.kind === "ministry") {
      if (role !== "universite") return false;
      const invited = payload.invitedUniversities || payload.allowedEmails || [];
      if (!invited.length) return true;
      const uni = session.universite || "";
      return invited.some(
        (x) =>
          norm(x) === norm(uni) ||
          norm(x) === norm(email) ||
          norm(x) === norm(session.identifiant)
      );
    }

    return false;
  }

  function kindLabel(kind) {
    if (kind === "course") return "Cours en direct";
    if (kind === "ministry") return "Live national";
    return "Réunion live";
  }

  function hideModal() {
    stopRing();
    if (modalEl) {
      modalEl.remove();
      modalEl = null;
    }
    document.body.style.overflow = "";
  }

  async function acceptCall(payload) {
    hideModal();
    markSeen(payload.sessionId);

    const session = sessionRef || (typeof SAC_SESSION !== "undefined" ? SAC_SESSION.getSession() : null);
    if (!session) return;

    const name = displayName(session);
    window.dispatchEvent(new CustomEvent("sac:goto-live"));

    try {
      if (payload.kind === "course" && typeof SAC_LIVE !== "undefined") {
        const s = await SAC_LIVE.joinSession(payload.sessionId, session);
        SAC_LIVE.openRoom(s, session);
        return;
      }
      if (payload.kind === "meeting" && typeof SAC_MEETINGS !== "undefined") {
        const m = await SAC_MEETINGS.joinMeeting(payload.sessionId);
        SAC_MEETINGS.openRoom(m, name);
        return;
      }
      if (payload.kind === "ministry" && typeof SAC_MINISTRY_LIVE !== "undefined") {
        const row = await SAC_MINISTRY_LIVE.getSession(payload.sessionId);
        if (row) SAC_MINISTRY_LIVE.openRoom(row, name, session);
      }
    } catch (err) {
      alert(err.message || "Impossible de rejoindre le live.");
    }
  }

  function showIncomingCall(payload) {
    if (!isEligible(sessionRef, payload)) return;
    if (wasRecentlySeen(payload.sessionId) && modalEl) return;
    if (modalEl) return;

    startRing();
    pushNotif(
      "📞 Appel live SAC",
      (payload.hostName || "Animateur") + " — " + (payload.title || "Session en direct")
    );

    modalEl = document.createElement("div");
    modalEl.className = "sac-live-call";
    modalEl.innerHTML = `
      <div class="sac-live-call__card" role="dialog" aria-modal="true" aria-labelledby="sacCallTitle">
        <div class="sac-live-call__ring" aria-hidden="true">📞</div>
        <p class="sac-live-call__title" id="sacCallTitle">${esc(kindLabel(payload.kind))}</p>
        <p class="sac-live-call__sub">
          <strong>${esc(payload.hostName || "Animateur")}</strong><br/>
          ${esc(payload.title || "Session en direct")}
        </p>
        <div class="sac-live-call__actions">
          <button type="button" class="sac-live-call__btn sac-live-call__btn--decline" data-call-decline>Refuser</button>
          <button type="button" class="sac-live-call__btn sac-live-call__btn--accept" data-call-accept>Rejoindre</button>
        </div>
      </div>`;

    modalEl.querySelector("[data-call-decline]").onclick = () => {
      markSeen(payload.sessionId);
      hideModal();
    };
    modalEl.querySelector("[data-call-accept]").onclick = () => acceptCall(payload);

    document.body.appendChild(modalEl);
    document.body.style.overflow = "hidden";
  }

  async function signalLiveStart(payload) {
    const data = {
      ...payload,
      sessionId: payload.sessionId || payload.id,
      at: Date.now(),
    };
    try {
      localStorage.setItem("sac_live_last_signal", JSON.stringify(data));
    } catch {
      /* ignore */
    }
    if (bc) {
      bc.postMessage(data);
    }
    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
      try {
        await SAC_API.postLiveSignal(data);
      } catch (err) {
        console.warn("[SAC_LIVE_CALL] signal API:", err.message || err);
      }
    }
  }

  function handleSignalPayload(payload) {
    if (!payload?.sessionId) return;
    if (wasRecentlySeen(payload.sessionId)) return;
    showIncomingCall(payload);
  }

  async function checkForLiveSignals() {
    const session = sessionRef;
    if (!session) return;
    if (typeof SAC_WEBRTC_ROOM !== "undefined" && SAC_WEBRTC_ROOM.isActive()) return;

    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
      try {
        const apiSignals = await SAC_API.getLiveSignals();
        for (const item of apiSignals) {
          if (!isEligible(session, item)) continue;
          if (wasRecentlySeen(item.sessionId)) continue;
          showIncomingCall(item);
          return;
        }
      } catch {
        /* repli local */
      }
    }

    const liveItems = [];

    if (typeof SAC_LIVE !== "undefined") {
      const courses = (await SAC_LIVE.listSessions()).filter((s) => s.status === "live");
      courses.forEach((s) => {
        liveItems.push({
          kind: "course",
          sessionId: s.id,
          title: s.title,
          hostName: s.professorName || "Professeur",
          roomName: s.roomName,
          universite: s.universite,
          filiere: s.filiere,
          niveau: s.niveau,
        });
      });
    }

    if (typeof SAC_MEETINGS !== "undefined") {
      const meetings = (await SAC_MEETINGS.listMeetings()).filter((m) => m.status === "live");
      meetings.forEach((m) => {
        liveItems.push({
          kind: "meeting",
          sessionId: m.id,
          title: m.title,
          hostName: m.hostName || "Organisateur",
          roomName: m.roomName,
          allowedEmails: m.allowedEmails,
          hostEmail: m.hostEmail,
          universite: m.universite,
          filiere: m.filiere,
          type: m.type,
          inviteStudents: m.type === "conference",
        });
      });
    }

    if (typeof SAC_MINISTRY_LIVE !== "undefined" && typeof SAC_MINISTRY_LIVE.listSessions === "function") {
      const ministry = (await SAC_MINISTRY_LIVE.listSessions(session)).filter((r) => r.status === "live");
      ministry.forEach((r) => {
        liveItems.push({
          kind: "ministry",
          sessionId: r.id,
          title: r.title,
          hostName: r.hostName || "Ministère",
          roomName: r.roomName,
          invitedUniversities: r.invitedUniversities || r.allowedEmails,
        });
      });
    }

    for (const item of liveItems) {
      if (!isEligible(session, item)) continue;
      if (wasRecentlySeen(item.sessionId)) continue;
      showIncomingCall(item);
      break;
    }
  }

  function init(session) {
    sessionRef = session;
    requestNotifPermission();

    if (typeof BroadcastChannel !== "undefined") {
      bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = (ev) => handleSignalPayload(ev.data);
    }

    window.addEventListener("storage", (ev) => {
      if (ev.key === "sac_live_last_signal" && ev.newValue) {
        try {
          handleSignalPayload(JSON.parse(ev.newValue));
        } catch {
          /* ignore */
        }
      }
    });

    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(checkForLiveSignals, POLL_MS);
    checkForLiveSignals();

    if (!window.__sacLiveCallGotoBound) {
      window.__sacLiveCallGotoBound = true;
      window.addEventListener("sac:goto-live", () => {
        const tab = document.querySelector(".nav-tab[data-section='live'], [data-goto='live']");
        if (tab) tab.click();
      });
    }
  }

  function stop() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    hideModal();
    if (bc) {
      bc.close();
      bc = null;
    }
  }

  async function clearLiveSignal(sessionId) {
    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
      try {
        await SAC_API.clearLiveSignal(sessionId);
      } catch {
        /* ignore */
      }
    }
  }

  return {
    init,
    stop,
    signalLiveStart,
    clearLiveSignal,
    checkForLiveSignals,
    showIncomingCall,
    hideModal,
  };
})();

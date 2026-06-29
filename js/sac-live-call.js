/**
 * Signal d'appel live — notification + sonnerie pour rejoindre
 */
const SAC_LIVE_CALL = (function () {
  const DECLINED_KEY = "sac_live_call_declined";
  const CHANNEL = "sac-live-call";
  const POLL_MS = 3000;

  let sessionRef = null;
  let pollTimer = null;
  let modalEl = null;
  let ringTimer = null;
  let vibrateTimer = null;
  let audioCtx = null;
  let ringAudio = null;
  let ringBlobUrl = null;
  let audioUnlocked = false;
  let bc = null;
  let activePayload = null;

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

  function getDeclined() {
    try {
      return JSON.parse(sessionStorage.getItem(DECLINED_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function markDeclined(id) {
    const declined = getDeclined();
    declined[id] = Date.now();
    const keys = Object.keys(declined);
    if (keys.length > 40) {
      keys.sort((a, b) => declined[a] - declined[b]);
      keys.slice(0, keys.length - 40).forEach((k) => delete declined[k]);
    }
    sessionStorage.setItem(DECLINED_KEY, JSON.stringify(declined));
  }

  function wasRecentlyDeclined(id) {
    const declined = getDeclined();
    const t = declined[id];
    return t && Date.now() - t < 3600000;
  }

  function createPhoneRingBlobUrl() {
    const sampleRate = 44100;
    const duration = 1.4;
    const samples = Math.floor(sampleRate * duration);
    const buf = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(buf);

    function writeStr(offset, str) {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }

    writeStr(0, "RIFF");
    view.setUint32(4, 36 + samples * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, samples * 2, true);

    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const ringOn = (t % 1.4) < 0.9;
      const env = ringOn ? (t % 0.45 < 0.05 ? (t % 0.45) / 0.05 : 1) : 0;
      const sample =
        env *
        0.42 *
        (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 480 * t));
      view.setInt16(44 + i * 2, Math.max(-32767, Math.min(32767, sample * 32767)), true);
    }

    const blob = new Blob([buf], { type: "audio/wav" });
    return URL.createObjectURL(blob);
  }

  function ensureRingAudio() {
    if (!ringAudio) {
      ringAudio = document.createElement("audio");
      ringAudio.id = "sacCallRing";
      ringAudio.loop = true;
      ringAudio.setAttribute("playsinline", "");
      ringAudio.setAttribute("webkit-playsinline", "true");
      ringAudio.preload = "auto";
      if (!ringBlobUrl) ringBlobUrl = createPhoneRingBlobUrl();
      ringAudio.src = ringBlobUrl;
      ringAudio.style.cssText = "position:fixed;left:-9999px;width:1px;height:1px;";
      document.body.appendChild(ringAudio);
    }
    return ringAudio;
  }

  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    ensureRingAudio();
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === "suspended") audioCtx.resume();
      const p = ringAudio.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          ringAudio.pause();
          ringAudio.currentTime = 0;
        }).catch(() => {});
      }
    } catch {
      /* ignore */
    }
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
        icon: "evo-uni.jpeg",
        tag: "sac-live-call",
        requireInteraction: true,
      });
      n.onclick = () => {
        window.focus();
        if (activePayload) showIncomingCall(activePayload, true);
        n.close();
      };
    } catch {
      /* ignore */
    }
  }

  function playWebAudioTone() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        return;
      }
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc1.frequency.value = 440;
    osc2.frequency.value = 480;
    osc1.type = "square";
    osc2.type = "square";
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioCtx.destination);
    gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.85);
    osc1.start();
    osc2.start();
    osc1.stop(audioCtx.currentTime + 0.9);
    osc2.stop(audioCtx.currentTime + 0.9);
  }

  function startVibrate() {
    if (!navigator.vibrate) return;
    stopVibrate();
    const pattern = [700, 350, 700, 350, 700, 900];
    navigator.vibrate(pattern);
    vibrateTimer = setInterval(() => navigator.vibrate(pattern), 2800);
  }

  function stopVibrate() {
    if (vibrateTimer) {
      clearInterval(vibrateTimer);
      vibrateTimer = null;
    }
    if (navigator.vibrate) navigator.vibrate(0);
  }

  function startRing() {
    stopRing();
    ensureRingAudio();
    playWebAudioTone();
    ringTimer = setInterval(playWebAudioTone, 1400);
    const playPromise = ringAudio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        /* iOS peut bloquer sans interaction — Web Audio + vibration restent actifs */
      });
    }
    startVibrate();
  }

  function stopRing() {
    if (ringTimer) {
      clearInterval(ringTimer);
      ringTimer = null;
    }
    stopVibrate();
    if (ringAudio) {
      try {
        ringAudio.pause();
        ringAudio.currentTime = 0;
      } catch {
        /* ignore */
      }
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

  function syncCourseFromPayload(payload) {
    if (payload.kind !== "course" || typeof SAC_LIVE === "undefined") return;
    if (SAC_LIVE.upsertLocal && SAC_LIVE.signalToSessionRow) {
      SAC_LIVE.upsertLocal(SAC_LIVE.signalToSessionRow(payload));
    }
  }

  function hideModal() {
    stopRing();
    activePayload = null;
    if (modalEl) {
      modalEl.remove();
      modalEl = null;
    }
    document.body.style.overflow = "";
  }

  async function joinFromPayload(payload, user) {
    const session = user || sessionRef || (typeof SAC_SESSION !== "undefined" ? SAC_SESSION.getSession() : null);
    if (!session) throw new Error("Session utilisateur introuvable.");

    if (typeof SAC_API !== "undefined") {
      await SAC_API.wakeServer();
      if (!(await SAC_API.ensureOnline(true))) {
        throw new Error("Serveur inaccessible. Vérifiez votre connexion et réessayez.");
      }
    }

    syncCourseFromPayload(payload);
    window.dispatchEvent(new CustomEvent("sac:goto-live"));

    if (payload.kind === "course" && typeof SAC_LIVE !== "undefined") {
      const s = await SAC_LIVE.joinSession(payload.sessionId, session);
      SAC_LIVE.openRoom(s, session);
      return s;
    }

    const name = displayName(session);

    if (payload.kind === "meeting" && typeof SAC_MEETINGS !== "undefined") {
      const m = await SAC_MEETINGS.joinMeeting(payload.sessionId);
      SAC_MEETINGS.openRoom(m, name, session);
      return m;
    }

    if (payload.kind === "ministry" && typeof SAC_MINISTRY_LIVE !== "undefined") {
      const row = await SAC_MINISTRY_LIVE.getSession(payload.sessionId);
      if (!row) throw new Error("Live introuvable.");
      SAC_MINISTRY_LIVE.openRoom(row, name, session);
      return row;
    }

    throw new Error("Type de live non reconnu.");
  }

  async function joinCourse(sessionId, user) {
    const session = user || sessionRef;
    let row = null;

    if (typeof SAC_LIVE !== "undefined") {
      const sessions = await SAC_LIVE.listSessions();
      row = sessions.find((s) => s.id === sessionId) || null;
    }

    const payload = {
      kind: "course",
      sessionId,
      title: row?.title || "Cours en direct",
      hostName: row?.professorName,
      roomName: row?.roomName,
      universite: row?.universite || session?.universite,
      filiere: row?.filiere || session?.filiere,
      niveau: row?.niveau || session?.niveau,
    };

    return joinFromPayload(payload, session);
  }

  async function acceptCall(payload) {
    const acceptBtn = modalEl?.querySelector("[data-call-accept]");
    if (acceptBtn) {
      acceptBtn.disabled = true;
      acceptBtn.textContent = "Connexion…";
    }
    stopRing();

    try {
      await joinFromPayload(payload);
      hideModal();
    } catch (err) {
      alert(err.message || "Impossible de rejoindre le live.");
      if (acceptBtn) {
        acceptBtn.disabled = false;
        acceptBtn.textContent = "Rejoindre";
      }
      startRing();
    }
  }

  function showIncomingCall(payload, force) {
    if (!isEligible(sessionRef, payload)) return;
    if (!force && wasRecentlyDeclined(payload.sessionId)) return;
    if (modalEl) return;

    activePayload = payload;
    syncCourseFromPayload(payload);
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
        <p class="sac-live-call__hint">Sonnerie active — touchez « Rejoindre » pour entrer dans la salle</p>
        <div class="sac-live-call__actions">
          <button type="button" class="sac-live-call__btn sac-live-call__btn--decline" data-call-decline>Refuser</button>
          <button type="button" class="sac-live-call__btn sac-live-call__btn--accept" data-call-accept>Rejoindre</button>
        </div>
      </div>`;

    modalEl.querySelector("[data-call-decline]").onclick = () => {
      markDeclined(payload.sessionId);
      hideModal();
    };
    modalEl.querySelector("[data-call-accept]").onclick = () => acceptCall(payload);

    document.body.appendChild(modalEl);
    document.body.style.overflow = "hidden";
    unlockAudio();
    startRing();
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
    if (wasRecentlyDeclined(payload.sessionId)) return;
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
          if (wasRecentlyDeclined(item.sessionId)) continue;
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
      if (wasRecentlyDeclined(item.sessionId)) continue;
      showIncomingCall(item);
      break;
    }
  }

  function init(session) {
    sessionRef = session;
    requestNotifPermission();
    ensureRingAudio();

    const unlockOnce = () => unlockAudio();
    document.addEventListener("touchstart", unlockOnce, { once: true, passive: true });
    document.addEventListener("click", unlockOnce, { once: true, passive: true });

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

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) checkForLiveSignals();
    });

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
    if (ringBlobUrl) {
      URL.revokeObjectURL(ringBlobUrl);
      ringBlobUrl = null;
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
    joinCourse,
    joinFromPayload,
    unlockAudio,
  };
})();

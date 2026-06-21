/**

 * Cours en direct SAC — vidéo WebRTC SAC + présence, documents, Q&A, IA, rapports

 */

const SAC_LIVE = (function () {

  const STORAGE_KEY = "sac_live_sessions";

  const NOTIF_KEY = "sac_live_notifications";

  let activeRoomId = null;



  function read(key) {

    try {

      return JSON.parse(localStorage.getItem(key) || "[]");

    } catch {

      return [];

    }

  }



  function write(key, data) {

    localStorage.setItem(key, JSON.stringify(data));

  }



  function uid(p) {

    return p + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);

  }



  function esc(s) {

    return String(s ?? "")

      .replace(/&/g, "&amp;")

      .replace(/</g, "&lt;")

      .replace(/>/g, "&gt;")

      .replace(/"/g, "&quot;");

  }



  function getSession() {

    return typeof SAC_SESSION !== "undefined" ? SAC_SESSION.getSession() : null;

  }



  function displayName(s) {

    if (typeof SAC_IDENTITY !== "undefined") return SAC_IDENTITY.getDisplayName(s);

    return [s?.prenom, s?.nom].filter(Boolean).join(" ") || s?.email || s?.identifiant || "Participant";

  }



  function isHostRole(role) {

    return role === "professeur" || role === "universite" || role === "assistant" || role === "section";

  }



  async function api(path, opts) {

    if (typeof SAC_API === "undefined") return null;

    if (!(await SAC_API.ensureOnline())) return null;

    try {

      return await SAC_API.platformRequest(path, opts);

    } catch {

      return null;

    }

  }



  function sanitizeRoom(title, id) {

    const slug = String(title || "cours")

      .toLowerCase()

      .replace(/[^a-z0-9]+/g, "-")

      .replace(/^-|-$/g, "")

      .slice(0, 40);

    return `sac-${slug}-${String(id).slice(-6)}`;

  }



  function emptySessionExtras() {

    return {

      documents: [],

      attendance: [],

      questions: [],

      transcript: "",

      aiSummary: "",

      aiKeyPoints: [],

      participationReport: null,

    };

  }



  function getById(sessionId) {

    return read(STORAGE_KEY).find((x) => x.id === sessionId) || null;

  }



  function patchLocal(sessionId, patch) {

    const list = read(STORAGE_KEY);

    const idx = list.findIndex((x) => x.id === sessionId);

    if (idx < 0) throw new Error("NOT_FOUND");

    list[idx] = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };

    write(STORAGE_KEY, list);

    return list[idx];

  }



  function localNotify(liveSession, type, title, message) {

    const notifs = read(NOTIF_KEY);

    notifs.unshift({

      id: uid("ln"),

      type,

      title,

      message,

      sessionId: liveSession.id,

      read: false,

      createdAt: new Date().toISOString(),

      universite: liveSession.universite,

    });

    write(NOTIF_KEY, notifs.slice(0, 80));

  }



  function pushBrowserNotif(title, body) {

    if (!("Notification" in window)) return;

    if (Notification.permission === "granted") {

      new Notification(title, { body, icon: "logos.svg" });

    } else if (Notification.permission !== "denied") {

      Notification.requestPermission().then((p) => {

        if (p === "granted") new Notification(title, { body, icon: "logos.svg" });

      });

    }

  }



  function aiAnalyze(text, title) {

    const sentences = String(text || "")

      .split(/[.!?\n]+/)

      .map((s) => s.trim())

      .filter(Boolean);

    const kw = ["décision", "important", "chapitre", "exercice", "examen", "résumé", "notion", "définition"];

    const keyPoints = sentences.filter((s) => kw.some((k) => s.toLowerCase().includes(k))).slice(0, 8);

    const summary =

      `Cours « ${title} » — ${sentences.length} segment(s) transcrit(s). ` +

      (keyPoints.length ? "Points clés : " + keyPoints.slice(0, 3).join("; ") + "." : "Contenu enregistré pour révision.");

    return {

      aiSummary: summary,

      aiKeyPoints: keyPoints.length ? keyPoints : ["Cours tenu en direct", "Supports partagés disponibles"],

    };

  }



  function buildParticipationReport(liveSession) {

    const att = liveSession.attendance || [];

    const qs = liveSession.questions || [];

    const durationMin =

      liveSession.startedAt && liveSession.endedAt

        ? Math.max(1, Math.round((new Date(liveSession.endedAt) - new Date(liveSession.startedAt)) / 60000))

        : null;

    return {

      generatedAt: new Date().toISOString(),

      totalPresent: att.length,

      totalQuestions: qs.length,

      durationMinutes: durationMin,

      attendees: att.map((a) => ({

        name: a.name,

        email: a.email,

        role: a.role,

        joinedAt: a.joinedAt,

        durationMinutes: a.durationMinutes || durationMin,

      })),

      engagementRate: att.length ? Math.min(100, Math.round((qs.length / att.length) * 100)) : 0,

    };

  }



  async function listSessions() {

    const data = await api("/platform/live/sessions");

    if (data?.sessions) return data.sessions;

    const s = getSession();

    return read(STORAGE_KEY)

      .filter((x) => !s?.universite || x.universite === s.universite)

      .filter((x) => {

        if (!s) return true;
        if (isHostRole(s.role) && s.role !== "section") return true;
        if (s.role === "section") {
          const sf = String(s.filiere || "").trim().toLowerCase();
          const xf = String(x.filiere || "").trim().toLowerCase();
          if (!sf || !xf) return true;
          return sf === xf || sf.includes(xf) || xf.includes(sf);
        }

        if (x.status !== "live" && x.status !== "scheduled") return true;

        if (!x.filiere && !x.niveau) return true;

        if (x.filiere && s.filiere && x.filiere !== s.filiere) return false;

        if (x.niveau && s.niveau && x.niveau !== s.niveau) return false;

        return true;

      })

      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

  }



  async function createSession(payload) {

    const data = await api("/platform/live/sessions", {

      method: "POST",

      body: JSON.stringify(payload),

    });

    if (data?.session) return data.session;

    const s = getSession();

    const id = uid("live");

    const row = {

      id,

      universite: s?.universite,

      professorEmail: s?.email || s?.identifiant,

      professorName: displayName(s),

      title: payload.title,

      description: payload.description || "",

      courseCode: payload.courseCode || "",

      filiere: payload.filiere || s?.filiere,

      niveau: payload.niveau || s?.niveau,

      roomName: sanitizeRoom(payload.title, id),

      status: "scheduled",

      joinUrl: "sac-live:" + sanitizeRoom(payload.title, id),

      scheduledAt: payload.scheduledAt || new Date().toISOString(),

      createdAt: new Date().toISOString(),

      updatedAt: new Date().toISOString(),

      ...emptySessionExtras(),

    };

    const list = read(STORAGE_KEY);

    list.unshift(row);

    write(STORAGE_KEY, list);

    localNotify(row, "live_session_scheduled", "Cours programmé", "« " + row.title + " » a été programmé.");

    return row;

  }



  async function startSession(sessionId) {

    const data = await api("/platform/live/sessions/" + sessionId + "/start", { method: "POST" });

    if (data?.session) {

      pushBrowserNotif("Cours en direct", data.session.title + " — rejoignez maintenant.");

      if (typeof SAC_LIVE_CALL !== "undefined") {
        SAC_LIVE_CALL.signalLiveStart({
          kind: "course",
          sessionId: data.session.id,
          title: data.session.title,
          hostName: data.session.professorName,
          roomName: data.session.roomName,
          universite: data.session.universite,
          filiere: data.session.filiere,
          niveau: data.session.niveau,
        });
      }

      return data.session;

    }

    const row = patchLocal(sessionId, { status: "live", startedAt: new Date().toISOString() });

    localNotify(row, "live_session_start", "Cours en direct", "« " + row.title + " » est en direct.");

    pushBrowserNotif("🔴 Cours en direct", row.title + " — rejoignez avec votre compte SAC.");

    if (typeof SAC_LIVE_CALL !== "undefined") {
      SAC_LIVE_CALL.signalLiveStart({
        kind: "course",
        sessionId: row.id,
        title: row.title,
        hostName: row.professorName,
        roomName: row.roomName,
        universite: row.universite,
        filiere: row.filiere,
        niveau: row.niveau,
      });
    }

    return row;

  }



  async function endSession(sessionId, opts) {

    opts = opts || {};

    const data = await api("/platform/live/sessions/" + sessionId + "/end", {

      method: "POST",

      body: JSON.stringify({ recordingUrl: opts.recordingUrl || "", transcript: opts.transcript || "" }),

    });

    if (data?.session) {
      if (typeof SAC_LIVE_CALL !== "undefined") {
        SAC_LIVE_CALL.clearLiveSignal(sessionId);
      }
      return data.session;
    }



    const current = getById(sessionId);

    const ai = aiAnalyze(opts.transcript || current?.transcript, current?.title || "Cours");

    const endedAt = new Date().toISOString();

    const withReport = {

      status: "ended",

      endedAt,

      recordingUrl: opts.recordingUrl || current?.recordingUrl || "",

      transcript: opts.transcript || current?.transcript || "",

      ...ai,

    };

    const row = patchLocal(sessionId, withReport);

    row.participationReport = buildParticipationReport(row);

    patchLocal(sessionId, { participationReport: row.participationReport });

    localNotify(row, "live_session_ended", "Cours terminé", "Rapport et enregistrement pour « " + row.title + " ».");

    if (typeof SAC_LIVE_CALL !== "undefined") {
      SAC_LIVE_CALL.clearLiveSignal(sessionId);
    }

    return getById(sessionId);

  }



  async function recordAttendance(sessionId, user) {

    const email = (user?.email || user?.identifiant || "").toLowerCase();

    if (!email) return getById(sessionId);

    const row = getById(sessionId);

    if (!row) throw new Error("NOT_FOUND");

    const att = row.attendance || [];

    if (att.some((a) => a.email === email)) return row;

    const entry = {

      id: uid("att"),

      email,

      name: displayName(user),

      role: user.role || "etudiant",

      joinedAt: new Date().toISOString(),

    };

    return patchLocal(sessionId, { attendance: [entry, ...att] });

  }



  async function joinSession(sessionId, user) {

    const u = user || getSession();

    const data = await api("/platform/live/sessions/" + sessionId + "/join", { method: "POST" });

    if (data?.session) {

      if (u?.role === "etudiant") await recordAttendance(sessionId, u);

      return data.session;

    }

    const row = getById(sessionId);

    if (!row) throw new Error("NOT_FOUND");

    if (row.status === "ended") throw new Error("SESSION_ENDED");

    if (u) await recordAttendance(sessionId, u);

    return getById(sessionId);

  }



  async function addDocument(sessionId, doc, user) {

    const row = getById(sessionId);

    if (!row) throw new Error("NOT_FOUND");

    const documents = [

      {

        id: uid("doc"),

        name: doc.name,

        type: doc.type || "file",

        url: doc.url,

        uploadedAt: new Date().toISOString(),

        uploadedBy: displayName(user),

      },

      ...(row.documents || []),

    ];

    return patchLocal(sessionId, { documents });

  }



  async function addQuestion(sessionId, text, user) {

    const row = getById(sessionId);

    if (!row) throw new Error("NOT_FOUND");

    const questions = [

      {

        id: uid("q"),

        text,

        author: displayName(user),

        authorEmail: user?.email || user?.identifiant,

        createdAt: new Date().toISOString(),

        answer: "",

      },

      ...(row.questions || []),

    ];

    return patchLocal(sessionId, { questions });

  }



  async function answerQuestion(sessionId, questionId, answer) {

    const row = getById(sessionId);

    if (!row) throw new Error("NOT_FOUND");

    const questions = (row.questions || []).map((q) =>

      q.id === questionId ? { ...q, answer, answeredAt: new Date().toISOString() } : q

    );

    return patchLocal(sessionId, { questions });

  }



  async function runTranscription(sessionId, text) {

    const row = getById(sessionId);

    if (!row) throw new Error("NOT_FOUND");

    const ai = aiAnalyze(text, row.title);

    return patchLocal(sessionId, { transcript: text, ...ai });

  }



  async function getNotifications() {

    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {

      try {

        const data = await SAC_API.platformRequest("/platform/corrections/notifications");

        const live = (data.notifications || []).filter((n) => String(n.type || "").startsWith("live_session"));

        if (live.length) return live;

      } catch {

        /* local */

      }

    }

    return read(NOTIF_KEY).filter((n) => !n.read);

  }



  function statusLabel(status) {

    return { scheduled: "Programmé", live: "EN DIRECT", ended: "Terminé" }[status] || status;

  }



  function statusClass(status) {

    return "live-badge live-badge--" + (status || "scheduled");

  }



  function liveRoomName(liveSession) {
    return liveSession.roomName || sanitizeRoom(liveSession.title, liveSession.id);
  }

  function openSacVideoRoom(hostId, roomName, userName, onLeave) {
    if (typeof SAC_WEBRTC_ROOM === "undefined") {
      alert("Module vidéo SAC indisponible.");
      return;
    }
    SAC_WEBRTC_ROOM.attachToHost(hostId, {
      roomId: roomName,
      displayName: userName,
      onLeave,
      onParticipantsChange: (list) => {
        const root = document.getElementById("sacLivePresenceRoot");
        if (root && typeof SAC_WEBRTC_ROOM !== "undefined") {
          SAC_WEBRTC_ROOM.renderPresenceList(root, list);
        }
      },
    }).catch((err) => {
      alert(err.message || "Impossible d'ouvrir la salle live SAC.");
      if (typeof onLeave === "function") onLeave();
    });
  }



  function renderSidePanel(liveSession, user, isHost) {

    const panel = document.getElementById("sacLiveSidePanel");

    if (!panel) return;

    const docs = liveSession.documents || [];

    const att = liveSession.attendance || [];

    const qs = liveSession.questions || [];



    panel.innerHTML = `

      <div id="sacLivePresenceRoot" class="live-side__presence-wrap"></div>

      <div class="live-side__tabs">

        <button type="button" class="live-side__tab active" data-side="docs">📄 Docs</button>

        <button type="button" class="live-side__tab" data-side="qa">❓ Q&R</button>

        <button type="button" class="live-side__tab" data-side="att">📝 Présence</button>

        ${isHost ? '<button type="button" class="live-side__tab" data-side="ai">🤖 IA</button>' : ""}

      </div>

      <div class="live-side__body" id="sacLiveSideBody">

        <div data-panel="docs">

          ${isHost ? `<label class="live-side__upload">Partager PDF / Word / PPT

            <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,application/pdf" id="sacLiveDocInput" />

          </label>

          <label style="margin-top:0.5rem;font-size:0.8rem">Ou lien (Drive, OneDrive…)

            <input type="url" id="sacLiveDocUrl" placeholder="https://…" class="live-side__input" />

            <button type="button" class="live-btn live-btn--ghost" id="sacLiveDocLinkBtn" style="margin-top:0.35rem">Ajouter le lien</button>

          </label>` : ""}

          <ul class="live-side__list">${

            docs.length

              ? docs

                  .map(

                    (d) =>

                      `<li><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.name)}</a><span>${esc(d.type)}</span></li>`

                  )

                  .join("")

              : "<li class='live-side__empty'>Aucun document partagé.</li>"

          }</ul>

        </div>

      </div>`;



    function showPanel(id) {

      const body = panel.querySelector("#sacLiveSideBody");

      if (id === "docs") {
        body.innerHTML = `
          ${isHost ? `<label class="live-side__upload">Partager PDF / Word / PPT
            <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,application/pdf" id="sacLiveDocInput" />
          </label>
          <label style="margin-top:0.5rem;font-size:0.8rem;display:flex;flex-direction:column;gap:0.3rem">Lien (Drive, OneDrive…)
            <input type="url" id="sacLiveDocUrl" placeholder="https://…" class="live-side__input" />
            <button type="button" class="live-btn live-btn--ghost" id="sacLiveDocLinkBtn">Ajouter le lien</button>
          </label>` : ""}
          <ul class="live-side__list">${
            docs.length
              ? docs.map((d) => `<li><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.name)}</a><span>${esc(d.type)}</span></li>`).join("")
              : "<li class='live-side__empty'>Aucun document partagé.</li>"
          }</ul>`;
        bindDocs();
        return;
      }

      if (id === "qa") {

        body.innerHTML = `

          <form id="sacLiveQaForm" class="live-side__qa-form">

            <input type="text" id="sacLiveQaInput" placeholder="Posez votre question…" required class="live-side__input" />

            <button type="submit" class="live-btn live-btn--join">Envoyer</button>

          </form>

          <div class="live-side__qa-list">${qs

            .map(

              (q) =>

                `<div class="live-side__qa-item"><strong>${esc(q.author)}</strong><p>${esc(q.text)}</p>` +

                (q.answer

                  ? `<p class="live-side__answer">↳ ${esc(q.answer)}</p>`

                  : isHost

                    ? `<button type="button" class="live-btn live-btn--ghost" data-answer="${esc(q.id)}">Répondre</button>`

                    : "") +

                `</div>`

            )

            .join("")}</div>`;

        body.querySelector("#sacLiveQaForm")?.addEventListener("submit", async (e) => {

          e.preventDefault();

          const input = body.querySelector("#sacLiveQaInput");

          if (!input.value.trim()) return;

          const updated = await addQuestion(liveSession.id, input.value.trim(), user);

          Object.assign(liveSession, updated);

          showPanel("qa");

        });

        body.querySelectorAll("[data-answer]").forEach((btn) => {

          btn.onclick = async () => {

            const ans = prompt("Votre réponse :");

            if (!ans) return;

            const updated = await answerQuestion(liveSession.id, btn.dataset.answer, ans);

            Object.assign(liveSession, updated);

            showPanel("qa");

          };

        });

        return;

      }

      if (id === "att") {

        body.innerHTML = `<p class="live-side__meta">${att.length} participant(s) — présence automatique à la connexion</p>

          <ul class="live-side__list">${

            att.length

              ? att

                  .map(

                    (a) =>

                      `<li><strong>${esc(a.name)}</strong><span>${esc(a.role)} · ${esc((a.joinedAt || "").slice(11, 16))}</span></li>`

                  )

                  .join("")

              : "<li class='live-side__empty'>En attente de participants…</li>"

          }</ul>`;

        return;

      }

      if (id === "ai" && isHost) {

        body.innerHTML = `

          <p class="live-side__meta">Transcription IA du cours (collez les notes ou la transcription audio)</p>

          <textarea id="sacLiveTranscript" rows="6" class="live-side__input" placeholder="Contenu du cours…">${esc(liveSession.transcript || "")}</textarea>

          <button type="button" class="live-btn live-btn--join" id="sacLiveRunAi">Générer transcription IA</button>

          ${liveSession.aiSummary ? `<div class="live-side__ai-box"><strong>Résumé</strong><p>${esc(liveSession.aiSummary)}</p></div>` : ""}`;

        body.querySelector("#sacLiveRunAi")?.addEventListener("click", async () => {

          const text = body.querySelector("#sacLiveTranscript").value;

          const updated = await runTranscription(liveSession.id, text);

          Object.assign(liveSession, updated);

          showPanel("ai");

        });

      }

    }



    function bindDocs() {

      const body = panel.querySelector("#sacLiveSideBody");

      body.querySelector("#sacLiveDocInput")?.addEventListener("change", async (e) => {

        const file = e.target.files?.[0];

        if (!file) return;

        const url = URL.createObjectURL(file);

        const updated = await addDocument(

          liveSession.id,

          { name: file.name, type: file.name.split(".").pop()?.toUpperCase() || "FILE", url },

          user

        );

        Object.assign(liveSession, updated);

        showPanel("docs");

      });

      body.querySelector("#sacLiveDocLinkBtn")?.addEventListener("click", async () => {

        const url = body.querySelector("#sacLiveDocUrl")?.value?.trim();

        if (!url) return;

        const name = prompt("Nom du document :", "Support de cours");

        if (!name) return;

        const updated = await addDocument(liveSession.id, { name, type: "LIEN", url }, user);

        Object.assign(liveSession, updated);

        showPanel("docs");

      });

    }



    panel.querySelectorAll(".live-side__tab").forEach((tab) => {

      tab.onclick = () => {

        panel.querySelectorAll(".live-side__tab").forEach((t) => t.classList.toggle("active", t === tab));

        showPanel(tab.dataset.side);

      };

    });

    showPanel("docs");

  }



  function openRoom(liveSession, user) {

    const userName = displayName(user);

    const isHost = isHostRole(user?.role);

    activeRoomId = liveSession.id;



    let overlay = document.getElementById("sacLiveRoomOverlay");

    if (!overlay) {

      overlay = document.createElement("div");

      overlay.id = "sacLiveRoomOverlay";

      overlay.className = "live-room-overlay";

      overlay.innerHTML = `

        <div class="live-room__head">

          <div>

            <h3 id="sacLiveRoomTitle"></h3>

            <span class="live-room__sub" id="sacLiveRoomSub"></span>

          </div>

          <button type="button" class="live-btn live-btn--ghost" id="sacLiveRoomClose" style="color:#fff;border-color:rgba(255,255,255,0.4)">✕ Quitter</button>

        </div>

        <div class="live-room__layout">

            <div class="live-room__frame-wrap">

            <div class="live-room__frame sac-webrtc-host" id="sacLiveRoomFrame"></div>

          </div>

          <aside class="live-room__side" id="sacLiveSidePanel"></aside>

        </div>

        <p class="live-room__hint">🎥 Vidéo SAC · 🎤 Audio · 🖥️ Partage d'écran · 💬 Commentaires sur l'écran · ⏺️ Enregistrement</p>`;

      document.body.appendChild(overlay);

      overlay.querySelector("#sacLiveRoomClose").addEventListener("click", closeRoom);

    }



    const fresh = getById(liveSession.id) || liveSession;

    document.getElementById("sacLiveRoomTitle").textContent = fresh.title || "Cours en direct";

    document.getElementById("sacLiveRoomSub").textContent =

      (fresh.attendance?.length || 0) + " présent(s) · " + (fresh.documents?.length || 0) + " document(s)";

    openSacVideoRoom("sacLiveRoomFrame", liveRoomName(fresh), userName, closeRoom);

    renderSidePanel(fresh, user, isHost);

    overlay.hidden = false;

    document.body.style.overflow = "hidden";

  }



  function closeRoom() {

    activeRoomId = null;

    if (typeof SAC_WEBRTC_ROOM !== "undefined") SAC_WEBRTC_ROOM.leave();

    const overlay = document.getElementById("sacLiveRoomOverlay");

    if (overlay) {

      overlay.hidden = true;

      const frame = document.getElementById("sacLiveRoomFrame");

      if (frame) frame.innerHTML = "";

    }

    document.body.style.overflow = "";

  }



  function renderReportCard(liveSession) {

    const r = liveSession.participationReport;

    if (!r) return "";

    return `<div class="live-report">

      <h4>📊 Rapport — ${esc(liveSession.title)}</h4>

      <div class="live-report__stats">

        <span><strong>${r.totalPresent}</strong> présents</span>

        <span><strong>${r.totalQuestions}</strong> questions</span>

        <span><strong>${r.durationMinutes || "—"}</strong> min</span>

        <span><strong>${r.engagementRate}%</strong> engagement</span>

      </div>

      ${liveSession.aiSummary ? `<p class="live-report__summary">${esc(liveSession.aiSummary)}</p>` : ""}

    </div>`;

  }



  function renderSessionCard(liveSession, role) {

    const isProf = isHostRole(role);

    const isLive = liveSession.status === "live";

    let actions = "";

    if (isLive || liveSession.status === "scheduled") {

      if (!isProf || isLive) {

        actions += `<button type="button" class="live-btn live-btn--join" data-join="${esc(liveSession.id)}">▶ Rejoindre le cours</button>`;

      }

    }

    if (isProf && liveSession.status === "scheduled") {

      actions += `<button type="button" class="live-btn live-btn--start" data-start="${esc(liveSession.id)}">🔴 Démarrer le live</button>`;

    }

    if (isProf && liveSession.status === "live") {

      actions += `<button type="button" class="live-btn live-btn--ghost" data-end="${esc(liveSession.id)}">⏹ Terminer</button>`;

    }

    if (isProf && liveSession.status === "ended") {

      actions += `<button type="button" class="live-btn live-btn--ghost" data-report="${esc(liveSession.id)}">📊 Rapport</button>`;

      actions += `<button type="button" class="live-btn live-btn--ghost" data-rec="${esc(liveSession.id)}">📎 Enregistrement</button>`;

    }

    if (liveSession.recordingUrl) {

      actions += `<a class="live-rec-link" href="${esc(liveSession.recordingUrl)}" target="_blank" rel="noopener">🎬 Revoir</a>`;

    }

    const meta =

      (liveSession.attendance?.length ? liveSession.attendance.length + " présents · " : "") +

      (liveSession.documents?.length ? liveSession.documents.length + " docs · " : "") +

      (liveSession.questions?.length ? liveSession.questions.length + " questions" : "");



    return `<article class="live-card${isLive ? " live-card--live" : ""}">

      <span class="${statusClass(liveSession.status)}">${isLive ? "● " : ""}${esc(statusLabel(liveSession.status))}</span>

      <div class="live-card__title">${esc(liveSession.title)}</div>

      <div class="live-card__meta">${esc(liveSession.professorName || "")}${liveSession.courseCode ? " · " + esc(liveSession.courseCode) : ""}</div>

      ${meta ? `<p class="live-card__stats">${esc(meta)}</p>` : ""}

      ${liveSession.description ? `<p style="font-size:0.85rem;color:var(--text-muted);margin:0">${esc(liveSession.description)}</p>` : ""}

      <div class="live-card__actions">${actions}</div>

      ${liveSession.status === "ended" ? renderReportCard(liveSession) : ""}

    </article>`;

  }



  function bindSessionActions(root, session, userName, user, renderDirect) {

    root.querySelectorAll("[data-join]").forEach((btn) => {

      btn.addEventListener("click", async () => {

        const s = await joinSession(btn.dataset.join, user);

        openRoom(s, user);

      });

    });

    root.querySelectorAll("[data-start]").forEach((btn) => {

      btn.addEventListener("click", async () => {

        const s = await startSession(btn.dataset.start);

        openRoom(s, user);

        await renderDirect();

      });

    });

    root.querySelectorAll("[data-end]").forEach((btn) => {

      btn.addEventListener("click", async () => {

        const transcript = prompt("Notes / transcription du cours (IA générera le résumé) :", "") || "";

        const url = prompt("URL enregistrement (YouTube, Drive…) — vide si pas encore prêt :", "") || "";

        await endSession(btn.dataset.end, { recordingUrl: url, transcript });

        closeRoom();

        await renderDirect();

      });

    });

    root.querySelectorAll("[data-rec]").forEach((btn) => {

      btn.addEventListener("click", async () => {

        const url = prompt("URL de l'enregistrement :");

        if (!url) return;

        patchLocal(btn.dataset.rec, { recordingUrl: url });

        await renderDirect();

      });

    });

    root.querySelectorAll("[data-report]").forEach((btn) => {

      btn.onclick = () => {

        const s = getById(btn.dataset.report);

        if (!s?.participationReport) {

          alert("Rapport non disponible.");

          return;

        }

        const r = s.participationReport;

        alert(

          "Rapport de participation\n\n" +

            "Présents : " + r.totalPresent + "\n" +

            "Questions : " + r.totalQuestions + "\n" +

            "Durée : " + (r.durationMinutes || "—") + " min\n" +

            "Engagement : " + r.engagementRate + "%\n\n" +

            (s.aiSummary || "")

        );

      };

    });

  }



  async function mountUI(container, session) {

    if (!container) return;

    const role = session.role;

    const isProf = isHostRole(role);

    const user = session;



    container.innerHTML = `

      <div class="live-wrap" id="sacLiveRoot">

        <div class="live-feature-bar">

          <span>🎓 Prof lance le live</span>

          <span>👨‍🎓 Étudiants avec compte</span>

          <span>📄 PDF · Word · PPT</span>

          <span>📝 Présence auto</span>

          <span>🤖 IA · Q&R · 🔔 Notifs</span>

        </div>

        <div class="live-tabs">

          <button type="button" class="live-tab active" data-live-tab="direct">🔴 Cours en direct</button>

          <button type="button" class="live-tab" data-live-tab="mooc">📚 Modules MOOC</button>

        </div>

        <div id="sacLiveNotifs"></div>

        <div id="sacLivePanel"></div>

      </div>`;



    const panel = container.querySelector("#sacLivePanel");

    const notifsEl = container.querySelector("#sacLiveNotifs");



    async function renderMooc() {

      if (typeof SAC_PLATFORM === "undefined") {

        panel.innerHTML = "<p>Modules MOOC — connectez-vous à la plateforme.</p>";

        return;

      }

      const courses = await SAC_PLATFORM.getCourses();

      panel.innerHTML = courses.length

        ? "<div class='live-grid'>" +

          courses.map((c) => "<article class='live-card'><div class='live-card__title'>" + esc(c.title) + "</div><p>" + esc(c.description || "") + "</p></article>").join("") +

          "</div>"

        : "<p>Aucun module MOOC.</p>";

    }



    async function renderDirect() {

      const sessions = await listSessions();

      const liveNow = sessions.filter((s) => s.status === "live");

      const notifs = await getNotifications();



      if (liveNow.length) {

        notifsEl.innerHTML = `<div class="live-notif-bar live-notif-bar--live"><span>🔴</span><div><strong>${liveNow.length} cours en direct</strong> — Rejoignez avec votre compte. Notification envoyée au démarrage.</div></div>`;

      } else if (notifs.length) {

        notifsEl.innerHTML = `<div class="live-notif-bar"><span>🔔</span><div>${esc(notifs[0].message || notifs[0].title)}</div></div>`;

      } else {

        notifsEl.innerHTML = "";

      }



      let html = "";

      if (isProf) {

        html += `<form class="live-form" id="sacLiveCreateForm">

          <strong style="color:var(--primary)">Lancer un cours en direct</strong>

          <label>Titre<input name="title" required placeholder="Ex. TD — Chapitre 3" /></label>

          <label>Code cours<input name="courseCode" placeholder="ECO101" /></label>

          <label>Description<textarea name="description" rows="2"></textarea></label>

          <label>Filière<input name="filiere" value="${esc(session.filiere || "")}" /></label>

          <label>Niveau<select name="niveau"><option value="">Tous</option><option value="l1">L1</option><option value="l2">L2</option><option value="l3">L3</option><option value="master1">M1</option><option value="master2">M2</option></select></label>

          <button type="submit" class="live-btn live-btn--start">+ Créer puis démarrer</button>

        </form>`;

      }



      html += `<div class="live-grid">${

        sessions.length

          ? sessions.map((s) => renderSessionCard(s, role)).join("")

          : "<p class='pub-empty'>" + (isProf ? "Créez votre premier cours live." : "Aucun cours en direct pour le moment.") + "</p>"

      }</div>`;



      panel.innerHTML = html;



      panel.querySelector("#sacLiveCreateForm")?.addEventListener("submit", async (e) => {

        e.preventDefault();

        const fd = new FormData(e.target);

        const created = await createSession({

          title: fd.get("title"),

          courseCode: fd.get("courseCode"),

          description: fd.get("description"),

          filiere: fd.get("filiere") || session.filiere,

          niveau: fd.get("niveau") || session.niveau,

        });

        const live = await startSession(created.id);

        openRoom(live, user);

        await renderDirect();

      });



      bindSessionActions(panel, session, displayName(user), user, renderDirect);

    }



    container.querySelectorAll("[data-live-tab]").forEach((tab) => {

      tab.addEventListener("click", () => {

        container.querySelectorAll(".live-tab").forEach((t) => t.classList.toggle("active", t === tab));

        if (tab.dataset.liveTab === "mooc") renderMooc();

        else renderDirect();

      });

    });



    if ("Notification" in window && Notification.permission === "default") {

      Notification.requestPermission();

    }



    await renderDirect();



    const joinId = new URLSearchParams(window.location.search).get("joinLive");

    if (joinId) {

      try {

        const s = await joinSession(joinId, user);

        openRoom(s, user);

      } catch {

        /* ignore */

      }

    }



    setInterval(async () => {

      const live = (await listSessions()).filter((s) => s.status === "live");

      if (live.length && !activeRoomId) {

        const cur = notifsEl.querySelector(".live-notif-bar--live strong");

        if (cur) cur.textContent = live.length + " cours en direct";

      }

    }, 30000);

  }



  function seedDemoIfEmpty() {

    const s = getSession();

    if (!s?.universite || read(STORAGE_KEY).length) return;

    if (!isHostRole(s.role)) return;

    const id = uid("live");

    write(STORAGE_KEY, [

      {

        id,

        universite: s.universite,

        professorEmail: s.email || s.identifiant,

        professorName: displayName(s),

        title: "TD — Introduction à l'économie (démo)",

        description: "Démo : présence auto, partage PDF, Q&R et transcription IA.",

        courseCode: "ECO101",

        filiere: s.filiere,

        niveau: s.niveau,

        roomName: sanitizeRoom("eco101-demo", id),

        status: "scheduled",

        joinUrl: "sac-live:" + sanitizeRoom("eco101-demo", id),

        createdAt: new Date().toISOString(),

        updatedAt: new Date().toISOString(),

        ...emptySessionExtras(),

      },

    ]);

  }



  return {

    listSessions,

    createSession,

    startSession,

    endSession,

    joinSession,

    recordAttendance,

    addDocument,

    addQuestion,

    openRoom,

    closeRoom,

    mountUI,

    seedDemoIfEmpty,

  };

})();



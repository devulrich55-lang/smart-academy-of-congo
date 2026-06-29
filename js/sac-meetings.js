/**
 * Réunions institutionnelles SAC
 * Chef section ↔ Professeurs | Doyen ↔ Chefs de section
 * Vidéo SAC WebRTC · Documents · Votes · IA (transcription, résumé, traduction, Q&A)
 */
const SAC_MEETINGS = (function () {
  const STORAGE_KEY = "sac_meetings";

  function read() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function write(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function uid(p) {
    return p + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  }

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

  async function api(path, opts) {
    if (typeof SAC_API === "undefined") return null;
    if (!(await SAC_API.ensureOnline())) return null;
    try {
      return await SAC_API.platformRequest(path, opts);
    } catch {
      return null;
    }
  }

  function aiAnalyze(text, title) {
    const sentences = String(text || "")
      .split(/[.!?\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const kw = ["décision", "vote", "action", "résultat", "moyenne", "note", "important", "recommandation"];
    const keyPoints = sentences.filter((s) => kw.some((k) => s.toLowerCase().includes(k))).slice(0, 8);
    const summary =
      `Réunion « ${title} » — ${sentences.length} intervention(s) analysées. ` +
      (keyPoints.length ? "Points clés : " + keyPoints.slice(0, 3).join("; ") + "." : "Ordre du jour traité.");
    return {
      aiSummary: summary,
      aiKeyPoints: keyPoints.length ? keyPoints : ["Séance tenue", "Suivi à planifier"],
      aiTranslations: { en: sentences.slice(0, 4).map((s) => "[EN] " + s).join("\n"), fr: text?.slice(0, 500) || "" },
    };
  }

  function profEmailsForSection(uni, filiere) {
    const users = JSON.parse(localStorage.getItem("sac_users") || "[]");
    const fl = (filiere || "").toLowerCase();
    return users
      .filter((u) => u.role === "professeur" && u.universite === uni)
      .filter((u) => {
        if (!fl) return true;
        const classes = u.coursClasses || [];
        return classes.some((c) => {
          const cf = (c.filiere || "").toLowerCase();
          return !cf || cf.includes(fl) || fl.includes(cf);
        });
      })
      .map((u) => u.email);
  }

  function sectionHeadEmails(uni) {
    if (typeof SAC_SECTIONS === "undefined") return [];
    return SAC_SECTIONS.getSections()
      .filter((s) => s.universite === uni && s.active !== false && s.email)
      .map((s) => s.email.toLowerCase());
  }

  async function listMeetings() {
    const data = await api("/platform/meetings");
    if (data?.meetings) return data.meetings;
    const s = typeof SAC_SESSION !== "undefined" ? SAC_SESSION.getSession() : null;
    const email = (s?.email || s?.identifiant || "").toLowerCase();
    return read().filter((m) => {
      if (s?.universite && m.universite !== s.universite) return false;
      if (s?.role === "universite") return true;
      if (m.status === "live" && m.type === "conference") return true;
      const allowed = (m.allowedEmails || []).map((e) => e.toLowerCase());
      return allowed.includes(email) || (m.hostEmail || "").toLowerCase() === email;
    });
  }

  async function createMeeting(payload) {
    const data = await api("/platform/meetings", { method: "POST", body: JSON.stringify(payload) });
    if (data?.meeting) return data.meeting;
    const s = typeof SAC_SESSION !== "undefined" ? SAC_SESSION.getSession() : {};
    const id = uid("mtg");
    const row = {
      id,
      ...payload,
      universite: s.universite,
      hostEmail: s.email || s.identifiant,
      hostName: displayName(s),
      roomName: "sac-mtg-" + id.slice(-10),
      status: "scheduled",
      documents: [],
      votes: [],
      allowedEmails: payload.allowedEmails || [],
      statsSnapshot: payload.type === "dean_sections" ? buildLocalStats() : {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      joinUrl: "sac-mtg:" + "sac-mtg-" + id.slice(-10),
    };
    const list = read();
    list.unshift(row);
    write(list);
    return row;
  }

  function buildLocalStats() {
    const grades = JSON.parse(localStorage.getItem("sac_platform_grades") || "[]");
    const avgs = grades.map((g) => g.avg).filter((n) => n != null);
    return {
      totalGrades: avgs.length,
      classAverage: avgs.length ? Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 10) / 10 : 0,
      passRate: avgs.length ? Math.round((100 * avgs.filter((a) => a >= 10).length) / avgs.length) : 0,
    };
  }

  async function updateLocal(id, patch) {
    const data = await api("/platform/meetings/" + id + (patch._action || ""), {
      method: patch._method || "POST",
      body: JSON.stringify(patch),
    });
    if (data?.meeting) return data.meeting;
    const list = read();
    const idx = list.findIndex((m) => m.id === id);
    if (idx < 0) throw new Error("NOT_FOUND");
    list[idx] = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
    write(list);
    return list[idx];
  }

  function meetingSignalPayload(m) {
    return {
      kind: "meeting",
      sessionId: m.id,
      title: m.title,
      hostName: m.hostName,
      roomName: m.roomName,
      allowedEmails: m.allowedEmails,
      hostEmail: m.hostEmail,
      universite: m.universite,
      filiere: m.filiere,
      type: m.type,
      inviteStudents: m.type === "conference" || !!m.filiere,
    };
  }

  async function startMeeting(id) {
    const d = await api("/platform/meetings/" + id + "/start", { method: "POST" });
    if (d?.meeting) {
      if (typeof SAC_LIVE_CALL !== "undefined") {
        SAC_LIVE_CALL.signalLiveStart(meetingSignalPayload(d.meeting));
      }
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("📞 Réunion live", {
          body: d.meeting.title + " — rejoignez maintenant",
          icon: "evo-uni.jpeg",
          requireInteraction: true,
        });
      }
      return d.meeting;
    }
    const m = updateLocal(id, { status: "live", startedAt: new Date().toISOString() });
    if (typeof SAC_LIVE_CALL !== "undefined") {
      SAC_LIVE_CALL.signalLiveStart(meetingSignalPayload(m));
    }
    return m;
  }

  async function joinMeeting(id) {
    const d = await api("/platform/meetings/" + id + "/join", { method: "POST" });
    if (d?.meeting) return d.meeting;
    return read().find((m) => m.id === id);
  }

  async function endMeeting(id, transcript) {
    const d = await api("/platform/meetings/" + id + "/end", {
      method: "POST",
      body: JSON.stringify({ transcript }),
    });
    if (d?.meeting) {
      if (typeof SAC_LIVE_CALL !== "undefined") {
        SAC_LIVE_CALL.clearLiveSignal(id);
      }
      return d.meeting;
    }
    const m = read().find((x) => x.id === id);
    const ai = aiAnalyze(transcript || m?.transcript, m?.title);
    const ended = updateLocal(id, {
      status: "ended",
      endedAt: new Date().toISOString(),
      transcript: transcript || m?.transcript,
      ...ai,
    });
    if (typeof SAC_LIVE_CALL !== "undefined") {
      SAC_LIVE_CALL.clearLiveSignal(id);
    }
    return ended;
  }

  async function runAi(id, transcript) {
    const d = await api("/platform/meetings/" + id + "/ai", {
      method: "POST",
      body: JSON.stringify({ transcript }),
    });
    if (d?.meeting) return d.meeting;
    const m = read().find((x) => x.id === id);
    const ai = aiAnalyze(transcript, m?.title);
    return updateLocal(id, { transcript, ...ai });
  }

  function openRoom(meeting, userName, session) {
    const user = session || (typeof SAC_SESSION !== "undefined" ? SAC_SESSION.getSession() : null);
    const role = user?.role || "";
    const isHost = ["professeur", "universite", "assistant", "section"].includes(role);
    let el = document.getElementById("sacMtgRoom");
    if (!el) {
      el = document.createElement("div");
      el.id = "sacMtgRoom";
      el.className = "mtg-room-overlay";
      el.innerHTML = `
        <div class="mtg-room__head">
          <h3 id="sacMtgRoomTitle"></h3>
          <button type="button" class="mtg-btn mtg-btn--ghost" id="sacMtgRoomClose" style="color:#fff">✕ Fermer</button>
        </div>
        <div class="mtg-side-panel">
          <div class="mtg-room__frame sac-webrtc-host" id="sacMtgRoomFrame"></div>
          <div class="mtg-chat-panel" id="sacMtgSidePanel"></div>
        </div>`;
      document.body.appendChild(el);
      el.querySelector("#sacMtgRoomClose").onclick = closeRoom;
    }
    document.getElementById("sacMtgRoomTitle").textContent = meeting.title;
    const room = meeting.roomName || "sac-mtg-" + meeting.id.slice(-10);
    const side = document.getElementById("sacMtgSidePanel");
    side.innerHTML = `<div id="sacMtgPresenceRoot"></div>
      <p class="mtg-side-hint">💬 Commentaires en bas de la vidéo · 🖥️ Partage d'écran · ⏺️ Enregistrement</p>`;
    if (typeof SAC_WEBRTC_ROOM !== "undefined") {
      SAC_WEBRTC_ROOM.renderPresenceList(side.querySelector("#sacMtgPresenceRoot"), [
        { displayName: userName || "Vous", isSelf: true },
      ]);
    }
    el.hidden = false;
    document.body.style.overflow = "hidden";
    if (typeof SAC_WEBRTC_ROOM !== "undefined") {
      SAC_WEBRTC_ROOM.attachToHost("sacMtgRoomFrame", {
        roomId: room,
        displayName: userName || "SAC",
        userRole: role,
        isHost,
        onLeave: closeRoom,
        onParticipantsChange: (list) => {
          const root = document.getElementById("sacMtgPresenceRoot");
          if (root) SAC_WEBRTC_ROOM.renderPresenceList(root, list);
        },
      }).catch((err) => alert(err.message || "Salle live indisponible."));
    }
  }

  function closeRoom() {
    if (typeof SAC_WEBRTC_ROOM !== "undefined") SAC_WEBRTC_ROOM.leave();
    const el = document.getElementById("sacMtgRoom");
    if (el) {
      el.hidden = true;
      const f = document.getElementById("sacMtgRoomFrame");
      if (f) f.innerHTML = "";
    }
    document.body.style.overflow = "";
  }

  function typeLabel(t) {
    const labels = {
      dean_sections: "Doyen ↔ Chefs de section",
      section_prof: "Chef de section ↔ Professeurs",
      conference: "Conférence institutionnelle",
    };
    return labels[t] || "Réunion";
  }

  function renderStats(stats) {
    if (!stats || !stats.totalGrades) return "";
    return `<div class="mtg-stats">
      <div class="mtg-stat"><strong>${stats.totalGrades}</strong><span>Cotes enregistrées</span></div>
      <div class="mtg-stat"><strong>${stats.classAverage || 0}/20</strong><span>Moyenne campus</span></div>
      <div class="mtg-stat"><strong>${stats.passRate || 0}%</strong><span>Taux réussite</span></div>
      ${stats.validatedWorks != null ? `<div class="mtg-stat"><strong>${stats.validatedWorks}</strong><span>Travaux validés IA</span></div>` : ""}
    </div>`;
  }

  function renderMeetingCard(m, session, canHost) {
    const isLive = m.status === "live";
    const typeCls =
      m.type === "dean_sections"
        ? "mtg-badge--dean"
        : m.type === "conference"
          ? "mtg-badge--conference"
          : "mtg-badge--section";
    let actions = "";
    if (m.status !== "ended") {
      actions += `<button type="button" class="mtg-btn mtg-btn--primary" data-join="${esc(m.id)}">▶ Rejoindre</button>`;
    }
    if (canHost && m.status === "scheduled") {
      actions += `<button type="button" class="mtg-btn mtg-btn--live" data-start="${esc(m.id)}">🔴 Démarrer</button>`;
    }
    if (canHost && m.status === "live") {
      actions += `<button type="button" class="mtg-btn mtg-btn--ghost" data-end="${esc(m.id)}">⏹ Terminer + IA</button>`;
    }
  let extra = "";
    if (m.type === "dean_sections" && m.statsSnapshot) {
      extra = renderStats(m.statsSnapshot);
    }
    if (m.documents?.length) {
      extra += `<div class="mtg-docs"><strong>Documents</strong><ul>${m.documents.map((d) => `<li><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.name)}</a></li>`).join("")}</ul></div>`;
    }
    if (m.votes?.length) {
      extra += `<div class="mtg-votes"><strong>Votes</strong>${m.votes
        .map(
          (v) =>
            `<p style="margin:0.35rem 0;font-weight:600">${esc(v.question)}</p>` +
            (v.options || [])
              .map(
                (o) =>
                  `<div class="mtg-vote-opt"><span>${esc(o.text)} (${(o.votes || []).length})</span>` +
                  (!v.closed
                    ? `<button type="button" class="mtg-btn mtg-btn--ghost" data-vote="${esc(m.id)}" data-vid="${esc(v.id)}" data-oid="${esc(o.id)}">Voter</button>`
                    : "") +
                  `</div>`
              )
              .join("")
        )
        .join("")}</div>`;
    }
    if (m.aiSummary) {
      extra += `<div class="mtg-ai"><strong>🤖 Compte rendu IA</strong>
        <div class="mtg-ai-box">${esc(m.aiSummary)}</div>
        ${(m.aiKeyPoints || []).length ? `<ul style="margin:0.35rem 0 0 1rem;font-size:0.82rem">${m.aiKeyPoints.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
        ${m.aiTranslations?.en ? `<p style="font-size:0.8rem;margin-top:0.5rem"><strong>Traduction EN :</strong><br/>${esc(m.aiTranslations.en)}</p>` : ""}
      </div>`;
    }
    if (canHost && m.status === "live") {
      extra += `<button type="button" class="mtg-btn mtg-btn--ghost" data-doc="${esc(m.id)}" style="margin-top:0.5rem">📎 Partager un document</button>`;
      extra += `<button type="button" class="mtg-btn mtg-btn--ghost" data-newvote="${esc(m.id)}">🗳 Nouveau vote</button>`;
    }
    return `<article class="mtg-card${isLive ? " mtg-card--live" : ""}">
      <span class="mtg-badge ${typeCls}">${esc(typeLabel(m.type))}</span>
      ${isLive ? '<span class="mtg-badge mtg-badge--live">● EN DIRECT</span>' : ""}
      <div style="font-weight:700;color:var(--primary)">${esc(m.title)}</div>
      <div style="font-size:0.8rem;color:var(--text-muted)">${esc(m.sectionName || "")} ${m.scheduledAt ? "· " + esc(m.scheduledAt.slice(0, 16).replace("T", " ")) : ""}</div>
      ${m.agenda ? `<p style="font-size:0.85rem;margin:0">${esc(m.agenda)}</p>` : ""}
      ${extra}
      <div class="mtg-actions">${actions}</div>
    </article>`;
  }

  async function mountUI(container, session) {
    if (!container) return;
    const role = session.role;
    const isUni = role === "universite";
    const isProf = role === "professeur";
    const canCreateSection = isUni || isProf;
    const userName = displayName(session);
    const uni = session.universite;
    const sections =
      typeof SAC_SECTIONS !== "undefined" ? SAC_SECTIONS.getSectionsByUniversity(session) : [];

    container.innerHTML = `
      <div class="mtg-wrap">
        <div class="mtg-toolbar">
          <div class="mtg-tabs">
            <button type="button" class="mtg-tab active" data-mtg-tab="list">📅 Réunions</button>
            <button type="button" class="mtg-tab" data-mtg-tab="live">🎓 Cours live</button>
            ${canCreateSection ? '<button type="button" class="mtg-tab" data-mtg-tab="section">👥 Chef section ↔ Prof</button>' : ""}
            ${isUni ? '<button type="button" class="mtg-tab" data-mtg-tab="dean">🏛️ Doyen ↔ Chefs section</button>' : ""}
            <button type="button" class="mtg-tab" data-mtg-tab="ai">🤖 IA & Q&A</button>
          </div>
          <div id="sacVideoLaunchSlot"></div>
        </div>
        <div id="sacMtgPanel"></div>
      </div>`;

    const panel = container.querySelector("#sacMtgPanel");

    async function bindMeetingActions(root) {
      root.querySelectorAll("[data-join]").forEach((btn) => {
        btn.onclick = async () => {
          const m = await joinMeeting(btn.dataset.join);
          openRoom(m, userName, session);
        };
      });
      root.querySelectorAll("[data-start]").forEach((btn) => {
        btn.onclick = async () => {
          const m = await startMeeting(btn.dataset.start);
          openRoom(m, userName, session);
          renderList();
        };
      });
      root.querySelectorAll("[data-end]").forEach((btn) => {
        btn.onclick = async () => {
          const transcript = prompt(
            "Collez la transcription / notes de la réunion (IA générera le compte rendu) :",
            ""
          );
          await endMeeting(btn.dataset.end, transcript || "");
          closeRoom();
          renderList();
        };
      });
      root.querySelectorAll("[data-vote]").forEach((btn) => {
        btn.onclick = async () => {
          await api("/platform/meetings/" + btn.dataset.vote + "/votes/" + btn.dataset.vid, {
            method: "POST",
            body: JSON.stringify({ optionId: btn.dataset.oid }),
          });
          renderList();
        };
      });
      root.querySelectorAll("[data-doc]").forEach((btn) => {
        btn.onclick = async () => {
          const name = prompt("Nom du document :");
          const url = prompt("URL du document (PDF, Drive…) :");
          if (!name || !url) return;
          await api("/platform/meetings/" + btn.dataset.doc + "/documents", {
            method: "POST",
            body: JSON.stringify({ name, url }),
          });
          renderList();
        };
      });
      root.querySelectorAll("[data-newvote]").forEach((btn) => {
        btn.onclick = async () => {
          const q = prompt("Question du vote :");
          const opts = prompt("Options séparées par | (ex: Oui | Non | Abstention) :");
          if (!q || !opts) return;
          await api("/platform/meetings/" + btn.dataset.newvote + "/votes", {
            method: "POST",
            body: JSON.stringify({ question: q, options: opts.split("|").map((s) => s.trim()) }),
          });
          renderList();
        };
      });
    }

    async function renderList() {
      const meetings = await listMeetings();
      const liveMeetings = meetings.filter((m) => m.status === "live");
      let liveCourses = [];
      if (typeof SAC_LIVE !== "undefined") {
        const sessions = await SAC_LIVE.listSessions();
        liveCourses = sessions.filter((s) => s.status === "live");
      }
      const liveBanner =
        liveMeetings.length || liveCourses.length
          ? `<div class="mtg-live-banner">
              <span class="mtg-live-banner__dot" aria-hidden="true"></span>
              <div>
                <strong>${liveMeetings.length + liveCourses.length} session(s) en direct</strong>
                <span>Rejoignez la réunion ou le cours ouvert par votre établissement.</span>
              </div>
            </div>`
          : "";

      panel.innerHTML =
        liveBanner +
        `<div class="mtg-grid">` +
        (meetings.length
          ? meetings
              .map((m) => {
                const host = (m.hostEmail || "").toLowerCase() === (session.email || session.identifiant || "").toLowerCase();
                return renderMeetingCard(m, session, host || isUni);
              })
              .join("")
          : "<p class='pub-empty'>Aucune réunion programmée.</p>") +
        `</div>`;
      bindMeetingActions(panel);
    }

    async function renderLiveCourses() {
      if (typeof SAC_LIVE === "undefined") {
        panel.innerHTML = "<p class='pub-empty'>Module cours live indisponible.</p>";
        return;
      }
      const host = document.createElement("div");
      panel.innerHTML = "";
      panel.appendChild(host);
      await SAC_LIVE.mountUI(host, session);
    }

    function renderCreateForm(type) {
      const isDean = type === "dean_sections";
      const sectionOpts = sections
        .map((s) => `<option value="${esc(s.id)}" data-name="${esc(s.name)}" data-filiere="${esc(s.filiere)}" data-email="${esc(s.email || "")}">${esc(s.name)} — ${esc(s.filiere)}</option>`)
        .join("");
      panel.innerHTML = `
        <form class="mtg-form" id="sacMtgCreate">
          <strong>${isDean ? "🏛️ Réunion Doyen ↔ Chefs de section" : "👥 Réunion Chef de section ↔ Professeurs"}</strong>
          <input type="hidden" name="type" value="${type}" />
          <label>Titre<input name="title" required placeholder="Ex. Conseil de section — Résultats S1" /></label>
          <label>Ordre du jour<textarea name="agenda" rows="3" placeholder="Points à aborder…"></textarea></label>
          <label>Description<textarea name="description" rows="2"></textarea></label>
          ${
            !isDean
              ? `<label>Section<select name="sectionId" required><option value="">— Choisir —</option>${sectionOpts}</select></label>`
              : "<p style='font-size:0.85rem;color:var(--text-muted)'>Seuls les chefs de section de votre établissement seront invités. Statistiques académiques jointes automatiquement.</p>"
          }
          <button type="submit" class="mtg-btn mtg-btn--primary">Programmer la réunion</button>
        </form>
        <p style="font-size:0.82rem;color:var(--text-muted)">Les participants recevront une notification. Accès restreint selon le type de réunion.</p>`;
      panel.querySelector("#sacMtgCreate").onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const payload = {
          type: fd.get("type"),
          title: fd.get("title"),
          agenda: fd.get("agenda"),
          description: fd.get("description"),
          universite: uni,
        };
        if (payload.type === "section_prof") {
          const sel = e.target.querySelector('[name="sectionId"]');
          const opt = sel.options[sel.selectedIndex];
          payload.sectionId = fd.get("sectionId");
          payload.sectionName = opt?.dataset?.name || "";
          payload.sectionFiliere = opt?.dataset?.filiere || "";
          payload.filiere = opt?.dataset?.filiere || "";
          payload.allowedEmails = profEmailsForSection(uni, opt?.dataset?.filiere);
        } else {
          payload.sectionHeadEmails = sectionHeadEmails(uni);
          payload.allowedEmails = payload.sectionHeadEmails;
        }
        await createMeeting(payload);
        container.querySelector('[data-mtg-tab="list"]').click();
      };
    }

    function renderAiPanel() {
      panel.innerHTML = `
        <div class="mtg-form">
          <strong>🤖 Assistant IA — après la réunion</strong>
          <p style="font-size:0.85rem;color:var(--text-muted);margin:0">Transcription, résumé automatique, points importants, traduction EN, réponses aux questions étudiantes.</p>
          <label>ID réunion (optionnel)<input id="sacMtgAiId" placeholder="mtg-…" /></label>
          <label>Transcription / notes<textarea id="sacMtgTranscript" rows="5" placeholder="Collez ici le compte rendu ou la transcription…"></textarea></label>
          <button type="button" class="mtg-btn mtg-btn--primary" id="sacMtgRunAi">Générer compte rendu IA</button>
          <hr style="border:none;border-top:1px solid var(--border);margin:0.75rem 0" />
          <label>Question étudiant (après cours)<input id="sacMtgQ" placeholder="Ex. Quelle décision sur les rattrapages ?" /></label>
          <button type="button" class="mtg-btn mtg-btn--ghost" id="sacMtgAsk">Poser la question à l'IA</button>
          <div id="sacMtgAiOut" class="mtg-ai-box" style="display:none"></div>
        </div>`;
      panel.querySelector("#sacMtgRunAi").onclick = async () => {
        const id = panel.querySelector("#sacMtgTranscript").value;
        const meetingId = panel.querySelector("#sacMtgAiId").value;
        const text = panel.querySelector("#sacMtgTranscript").value;
        let m;
        if (meetingId) m = await runAi(meetingId, text);
        else m = aiAnalyze(text, "Réunion");
        const out = panel.querySelector("#sacMtgAiOut");
        out.style.display = "block";
        out.innerHTML =
          "<strong>Résumé :</strong> " +
          esc(m.aiSummary) +
          "<br/><br/><strong>Points clés :</strong><ul>" +
          (m.aiKeyPoints || []).map((p) => "<li>" + esc(p) + "</li>").join("") +
          "</ul>";
      };
      panel.querySelector("#sacMtgAsk").onclick = async () => {
        const q = panel.querySelector("#sacMtgQ").value;
        const meetingId = panel.querySelector("#sacMtgAiId").value;
        let ans;
        if (meetingId) {
          const d = await api("/platform/meetings/" + meetingId + "/qa", {
            method: "POST",
            body: JSON.stringify({ question: q }),
          });
          ans = d?.answer;
        }
        if (!ans) {
          const m = meetingId ? (await listMeetings()).find((x) => x.id === meetingId) : null;
          const corpus = (m?.aiSummary || "") + " " + (m?.transcript || "");
          ans = corpus
            ? "D'après le compte rendu : " + corpus.slice(0, 280) + "…"
            : "Aucun compte rendu disponible pour cette réunion.";
        }
        const out = panel.querySelector("#sacMtgAiOut");
        out.style.display = "block";
        out.innerHTML = "<strong>Q :</strong> " + esc(q) + "<br/><strong>R :</strong> " + esc(ans);
      };
    }

    container.querySelectorAll("[data-mtg-tab]").forEach((tab) => {
      tab.onclick = () => {
        container.querySelectorAll(".mtg-tab").forEach((t) => t.classList.toggle("active", t === tab));
        const id = tab.dataset.mtgTab;
        if (id === "list") renderList();
        else if (id === "live") renderLiveCourses();
        else if (id === "section") renderCreateForm("section_prof");
        else if (id === "dean") renderCreateForm("dean_sections");
        else if (id === "ai") renderAiPanel();
      };
    });

    if (typeof SAC_VIDEO_LIVE !== "undefined") {
      SAC_VIDEO_LIVE.mountLauncher(container.querySelector("#sacVideoLaunchSlot"), session, () => {
        const active = container.querySelector(".mtg-tab.active")?.dataset?.mtgTab;
        if (active === "live") renderLiveCourses();
        else renderList();
      });
    }

    await renderList();
  }

  return {
    mountUI,
    listMeetings,
    createMeeting,
    startMeeting,
    joinMeeting,
    endMeeting,
    openRoom,
    closeRoom,
    profEmailsForSection,
    sectionHeadEmails,
  };
})();

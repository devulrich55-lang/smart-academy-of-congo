/**
 * Espace live Ministère ↔ responsables universités (vidéo SAC + documents)
 * Réservé au rôle ministere (hôte) et universite (invités).
 */
const SAC_MINISTRY_LIVE = (function () {
  const STORAGE_KEY = "sac_ministry_live";
  const TYPE = "ministry_universities";

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

  function normEmail(e) {
    return String(e || "").trim().toLowerCase();
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

  async function getUniAdmins(session) {
    if (typeof SAC_INSTITUTIONAL !== "undefined" && session) {
      const { admins } = await SAC_INSTITUTIONAL.load(session);
      return (admins || []).filter((a) => a.role === "universite");
    }
    try {
      return JSON.parse(localStorage.getItem("sac_users") || "[]").filter((u) => u.role === "universite");
    } catch {
      return [];
    }
  }

  function canHost(session) {
    return session?.role === "ministere";
  }

  function canJoin(session, liveRow) {
    if (!session || !liveRow) return false;
    if (canHost(session)) return true;
    if (session.role !== "universite") return false;
    const email = normEmail(session.email || session.identifiant);
    const allowed = (liveRow.allowedEmails || []).map(normEmail);
    return allowed.includes(email) || liveRow.status === "live";
  }

  async function listSessions(session) {
    const data = await api("/platform/ministry/live");
    let rows = data?.sessions || read();
    rows = rows.filter((r) => r.type === TYPE);
    if (!session) return rows;
    if (canHost(session)) return rows;
    if (session.role === "universite") {
      const email = normEmail(session.email || session.identifiant);
      return rows.filter((r) => {
        const allowed = (r.allowedEmails || []).map(normEmail);
        return allowed.includes(email) || r.status === "live";
      });
    }
    return [];
  }

  async function createSession(session, payload) {
    if (!canHost(session)) throw new Error("Réservé au Ministère");
    const admins = await getUniAdmins(session);
    const selected = payload.inviteEmails?.length
      ? admins.filter((a) => payload.inviteEmails.map(normEmail).includes(normEmail(a.email)))
      : admins;
    const allowedEmails = selected.map((a) => normEmail(a.email)).filter(Boolean);
    const body = {
      type: TYPE,
      title: payload.title,
      agenda: payload.agenda || "",
      description: payload.description || "",
      allowedEmails,
      invitedUniversities: selected.map((a) => ({
        email: a.email,
        nomUniversite: a.nomUniversite || a.displayName || "",
        responsable: a.responsable || "",
      })),
      hostEmail: normEmail(session.email || session.identifiant),
      hostName: displayName(session),
    };
    const data = await api("/platform/ministry/live", { method: "POST", body: JSON.stringify(body) });
    if (data?.session) return data.session;

    const id = uid("mnl");
    const row = {
      id,
      ...body,
      roomName: "sac-min-" + id.slice(-10),
      status: "scheduled",
      documents: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      joinUrl: "sac-min:" + "sac-min-" + id.slice(-10),
    };
    const list = read();
    list.unshift(row);
    write(list);
    return row;
  }

  function patchLocal(id, patch) {
    const list = read();
    const idx = list.findIndex((r) => r.id === id);
    if (idx < 0) throw new Error("NOT_FOUND");
    list[idx] = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
    write(list);
    return list[idx];
  }

  async function startSession(id, session) {
    if (!canHost(session)) throw new Error("Accès refusé");
    const data = await api("/platform/ministry/live/" + id + "/start", { method: "POST" });
    if (data?.session) {
      if (typeof SAC_LIVE_CALL !== "undefined") {
        SAC_LIVE_CALL.signalLiveStart({
          kind: "ministry",
          sessionId: data.session.id,
          title: data.session.title,
          hostName: data.session.hostName || "Ministère",
          roomName: data.session.roomName,
          invitedUniversities: data.session.invitedUniversities || data.session.allowedEmails,
        });
      }
      return data.session;
    }
    const row = patchLocal(id, { status: "live", startedAt: new Date().toISOString() });
    if (typeof SAC_LIVE_CALL !== "undefined") {
      SAC_LIVE_CALL.signalLiveStart({
        kind: "ministry",
        sessionId: row.id,
        title: row.title,
        hostName: row.hostName || "Ministère",
        roomName: row.roomName,
        invitedUniversities: row.invitedUniversities || row.allowedEmails,
      });
    }
    return row;
  }

  async function endSession(id, session) {
    if (!canHost(session)) throw new Error("Accès refusé");
    const data = await api("/platform/ministry/live/" + id + "/end", { method: "POST" });
    if (data?.session) return data.session;
    return patchLocal(id, { status: "ended", endedAt: new Date().toISOString() });
  }

  async function getSession(id) {
    const data = await api("/platform/ministry/live/" + id);
    if (data?.session) return data.session;
    return read().find((r) => r.id === id) || null;
  }

  async function addDocument(sessionId, doc, user) {
    const row = await getSession(sessionId);
    if (!row) throw new Error("NOT_FOUND");
    const entry = {
      id: uid("doc"),
      name: doc.name,
      type: doc.type || "file",
      url: doc.url,
      uploadedAt: new Date().toISOString(),
      uploadedBy: displayName(user),
    };
    const documents = [entry, ...(row.documents || [])];
    const data = await api("/platform/ministry/live/" + sessionId + "/documents", {
      method: "POST",
      body: JSON.stringify(entry),
    });
    if (data?.session) return data.session;
    return patchLocal(sessionId, { documents });
  }

  async function uploadFile(sessionId, file, user) {
    let url = "";
    const name = file.name || "Document";
    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
      try {
        const created = await SAC_API.createDocument(
          { title: name, category: "ministry_live", sessionId },
          file
        );
        url =
          created?.url ||
          created?.mediaUrl ||
          (created?.files?.[0]?.url) ||
          "";
      } catch {
        /* fallback data URL */
      }
    }
    if (!url) {
      url = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Lecture fichier impossible"));
        reader.readAsDataURL(file);
      });
    }
    return addDocument(sessionId, { name, type: file.type || "file", url }, user);
  }

  function statusLabel(s) {
    return { scheduled: "Programmé", live: "EN DIRECT", ended: "Terminé" }[s] || s;
  }

  function renderDocsPanel(liveRow, user, isHost, onRefresh) {
    const docs = liveRow.documents || [];
    return `
      <div class="min-live-side">
        <h4>📄 Documents partagés</h4>
        ${
          isHost
            ? `<label class="min-live-upload">Importer PDF / Word / PPT / image
            <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,application/pdf,image/*" data-min-live-file />
          </label>
          <label style="font-size:0.8rem;margin-top:0.5rem;display:block">Ou lien (Drive, OneDrive…)
            <input type="url" class="fi" style="width:100%;margin-top:0.25rem" placeholder="https://…" data-min-live-url />
            <button type="button" class="btn btn--ghost btn--xs" data-min-live-link style="margin-top:0.35rem">Ajouter le lien</button>
          </label>`
            : ""
        }
        <ul class="min-live-docs">${docs.length
          ? docs
              .map(
                (d) =>
                  `<li><a href="${esc(d.url)}" target="_blank" rel="noopener" download>${esc(d.name)}</a>
                  <span>${esc(d.uploadedBy || "")}</span></li>`
              )
              .join("")
          : "<li class='empty'>Aucun document pour l'instant.</li>"}</ul>
        ${
          isHost && liveRow.status === "live"
            ? `<button type="button" class="btn btn--role btn--sm" data-min-live-end style="margin-top:0.75rem">⏹ Terminer le live</button>`
            : ""
        }
      </div>`;
  }

  function bindDocsPanel(sideEl, liveRow, user, isHost, session, onClose) {
    sideEl.querySelector("[data-min-live-file]")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        liveRow = await uploadFile(liveRow.id, file, user);
        sideEl.innerHTML = renderDocsPanel(liveRow, user, isHost, null);
        bindDocsPanel(sideEl, liveRow, user, isHost, session, onClose);
      } catch (err) {
        alert(err.message || "Import impossible.");
      }
      e.target.value = "";
    });
    sideEl.querySelector("[data-min-live-link]")?.addEventListener("click", async () => {
      const url = sideEl.querySelector("[data-min-live-url]")?.value?.trim();
      const name = prompt("Nom du document :", "Document partagé");
      if (!url || !name) return;
      liveRow = await addDocument(liveRow.id, { name, type: "LIEN", url }, user);
      sideEl.innerHTML = renderDocsPanel(liveRow, user, isHost, null);
      bindDocsPanel(sideEl, liveRow, user, isHost, session, onClose);
    });
    sideEl.querySelector("[data-min-live-end]")?.addEventListener("click", async () => {
      if (!confirm("Terminer ce live national ?")) return;
      await endSession(liveRow.id, session);
      onClose();
    });
  }

  function openRoom(liveRow, userName, session) {
    let el = document.getElementById("sacMinLiveRoom");
    if (!el) {
      el = document.createElement("div");
      el.id = "sacMinLiveRoom";
      el.className = "min-live-room";
      el.innerHTML = `
        <div class="min-live-room__head">
          <h3 id="sacMinLiveTitle"></h3>
          <button type="button" class="btn btn--ghost" id="sacMinLiveClose" style="color:#fff">✕ Fermer</button>
        </div>
        <div class="min-live-room__body">
          <div id="sacMinLiveFrame" class="sac-webrtc-host"></div>
          <aside id="sacMinLiveSide"></aside>
        </div>`;
      document.body.appendChild(el);
    }
    const isHost = canHost(session);
    document.getElementById("sacMinLiveTitle").textContent = liveRow.title;
    const room = liveRow.roomName || "sac-min-" + liveRow.id.slice(-10);
    const side = document.getElementById("sacMinLiveSide");
    side.innerHTML = renderDocsPanel(liveRow, session, isHost);
    bindDocsPanel(side, liveRow, session, isHost, session, closeRoom);
    document.getElementById("sacMinLiveClose").onclick = closeRoom;
    el.hidden = false;
    document.body.style.overflow = "hidden";
    if (typeof SAC_WEBRTC_ROOM !== "undefined") {
      SAC_WEBRTC_ROOM.attachToHost("sacMinLiveFrame", {
        roomId: room,
        displayName: userName || "SAC",
        onLeave: closeRoom,
      }).catch((err) => alert(err.message || "Salle live indisponible."));
    }
  }

  function closeRoom() {
    if (typeof SAC_WEBRTC_ROOM !== "undefined") SAC_WEBRTC_ROOM.leave();
    const el = document.getElementById("sacMinLiveRoom");
    if (el) {
      el.hidden = true;
      const f = document.getElementById("sacMinLiveFrame");
      if (f) f.innerHTML = "";
    }
    document.body.style.overflow = "";
  }

  function renderCard(row, session) {
    const isHost = canHost(session);
    const live = row.status === "live";
    let actions = "";
    if (row.status !== "ended" && canJoin(session, row)) {
      actions += `<button type="button" class="btn btn--role btn--sm" data-min-join="${esc(row.id)}">▶ Rejoindre</button>`;
    }
    if (isHost && row.status === "scheduled") {
      actions += `<button type="button" class="btn btn--role btn--sm" data-min-start="${esc(row.id)}">🔴 Démarrer le live</button>`;
    }
    const inviteCount = (row.invitedUniversities || row.allowedEmails || []).length;
    const docs = row.documents || [];
    return `<article class="min-live-card${live ? " min-live-card--live" : ""}">
      ${live ? '<span class="min-live-badge">● EN DIRECT</span>' : `<span class="min-live-badge min-live-badge--sched">${esc(statusLabel(row.status))}</span>`}
      <h3>${esc(row.title)}</h3>
      ${row.agenda ? `<p>${esc(row.agenda)}</p>` : ""}
      <p class="min-live-meta">${inviteCount} université(s) invitée(s) · ${esc(row.hostName || "Ministère")}</p>
      ${
        docs.length
          ? `<ul class="min-live-docs min-live-docs--inline">${docs
              .slice(0, 4)
              .map((d) => `<li><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.name)}</a></li>`)
              .join("")}</ul>`
          : ""
      }
      <div class="min-live-actions">${actions}</div>
    </article>`;
  }

  function bindCards(root, session, refresh) {
    root.querySelectorAll("[data-min-join]").forEach((btn) => {
      btn.onclick = async () => {
        const row = await getSession(btn.dataset.minJoin);
        if (!row || !canJoin(session, row)) {
          alert("Accès refusé à ce live.");
          return;
        }
        openRoom(row, displayName(session), session);
      };
    });
    root.querySelectorAll("[data-min-start]").forEach((btn) => {
      btn.onclick = async () => {
        const row = await startSession(btn.dataset.minStart, session);
        openRoom(row, displayName(session), session);
        refresh();
      };
    });
  }

  async function mountMinistryUI(container, session) {
    if (!container || !canHost(session)) {
      if (container) container.innerHTML = "<p class='empty'>Espace réservé au Ministère.</p>";
      return;
    }
    const admins = await getUniAdmins(session);
    container.innerHTML = `
      <div class="min-live-wrap">
        <p class="page-desc">Live national avec les <strong>responsables des universités</strong> partenaires — vidéo SAC et échange de documents.</p>
        <div class="ws-grid-2">
          <div class="panel panel--ws">
            <div class="panel__head"><h2>Programmer un live</h2></div>
            <div class="panel__body">
              <form id="minLiveCreateForm" class="ws-form-grid" style="grid-template-columns:1fr;">
                <div class="fg">
                  <label for="minLiveTitle">Titre *</label>
                  <input type="text" class="fi" id="minLiveTitle" required placeholder="Ex. Conseil des recteurs — Rentrée 2025" />
                </div>
                <div class="fg">
                  <label for="minLiveAgenda">Ordre du jour</label>
                  <textarea class="fi" id="minLiveAgenda" rows="3" placeholder="Points à aborder…"></textarea>
                </div>
                <div class="fg">
                  <label>Universités invitées (${admins.length})</label>
                  <p class="ws-field-hint">Par défaut, tous les admins université enregistrés sont invités.</p>
                  <div class="min-live-invite-list">${admins.length
                    ? admins
                        .map(
                          (a) =>
                            `<label class="min-live-invite"><input type="checkbox" name="invite" value="${esc(a.email)}" checked />
                            ${esc(a.nomUniversite || a.email)} — ${esc(a.responsable || "Responsable")}</label>`
                        )
                        .join("")
                    : "<p class='empty'>Aucun admin université enregistré.</p>"}</div>
                </div>
                <button type="submit" class="btn btn--role">📅 Programmer le live</button>
              </form>
            </div>
          </div>
          <div class="panel panel--accent-gold">
            <div class="panel__head"><h2>Guide</h2></div>
            <div class="panel__body">
              <ul class="ws-guide">
                <li><strong>Programmer</strong> — invite les responsables d'université</li>
                <li><strong>Démarrer</strong> — ouvre la salle vidéo SAC</li>
                <li><strong>Documents</strong> — partagez PDF, liens Drive pendant le live</li>
                <li>Les universités rejoignent depuis leur portail <code>/admin-uni/</code></li>
              </ul>
            </div>
          </div>
        </div>
        <div class="panel panel--ws" style="margin-top:1.25rem;">
          <div class="panel__head"><h2>Lives nationaux</h2></div>
          <div class="panel__body" id="minLiveList"><p class="empty">Chargement…</p></div>
        </div>
      </div>`;

    async function refreshList() {
      const listEl = container.querySelector("#minLiveList");
      const rows = await listSessions(session);
      listEl.innerHTML = rows.length
        ? `<div class="min-live-grid">${rows.map((r) => renderCard(r, session)).join("")}</div>`
        : "<p class='empty'>Aucun live programmé.</p>";
      bindCards(listEl, session, refreshList);
    }

    container.querySelector("#minLiveCreateForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const inviteEmails = [...e.target.querySelectorAll('input[name="invite"]:checked')].map(
        (c) => c.value
      );
      if (!inviteEmails.length) {
        alert("Sélectionnez au moins une université.");
        return;
      }
      await createSession(session, {
        title: document.getElementById("minLiveTitle").value.trim(),
        agenda: document.getElementById("minLiveAgenda").value.trim(),
        inviteEmails,
      });
      e.target.reset();
      [...e.target.querySelectorAll('input[name="invite"]')].forEach((c) => {
        c.checked = true;
      });
      await refreshList();
    });

    await refreshList();
  }

  async function mountUniJoinUI(container, session) {
    if (!container || session.role !== "universite") return;
    const rows = (await listSessions(session)).filter((r) => r.status === "live" || r.status === "scheduled");
    const liveNow = rows.filter((r) => r.status === "live");
    if (!rows.length) {
      container.innerHTML = "";
      return;
    }
    container.innerHTML = `
      <div class="min-live-uni-banner${liveNow.length ? " min-live-uni-banner--live" : ""}">
        <div>
          <strong>🏛️ Live Ministère</strong>
          <span>${liveNow.length ? "Session en direct — rejoignez la réunion nationale" : rows.length + " session(s) programmée(s) par le Ministère"}</span>
        </div>
        <div class="min-live-grid min-live-grid--compact">${rows
          .slice(0, 3)
          .map((r) => renderCard(r, session))
          .join("")}</div>
      </div>`;
    bindCards(container, session, () => mountUniJoinUI(container, session));
  }

  return {
    mountMinistryUI,
    mountUniJoinUI,
    listSessions,
    getSession,
    createSession,
    startSession,
    endSession,
    openRoom,
    closeRoom,
    canHost,
    canJoin,
  };
})();

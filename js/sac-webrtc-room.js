/**
 * Salle live SAC — WebRTC natif
 * Commentaires sur l'écran · responsive · sans panneau chat
 */
const SAC_WEBRTC_ROOM = (function () {
  const ICE = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };

  let active = null;

  const HOST_ROLES = ["professeur", "universite", "assistant", "section"];

  function isHostRole(role) {
    return HOST_ROLES.includes(String(role || "").toLowerCase());
  }

  function shouldConnectToPeer(localRole, remoteRole) {
    if (isHostRole(localRole)) return true;
    if (String(localRole || "").toLowerCase() === "etudiant") return isHostRole(remoteRole);
    return true;
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function buildWsUrl(roomId) {
    if (typeof SAC_API !== "undefined" && SAC_API.buildWebSocketUrl) {
      return SAC_API.buildWebSocketUrl("/webrtc/room/" + encodeURIComponent(roomId));
    }
    const origin = window.location.origin.replace(/^http/, "ws");
    return origin + "/api/webrtc/room/" + encodeURIComponent(roomId);
  }

  function ensureVideoHost(hostId) {
    let el = document.getElementById(hostId);
    if (!el) return null;
    if (el.tagName === "IFRAME") {
      const div = document.createElement("div");
      div.id = hostId;
      div.className = (el.className || "") + " sac-webrtc-host";
      el.replaceWith(div);
      return div;
    }
    el.classList.add("sac-webrtc-host");
    el.innerHTML = "";
    return el;
  }

  class RoomSession {
    constructor(opts) {
      this.opts = opts;
      this.roomId = opts.roomId;
      this.displayName = opts.displayName || "Participant";
      this.userRole = opts.userRole || "";
      this.isAudience = !opts.isHost && String(this.userRole).toLowerCase() === "etudiant";
      this.container = opts.container;
      this.peerId = null;
      this.peers = new Map();
      this.ws = null;
      this.localStream = null;
      this.screenStream = null;
      this.micOn = !this.isAudience;
      this.camOn = !this.isAudience;
      this.recorder = null;
      this.recordChunks = [];
      this.participants = [];
      this.qaQuestions = [];
      this.peerMicStates = new Map();
      this.reconnectAttempts = 0;
      this.destroyed = false;
    }

    emitParticipants() {
      if (typeof this.opts.onParticipantsChange === "function") {
        this.opts.onParticipantsChange(this.participants.slice());
      }
    }

    setParticipantsFromServer(list, selfName) {
      const self = {
        peerId: this.peerId || "local",
        displayName: selfName || this.displayName,
        role: "",
        isSelf: true,
      };
      const others = (list || []).map((p) => ({
        peerId: p.peerId,
        displayName: p.displayName || "Participant",
        role: p.role || "",
        isSelf: false,
      }));
      this.participants = [self, ...others];
      this.emitParticipants();
    }

    addParticipant(peerId, displayName, role) {
      if (this.participants.some((p) => p.peerId === peerId)) return;
      this.participants.push({
        peerId,
        displayName: displayName || "Participant",
        role: role || "",
        isSelf: false,
      });
      this.emitParticipants();
    }

    removeParticipant(peerId) {
      this.participants = this.participants.filter((p) => p.peerId !== peerId);
      this.emitParticipants();
    }

    async connect() {
      this.renderShell();
      if (typeof SAC_API !== "undefined" && SAC_API.wakeServer) {
        this.setStatus("Réveil du serveur SAC… (30–90 s sur Render)");
        try {
          await SAC_API.wakeServer({ attempts: 8, timeoutMs: 55000, delayMs: 7000 });
        } catch {
          /* on retente via WebSocket */
        }
      }
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            facingMode: "user",
          },
        });
      } catch (err) {
        this.setStatus("Caméra/micro inaccessible : " + (err.message || err));
        throw err;
      }
      if (this.isAudience) {
        this.localStream.getAudioTracks().forEach((t) => {
          t.enabled = false;
        });
        this.localStream.getVideoTracks().forEach((t) => {
          t.enabled = false;
        });
        this.container.querySelector("#sacWrtcMic")?.classList.add("sac-webrtc__btn--off");
        this.container.querySelector("#sacWrtcCam")?.classList.add("sac-webrtc__btn--off");
      }
      this.addLocalTile();
      this.participants = [
        {
          peerId: "local",
          displayName: this.displayName,
          role: this.userRole,
          isSelf: true,
        },
      ];
      this.emitParticipants();
      this.updateGridLayout();
      await this.openSocket();
    }

    renderShell() {
      this.container.innerHTML = `
        <div class="sac-webrtc">
          <div class="sac-webrtc__stage" id="sacWrtcStage">
            <div class="sac-webrtc__status" id="sacWrtcStatus">Connexion…</div>
            <div class="sac-webrtc__grid" id="sacWrtcGrid"></div>
            <div class="sac-webrtc__float" id="sacWrtcFloat" aria-live="polite"></div>
          </div>
          <form class="sac-webrtc__comment-bar" id="sacWrtcCommentForm">
            <input type="text" id="sacWrtcCommentInput" placeholder="Commenter le live…" maxlength="200" autocomplete="off" />
            <button type="submit" aria-label="Envoyer">➤</button>
          </form>
          <div class="sac-webrtc__toolbar" role="toolbar" aria-label="Contrôles live">
            <button type="button" class="sac-webrtc__btn" id="sacWrtcMic" title="Micro" aria-label="Micro">🎤</button>
            <button type="button" class="sac-webrtc__btn" id="sacWrtcCam" title="Caméra" aria-label="Caméra">📷</button>
            <button type="button" class="sac-webrtc__btn" id="sacWrtcScreen" title="Partager l'écran" aria-label="Partage écran">🖥️</button>
            <button type="button" class="sac-webrtc__btn" id="sacWrtcRecord" title="Enregistrer" aria-label="Enregistrer">⏺️</button>
            <button type="button" class="sac-webrtc__btn sac-webrtc__btn--leave" id="sacWrtcLeave">Quitter</button>
          </div>
        </div>`;

      this.stage = this.container.querySelector("#sacWrtcStage");
      this.grid = this.container.querySelector("#sacWrtcGrid");
      this.floatLayer = this.container.querySelector("#sacWrtcFloat");
      this.statusEl = this.container.querySelector("#sacWrtcStatus");

      this.container.querySelector("#sacWrtcMic").onclick = () => this.toggleMic();
      this.container.querySelector("#sacWrtcCam").onclick = () => this.toggleCam();
      this.container.querySelector("#sacWrtcScreen").onclick = () => this.toggleScreen();
      this.container.querySelector("#sacWrtcRecord").onclick = () => this.toggleRecord();
      this.container.querySelector("#sacWrtcLeave").onclick = () => {
        if (typeof this.opts.onLeave === "function") this.opts.onLeave();
        else leave();
      };
      this.container.querySelector("#sacWrtcCommentForm").onsubmit = (e) => {
        e.preventDefault();
        const input = this.container.querySelector("#sacWrtcCommentInput");
        const text = input.value.trim();
        if (!text) return;
        this.sendChat(text);
        input.value = "";
      };
    }

    setStatus(text) {
      if (this.statusEl) this.statusEl.textContent = text;
    }

    updateGridLayout() {
      const count = this.grid.querySelectorAll(".sac-webrtc__tile").length;
      this.grid.dataset.count = String(count);
      this.grid.dataset.mode = this.isAudience ? "audience" : "host";
      if (this.isAudience) {
        this.grid.dataset.layout = "audience";
        return;
      }
      if (count <= 1) this.grid.dataset.layout = "solo";
      else if (count === 2) this.grid.dataset.layout = "duo";
      else this.grid.dataset.layout = "multi";
    }

    addLocalTile() {
      const tile = document.createElement("div");
      tile.className = "sac-webrtc__tile sac-webrtc__tile--local";
      tile.dataset.peer = "local";
      const video = document.createElement("video");
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.srcObject = this.localStream;
      const label = document.createElement("span");
      label.className = "sac-webrtc__label";
      label.textContent = this.displayName + " (vous)";
      tile.appendChild(video);
      tile.appendChild(label);
      this.grid.appendChild(tile);
      this.localVideo = video;
      this.updateGridLayout();
    }

    async openSocket() {
      if (this.destroyed) return;
      const url = buildWsUrl(this.roomId);
      if (!url) {
        this.setStatus("URL WebRTC invalide — vérifiez la connexion");
        return;
      }
      if (this.reconnectAttempts === 0 && typeof SAC_API !== "undefined" && SAC_API.ensureOnline) {
        this.setStatus("Connexion à l'API live…");
        await SAC_API.ensureOnline(true);
      }
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setStatus("Connecté · Salle SAC");
      };
      this.ws.onclose = () => {
        if (this.destroyed) {
          this.setStatus("Session terminée");
          return;
        }
        if (this.reconnectAttempts < 12) {
          this.reconnectAttempts += 1;
          this.setStatus(
            "Reconnexion… (" +
              this.reconnectAttempts +
              "/12) — le serveur Render peut mettre 1 min à démarrer"
          );
          setTimeout(() => this.openSocket(), 5000);
        } else {
          this.setStatus(
            "API live indisponible — vérifiez le déploiement WebRTC sur Render ou attendez 1 min et rouvrez le live"
          );
        }
      };
      this.ws.onerror = () => {
        if (!this.destroyed) this.setStatus("Erreur serveur SAC");
      };
      this.ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          this.onSignal(msg);
        } catch {
          /* ignore */
        }
      };
    }

    onSignal(msg) {
      const type = msg.type;
      if (type === "welcome") {
        this.peerId = msg.peerId;
        if (msg.role) this.userRole = msg.role;
        this.setStatus((msg.peers?.length || 0) + " connecté(s) · Live SAC");
        this.setParticipantsFromServer(msg.peers, msg.displayName || this.displayName);
        (msg.chatLog || []).forEach((m) => this.showFloatingComment(m));
        (msg.qaLog || []).forEach((m) => this.ingestQa(m, false));
        this.emitQaUpdate();
        (msg.peers || []).forEach((p) => {
          if (shouldConnectToPeer(this.userRole, p.role)) {
            this.createPeer(p.peerId, p.displayName, true, p.role);
          }
        });
        if (this.isAudience) this.sendMicState();
        return;
      }
      if (type === "participants") {
        this.setParticipantsFromServer(msg.list, this.displayName);
        return;
      }
      if (type === "peer-joined") {
        this.addParticipant(msg.peerId, msg.displayName, msg.role);
        if (shouldConnectToPeer(this.userRole, msg.role)) {
          this.createPeer(msg.peerId, msg.displayName, false, msg.role);
        }
        return;
      }
      if (type === "peer-left") {
        this.removeParticipant(msg.peerId);
        this.removePeer(msg.peerId);
        this.peerMicStates.delete(msg.peerId);
        return;
      }
      if (type === "mic-state" && msg.peerId) {
        this.peerMicStates.set(msg.peerId, !!msg.micOn);
        this.applyRemoteAudio(msg.peerId, msg.role);
        return;
      }
      if (type === "offer" && msg.from) {
        this.handleOffer(msg.from, msg.sdp, msg.role);
        return;
      }
      if (type === "answer" && msg.from) {
        this.handleAnswer(msg.from, msg.sdp);
        return;
      }
      if (type === "ice" && msg.from && msg.candidate) {
        this.handleIce(msg.from, msg.candidate);
        return;
      }
      if (type === "chat" && msg.message) {
        this.showFloatingComment(msg.message);
        return;
      }
      if (type === "qa" && msg.message) {
        this.ingestQa(msg.message, true);
      }
    }

    send(payload) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(payload));
      }
    }

    sendChat(text) {
      this.send({ type: "chat", text });
    }

    sendMicState() {
      this.send({ type: "mic-state", micOn: this.micOn });
    }

    sendQuestion(question) {
      if (!question?.text) return;
      this.send({
        type: "qa-question",
        id: question.id,
        text: question.text,
        author: question.author,
        authorEmail: question.authorEmail,
      });
    }

    sendAnswer(questionId, answer) {
      if (!questionId || !answer) return;
      this.send({ type: "qa-answer", questionId, answer });
    }

    ingestQa(message, notify) {
      if (!message) return;
      if (message.kind === "answer" && message.id) {
        const idx = this.qaQuestions.findIndex((q) => q.id === message.id);
        if (idx >= 0) {
          this.qaQuestions[idx] = {
            ...this.qaQuestions[idx],
            answer: message.answer || "",
            answeredAt: message.answeredAt || "",
            answeredBy: message.answeredBy || "",
          };
        }
      } else if (message.text) {
        const exists = this.qaQuestions.some((q) => q.id === message.id);
        if (!exists) {
          this.qaQuestions.unshift({
            id: message.id || "q-" + Date.now(),
            text: message.text,
            author: message.author || "Participant",
            authorEmail: message.authorEmail || "",
            createdAt: message.createdAt || new Date().toISOString(),
            answer: message.answer || "",
          });
        }
      }
      if (notify && typeof this.opts.onQaUpdate === "function") {
        this.opts.onQaUpdate(this.qaQuestions.slice());
      }
    }

    emitQaUpdate() {
      if (typeof this.opts.onQaUpdate === "function") {
        this.opts.onQaUpdate(this.qaQuestions.slice());
      }
    }

    showFloatingComment(msg) {
      if (!this.floatLayer || !msg?.text) return;
      while (this.floatLayer.children.length >= 6) {
        this.floatLayer.firstChild?.remove();
      }
      const isSelf = msg.peerId && msg.peerId === this.peerId;
      const bubble = document.createElement("div");
      bubble.className =
        "sac-webrtc__float-item" + (isSelf ? " sac-webrtc__float-item--self" : "");
      const who = esc(msg.displayName || "Participant");
      bubble.innerHTML = `<span class="sac-webrtc__float-name">${who}</span> ${esc(msg.text)}`;
      bubble.style.left = `${8 + Math.floor(Math.random() * 52)}%`;
      this.floatLayer.appendChild(bubble);
      requestAnimationFrame(() => bubble.classList.add("sac-webrtc__float-item--in"));
      setTimeout(() => {
        bubble.classList.add("sac-webrtc__float-item--out");
        setTimeout(() => bubble.remove(), 700);
      }, 5200);
    }

    applyRemoteAudio(peerId, role) {
      const remote = this.peers.get(peerId);
      if (!remote?.video?.srcObject) return;
      const stream = remote.video.srcObject;
      const audioTracks = stream.getAudioTracks();
      if (!audioTracks.length) return;

      let allow = true;
      const remoteRole = role || remote.role;
      if (this.isAudience) {
        allow = isHostRole(remoteRole);
      } else if (isHostRole(this.userRole)) {
        allow = isHostRole(remoteRole) || this.peerMicStates.get(peerId) === true;
      }

      audioTracks.forEach((t) => {
        t.enabled = allow;
      });
      remote.video.muted = !allow;
    }

    getSendStream() {
      if (this.screenStream) return this.screenStream;
      return this.localStream;
    }

    async createPeer(remoteId, name, initiator, role) {
      if (remoteId === this.peerId || this.peers.has(remoteId)) return;
      if (!shouldConnectToPeer(this.userRole, role)) return;

      const pc = new RTCPeerConnection(ICE);
      const remote = { id: remoteId, name, role: role || "", pc, tile: null, video: null };
      this.peerMicStates.set(remoteId, isHostRole(role));

      this.getSendStream().getTracks().forEach((track) => {
        pc.addTrack(track, this.getSendStream());
      });

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          this.send({ type: "ice", target: remoteId, candidate: ev.candidate });
        }
      };

      pc.ontrack = (ev) => {
        if (!remote.video) {
          remote.tile = this.createRemoteTile(remoteId, name, role);
          remote.video = remote.tile.querySelector("video");
          this.updateGridLayout();
        }
        if (remote.video.srcObject !== ev.streams[0]) {
          remote.video.srcObject = ev.streams[0];
          remote.video.muted = false;
          remote.video.playsInline = true;
          remote.video.setAttribute("playsinline", "");
          const playPromise = remote.video.play();
          if (playPromise && typeof playPromise.catch === "function") playPromise.catch(() => {});
        }
        this.applyRemoteAudio(remoteId, role);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          this.removePeer(remoteId);
        }
      };

      this.peers.set(remoteId, remote);

      if (initiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.send({ type: "offer", target: remoteId, sdp: pc.localDescription, role: this.userRole });
      }
    }

    createRemoteTile(id, name, role) {
      const tile = document.createElement("div");
      tile.className = "sac-webrtc__tile";
      if (isHostRole(role)) tile.classList.add("sac-webrtc__tile--host");
      else tile.classList.add("sac-webrtc__tile--peer");
      tile.dataset.peer = id;
      const video = document.createElement("video");
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.muted = false;
      const label = document.createElement("span");
      label.className = "sac-webrtc__label";
      label.textContent = (isHostRole(role) ? "🎓 " : "") + (name || "Participant");
      tile.appendChild(video);
      tile.appendChild(label);
      if (this.isAudience && isHostRole(role)) {
        this.grid.insertBefore(tile, this.grid.firstChild);
      } else {
        this.grid.appendChild(tile);
      }
      return tile;
    }

    async handleOffer(from, sdp, role) {
      await this.createPeer(from, "Participant", false, role);
      const remote = this.peers.get(from);
      if (!remote) return;
      await remote.pc.setRemoteDescription(sdp);
      const answer = await remote.pc.createAnswer();
      await remote.pc.setLocalDescription(answer);
      this.send({ type: "answer", target: from, sdp: remote.pc.localDescription });
    }

    async handleAnswer(from, sdp) {
      const remote = this.peers.get(from);
      if (!remote) return;
      await remote.pc.setRemoteDescription(sdp);
    }

    async handleIce(from, candidate) {
      const remote = this.peers.get(from);
      if (!remote) return;
      try {
        await remote.pc.addIceCandidate(candidate);
      } catch {
        /* ignore */
      }
    }

    removePeer(id) {
      const remote = this.peers.get(id);
      if (!remote) return;
      remote.pc.close();
      if (remote.tile) remote.tile.remove();
      this.peers.delete(id);
      this.updateGridLayout();
    }

    replaceTracksOnPeers(stream) {
      this.peers.forEach((remote) => {
        const senders = remote.pc.getSenders();
        stream.getTracks().forEach((track) => {
          const kind = track.kind;
          const sender = senders.find((s) => s.track && s.track.kind === kind);
          if (sender) sender.replaceTrack(track);
          else remote.pc.addTrack(track, stream);
        });
      });
    }

    toggleMic() {
      this.micOn = !this.micOn;
      this.localStream.getAudioTracks().forEach((t) => {
        t.enabled = this.micOn;
      });
      this.container.querySelector("#sacWrtcMic").classList.toggle("sac-webrtc__btn--off", !this.micOn);
      this.sendMicState();
    }

    toggleCam() {
      this.camOn = !this.camOn;
      this.localStream.getVideoTracks().forEach((t) => {
        t.enabled = this.camOn;
      });
      this.container.querySelector("#sacWrtcCam").classList.toggle("sac-webrtc__btn--off", !this.camOn);
    }

    async toggleScreen() {
      const btn = this.container.querySelector("#sacWrtcScreen");
      if (this.screenStream) {
        this.screenStream.getTracks().forEach((t) => t.stop());
        this.screenStream = null;
        btn.classList.remove("sac-webrtc__btn--active");
        this.replaceTracksOnPeers(this.localStream);
        if (this.localVideo) this.localVideo.srcObject = this.localStream;
        return;
      }
      try {
        this.screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        btn.classList.add("sac-webrtc__btn--active");
        this.replaceTracksOnPeers(this.screenStream);
        if (this.localVideo) this.localVideo.srcObject = this.screenStream;
        this.screenStream.getVideoTracks()[0].onended = () => this.toggleScreen();
      } catch {
        /* cancelled */
      }
    }

    toggleRecord() {
      const btn = this.container.querySelector("#sacWrtcRecord");
      if (this.recorder && this.recorder.state === "recording") {
        this.recorder.stop();
        btn.classList.remove("sac-webrtc__btn--active");
        btn.textContent = "⏺️";
        return;
      }
      const stream = this.getSendStream();
      if (!stream) return;
      this.recordChunks = [];
      try {
        this.recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8,opus" });
      } catch {
        this.recorder = new MediaRecorder(stream);
      }
      this.recorder.ondataavailable = (e) => {
        if (e.data.size) this.recordChunks.push(e.data);
      };
      this.recorder.onstop = () => {
        const blob = new Blob(this.recordChunks, { type: "video/webm" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "sac-live-" + (this.roomId || "session").slice(0, 24) + ".webm";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      };
      this.recorder.start();
      btn.classList.add("sac-webrtc__btn--active");
      btn.textContent = "⏹";
    }

    destroy() {
      this.destroyed = true;
      if (this.recorder && this.recorder.state === "recording") {
        this.recorder.stop();
      }
      this.peers.forEach((remote) => remote.pc.close());
      this.peers.clear();
      if (this.ws) {
        try {
          this.ws.close();
        } catch {
          /* ignore */
        }
      }
      if (this.screenStream) {
        this.screenStream.getTracks().forEach((t) => t.stop());
      }
      if (this.localStream) {
        this.localStream.getTracks().forEach((t) => t.stop());
      }
      if (this.container) this.container.innerHTML = "";
    }
  }

  function renderPresenceList(container, participants) {
    if (!container) return;
    const list = participants || [];
    const count = list.length;
    container.innerHTML = `
      <div class="sac-live-presence">
        <div class="sac-live-presence__head">
          <span class="sac-live-presence__dot" aria-hidden="true"></span>
          <strong>Présents (${count})</strong>
        </div>
        <ul class="sac-live-presence__list">
          ${
            list.length
              ? list
                  .map(
                    (p) =>
                      `<li class="sac-live-presence__item${p.isSelf ? " sac-live-presence__item--self" : ""}">
                        <span class="sac-live-presence__avatar">${esc((p.displayName || "?")[0])}</span>
                        <span>${esc(p.displayName || "Participant")}${p.isSelf ? " (vous)" : ""}</span>
                      </li>`
                  )
                  .join("")
              : "<li class='sac-live-presence__empty'>En attente de participants…</li>"
          }
        </ul>
      </div>`;
  }

  async function join(opts) {
    if (!opts || !opts.roomId) throw new Error("Salle live invalide.");
    if (active) leave();

    let container = opts.container;
    if (!container && opts.hostId) {
      container = ensureVideoHost(opts.hostId);
    }
    if (!container) throw new Error("Conteneur vidéo introuvable.");

    const session = new RoomSession({ ...opts, container });
    active = session;
    await session.connect();
    return session;
  }

  function leave() {
    if (active) {
      active.destroy();
      active = null;
    }
  }

  function isActive() {
    return !!active;
  }

  function attachToHost(hostId, opts) {
    const container = ensureVideoHost(hostId);
    if (!container) return Promise.reject(new Error("Conteneur introuvable"));
    return join({ ...opts, container });
  }

  function sendQuestion(question) {
    if (active) active.sendQuestion(question);
  }

  function sendAnswer(questionId, answer) {
    if (active) active.sendAnswer(questionId, answer);
  }

  return {
    join,
    leave,
    isActive,
    attachToHost,
    ensureVideoHost,
    renderPresenceList,
    sendQuestion,
    sendAnswer,
    isHostRole,
  };
})();

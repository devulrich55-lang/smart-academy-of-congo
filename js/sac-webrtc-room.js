/**
 * Salle live SAC — WebRTC natif
 * Commentaires sur l'écran · responsive · sans panneau chat
 */
const SAC_WEBRTC_ROOM = (function () {
  const ICE = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      {
        urls: [
          "turn:openrelay.metered.ca:80",
          "turn:openrelay.metered.ca:443",
          "turn:openrelay.metered.ca:443?transport=tcp",
        ],
        username: "openrelayproject",
        credential: "openrelayproject",
      },
    ],
    iceCandidatePoolSize: 10,
  };

  let active = null;

  const HOST_ROLES = ["professeur", "universite", "assistant", "section"];

  function isHostRole(role) {
    return HOST_ROLES.includes(String(role || "").toLowerCase());
  }

  function shouldConnectToPeer(localRole, remoteRole) {
    if (isHostRole(localRole)) return true;
    if (String(localRole || "").toLowerCase() === "etudiant") {
      if (!remoteRole) return true;
      return isHostRole(remoteRole);
    }
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
      this.probeFail = null;
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
        role: this.userRole || "",
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
      if (typeof SAC_API !== "undefined" && SAC_API.probeLiveApi) {
        this.setStatus("Vérification API live…");
        const probe = await SAC_API.probeLiveApi();
        if (!probe.ok) {
          this.probeFail = probe;
          this.setStatus(probe.message || "API live indisponible");
          if (probe.reason === "WEBRTC_MISSING" || probe.reason === "NO_TOKEN" || probe.reason === "AUTH") {
            throw new Error(probe.message);
          }
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
      if (this.isAudience && this.stage) {
        this.stage.addEventListener(
          "click",
          () => {
            this.peers.forEach((remote, id) => {
              this.applyRemoteAudio(id, remote.role);
              if (remote.audio) remote.audio.play().catch(() => {});
              if (remote.video) remote.video.play().catch(() => {});
            });
          },
          { once: true }
        );
      }
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
      if (this.isAudience && !this.camOn) {
        tile.classList.add("sac-webrtc__tile--cam-off");
        video.style.opacity = "0";
      }
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
        if (this.isAudience) {
          this.setStatus("Connecté · Touchez l'écran si vous n'entendez pas le professeur");
        } else {
          this.setStatus("Connecté · Salle SAC");
        }
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
          const pf = this.probeFail;
          if (pf?.message) {
            this.setStatus(pf.message);
          } else {
            this.setStatus(
              "Connexion live impossible — vérifiez l'API Render (plan Starter) et reconnectez-vous."
            );
          }
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
        (msg.list || []).forEach((p) => {
          const remote = this.peers.get(p.peerId);
          if (!remote) return;
          if (p.role) remote.role = p.role;
          this.syncRemoteTileRole(remote, p.role);
          this.applyRemoteAudio(p.peerId, p.role);
        });
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

    syncRemoteTileRole(remote, role) {
      if (!remote?.tile) return;
      remote.tile.classList.remove("sac-webrtc__tile--host", "sac-webrtc__tile--peer");
      if (this.isAudience || isHostRole(role)) {
        remote.tile.classList.add("sac-webrtc__tile--host");
      } else {
        remote.tile.classList.add("sac-webrtc__tile--peer");
      }
    }

    attachRemotePlayback(remote, stream) {
      if (!remote?.tile || !stream) return;
      if (!remote.audio) {
        remote.audio = document.createElement("audio");
        remote.audio.autoplay = true;
        remote.audio.setAttribute("playsinline", "");
        remote.audio.style.display = "none";
        remote.tile.appendChild(remote.audio);
      }
      remote.audio.srcObject = stream;
    }

    applyRemoteAudio(peerId, role) {
      const remote = this.peers.get(peerId);
      if (!remote?.video?.srcObject) return;
      const stream = remote.video.srcObject;
      const audioTracks = stream.getAudioTracks();
      if (!audioTracks.length) return;

      const remoteRole = role || remote.role || "";
      let allow = true;
      if (this.isAudience) {
        allow = remoteRole !== "etudiant";
      } else if (isHostRole(this.userRole)) {
        allow = isHostRole(remoteRole) || this.peerMicStates.get(peerId) === true;
      }

      audioTracks.forEach((t) => {
        t.enabled = allow;
      });
      remote.video.muted = !allow;
      if (remote.audio) {
        remote.audio.muted = !allow;
        if (allow) {
          const p = remote.audio.play();
          if (p && typeof p.catch === "function") p.catch(() => {});
        }
      }
    }

    getSendStream() {
      if (this.screenStream) return this.screenStream;
      return this.localStream;
    }

    bindRemoteStream(remote, ev, role) {
      const stream =
        ev.streams && ev.streams[0] ? ev.streams[0] : new MediaStream([ev.track]);
      if (ev.track) {
        ev.track.enabled = true;
      }
      if (!remote.video) {
        remote.tile = this.createRemoteTile(remote.id, remote.name, role || remote.role);
        remote.video = remote.tile.querySelector("video");
        this.updateGridLayout();
      }
      if (remote.video.srcObject !== stream) {
        remote.video.srcObject = stream;
      }
      remote.video.muted = false;
      remote.video.playsInline = true;
      remote.video.setAttribute("playsinline", "");
      remote.video.setAttribute("webkit-playsinline", "");
      this.attachRemotePlayback(remote, stream);
      const playVideo = remote.video.play();
      if (playVideo && typeof playVideo.catch === "function") playVideo.catch(() => {});
      remote.tile.classList.add("sac-webrtc__tile--playing");
      this.applyRemoteAudio(remote.id, role || remote.role);
      if (this.isAudience) {
        this.setStatus("Connecté · Touchez l'écran si vous n'entendez pas le professeur");
      }
    }

    async createPeer(remoteId, name, initiator, role) {
      if (remoteId === this.peerId || this.peers.has(remoteId)) return;
      if (!shouldConnectToPeer(this.userRole, role)) return;

      const pc = new RTCPeerConnection(ICE);
      const remote = { id: remoteId, name, role: role || "", pc, tile: null, video: null, audio: null };
      this.peerMicStates.set(remoteId, isHostRole(role));

      if (this.isAudience) {
        pc.addTransceiver("video", { direction: "recvonly" });
        pc.addTransceiver("audio", { direction: "recvonly" });
      } else {
        this.getSendStream().getTracks().forEach((track) => {
          pc.addTrack(track, this.getSendStream());
        });
      }

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          this.send({ type: "ice", target: remoteId, candidate: ev.candidate });
        }
      };

      pc.ontrack = (ev) => {
        this.bindRemoteStream(remote, ev, role);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          this.applyRemoteAudio(remoteId, remote.role);
        }
        if (pc.connectionState === "failed") {
          this.setStatus("Connexion vidéo échouée — réseau mobile : réessayez ou changez de connexion");
        }
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          setTimeout(() => {
            if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
              this.removePeer(remoteId);
            }
          }, 4000);
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "failed") {
          this.setStatus("Réseau bloqué — activez Wi‑Fi ou réessayez dans quelques secondes");
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
      if (this.isAudience || isHostRole(role)) {
        tile.classList.add("sac-webrtc__tile--host");
      } else {
        tile.classList.add("sac-webrtc__tile--peer");
      }
      tile.dataset.peer = id;
      const video = document.createElement("video");
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.muted = false;
      const label = document.createElement("span");
      label.className = "sac-webrtc__label";
      const hostTag = this.isAudience || isHostRole(role) ? "🎓 " : "";
      label.textContent = hostTag + (name || "Participant");
      tile.appendChild(video);
      tile.appendChild(label);
      if (this.isAudience || isHostRole(role)) {
        this.grid.insertBefore(tile, this.grid.firstChild);
      } else {
        this.grid.appendChild(tile);
      }
      return tile;
    }

    async handleOffer(from, sdp, role) {
      const known = this.participants.find((p) => p.peerId === from);
      const resolvedRole = role || known?.role || "";
      let remote = this.peers.get(from);
      if (!remote) {
        await this.createPeer(from, known?.displayName || "Participant", false, resolvedRole);
        remote = this.peers.get(from);
      } else if (resolvedRole) {
        remote.role = resolvedRole;
        this.syncRemoteTileRole(remote, resolvedRole);
      }
      if (!remote) return;
      await remote.pc.setRemoteDescription(new RTCSessionDescription(sdp));
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

    async renegotiatePeer(remote) {
      if (!remote?.pc) return;
      const offer = await remote.pc.createOffer();
      await remote.pc.setLocalDescription(offer);
      this.send({ type: "offer", target: remote.id, sdp: remote.pc.localDescription, role: this.userRole });
    }

    async ensureAudienceSenders() {
      if (!this.isAudience || !this.localStream) return;
      for (const remote of this.peers.values()) {
        if (this.micOn) {
          const audioTrack = this.localStream.getAudioTracks()[0];
          if (audioTrack) {
            audioTrack.enabled = true;
            let sender = remote.pc.getSenders().find((s) => s.track && s.track.kind === "audio");
            if (!sender) {
              remote.pc.addTrack(audioTrack, this.localStream);
            } else {
              await sender.replaceTrack(audioTrack);
            }
          }
        }
        if (this.camOn) {
          const videoTrack = this.localStream.getVideoTracks()[0];
          if (videoTrack) {
            videoTrack.enabled = true;
            let sender = remote.pc.getSenders().find((s) => s.track && s.track.kind === "video");
            if (!sender) {
              remote.pc.addTrack(videoTrack, this.localStream);
            } else {
              await sender.replaceTrack(videoTrack);
            }
          }
        }
        await this.renegotiatePeer(remote);
      }
    }

    toggleMic() {
      this.micOn = !this.micOn;
      this.localStream.getAudioTracks().forEach((t) => {
        t.enabled = this.micOn;
      });
      this.container.querySelector("#sacWrtcMic").classList.toggle("sac-webrtc__btn--off", !this.micOn);
      if (this.isAudience && this.micOn) {
        this.ensureAudienceSenders().catch(() => {});
      }
      this.sendMicState();
    }

    toggleCam() {
      this.camOn = !this.camOn;
      this.localStream.getVideoTracks().forEach((t) => {
        t.enabled = this.camOn;
      });
      if (this.localVideo) {
        this.localVideo.style.opacity = this.camOn ? "1" : "0";
      }
      const localTile = this.grid.querySelector(".sac-webrtc__tile--local");
      if (localTile) localTile.classList.toggle("sac-webrtc__tile--cam-off", !this.camOn);
      this.container.querySelector("#sacWrtcCam").classList.toggle("sac-webrtc__btn--off", !this.camOn);
      if (this.isAudience && this.camOn) {
        this.ensureAudienceSenders().catch(() => {});
      }
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

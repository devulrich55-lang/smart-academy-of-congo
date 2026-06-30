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
  let lastRecordingUrl = null;
  let recordingUploadPromise = null;

  const HOST_ROLES = ["professeur", "universite", "assistant", "section"];

  const AUDIO_CONSTRAINTS = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    voiceIsolation: true,
    sampleRate: { ideal: 48000 },
    channelCount: { ideal: 1 },
  };

  const AUDIO_CONSTRAINTS_BASIC = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };

  const VIDEO_CONSTRAINTS = {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 30 },
    facingMode: "user",
  };

  async function requestUserMedia(wantAudio, wantVideo) {
    const attempts = [];
    if (wantAudio && wantVideo) {
      attempts.push({ audio: AUDIO_CONSTRAINTS, video: VIDEO_CONSTRAINTS });
      attempts.push({ audio: AUDIO_CONSTRAINTS_BASIC, video: VIDEO_CONSTRAINTS });
      attempts.push({ audio: true, video: { facingMode: "user" } });
    } else if (wantAudio) {
      attempts.push({ audio: AUDIO_CONSTRAINTS, video: false });
      attempts.push({ audio: AUDIO_CONSTRAINTS_BASIC, video: false });
      attempts.push({ audio: true, video: false });
    } else if (wantVideo) {
      attempts.push({ audio: false, video: VIDEO_CONSTRAINTS });
      attempts.push({ audio: false, video: { facingMode: "user" } });
    }
    let lastErr = null;
    for (const constraints of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("Accès caméra/micro refusé");
  }

  function mediaErrorMessage(err) {
    const name = String(err?.name || "");
    const msg = String(err?.message || err || "");
    if (name === "NotAllowedError" || /permission denied/i.test(msg)) {
      return "Accès caméra/micro refusé — autorisez le micro dans la barre d'adresse du navigateur, puis réessayez.";
    }
    if (name === "NotFoundError") {
      return "Aucune caméra ou micro détecté sur cet appareil.";
    }
    if (name === "NotReadableError") {
      return "Caméra ou micro déjà utilisé par une autre application.";
    }
    return msg || "Impossible d'accéder à la caméra ou au micro.";
  }

  function enhanceAudioStream(micStream) {
    if (!micStream || typeof AudioContext === "undefined") {
      return { stream: micStream, cleanup: () => {} };
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx({ latencyHint: "interactive", sampleRate: 48000 });
      const source = ctx.createMediaStreamSource(micStream);
      const highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 110;
      highpass.Q.value = 0.8;
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 14000;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -26;
      compressor.knee.value = 18;
      compressor.ratio.value = 10;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.18;
      const gain = ctx.createGain();
      gain.gain.value = 1.08;
      const dest = ctx.createMediaStreamDestination();
      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(compressor);
      compressor.connect(gain);
      gain.connect(dest);
      return {
        ctx,
        stream: dest.stream,
        outputTrack: dest.stream.getAudioTracks()[0],
        cleanup: () => {
          try {
            ctx.close();
          } catch {
            /* ignore */
          }
        },
      };
    } catch {
      return { stream: micStream, cleanup: () => {} };
    }
  }

  async function optimizeVideoSender(pc) {
    if (!pc) return;
    try {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (!sender?.getParameters) return;
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];
      params.encodings[0].maxBitrate = 2_500_000;
      params.encodings[0].maxFramerate = 30;
      await sender.setParameters(params);
    } catch {
      /* navigateur / réseau */
    }
  }

  function isHostRole(role) {
    return HOST_ROLES.includes(String(role || "").toLowerCase());
  }

  function isPresenterForAudience(remote, role) {
    const r = String(role || remote?.role || "").toLowerCase();
    if (!r) return true;
    return isHostRole(r);
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
      this.rawMicStream = null;
      this.audioEnhancer = null;
      this.noiseCancelOn = true;
      this.hostWatchTimer = null;
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
      await this.setupLocalMedia();
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
      if (this.isAudience) {
        this.startHostPlaybackWatch();
        if (this.stage) {
          this.stage.addEventListener("click", () => this.resumeAudiencePlayback());
        }
      }
    }

    resumeAudiencePlayback() {
      this.peers.forEach((remote) => {
        if (!isPresenterForAudience(remote, remote.role)) return;
        this.playRemoteMedia(remote, remote.role);
      });
      this.setStatus("Connecté · Touchez l'écran si vous n'entendez pas le professeur");
    }

    startHostPlaybackWatch() {
      if (!this.isAudience) return;
      if (this.hostWatchTimer) clearInterval(this.hostWatchTimer);
      this.hostWatchTimer = setInterval(() => {
        if (this.destroyed) return;
        this.peers.forEach((remote) => {
          if (!isPresenterForAudience(remote, remote.role)) return;
          this.playRemoteMedia(remote, remote.role);
          this.updateRemoteMediaStatus(remote);
        });
        this.refreshAudienceLayout();
      }, 2500);
    }

    pickPrimaryHostPeer() {
      const presenters = [...this.peers.values()].filter((p) =>
        isPresenterForAudience(p, p.role)
      );
      return (
        presenters.find((p) => p.role === "professeur") ||
        presenters.find((p) => p.role === "universite") ||
        presenters.find((p) => p.role === "section") ||
        presenters.find((p) => p.role === "assistant") ||
        presenters[0] ||
        null
      );
    }

    refreshAudienceLayout() {
      if (!this.isAudience) return;
      const primary = this.pickPrimaryHostPeer();
      this.peers.forEach((remote) => {
        if (!remote.tile) return;
        if (!isPresenterForAudience(remote, remote.role)) return;
        const isPrimary = !primary || remote.id === primary.id;
        remote.tile.classList.toggle("sac-webrtc__tile--hidden", !isPrimary);
        if (isPrimary) {
          remote.tile.classList.add("sac-webrtc__tile--host");
          remote.tile.classList.remove("sac-webrtc__tile--peer");
          if (remote.tile.parentNode === this.grid) {
            this.grid.insertBefore(remote.tile, this.grid.firstChild);
          }
        }
      });
    }

    async setupLocalMedia() {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (this.isAudience) {
          this.localStream = new MediaStream();
          this.micOn = false;
          this.camOn = false;
          this.setStatus("Mode spectateur — en attente du flux professeur");
          return;
        }
        throw new Error("Votre navigateur ne prend pas en charge la vidéo en direct.");
      }

      if (this.isAudience) {
        try {
          this.rawMicStream = await requestUserMedia(true, false);
          this.localStream = this.buildLocalStream(this.rawMicStream);
          this.localStream.getAudioTracks().forEach((t) => {
            t.enabled = false;
          });
          this.localStream.getVideoTracks().forEach((t) => {
            t.enabled = false;
          });
          this.micOn = false;
          this.camOn = false;
          this.container.querySelector("#sacWrtcMic")?.classList.add("sac-webrtc__btn--off");
          this.container.querySelector("#sacWrtcCam")?.classList.add("sac-webrtc__btn--off");
          this.addLocalTile();
          this.setStatus("Mode spectateur — touchez l'écran si le son ne démarre pas");
        } catch {
          this.rawMicStream = null;
          this.localStream = new MediaStream();
          this.micOn = false;
          this.camOn = false;
          this.container.querySelector("#sacWrtcMic")?.classList.add("sac-webrtc__btn--off");
          this.container.querySelector("#sacWrtcCam")?.classList.add("sac-webrtc__btn--off");
          this.setStatus("Mode spectateur — vous regardez le cours sans caméra ni micro");
        }
        this.hideAudienceHostControls();
        return;
      }

      try {
        this.rawMicStream = await requestUserMedia(true, true);
      } catch {
        try {
          this.rawMicStream = await requestUserMedia(true, false);
          this.setStatus("Micro actif — appuyez sur Caméra pour activer la vidéo");
        } catch {
          try {
            this.rawMicStream = await requestUserMedia(false, true);
            this.setStatus("Caméra active — micro indisponible, cliquez sur 🎤 pour réessayer");
          } catch (err2) {
            this.rawMicStream = null;
            this.localStream = new MediaStream();
            this.micOn = false;
            this.camOn = false;
            this.container.querySelector("#sacWrtcMic")?.classList.add("sac-webrtc__btn--off");
            this.container.querySelector("#sacWrtcCam")?.classList.add("sac-webrtc__btn--off");
            this.setStatus(
              "Micro/caméra refusés — cliquez sur 🎤 ou 📷 pour autoriser, ou vérifiez l'icône cadenas dans la barre d'adresse."
            );
            return;
          }
        }
      }
      this.localStream = this.buildLocalStream(this.rawMicStream);
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack?.applyConstraints) {
        audioTrack.applyConstraints(AUDIO_CONSTRAINTS_BASIC).catch(() => {});
      }
      this.micOn = !!this.localStream.getAudioTracks().length;
      this.camOn = !!this.localStream.getVideoTracks().length;
      this.localStream.getAudioTracks().forEach((t) => {
        t.enabled = this.micOn;
      });
      this.localStream.getVideoTracks().forEach((t) => {
        t.enabled = this.camOn;
      });
      if (!this.camOn) {
        this.container.querySelector("#sacWrtcCam")?.classList.add("sac-webrtc__btn--off");
      }
      if (!this.micOn) {
        this.container.querySelector("#sacWrtcMic")?.classList.add("sac-webrtc__btn--off");
      }
      this.addLocalTile();
    }

    hideAudienceHostControls() {
      ["#sacWrtcScreen", "#sacWrtcRecord", "#sacWrtcNoise"].forEach((sel) => {
        this.container.querySelector(sel)?.style.setProperty("display", "none");
      });
    }

    buildLocalStream(rawStream) {
      if (!rawStream) return new MediaStream();
      if (this.audioEnhancer?.cleanup) this.audioEnhancer.cleanup();
      const audioOnly = new MediaStream(rawStream.getAudioTracks());
      if (this.noiseCancelOn) {
        this.audioEnhancer = enhanceAudioStream(audioOnly);
      } else {
        this.audioEnhancer = null;
      }
      const audioTrack =
        this.audioEnhancer?.outputTrack || rawStream.getAudioTracks()[0] || null;
      const tracks = [];
      if (audioTrack) tracks.push(audioTrack);
      rawStream.getVideoTracks().forEach((t) => tracks.push(t));
      return new MediaStream(tracks);
    }

    renderShell() {
      this.container.innerHTML = `
        <div class="sac-webrtc sac-webrtc--pro">
          <div class="sac-webrtc__stage" id="sacWrtcStage">
            <div class="sac-webrtc__status" id="sacWrtcStatus">Connexion…</div>
            <div class="sac-webrtc__quality" id="sacWrtcQuality" title="Qualité HD">HD</div>
            <div class="sac-webrtc__grid" id="sacWrtcGrid"></div>
            <div class="sac-webrtc__float" id="sacWrtcFloat" aria-live="polite"></div>
            <div class="sac-webrtc__dock" id="sacWrtcDock">
              <form class="sac-webrtc__comment-bar" id="sacWrtcCommentForm">
                <input type="text" id="sacWrtcCommentInput" placeholder="Commenter le live…" maxlength="200" autocomplete="off" />
                <button type="submit" aria-label="Envoyer">➤</button>
              </form>
              <div class="sac-webrtc__toolbar" role="toolbar" aria-label="Contrôles live">
                <button type="button" class="sac-webrtc__btn sac-webrtc__btn--labeled" id="sacWrtcMic" title="Micro" aria-label="Micro">
                  <span class="sac-webrtc__btn-icon">🎤</span><span class="sac-webrtc__btn-text">Micro</span>
                </button>
                <button type="button" class="sac-webrtc__btn sac-webrtc__btn--labeled" id="sacWrtcCam" title="Caméra" aria-label="Caméra">
                  <span class="sac-webrtc__btn-icon">📷</span><span class="sac-webrtc__btn-text">Caméra</span>
                </button>
                <button type="button" class="sac-webrtc__btn sac-webrtc__btn--labeled" id="sacWrtcNoise" title="Réduction du bruit" aria-label="Réduction du bruit">
                  <span class="sac-webrtc__btn-icon">🔇</span><span class="sac-webrtc__btn-text">Anti-bruit</span>
                </button>
                <button type="button" class="sac-webrtc__btn sac-webrtc__btn--labeled" id="sacWrtcScreen" title="Partager l'écran" aria-label="Partage écran">
                  <span class="sac-webrtc__btn-icon">🖥️</span><span class="sac-webrtc__btn-text">Écran</span>
                </button>
                <button type="button" class="sac-webrtc__btn sac-webrtc__btn--labeled" id="sacWrtcRecord" title="Enregistrer" aria-label="Enregistrer">
                  <span class="sac-webrtc__btn-icon">⏺️</span><span class="sac-webrtc__btn-text">Enreg.</span>
                </button>
                <button type="button" class="sac-webrtc__btn sac-webrtc__btn--labeled" id="sacWrtcFullscreen" title="Plein écran" aria-label="Plein écran">
                  <span class="sac-webrtc__btn-icon">⛶</span><span class="sac-webrtc__btn-text">Plein écran</span>
                </button>
                <button type="button" class="sac-webrtc__btn sac-webrtc__btn--leave sac-webrtc__btn--labeled" id="sacWrtcLeave">
                  <span class="sac-webrtc__btn-icon">✕</span><span class="sac-webrtc__btn-text">Quitter</span>
                </button>
              </div>
            </div>
          </div>
        </div>`;

      this.stage = this.container.querySelector("#sacWrtcStage");
      this.grid = this.container.querySelector("#sacWrtcGrid");
      this.floatLayer = this.container.querySelector("#sacWrtcFloat");
      this.statusEl = this.container.querySelector("#sacWrtcStatus");

      this.container.querySelector("#sacWrtcMic").onclick = () => this.toggleMic();
      this.container.querySelector("#sacWrtcCam").onclick = () => this.toggleCam();
      this.container.querySelector("#sacWrtcNoise").onclick = () => this.toggleNoiseCancel();
      this.container.querySelector("#sacWrtcScreen").onclick = () => this.toggleScreen();
      this.container.querySelector("#sacWrtcRecord").onclick = () => this.toggleRecord();
      this.container.querySelector("#sacWrtcFullscreen").onclick = () => this.toggleFullscreen();
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
      this.container.querySelector("#sacWrtcNoise")?.classList.add("sac-webrtc__btn--active");
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
      if (!this.localStream?.getTracks?.().length) return;
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
          if (!shouldConnectToPeer(this.userRole, p.role)) return;
          if (this.isAudience && p.role && !isHostRole(p.role)) return;
          this.createPeer(p.peerId, p.displayName, isHostRole(this.userRole), p.role);
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
          this.syncRemoteTileRole(remote, p.role || remote.role);
          this.applyRemoteAudio(p.peerId, p.role || remote.role);
          this.playRemoteMedia(remote, p.role || remote.role);
        });
        this.refreshAudienceLayout();
        if (this.isAudience) {
          (msg.list || []).forEach((p) => {
            if (!isHostRole(p.role)) return;
            if (this.peers.has(p.peerId)) return;
            if (!shouldConnectToPeer(this.userRole, p.role)) return;
            this.createPeer(p.peerId, p.displayName, isHostRole(this.userRole), p.role);
          });
          this.peers.forEach((remote, id) => {
            if (remote.role && !isHostRole(remote.role)) {
              this.removePeer(id);
            }
          });
        }
        return;
      }
      if (type === "peer-joined") {
        this.addParticipant(msg.peerId, msg.displayName, msg.role);
        if (shouldConnectToPeer(this.userRole, msg.role)) {
          this.createPeer(msg.peerId, msg.displayName, isHostRole(this.userRole), msg.role);
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
      const resolved = String(role || remote.role || "").toLowerCase();
      if (role) remote.role = role;
      remote.tile.classList.remove("sac-webrtc__tile--host", "sac-webrtc__tile--peer", "sac-webrtc__tile--hidden");
      if (isHostRole(resolved) || (this.isAudience && resolved !== "etudiant")) {
        remote.tile.classList.add("sac-webrtc__tile--host");
        if (remote.tile.parentNode === this.grid) {
          this.grid.insertBefore(remote.tile, this.grid.firstChild);
        }
      } else if (this.isAudience) {
        remote.tile.classList.add("sac-webrtc__tile--peer", "sac-webrtc__tile--hidden");
      } else {
        remote.tile.classList.add("sac-webrtc__tile--peer");
      }
      this.refreshAudienceLayout();
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
      if (this.isAudience) {
        remote.video.muted = true;
      } else {
        remote.video.muted = !allow;
      }
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
      return this.localStream || new MediaStream();
    }

    bindRemoteStream(remote, ev, role) {
      if (!remote.mediaStream) {
        remote.mediaStream = new MediaStream();
      }

      const attachTrack = (track) => {
        if (!track) return;
        track.enabled = true;
        remote.mediaStream
          .getTracks()
          .filter((t) => t.kind === track.kind)
          .forEach((t) => remote.mediaStream.removeTrack(t));
        remote.mediaStream.addTrack(track);
        track.onunmute = () => {
          this.playRemoteMedia(remote, role || remote.role);
          this.updateRemoteMediaStatus(remote);
        };
        track.onmute = () => this.updateRemoteMediaStatus(remote);
        track.onended = () => this.updateRemoteMediaStatus(remote);
        if (track.kind === "video") {
          setTimeout(() => this.updateRemoteMediaStatus(remote), 400);
          setTimeout(() => this.updateRemoteMediaStatus(remote), 2000);
        }
      };

      if (ev.streams?.[0]) {
        ev.streams[0].getTracks().forEach((track) => attachTrack(track));
      } else if (ev.track) {
        attachTrack(ev.track);
      }

      if (!remote.video) {
        this.ensureRemoteTile(remote, role || remote.role);
      }

      this.playRemoteMedia(remote, role || remote.role);
      this.updateRemoteMediaStatus(remote);
      this.refreshAudienceLayout();
    }

    ensureRemoteTile(remote, role) {
      if (remote.tile) return;
      remote.tile = this.createRemoteTile(remote.id, remote.name, role || remote.role);
      remote.video = remote.tile.querySelector("video");
      if (this.isAudience && isPresenterForAudience(remote, role || remote.role)) {
        remote.tile.classList.add("sac-webrtc__tile--no-video");
      }
      this.updateGridLayout();
      this.refreshAudienceLayout();
    }

    playRemoteMedia(remote, role) {
      if (!remote?.mediaStream || !remote.video) return;
      remote.video.srcObject = remote.mediaStream;
      remote.video.muted = this.isAudience;
      remote.video.playsInline = true;
      remote.video.setAttribute("playsinline", "");
      remote.video.setAttribute("webkit-playsinline", "");
      this.attachRemotePlayback(remote, remote.mediaStream);
      const playVideo = remote.video.play();
      if (playVideo && typeof playVideo.catch === "function") {
        playVideo.catch(() => {
          if (this.isAudience) {
            remote.video.muted = true;
            remote.video.play().catch(() => {});
          }
        });
      }
      if (remote.audio) {
        const playAudio = remote.audio.play();
        if (playAudio && typeof playAudio.catch === "function") playAudio.catch(() => {});
      }
      remote.tile?.classList.add("sac-webrtc__tile--playing");
      this.applyRemoteAudio(remote.id, role || remote.role);
    }

    updateRemoteMediaStatus(remote) {
      if (!remote?.tile) return;
      const videoTracks = (remote.mediaStream?.getVideoTracks() || []).filter(
        (t) => t.readyState !== "ended"
      );
      const hasVideoTrack = videoTracks.length > 0;
      const camEnabled = videoTracks.some((t) => t.enabled);
      const showNoVideo = !hasVideoTrack || !camEnabled;
      remote.tile.classList.toggle("sac-webrtc__tile--no-video", showNoVideo);
      remote.tile.classList.toggle("sac-webrtc__tile--cam-off-remote", hasVideoTrack && !camEnabled);
      if (this.isAudience && isPresenterForAudience(remote, remote.role)) {
        if (!remote.mediaStream || !hasVideoTrack) {
          this.setStatus("Professeur connecté — caméra en attente…");
        } else if (!camEnabled) {
          this.setStatus("Professeur connecté — caméra désactivée");
        } else {
          this.setStatus("Connecté · Touchez l'écran si vous n'entendez pas le professeur");
        }
      }
    }

    async createPeer(remoteId, name, initiator, role) {
      if (remoteId === this.peerId || this.peers.has(remoteId)) return;
      if (!shouldConnectToPeer(this.userRole, role)) return;

      const pc = new RTCPeerConnection(ICE);
      const remote = {
        id: remoteId,
        name,
        role: role || "",
        pc,
        tile: null,
        video: null,
        audio: null,
        mediaStream: null,
      };
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
        this.bindRemoteStream(remote, ev, role);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          optimizeVideoSender(pc);
          this.applyRemoteAudio(remoteId, remote.role);
          if (isHostRole(this.userRole)) {
            this.ensureHostVideoSent(remote).catch(() => {});
          }
          if (this.isAudience && isPresenterForAudience(remote, remote.role)) {
            [600, 2000, 4500, 8000].forEach((ms) => {
              setTimeout(() => {
                this.updateRemoteMediaStatus(remote);
                this.playRemoteMedia(remote, remote.role);
                this.refreshAudienceLayout();
              }, ms);
            });
          }
        }
        if (pc.connectionState === "failed") {
          this.setStatus("Connexion vidéo échouée — réseau mobile : réessayez ou changez de connexion");
        }
        if (pc.connectionState === "failed") {
          setTimeout(() => {
            if (pc.connectionState === "failed") {
              this.removePeer(remoteId);
            }
          }, 6000);
        } else if (pc.connectionState === "disconnected") {
          setTimeout(() => {
            if (pc.connectionState === "disconnected") {
              this.playRemoteMedia(remote, remote.role);
            }
          }, 2000);
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "failed") {
          this.setStatus("Réseau bloqué — activez Wi‑Fi ou réessayez dans quelques secondes");
        }
      };

      this.peers.set(remoteId, remote);

      if (this.isAudience && isPresenterForAudience(remote, role)) {
        this.ensureRemoteTile(remote, role);
      }

      if (initiator) {
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);
        this.send({ type: "offer", target: remoteId, sdp: pc.localDescription, role: this.userRole });
      }
    }

    createRemoteTile(id, name, role) {
      const tile = document.createElement("div");
      tile.className = "sac-webrtc__tile";
      const showAsHost =
        isHostRole(role) || (this.isAudience && String(role || "").toLowerCase() !== "etudiant");
      if (showAsHost) {
        tile.classList.add("sac-webrtc__tile--host");
      } else {
        tile.classList.add("sac-webrtc__tile--peer");
        if (this.isAudience) tile.classList.add("sac-webrtc__tile--hidden");
      }
      tile.dataset.peer = id;
      const video = document.createElement("video");
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.muted = false;
      const label = document.createElement("span");
      label.className = "sac-webrtc__label";
      const hostTag = showAsHost ? "🎓 " : "";
      label.textContent = hostTag + (name || "Participant");
      tile.appendChild(video);
      tile.appendChild(label);
      if (showAsHost) {
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

    async ensureHostVideoSent(remote) {
      if (!remote?.pc || !this.localStream || this.isAudience) return;
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (!videoTrack || !this.camOn) return;
      videoTrack.enabled = true;
      const sender = remote.pc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (!sender || !sender.track) {
        remote.pc.addTrack(videoTrack, this.localStream);
        await this.renegotiatePeer(remote);
      }
    }

    async acquireVideoTrack() {
      try {
        const stream = await requestUserMedia(false, true);
        const track = stream.getVideoTracks()[0];
        if (!track) return;
        if (!this.localStream) this.localStream = new MediaStream();
        const old = this.localStream.getVideoTracks()[0];
        if (old) {
          old.stop();
          this.localStream.removeTrack(old);
        }
        this.localStream.addTrack(track);
        track.enabled = this.camOn;
        if (!this.localVideo) this.addLocalTile();
        if (this.localVideo) {
          this.localVideo.srcObject = this.localStream;
          this.localVideo.style.opacity = this.camOn ? "1" : "0";
        }
        this.replaceTracksOnPeers(this.localStream);
        for (const remote of this.peers.values()) {
          await this.renegotiatePeer(remote);
        }
      } catch (err) {
        this.camOn = false;
        this.container.querySelector("#sacWrtcCam")?.classList.add("sac-webrtc__btn--off");
        this.setStatus(mediaErrorMessage(err));
        throw new Error(mediaErrorMessage(err));
      }
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

    async replaceAudioOnPeers() {
      const audioTrack = this.localStream?.getAudioTracks()[0];
      if (!audioTrack) return;
      for (const remote of this.peers.values()) {
        const sender = remote.pc.getSenders().find((s) => s.track && s.track.kind === "audio");
        if (sender) await sender.replaceTrack(audioTrack);
        else remote.pc.addTrack(audioTrack, this.localStream);
        await this.renegotiatePeer(remote);
      }
    }

    async toggleNoiseCancel() {
      this.noiseCancelOn = !this.noiseCancelOn;
      const btn = this.container.querySelector("#sacWrtcNoise");
      btn?.classList.toggle("sac-webrtc__btn--active", this.noiseCancelOn);
      btn?.classList.toggle("sac-webrtc__btn--off", !this.noiseCancelOn);
      if (!this.rawMicStream) return;
      const micOn = this.micOn;
      this.localStream = this.buildLocalStream(this.rawMicStream);
      this.localStream.getAudioTracks().forEach((t) => {
        t.enabled = micOn;
      });
      if (this.localVideo) this.localVideo.srcObject = this.getSendStream();
      await this.replaceAudioOnPeers();
      this.setStatus(this.noiseCancelOn ? "Anti-bruit activé" : "Anti-bruit désactivé");
    }

    toggleFullscreen() {
      const root =
        this.container.closest(".live-room-overlay, .mtg-room-overlay, .min-live-room") ||
        this.stage ||
        this.container;
      const req = root.requestFullscreen || root.webkitRequestFullscreen;
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        req?.call(root);
      } else {
        exit?.call(document);
      }
    }

    toggleMic() {
      const tracks = this.localStream?.getAudioTracks?.() || [];
      if (!tracks.length && !this.micOn) {
        requestUserMedia(true, false)
          .then(async (stream) => {
            this.rawMicStream = stream;
            this.localStream = this.buildLocalStream(stream);
            this.micOn = true;
            this.container.querySelector("#sacWrtcMic")?.classList.remove("sac-webrtc__btn--off");
            if (!this.localVideo) this.addLocalTile();
            if (this.isAudience) {
              await this.ensureAudienceSenders().catch(() => {});
            } else {
              await this.replaceAudioOnPeers().catch(() => {});
            }
            this.sendMicState();
            this.setStatus("Micro activé");
          })
          .catch((err) => {
            this.setStatus(mediaErrorMessage(err));
          });
        return;
      }
      if (!tracks.length) return;
      this.micOn = !this.micOn;
      tracks.forEach((t) => {
        t.enabled = this.micOn;
      });
      this.container.querySelector("#sacWrtcMic")?.classList.toggle("sac-webrtc__btn--off", !this.micOn);
      if (this.isAudience && this.micOn) {
        this.ensureAudienceSenders().catch(() => {});
      }
      this.sendMicState();
    }

    toggleCam() {
      this.camOn = !this.camOn;
      if (!this.localStream) this.localStream = new MediaStream();
      const videoTracks = this.localStream.getVideoTracks();
      if (videoTracks.length) {
        videoTracks.forEach((t) => {
          t.enabled = this.camOn;
        });
      } else if (this.camOn) {
        this.acquireVideoTrack().catch(() => {
          this.camOn = false;
        });
        return;
      }
      if (this.localVideo) {
        this.localVideo.style.opacity = this.camOn ? "1" : "0";
      }
      const localTile = this.grid.querySelector(".sac-webrtc__tile--local");
      if (localTile) localTile.classList.toggle("sac-webrtc__tile--cam-off", !this.camOn);
      this.container.querySelector("#sacWrtcCam").classList.toggle("sac-webrtc__btn--off", !this.camOn);
      if (this.isAudience && this.camOn) {
        this.ensureAudienceSenders().catch(() => {});
      } else if (!this.isAudience && this.camOn && videoTracks.length) {
        this.peers.forEach((remote) => this.ensureHostVideoSent(remote).catch(() => {}));
      }
    }

    async toggleScreen() {
      const btn = this.container.querySelector("#sacWrtcScreen");
      if (this.screenStream) {
        this.screenStream.getTracks().forEach((t) => t.stop());
        this.screenStream = null;
        btn.classList.remove("sac-webrtc__btn--active");
        this.replaceTracksOnPeers(this.localStream);
        for (const remote of this.peers.values()) {
          await this.renegotiatePeer(remote);
        }
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
        for (const remote of this.peers.values()) {
          await this.renegotiatePeer(remote);
        }
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
        recordingUploadPromise = this.handleRecordingBlob(blob);
      };
      this.recorder.start();
      btn.classList.add("sac-webrtc__btn--active");
      btn.textContent = "⏹";
    }

    async handleRecordingBlob(blob) {
      const sessionId = this.opts.sessionId;
      if (sessionId && typeof SAC_API !== "undefined" && SAC_API.uploadLiveRecording) {
        this.setStatus("Envoi de l'enregistrement vers SAC…");
        const fd = new FormData();
        fd.append(
          "file",
          blob,
          "sac-live-" + String(sessionId).slice(-8) + ".webm"
        );
        try {
          const data = await SAC_API.uploadLiveRecording(sessionId, fd);
          lastRecordingUrl = data.recordingUrl || data.session?.recordingUrl || null;
          if (lastRecordingUrl) {
            this.setStatus("Enregistrement enregistré sur SAC");
            if (typeof this.opts.onRecordingUploaded === "function") {
              this.opts.onRecordingUploaded(lastRecordingUrl);
            }
            return lastRecordingUrl;
          }
        } catch (err) {
          this.setStatus("Échec envoi enregistrement — téléchargement local");
        }
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "sac-live-" + (this.roomId || "session").slice(0, 24) + ".webm";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      return null;
    }

    async finalizeRecording() {
      if (this.recorder && this.recorder.state === "recording") {
        await new Promise((resolve) => {
          const prev = this.recorder.onstop;
          this.recorder.onstop = () => {
            if (typeof prev === "function") prev();
            resolve();
          };
          this.recorder.stop();
          const btn = this.container.querySelector("#sacWrtcRecord");
          if (btn) {
            btn.classList.remove("sac-webrtc__btn--active");
            btn.textContent = "⏺️";
          }
        });
      }
      if (recordingUploadPromise) {
        const url = await recordingUploadPromise;
        recordingUploadPromise = null;
        return url || lastRecordingUrl;
      }
      return lastRecordingUrl;
    }

    destroy() {
      this.destroyed = true;
      if (this.hostWatchTimer) {
        clearInterval(this.hostWatchTimer);
        this.hostWatchTimer = null;
      }
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
      if (this.audioEnhancer?.cleanup) this.audioEnhancer.cleanup();
      if (this.rawMicStream) {
        this.rawMicStream.getTracks().forEach((t) => t.stop());
      } else if (this.localStream) {
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

  async function finalizeRecording() {
    if (!active) return lastRecordingUrl;
    return active.finalizeRecording();
  }

  function getLastRecordingUrl() {
    return lastRecordingUrl;
  }

  function clearRecordingUrl() {
    lastRecordingUrl = null;
    recordingUploadPromise = null;
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
    finalizeRecording,
    getLastRecordingUrl,
    clearRecordingUrl,
    isHostRole,
  };
})();

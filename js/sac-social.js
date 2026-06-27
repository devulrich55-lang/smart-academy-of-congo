/**
 * Réseau social campus SAC — fil moderne, réactions, commentaires, messagerie
 */
const SAC_SOCIAL = (function () {
  const ROLE_LABELS = {
    etudiant: "Étudiant",
    professeur: "Professeur",
    assistant: "Assistant",
    universite: "Université",
    section: "Section",
    ministere: "Ministère",
  };

  const REACTIONS = [
    { id: "like", emoji: "👍", label: "J'aime" },
    { id: "love", emoji: "❤️", label: "J'adore" },
    { id: "celebrate", emoji: "🎉", label: "Bravo" },
    { id: "support", emoji: "💪", label: "Soutien" },
  ];

  const SUGGESTED_TAGS = ["Examens", "Informatique", "UPN", "Stages", "Bibliothèque", "Sport"];

  function esc(s) {
    const el = document.createElement("div");
    el.textContent = String(s ?? "");
    return el.innerHTML;
  }

  function roleLabel(r) {
    return ROLE_LABELS[r] || r || "Membre";
  }

  function initials(name) {
    const p = String(name || "?").trim().split(/\s+/);
    return ((p[0] || "?")[0] + (p[1] || "")[0]).toUpperCase();
  }

  function absMedia(url) {
    if (!url) return "";
    const s = String(url);
    if (/^https?:\/\//i.test(s) || s.startsWith("data:")) return s;
    if (s.startsWith("/uploads/") && typeof SAC_API !== "undefined" && SAC_API.getBase) {
      const base = String(SAC_API.getBase() || "").replace(/\/$/, "");
      return base ? base + "/api" + s : s;
    }
    return s;
  }

  function renderContent(text) {
    const safe = esc(text || "");
    return safe.replace(/#([\w\u00C0-\u024F]+)/g, '<a href="#" class="social-post__hash" data-hash="$1">#$1</a>');
  }

  function canModerate(session) {
    return session && ["universite", "section", "ministere"].includes(session.role);
  }

  function displayName(session) {
    if (typeof SAC_IDENTITY !== "undefined" && SAC_IDENTITY.getDisplayName) {
      return SAC_IDENTITY.getDisplayName(session);
    }
    return [session?.prenom, session?.nom].filter(Boolean).join(" ") || session?.email || "Membre";
  }

  async function apiCall(fn, fallback) {
    if (typeof SAC_API !== "undefined" && SAC_API[fn]) {
      const online = await SAC_API.ensureOnline();
      if (online) return SAC_API[fn](...(fallback?.args || []));
    }
    if (fallback?.local) return fallback.local();
    throw new Error("Connexion API requise.");
  }

  function needsApiTokens() {
    return typeof SAC_API.useBearerAuth === "function"
      ? SAC_API.useBearerAuth()
      : SAC_API.isCrossOriginApi && SAC_API.isCrossOriginApi();
  }

  async function listPosts(session, filters) {
    if (typeof SAC_API !== "undefined" && SAC_API.listSocialPosts) {
      if (typeof SAC_API.ensureApiSession === "function") {
        await SAC_API.ensureApiSession({ soft: true });
      }
      if (needsApiTokens() && SAC_API.hasAuthTokens && !SAC_API.hasAuthTokens()) {
        throw new Error("Session expirée — déconnectez-vous puis reconnectez-vous.");
      }
      const online = await SAC_API.ensureOnline();
      if (!online) {
        throw new Error("Connexion au serveur impossible — l'API ne répond pas. Réessayez dans 1 minute.");
      }
      return SAC_API.listSocialPosts(filters);
    }
    if (typeof SAC_PLATFORM !== "undefined" && SAC_PLATFORM.getSocialPosts) {
      return SAC_PLATFORM.getSocialPosts();
    }
    return [];
  }

  async function createPost(session, payload) {
    if (typeof SAC_API !== "undefined" && SAC_API.createSocialPost) {
      if (typeof SAC_API.ensureApiSession === "function") {
        await SAC_API.ensureApiSession({ soft: true });
      }
      if (needsApiTokens() && SAC_API.hasAuthTokens && !SAC_API.hasAuthTokens()) {
        throw new Error("Session expirée — déconnectez-vous puis reconnectez-vous.");
      }
      const online = await SAC_API.ensureOnline(true);
      if (!online) {
        throw new Error(
          "Serveur en cours de démarrage (Render). Attendez 1 minute puis réessayez."
        );
      }
      return SAC_API.createSocialPost(payload);
    }
    if (typeof SAC_PLATFORM !== "undefined" && SAC_PLATFORM.addSocialLocal) {
      return SAC_PLATFORM.addSocialLocal(payload.content, payload.audience);
    }
    throw new Error("Publication en ligne requise.");
  }

  function postCard(p, session, state) {
    const email = (session.email || session.identifiant || "").toLowerCase();
    const isAuthor = (p.authorEmail || "").toLowerCase() === email;
    const mod = canModerate(session);
    const aud =
      p.audience === "promotion"
        ? '<span class="social-tag social-tag--promo">Promotion' +
          (p.filiere ? " · " + esc(p.filiere) : "") +
          (p.niveau ? " " + esc(p.niveau) : "") +
          "</span>"
        : p.audience === "filiere"
          ? '<span class="social-tag social-tag--filiere">Filière' +
            (p.filiere ? " · " + esc(p.filiere) : "") +
            "</span>"
          : '<span class="social-tag">Campus</span>';

    const reactions = REACTIONS.map((r) => {
      const count = (p.reactions && p.reactions[r.id]) ? p.reactions[r.id].length : 0;
      const active = (p.myReactions || []).includes(r.id) ? " social-react--active" : "";
      return (
        '<button type="button" class="social-react' +
        active +
        '" data-react="' +
        esc(p.id) +
        '" data-kind="' +
        r.id +
        '" title="' +
        r.label +
        '">' +
        r.emoji +
        (count ? " " + count : "") +
        "</button>"
      );
    }).join("");

    let media = "";
    if (p.mediaUrl && p.postType === "photo") {
      media =
        '<div class="social-post__media"><img src="' +
        esc(absMedia(p.mediaUrl)) +
        '" alt="' +
        esc(p.mediaName || "Photo") +
        '" loading="lazy" /></div>';
    } else if (p.mediaUrl && p.postType === "document") {
      media =
        '<a class="social-post__doc" href="' +
        esc(absMedia(p.mediaUrl)) +
        '" target="_blank" rel="noopener">📄 ' +
        esc(p.mediaName || "Document") +
        "</a>";
    }

    let event = "";
    if (p.eventAt || p.postType === "event") {
      event =
        '<div class="social-post__event">🎉 <strong>' +
        esc(p.eventTitle || "Événement") +
        "</strong>" +
        (p.eventAt
          ? " · " + new Date(p.eventAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })
          : "") +
        "</div>";
    }

    const tags = (p.hashtags || [])
      .map((t) => '<a href="#" class="social-post__hash" data-hash="' + esc(t) + '">#' + esc(t) + "</a>")
      .join(" ");

    const modBtns = [];
    if (mod && !p.pinned) {
      modBtns.push(
        '<button type="button" class="btn btn--ghost btn--xs" data-pin-post="' + esc(p.id) + '">📌 Épingler</button>'
      );
    }
    if (mod && p.pinned) {
      modBtns.push(
        '<button type="button" class="btn btn--ghost btn--xs" data-unpin-post="' + esc(p.id) + '">Retirer épinglage</button>'
      );
    }
    if (isAuthor || mod) {
      modBtns.push(
        '<button type="button" class="btn btn--ghost btn--xs" data-del-post="' + esc(p.id) + '">Supprimer</button>'
      );
    }
    if (mod && !p.hidden) {
      modBtns.push(
        '<button type="button" class="btn btn--ghost btn--xs" data-hide-post="' + esc(p.id) + '">Masquer</button>'
      );
    }

    const openComments = state.openComments === p.id;
    const commentsHtml = openComments
      ? '<div class="social-comments" id="comments-' +
        esc(p.id) +
        '"><div class="social-comments__list">Chargement…</div>' +
        '<form class="social-comment__form" data-comment-form="' +
        esc(p.id) +
        '"><input type="text" placeholder="Écrire un commentaire…" maxlength="1000" required /><button type="submit" class="btn btn--role btn--xs">Envoyer</button></form></div>'
      : "";

    return (
      '<article class="social-post' +
      (p.pinned ? " social-post--pinned" : "") +
      (p.hidden ? " social-post--hidden" : "") +
      '" data-post="' +
      esc(p.id) +
      '">' +
      (p.pinned ? '<div class="social-post__pin">📌 Publication épinglée — Administration</div>' : "") +
      '<header class="social-post__head">' +
      '<span class="social-post__avatar">' +
      esc(initials(p.authorName)) +
      "</span>" +
      "<div><strong>" +
      esc(p.authorName || p.authorEmail) +
      "</strong><br/><span style='font-size:0.78rem;color:var(--muted);'>" +
      esc(roleLabel(p.authorRole)) +
      " · " +
      aud +
      "</span></div>" +
      '<time style="margin-left:auto;font-size:0.76rem;color:var(--muted);">' +
      new Date(p.createdAt).toLocaleString("fr-FR") +
      "</time></header>" +
      '<div class="social-post__body">' +
      renderContent(p.content) +
      (tags ? '<div style="margin-top:0.35rem;">' + tags + "</div>" : "") +
      "</div>" +
      media +
      event +
      '<div class="social-post__reactions">' +
      reactions +
      "</div>" +
      '<div class="social-post__meta-actions">' +
      '<button type="button" class="btn btn--ghost btn--xs" data-toggle-comments="' +
      esc(p.id) +
      '">💬 ' +
      (p.commentCount || 0) +
      " commentaire(s)</button>" +
      modBtns.join("") +
      "</div>" +
      commentsHtml +
      "</article>"
    );
  }

  function relTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return "À l'instant";
    if (diff < 3600000) return Math.floor(diff / 60000) + " min";
    if (diff < 86400000) return Math.floor(diff / 3600000) + " h";
    if (diff < 604800000) return Math.floor(diff / 86400000) + " j";
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  }

  function mountFeedUI(root, session, options) {
    if (!root || !session) return;

    const state = {
      view: "feed",
      filters: { q: "", group: "", hashtag: "", feed: "all" },
      openComments: null,
      settings: {
        canPost: ["etudiant", "professeur", "assistant"].includes(session.role),
        canMessage: session.role === "etudiant",
        privateDmEnabled: true,
        canModerate: canModerate(session),
      },
      pendingMedia: null,
      pendingKind: null,
      msgPeer: null,
      msgPeerName: "",
    };

    const showMessagesNav = session.role === "etudiant";

    if (typeof SAC_API !== "undefined" && SAC_API.wakeServer) {
      SAC_API.wakeServer({ attempts: 4, timeoutMs: 45000, delayMs: 4000 }).catch(() => {});
    }

    root.innerHTML =
      '<div class="social-hub">' +
      '<header class="social-hub__nav">' +
      '<div class="social-hub__nav-brand"><span class="social-hub__nav-logo">💬</span><div><strong>Réseau campus</strong><small>Fil · Messages · Alertes</small></div></div>' +
      '<nav class="social-hub__nav-tabs" aria-label="Sections">' +
      '<button type="button" class="social-hub__nav-tab social-hub__nav-tab--active" data-view="feed">📰 Fil</button>' +
      (showMessagesNav
        ? '<button type="button" class="social-hub__nav-tab" data-view="messages">💬 Messages<span class="social-hub__nav-badge" id="navMsgBadge" hidden>0</span></button>'
        : "") +
      '<button type="button" class="social-hub__nav-tab" data-view="notif">🔔 Alertes<span class="social-hub__nav-badge" id="navNotifBadge" hidden>0</span></button>' +
      "</nav></header>" +
      '<section class="social-view" id="socialViewFeed">' +
      '<div class="social-hub__toolbar">' +
      '<input type="search" class="social-hub__search" id="socialSearch" placeholder="Rechercher dans le fil…" />' +
      '<div class="social-hub__feed-tabs">' +
      '<button type="button" class="social-hub__feed-tab social-hub__feed-tab--active" data-feed="all">Tout</button>' +
      '<button type="button" class="social-hub__feed-tab" data-feed="personal">Pour vous</button>' +
      "</div></div>" +
      '<div class="social-hub__grid social-hub__grid--feed">' +
      '<aside class="social-hub__side">' +
      '<div class="social-hub__card"><h4>Groupes</h4>' +
      '<button type="button" class="social-hub__group-btn social-hub__group-btn--active" data-group="">🌐 Campus</button>' +
      '<button type="button" class="social-hub__group-btn" data-group="filiere">🎓 Ma filière</button>' +
      '<button type="button" class="social-hub__group-btn" data-group="promotion">👥 Ma promotion</button></div>' +
      '<div class="social-hub__card" id="socialTagsCard"><h4>Hashtags</h4><p class="social-hub__muted">Chargement…</p></div>' +
      '<div class="social-hub__card" id="socialEventsCard"><h4>Événements</h4><p class="social-hub__muted">Chargement…</p></div>' +
      (state.settings.canModerate
        ? '<div class="social-hub__card social-hub__card--admin"><h4>Administration</h4>' +
          '<label class="social-hub__toggle"><input type="checkbox" id="socialDmToggle" checked /><span>Messages privés étudiants</span></label></div>'
        : "") +
      "</aside>" +
      '<main class="social-hub__main">' +
      (state.settings.canPost || state.settings.canModerate
        ? '<div class="social-composer" id="socialComposer">' +
          '<button type="button" class="social-composer__trigger" id="socialComposerOpen">' +
          '<span class="social-composer__avatar">' +
          esc(initials(displayName(session))) +
          '</span><span>Quoi de neuf sur le campus ?</span></button>' +
          '<div class="social-composer__form">' +
          '<textarea class="social-composer__textarea" id="socialContent" rows="3" maxlength="2000" placeholder="Écrivez votre publication… #Examens #Informatique"></textarea>' +
          '<div class="social-composer__chips" id="socialTagChips">' +
          SUGGESTED_TAGS.map((t) => '<button type="button" class="social-composer__chip" data-add-tag="' + t + '">#' + t + "</button>").join("") +
          "</div>" +
          '<div class="social-composer__tools">' +
          '<label class="social-composer__tool">📷 Photo<input type="file" id="socialPhotoInput" accept="image/*" hidden /></label>' +
          '<label class="social-composer__tool">📄 Document<input type="file" id="socialDocInput" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt" hidden /></label>' +
          '<label class="social-composer__tool"><input type="checkbox" id="socialIsEvent" /> Événement</label>' +
          '<select class="fi" id="socialAudience"><option value="filiere">Ma filière</option><option value="campus">Tout le campus</option><option value="promotion">Ma promotion</option></select>' +
          (state.settings.canModerate ? '<label class="social-composer__tool"><input type="checkbox" id="socialPinned" /> Épingler</label>' : "") +
          "</div>" +
          '<div id="socialEventFields" class="social-composer__tools" style="display:none;">' +
          '<input class="fi" id="socialEventTitle" placeholder="Titre événement" />' +
          '<input class="fi" id="socialEventAt" type="datetime-local" /></div>' +
          '<div class="social-composer__preview" id="socialMediaPreview" hidden></div>' +
          '<div class="social-composer__actions">' +
          '<button type="button" class="btn btn--ghost" id="socialComposerCancel">Annuler</button>' +
          '<button type="button" class="btn btn--role" id="socialPublishBtn">Publier</button></div></div></div>'
        : "") +
      '<div id="socialFeedList"><p class="social-hub__muted">Chargement du fil…</p></div></main></div></section>' +
      (showMessagesNav
        ? '<section class="social-view" id="socialViewMessages" hidden>' +
          '<div class="messenger" id="messengerRoot">' +
          '<aside class="messenger__inbox">' +
          '<div class="messenger__inbox-head"><h3>Messages</h3>' +
          '<button type="button" class="messenger__new-btn" id="messengerNewBtn" title="Nouveau message">✏️</button></div>' +
          '<div class="messenger__search-wrap">' +
          '<input type="search" class="messenger__search" id="messengerSearch" placeholder="Rechercher une conversation…" /></div>' +
          '<div class="messenger__convos" id="messengerConvos"><p class="social-hub__muted">Chargement…</p></div>' +
          '<div class="messenger__new-peer" id="messengerNewPeer" hidden>' +
          '<input class="fi" id="messengerPeerEmail" placeholder="E-mail de l\'étudiant" />' +
          '<button type="button" class="btn btn--role btn--xs" id="messengerPeerStart">Démarrer</button></div>' +
          "</aside>" +
          '<div class="messenger__chat" id="messengerChat">' +
          '<div class="messenger__empty" id="messengerEmpty">' +
          '<div class="messenger__empty-icon">💬</div>' +
          "<h3>Vos messages</h3>" +
          "<p>Sélectionnez une conversation à gauche ou démarrez un nouveau message avec un camarade de campus.</p></div>" +
          '<div class="messenger__active" id="messengerActive" hidden>' +
          '<header class="messenger__chat-head">' +
          '<button type="button" class="messenger__back" id="messengerBack" aria-label="Retour">←</button>' +
          '<span class="messenger__avatar" id="messengerChatAvatar">?</span>' +
          '<div class="messenger__chat-meta"><strong id="messengerChatName">—</strong><small id="messengerChatSub">Étudiant</small></div></header>' +
          '<div class="messenger__thread" id="messengerThread"></div>' +
          '<form class="messenger__composer" id="messengerForm">' +
          '<input type="text" id="messengerInput" placeholder="Aa" maxlength="2000" autocomplete="off" />' +
          '<button type="submit" class="messenger__send" aria-label="Envoyer">➤</button></form></div></div></div></section>'
        : "") +
      '<section class="social-view" id="socialViewNotif" hidden>' +
      '<div class="notif-center">' +
      '<h3 class="notif-center__title">Notifications</h3>' +
      '<p class="social-hub__muted notif-center__sub">Réactions, commentaires et activité sur vos publications.</p>' +
      '<div id="notifCenterList"><p class="social-hub__muted">Chargement…</p></div></div></section></div>';

    const composer = root.querySelector("#socialComposer");
    const feedEl = root.querySelector("#socialFeedList");
    const audienceSel = root.querySelector("#socialAudience");
    if (audienceSel && session.filiere) {
      audienceSel.value = "filiere";
    } else if (audienceSel) {
      audienceSel.value = "campus";
    }

    root.querySelector("#socialComposerOpen")?.addEventListener("click", () => {
      composer?.classList.add("social-composer--open");
    });
    root.querySelector("#socialComposerCancel")?.addEventListener("click", () => {
      composer?.classList.remove("social-composer--open");
      resetComposer();
    });

    root.querySelector("#socialIsEvent")?.addEventListener("change", (e) => {
      const box = root.querySelector("#socialEventFields");
      if (box) box.style.display = e.target.checked ? "flex" : "none";
    });

    root.querySelectorAll("[data-add-tag]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ta = root.querySelector("#socialContent");
        if (!ta) return;
        const tag = "#" + btn.dataset.addTag + " ";
        ta.value = (ta.value + " " + tag).trim() + " ";
        ta.focus();
      });
    });

    async function uploadFile(file, kind) {
      if (typeof SAC_API !== "undefined" && SAC_API.uploadSocialMedia) {
        return SAC_API.uploadSocialMedia(file, kind);
      }
      throw new Error("Upload API indisponible.");
    }

    function resetComposer() {
      state.pendingMedia = null;
      state.pendingKind = null;
      const prev = root.querySelector("#socialMediaPreview");
      if (prev) {
        prev.hidden = true;
        prev.textContent = "";
      }
      root.querySelector("#socialContent").value = "";
      root.querySelector("#socialPhotoInput").value = "";
      root.querySelector("#socialDocInput").value = "";
    }

    async function handleFileInput(file, kind) {
      if (!file) return;
      const prev = root.querySelector("#socialMediaPreview");
      try {
        prev.hidden = false;
        prev.textContent = "Envoi en cours…";
        const data = await uploadFile(file, kind);
        state.pendingMedia = data;
        state.pendingKind = kind;
        prev.textContent = (kind === "photo" ? "📷 " : "📄 ") + (data.mediaName || file.name);
      } catch (err) {
        prev.textContent = err.message || "Échec upload";
      }
    }

    root.querySelector("#socialPhotoInput")?.addEventListener("change", (e) => {
      handleFileInput(e.target.files[0], "photo");
    });
    root.querySelector("#socialDocInput")?.addEventListener("change", (e) => {
      handleFileInput(e.target.files[0], "document");
    });

    root.querySelector("#socialPublishBtn")?.addEventListener("click", async () => {
      const content = root.querySelector("#socialContent")?.value.trim() || "";
      const audience = root.querySelector("#socialAudience")?.value || "campus";
      const isEvent = root.querySelector("#socialIsEvent")?.checked;
      const pinned = root.querySelector("#socialPinned")?.checked;
      const publishBtn = root.querySelector("#socialPublishBtn");
      let postType = "text";
      if (isEvent) postType = "event";
      else if (state.pendingKind === "photo") postType = "photo";
      else if (state.pendingKind === "document") postType = "document";
      const payload = {
        content,
        audience,
        postType,
        pinned: !!pinned,
        mediaUrl: state.pendingMedia?.mediaUrl || "",
        mediaName: state.pendingMedia?.mediaName || "",
      };
      if (isEvent) {
        payload.eventTitle = root.querySelector("#socialEventTitle")?.value.trim() || "";
        const raw = root.querySelector("#socialEventAt")?.value;
        payload.eventAt = raw ? new Date(raw).toISOString() : "";
      }
      try {
        if (publishBtn) {
          publishBtn.disabled = true;
          publishBtn.textContent = "Connexion au serveur…";
        }
        await createPost(session, payload);
        composer?.classList.remove("social-composer--open");
        resetComposer();
        await paintFeed();
        await paintSidebar();
      } catch (err) {
        alert(err.message || "Publication impossible.");
      } finally {
        if (publishBtn) {
          publishBtn.disabled = false;
          publishBtn.textContent = "Publier";
        }
      }
    });

    let searchTimer;
    root.querySelector("#socialSearch")?.addEventListener("input", (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.filters.q = e.target.value.trim();
        paintFeed();
      }, 350);
    });

    root.querySelectorAll("[data-feed]").forEach((btn) => {
      btn.addEventListener("click", () => {
        root.querySelectorAll("[data-feed]").forEach((b) => b.classList.remove("social-hub__feed-tab--active"));
        btn.classList.add("social-hub__feed-tab--active");
        state.filters.feed = btn.dataset.feed;
        paintFeed();
      });
    });

    root.querySelectorAll("[data-group]").forEach((btn) => {
      btn.addEventListener("click", () => {
        root.querySelectorAll("[data-group]").forEach((b) => b.classList.remove("social-hub__group-btn--active"));
        btn.classList.add("social-hub__group-btn--active");
        state.filters.group = btn.dataset.group;
        paintFeed();
      });
    });

    function switchView(view) {
      state.view = view;
      root.querySelectorAll("[data-view]").forEach((b) => {
        b.classList.toggle("social-hub__nav-tab--active", b.dataset.view === view);
      });
      root.querySelector("#socialViewFeed").hidden = view !== "feed";
      const msgView = root.querySelector("#socialViewMessages");
      if (msgView) msgView.hidden = view !== "messages";
      root.querySelector("#socialViewNotif").hidden = view !== "notif";
      if (view === "messages") paintMessenger();
      if (view === "notif") paintNotifications();
      if (view === "feed") paintFeed();
    }

    root.querySelectorAll("[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => switchView(btn.dataset.view));
    });

    root.querySelector("#socialDmToggle")?.addEventListener("change", async (e) => {
      if (typeof SAC_API === "undefined" || !SAC_API.updateSocialSettings) return;
      try {
        await SAC_API.updateSocialSettings({ privateDmEnabled: e.target.checked });
        state.settings.privateDmEnabled = e.target.checked;
      } catch (err) {
        alert(err.message);
        e.target.checked = !e.target.checked;
      }
    });

    async function loadComments(postId) {
      const box = root.querySelector("#comments-" + postId + " .social-comments__list");
      if (!box) return;
      try {
        if (typeof SAC_API !== "undefined" && SAC_API.ensureOnline) {
          const online = await SAC_API.ensureOnline();
          if (!online) throw new Error("Connexion API requise pour les commentaires.");
        }
        const comments =
          typeof SAC_API !== "undefined" && SAC_API.listSocialComments
            ? await SAC_API.listSocialComments(postId)
            : [];
        if (!comments.length) {
          box.innerHTML = "<p style='margin:0;font-size:0.82rem;color:var(--muted);'>Aucun commentaire.</p>";
          return;
        }
        box.innerHTML = comments
          .map(
            (c) =>
              '<div class="social-comment social-comment--bubble"><span class="social-comment__avatar">' +
              esc(initials(c.authorName)) +
              '</span><div class="social-comment__bubble"><strong>' +
              esc(c.authorName) +
              "</strong><p>" +
              esc(c.content) +
              '</p><time>' +
              relTime(c.createdAt) +
              "</time></div></div>"
          )
          .join("");
      } catch (err) {
        box.innerHTML =
          "<p style='color:#b91c1c;'>" +
          esc(err.message || "Commentaires indisponibles.") +
          "</p>";
      }
    }

    function bindFeedEvents() {
      feedEl.querySelectorAll("[data-react]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          try {
            if (typeof SAC_API !== "undefined" && SAC_API.ensureOnline) {
              const online = await SAC_API.ensureOnline();
              if (!online) throw new Error("Connexion API requise pour réagir.");
            }
            if (typeof SAC_API !== "undefined" && SAC_API.toggleSocialReaction) {
              await SAC_API.toggleSocialReaction(btn.dataset.react, btn.dataset.kind);
            }
            await paintFeed();
          } catch (err) {
            alert(err.message || "Réaction impossible.");
          }
        });
      });
      feedEl.querySelectorAll("[data-toggle-comments]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          state.openComments = state.openComments === btn.dataset.toggleComments ? null : btn.dataset.toggleComments;
          await paintFeed();
          if (state.openComments) await loadComments(state.openComments);
        });
      });
      feedEl.querySelectorAll("[data-comment-form]").forEach((form) => {
        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          const input = form.querySelector("input");
          const text = input?.value.trim();
          if (!text) return;
          try {
            if (typeof SAC_API !== "undefined" && SAC_API.ensureOnline) {
              const online = await SAC_API.ensureOnline();
              if (!online) throw new Error("Connexion API requise pour commenter.");
            }
            if (typeof SAC_API !== "undefined" && SAC_API.addSocialComment) {
              await SAC_API.addSocialComment(form.dataset.commentForm, text);
              input.value = "";
              await loadComments(form.dataset.commentForm);
              await paintFeed();
            } else {
              throw new Error("Commentaires indisponibles hors ligne.");
            }
          } catch (err) {
            alert(err.message || "Impossible d'envoyer le commentaire.");
          }
        });
      });
      feedEl.querySelectorAll("[data-hash]").forEach((a) => {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          state.filters.hashtag = a.dataset.hash;
          const search = root.querySelector("#socialSearch");
          if (search) search.value = "#" + a.dataset.hash;
          paintFeed();
        });
      });
      feedEl.querySelectorAll("[data-del-post]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!confirm("Supprimer cette publication ?")) return;
          try {
            if (typeof SAC_API !== "undefined" && SAC_API.deleteSocialPost) {
              await SAC_API.deleteSocialPost(btn.dataset.delPost);
              await paintFeed();
            }
          } catch (err) {
            alert(err.message);
          }
        });
      });
      feedEl.querySelectorAll("[data-hide-post]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!confirm("Masquer cette publication ?")) return;
          try {
            if (typeof SAC_API !== "undefined" && SAC_API.moderateSocialPost) {
              await SAC_API.moderateSocialPost(btn.dataset.hidePost, { hidden: true });
              await paintFeed();
            }
          } catch (err) {
            alert(err.message);
          }
        });
      });
      feedEl.querySelectorAll("[data-pin-post]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          try {
            if (typeof SAC_API !== "undefined" && SAC_API.moderateSocialPost) {
              await SAC_API.moderateSocialPost(btn.dataset.pinPost, { pinned: true });
              await paintFeed();
            }
          } catch (err) {
            alert(err.message);
          }
        });
      });
      feedEl.querySelectorAll("[data-unpin-post]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          try {
            if (typeof SAC_API !== "undefined" && SAC_API.moderateSocialPost) {
              await SAC_API.moderateSocialPost(btn.dataset.unpinPost, { pinned: false });
              await paintFeed();
            }
          } catch (err) {
            alert(err.message);
          }
        });
      });
    }

    async function paintFeed() {
      try {
        const posts = await listPosts(session, state.filters);
        if (!posts.length) {
          feedEl.innerHTML =
            "<p style='margin:0;color:var(--muted);'>Aucune publication. Créez la première ou modifiez vos filtres.</p>";
          return;
        }
        feedEl.innerHTML = posts.map((p) => postCard(p, session, state)).join("");
        bindFeedEvents();
        if (state.openComments) await loadComments(state.openComments);
      } catch (err) {
        feedEl.innerHTML = "<p style='color:#b91c1c;'>" + esc(err.message) + "</p>";
      }
    }

    async function paintSidebar() {
      const tagsCard = root.querySelector("#socialTagsCard");
      const eventsCard = root.querySelector("#socialEventsCard");
      try {
        if (typeof SAC_API !== "undefined" && SAC_API.listSocialHashtags) {
          const tags = await SAC_API.listSocialHashtags();
          if (tags.length) {
            tagsCard.innerHTML =
              "<h4>#️⃣ Hashtags</h4>" +
              tags
                .map(
                  (t) =>
                    '<button type="button" class="social-hub__tag-btn" data-side-tag="' +
                    esc(t.tag) +
                    '">#' +
                    esc(t.tag) +
                    " <span style='color:var(--muted);'>(" +
                    t.count +
                    ")</span></button>"
                )
                .join("");
            tagsCard.querySelectorAll("[data-side-tag]").forEach((btn) => {
              btn.addEventListener("click", () => {
                state.filters.hashtag = btn.dataset.sideTag;
                root.querySelector("#socialSearch").value = "#" + btn.dataset.sideTag;
                paintFeed();
              });
            });
          }
        }
      } catch {
        /* ignore */
      }
      try {
        if (typeof SAC_API !== "undefined" && SAC_API.listSocialEvents) {
          const events = await SAC_API.listSocialEvents();
          if (!events.length) {
            eventsCard.innerHTML = "<h4>🎉 Événements</h4><p style='margin:0;font-size:0.8rem;color:var(--muted);'>Aucun événement à venir.</p>";
          } else {
            eventsCard.innerHTML =
              "<h4>🎉 Événements à venir</h4>" +
              events
                .slice(0, 6)
                .map(
                  (ev) =>
                    '<div class="social-hub__event-item"><strong>' +
                    esc(ev.eventTitle || ev.content?.slice(0, 40)) +
                    "</strong><br/><span style='color:var(--muted);'>" +
                    (ev.eventAt ? new Date(ev.eventAt).toLocaleString("fr-FR") : "") +
                    "</span></div>"
                )
                .join("");
          }
        }
      } catch {
        /* ignore */
      }
    }

    async function updateBadges() {
      try {
        if (typeof SAC_API !== "undefined" && SAC_API.listSocialNotifications) {
          const notifs = await SAC_API.listSocialNotifications();
          const unreadN = notifs.filter((n) => !n.read).length;
          const nb = root.querySelector("#navNotifBadge");
          if (nb) {
            nb.hidden = !unreadN;
            nb.textContent = String(unreadN);
          }
        }
        if (session.role === "etudiant" && typeof SAC_API !== "undefined" && SAC_API.listSocialConversations) {
          const convos = await SAC_API.listSocialConversations();
          const unreadM = convos.reduce((s, c) => s + (c.unread || 0), 0);
          const mb = root.querySelector("#navMsgBadge");
          if (mb) {
            mb.hidden = !unreadM;
            mb.textContent = String(unreadM);
          }
        }
      } catch {
        /* ignore */
      }
    }

    function openChat(peerEmail, peerName) {
      state.msgPeer = peerEmail;
      state.msgPeerName = peerName || peerEmail;
      paintMessenger();
    }

    async function paintMessenger() {
      if (session.role !== "etudiant") return;
      const convosEl = root.querySelector("#messengerConvos");
      const emptyEl = root.querySelector("#messengerEmpty");
      const activeEl = root.querySelector("#messengerActive");
      if (!convosEl) return;

      if (!state.settings.privateDmEnabled) {
        convosEl.innerHTML =
          '<p class="social-hub__dm-disabled">Les messages privés sont désactivés par l\'administration du campus.</p>';
        if (emptyEl) emptyEl.hidden = false;
        if (activeEl) activeEl.hidden = true;
        return;
      }

      try {
        const convos =
          typeof SAC_API !== "undefined" && SAC_API.listSocialConversations
            ? await SAC_API.listSocialConversations()
            : [];
        const q = (root.querySelector("#messengerSearch")?.value || "").trim().toLowerCase();
        const filtered = q
          ? convos.filter(
              (c) =>
                (c.peerName || "").toLowerCase().includes(q) ||
                (c.peerEmail || "").toLowerCase().includes(q) ||
                (c.lastMessage || "").toLowerCase().includes(q)
            )
          : convos;

        if (!filtered.length) {
          convosEl.innerHTML =
            '<p class="social-hub__muted">Aucune conversation. Utilisez ✏️ pour écrire à un camarade.</p>';
        } else {
          convosEl.innerHTML = filtered
            .map(
              (c) =>
                '<button type="button" class="messenger__convo' +
                (state.msgPeer === c.peerEmail ? " messenger__convo--active" : "") +
                (c.unread ? " messenger__convo--unread" : "") +
                '" data-peer="' +
                esc(c.peerEmail) +
                '" data-name="' +
                esc(c.peerName) +
                '">' +
                '<span class="messenger__avatar">' +
                esc(initials(c.peerName)) +
                "</span>" +
                '<span class="messenger__convo-body">' +
                '<span class="messenger__convo-top"><strong>' +
                esc(c.peerName) +
                "</strong><time>" +
                relTime(c.lastAt) +
                "</time></span>" +
                '<span class="messenger__convo-preview">' +
                esc((c.lastMessage || "").slice(0, 72)) +
                "</span></span>" +
                (c.unread ? '<span class="messenger__unread-dot" aria-hidden="true"></span>' : "") +
                "</button>"
            )
            .join("");
          convosEl.querySelectorAll("[data-peer]").forEach((btn) => {
            btn.addEventListener("click", () => openChat(btn.dataset.peer, btn.dataset.name));
          });
        }
        await updateBadges();
      } catch (err) {
        convosEl.innerHTML = "<p style='color:#b91c1c;'>" + esc(err.message) + "</p>";
      }

      const hasPeer = !!state.msgPeer;
      if (emptyEl) emptyEl.hidden = hasPeer;
      if (activeEl) activeEl.hidden = !hasPeer;
      root.querySelector(".messenger")?.classList.toggle("messenger--chat-open", hasPeer);

      if (!hasPeer) return;

      root.querySelector("#messengerChatName").textContent = state.msgPeerName;
      root.querySelector("#messengerChatSub").textContent = state.msgPeer;
      root.querySelector("#messengerChatAvatar").textContent = initials(state.msgPeerName);

      const thread = root.querySelector("#messengerThread");
      try {
        const messages =
          typeof SAC_API !== "undefined" && SAC_API.listSocialMessages
            ? await SAC_API.listSocialMessages(state.msgPeer)
            : [];
        if (!messages.length) {
          thread.innerHTML =
            '<p class="messenger__thread-hint">Début de la conversation — dites bonjour 👋</p>';
        } else {
          thread.innerHTML = messages
            .map(
              (m) =>
                '<div class="messenger__row' +
                (m.mine ? " messenger__row--mine" : "") +
                '"><div class="messenger__bubble' +
                (m.mine ? " messenger__bubble--mine" : " messenger__bubble--peer") +
                '">' +
                esc(m.body) +
                '<time>' +
                relTime(m.createdAt) +
                "</time></div></div>"
            )
            .join("");
        }
        thread.scrollTop = thread.scrollHeight;
      } catch (err) {
        thread.innerHTML = "<p style='color:#b91c1c;'>" + esc(err.message) + "</p>";
      }
    }

    root.querySelector("#messengerNewBtn")?.addEventListener("click", () => {
      const box = root.querySelector("#messengerNewPeer");
      if (box) box.hidden = !box.hidden;
    });
    root.querySelector("#messengerPeerStart")?.addEventListener("click", () => {
      const em = root.querySelector("#messengerPeerEmail")?.value.trim().toLowerCase();
      if (em) {
        openChat(em, em);
        root.querySelector("#messengerNewPeer").hidden = true;
      }
    });
    root.querySelector("#messengerSearch")?.addEventListener("input", () => paintMessenger());
    root.querySelector("#messengerBack")?.addEventListener("click", () => {
      state.msgPeer = null;
      paintMessenger();
    });
    root.querySelector("#messengerForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = root.querySelector("#messengerInput");
      const text = input?.value.trim();
      if (!text || !state.msgPeer) return;
      try {
        await SAC_API.sendSocialMessage(state.msgPeer, text);
        input.value = "";
        await paintMessenger();
      } catch (err) {
        alert(err.message || "Envoi impossible.");
      }
    });

    async function paintNotifications() {
      const body = root.querySelector("#notifCenterList");
      if (!body) return;
      try {
        const notifs =
          typeof SAC_API !== "undefined" && SAC_API.listSocialNotifications
            ? await SAC_API.listSocialNotifications()
            : [];
        await updateBadges();
        if (!notifs.length) {
          body.innerHTML =
            '<div class="notif-center__empty"><span>🔔</span><p>Aucune alerte pour le moment.</p></div>';
          return;
        }
        body.innerHTML = notifs
          .map(
            (n) =>
              '<button type="button" class="notif-center__item' +
              (n.read ? "" : " notif-center__item--unread") +
              '" data-notif="' +
              esc(n.id) +
              '" data-post="' +
              esc(n.postId || "") +
              '" data-type="' +
              esc(n.type || "") +
              '">' +
              '<span class="notif-center__icon">' +
              (n.type === "message" ? "💬" : n.type === "comment" ? "💭" : "❤️") +
              "</span>" +
              '<span class="notif-center__body"><strong>' +
              esc(n.title) +
              "</strong><span>" +
              esc(n.message) +
              '</span><time>' +
              relTime(n.createdAt) +
              "</time></span></button>"
          )
          .join("");
        body.querySelectorAll("[data-notif]").forEach((el) => {
          el.addEventListener("click", async () => {
            if (typeof SAC_API !== "undefined" && SAC_API.markSocialNotificationRead) {
              await SAC_API.markSocialNotificationRead(el.dataset.notif);
            }
            if (el.dataset.post) {
              state.openComments = el.dataset.post;
              switchView("feed");
              await paintFeed();
            } else if (el.dataset.type === "message") {
              switchView("messages");
            } else {
              await paintNotifications();
            }
          });
        });
      } catch {
        body.innerHTML = "<p class='social-hub__muted'>Alertes indisponibles hors ligne.</p>";
      }
    }

    async function init() {
      try {
        if (typeof SAC_API !== "undefined") {
          if (SAC_API.ensureApiSession) {
            await SAC_API.ensureApiSession({ soft: true });
          }
          const online = await SAC_API.ensureOnline();
          if (online && SAC_API.getSocialSettings) {
            state.settings = { ...state.settings, ...(await SAC_API.getSocialSettings()) };
            const dmToggle = root.querySelector("#socialDmToggle");
            if (dmToggle) dmToggle.checked = state.settings.privateDmEnabled !== false;
          }
        }
      } catch {
        /* ignore */
      }
      await paintFeed();
      await paintSidebar();
      await updateBadges();
    }

    init();
  }

  return { mountFeedUI, listPosts, createPost };
})();

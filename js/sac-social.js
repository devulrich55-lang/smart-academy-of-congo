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

  async function listPosts(session, filters) {
    if (typeof SAC_API !== "undefined" && SAC_API.listSocialPosts) {
      const online = await SAC_API.ensureOnline();
      if (online) return SAC_API.listSocialPosts(filters);
    }
    if (typeof SAC_PLATFORM !== "undefined" && SAC_PLATFORM.getSocialPosts) {
      return SAC_PLATFORM.getSocialPosts();
    }
    return [];
  }

  async function createPost(session, payload) {
    if (typeof SAC_API !== "undefined" && SAC_API.createSocialPost) {
      const online = await SAC_API.ensureOnline();
      if (online) return SAC_API.createSocialPost(payload);
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

  function mountFeedUI(root, session, options) {
    if (!root || !session) return;

    const state = {
      filters: { q: "", group: "", hashtag: "", feed: "all" },
      openComments: null,
      settings: { canPost: ["etudiant", "professeur", "assistant"].includes(session.role), canMessage: false, privateDmEnabled: true, canModerate: canModerate(session) },
      pendingMedia: null,
      pendingKind: null,
      rightPanel: "notif",
      msgPeer: null,
    };

    root.innerHTML =
      '<div class="social-hub">' +
      '<div class="social-hub__toolbar">' +
      '<input type="search" class="social-hub__search" id="socialSearch" placeholder="🔍 Rechercher publications, auteurs, #hashtags…" />' +
      '<div class="social-hub__feed-tabs">' +
      '<button type="button" class="social-hub__feed-tab social-hub__feed-tab--active" data-feed="all">📢 Tout</button>' +
      '<button type="button" class="social-hub__feed-tab" data-feed="personal">✨ Pour vous</button>' +
      "</div>" +
      '<button type="button" class="social-hub__icon-btn" id="socialNotifBtn" title="Notifications">🔔<span class="social-hub__badge" id="socialNotifBadge" hidden>0</span></button>' +
      (session.role === "etudiant"
        ? '<button type="button" class="social-hub__icon-btn" id="socialMsgBtn" title="Messages">💬<span class="social-hub__badge" id="socialMsgBadge" hidden>0</span></button>'
        : "") +
      "</div>" +
      '<div class="social-hub__grid">' +
      '<aside class="social-hub__side">' +
      '<div class="social-hub__card"><h4>👥 Groupes</h4>' +
      '<button type="button" class="social-hub__group-btn social-hub__group-btn--active" data-group="">Tout le campus</button>' +
      '<button type="button" class="social-hub__group-btn" data-group="filiere">Ma filière</button>' +
      '<button type="button" class="social-hub__group-btn" data-group="promotion">Ma promotion</button>' +
      "</div>" +
      '<div class="social-hub__card" id="socialTagsCard"><h4>#️⃣ Hashtags</h4><p style="margin:0;font-size:0.8rem;color:var(--muted);">Chargement…</p></div>' +
      '<div class="social-hub__card" id="socialEventsCard"><h4>🎉 Événements</h4><p style="margin:0;font-size:0.8rem;color:var(--muted);">Chargement…</p></div>' +
      "</aside>" +
      '<main class="social-hub__main">' +
      (state.settings.canPost || state.settings.canModerate
        ? '<div class="social-composer" id="socialComposer">' +
          '<button type="button" class="social-composer__trigger" id="socialComposerOpen">' +
          '<span class="social-composer__avatar">' +
          esc(initials(displayName(session))) +
          "</span>" +
          "<span>📝 Créer une publication…</span></button>" +
          '<div class="social-composer__form">' +
          '<textarea class="social-composer__textarea" id="socialContent" rows="4" maxlength="2000" placeholder="Partagez une info, une question, un événement… Utilisez #Examens #Informatique"></textarea>' +
          '<div class="social-composer__chips" id="socialTagChips">' +
          SUGGESTED_TAGS.map((t) => '<button type="button" class="social-composer__chip" data-add-tag="' + t + '">#' + t + "</button>").join("") +
          "</div>" +
          '<div class="social-composer__tools">' +
          '<label class="social-composer__tool">📷 Photo<input type="file" id="socialPhotoInput" accept="image/*" hidden /></label>' +
          '<label class="social-composer__tool">📄 Document<input type="file" id="socialDocInput" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt" hidden /></label>' +
          '<label class="social-composer__tool"><input type="checkbox" id="socialIsEvent" /> 🎉 Événement</label>' +
          '<select class="fi" id="socialAudience" style="max-width:200px;font-size:0.82rem;">' +
          '<option value="campus">Tout le campus</option>' +
          '<option value="filiere">Ma filière</option>' +
          '<option value="promotion">Ma promotion</option></select>' +
          (state.settings.canModerate
            ? '<label class="social-composer__tool"><input type="checkbox" id="socialPinned" /> 📌 Épingler (admin)</label>'
            : "") +
          "</div>" +
          '<div id="socialEventFields" style="display:none;margin:0.5rem 0;gap:0.5rem;" class="social-composer__tools">' +
          '<input class="fi" id="socialEventTitle" placeholder="Titre de l\'événement" style="flex:1;min-width:140px;" />' +
          '<input class="fi" id="socialEventAt" type="datetime-local" style="flex:1;min-width:160px;" />' +
          "</div>" +
          '<div class="social-composer__preview" id="socialMediaPreview" hidden></div>' +
          '<div class="social-composer__actions">' +
          '<button type="button" class="btn btn--ghost" id="socialComposerCancel">Annuler</button>' +
          '<button type="button" class="btn btn--role" id="socialPublishBtn">Publier</button>' +
          "</div></div></div>"
        : "") +
      '<div id="socialFeedList"><p class="empty">Chargement du fil…</p></div>' +
      "</main>" +
      '<aside class="social-hub__side social-hub__side--right">' +
      '<div class="social-hub__card" id="socialRightPanel">' +
      '<h4 id="socialRightTitle">🔔 Notifications</h4>' +
      '<div id="socialRightBody"><p style="margin:0;font-size:0.82rem;color:var(--muted);">Chargement…</p></div>' +
      (state.settings.canModerate
        ? '<div style="margin-top:0.75rem;padding-top:0.65rem;border-top:1px solid var(--border);">' +
          '<label style="font-size:0.8rem;display:flex;gap:0.4rem;align-items:center;">' +
          '<input type="checkbox" id="socialDmToggle" checked /> Messages privés étudiants</label></div>'
        : "") +
      "</div></aside></div></div>";

    const composer = root.querySelector("#socialComposer");
    const feedEl = root.querySelector("#socialFeedList");

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
        await createPost(session, payload);
        composer?.classList.remove("social-composer--open");
        resetComposer();
        await paintFeed();
        await paintSidebar();
      } catch (err) {
        alert(err.message || "Publication impossible.");
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

    root.querySelector("#socialNotifBtn")?.addEventListener("click", () => {
      state.rightPanel = "notif";
      paintRightPanel();
    });
    root.querySelector("#socialMsgBtn")?.addEventListener("click", () => {
      state.rightPanel = "msg";
      state.msgPeer = null;
      paintRightPanel();
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
              '<div class="social-comment"><strong>' +
              esc(c.authorName) +
              "</strong> · " +
              esc(c.content) +
              '<br/><span style="font-size:0.72rem;color:var(--muted);">' +
              new Date(c.createdAt).toLocaleString("fr-FR") +
              "</span></div>"
          )
          .join("");
      } catch {
        box.innerHTML = "<p style='color:#b91c1c;'>Commentaires indisponibles.</p>";
      }
    }

    function bindFeedEvents() {
      feedEl.querySelectorAll("[data-react]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          try {
            if (typeof SAC_API !== "undefined" && SAC_API.toggleSocialReaction) {
              await SAC_API.toggleSocialReaction(btn.dataset.react, btn.dataset.kind);
            }
            await paintFeed();
          } catch (err) {
            alert(err.message);
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
            if (typeof SAC_API !== "undefined" && SAC_API.addSocialComment) {
              await SAC_API.addSocialComment(form.dataset.commentForm, text);
              input.value = "";
              await loadComments(form.dataset.commentForm);
              await paintFeed();
            }
          } catch (err) {
            alert(err.message);
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

    async function paintRightPanel() {
      const title = root.querySelector("#socialRightTitle");
      const body = root.querySelector("#socialRightBody");
      if (state.rightPanel === "msg" && session.role === "etudiant") {
        title.textContent = "💬 Messagerie";
        if (!state.settings.privateDmEnabled) {
          body.innerHTML =
            '<p class="social-hub__dm-disabled">Les messages privés sont désactivés par l\'administration du campus.</p>';
          return;
        }
        if (!state.msgPeer) {
          try {
            const convos =
              typeof SAC_API !== "undefined" && SAC_API.listSocialConversations
                ? await SAC_API.listSocialConversations()
                : [];
            let unread = 0;
            convos.forEach((c) => {
              unread += c.unread || 0;
            });
            const badge = root.querySelector("#socialMsgBadge");
            if (badge) {
              badge.hidden = !unread;
              badge.textContent = String(unread);
            }
            body.innerHTML =
              '<p style="font-size:0.8rem;color:var(--muted);">Conversations étudiantes</p>' +
              (convos.length
                ? convos
                    .map(
                      (c) =>
                        '<div class="social-msg-item" data-open-peer="' +
                        esc(c.peerEmail) +
                        '"><strong>' +
                        esc(c.peerName) +
                        "</strong>" +
                        (c.unread ? " <span style='color:#ef4444;'>•</span>" : "") +
                        "<br/><span style='color:var(--muted);'>" +
                        esc((c.lastMessage || "").slice(0, 60)) +
                        "</span></div>"
                    )
                    .join("")
                : "<p style='color:var(--muted);'>Aucune conversation.</p>") +
              '<div style="margin-top:0.65rem;display:flex;gap:0.35rem;">' +
              '<input class="fi" id="socialNewPeer" placeholder="E-mail étudiant" style="flex:1;font-size:0.82rem;" />' +
              '<button type="button" class="btn btn--role btn--xs" id="socialNewPeerBtn">Nouveau</button></div>';
            body.querySelectorAll("[data-open-peer]").forEach((el) => {
              el.addEventListener("click", () => {
                state.msgPeer = el.dataset.openPeer;
                paintRightPanel();
              });
            });
            body.querySelector("#socialNewPeerBtn")?.addEventListener("click", () => {
              const em = body.querySelector("#socialNewPeer")?.value.trim();
              if (em) {
                state.msgPeer = em.toLowerCase();
                paintRightPanel();
              }
            });
          } catch (err) {
            body.innerHTML = "<p style='color:#b91c1c;'>" + esc(err.message) + "</p>";
          }
          return;
        }
        try {
          const messages =
            typeof SAC_API !== "undefined" && SAC_API.listSocialMessages
              ? await SAC_API.listSocialMessages(state.msgPeer)
              : [];
          body.innerHTML =
            '<button type="button" class="btn btn--ghost btn--xs" id="socialBackConvos">← Conversations</button>' +
            '<p style="margin:0.35rem 0;font-weight:700;">' +
            esc(state.msgPeer) +
            "</p>" +
            '<div class="social-msg-thread">' +
            messages
              .map(
                (m) =>
                  '<div class="social-msg-bubble ' +
                  (m.mine ? "social-msg-bubble--mine" : "social-msg-bubble--peer") +
                  '">' +
                  esc(m.body) +
                  "</div>"
              )
              .join("") +
            "</div>" +
            '<form id="socialMsgForm" style="display:flex;gap:0.35rem;">' +
            '<input class="fi" id="socialMsgInput" placeholder="Votre message…" style="flex:1;font-size:0.82rem;" required />' +
            '<button type="submit" class="btn btn--role btn--xs">Envoyer</button></form>';
          body.querySelector("#socialBackConvos")?.addEventListener("click", () => {
            state.msgPeer = null;
            paintRightPanel();
          });
          body.querySelector("#socialMsgForm")?.addEventListener("submit", async (e) => {
            e.preventDefault();
            const text = body.querySelector("#socialMsgInput")?.value.trim();
            if (!text) return;
            try {
              await SAC_API.sendSocialMessage(state.msgPeer, text);
              await paintRightPanel();
            } catch (err) {
              alert(err.message || "Envoi impossible.");
            }
          });
          const thread = body.querySelector(".social-msg-thread");
          if (thread) thread.scrollTop = thread.scrollHeight;
        } catch (err) {
          body.innerHTML = "<p style='color:#b91c1c;'>" + esc(err.message) + "</p>";
        }
        return;
      }

      title.textContent = "🔔 Notifications";
      try {
        const notifs =
          typeof SAC_API !== "undefined" && SAC_API.listSocialNotifications
            ? await SAC_API.listSocialNotifications()
            : [];
        const unread = notifs.filter((n) => !n.read).length;
        const badge = root.querySelector("#socialNotifBadge");
        if (badge) {
          badge.hidden = !unread;
          badge.textContent = String(unread);
        }
        body.innerHTML = notifs.length
          ? notifs
              .map(
                (n) =>
                  '<div class="social-notif' +
                  (n.read ? "" : " social-notif--unread") +
                  '" data-notif="' +
                  esc(n.id) +
                  '" data-post="' +
                  esc(n.postId || "") +
                  '"><strong>' +
                  esc(n.title) +
                  "</strong><br/>" +
                  esc(n.message) +
                  '<br/><span style="font-size:0.72rem;color:var(--muted);">' +
                  new Date(n.createdAt).toLocaleString("fr-FR") +
                  "</span></div>"
              )
              .join("")
          : "<p style='margin:0;font-size:0.82rem;color:var(--muted);'>Aucune notification.</p>";
        body.querySelectorAll("[data-notif]").forEach((el) => {
          el.addEventListener("click", async () => {
            if (typeof SAC_API !== "undefined" && SAC_API.markSocialNotificationRead) {
              await SAC_API.markSocialNotificationRead(el.dataset.notif);
            }
            if (el.dataset.post) state.openComments = el.dataset.post;
            await paintFeed();
            await paintRightPanel();
          });
        });
      } catch {
        body.innerHTML = "<p style='color:var(--muted);'>Notifications indisponibles hors ligne.</p>";
      }
    }

    async function init() {
      try {
        if (typeof SAC_API !== "undefined" && SAC_API.getSocialSettings) {
          const online = await SAC_API.ensureOnline();
          if (online) {
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
      await paintRightPanel();
    }

    init();
  }

  return { mountFeedUI, listPosts, createPost };
})();

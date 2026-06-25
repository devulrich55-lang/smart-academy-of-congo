/**
 * Réseau social campus — fil modéré, likes, audience campus / filière
 */
const SAC_SOCIAL = (function () {
  const ROLE_LABELS = {
    etudiant: "Étudiant",
    professeur: "Professeur",
    assistant: "Assistant",
    universite: "Université",
    section: "Section",
  };

  function esc(s) {
    const el = document.createElement("div");
    el.textContent = String(s || "");
    return el.innerHTML;
  }

  function roleLabel(r) {
    return ROLE_LABELS[r] || r || "Membre";
  }

  async function listPosts(session) {
    if (typeof SAC_API !== "undefined" && SAC_API.listSocialPosts) {
      const online = await SAC_API.ensureOnline();
      if (online) return await SAC_API.listSocialPosts();
    }
    if (typeof SAC_PLATFORM !== "undefined" && SAC_PLATFORM.getSocialPosts) {
      return SAC_PLATFORM.getSocialPosts();
    }
    return [];
  }

  async function createPost(session, content, audience) {
    if (typeof SAC_API !== "undefined" && SAC_API.createSocialPost) {
      const online = await SAC_API.ensureOnline();
      if (online) return await SAC_API.createSocialPost(content, audience);
    }
    if (typeof SAC_PLATFORM !== "undefined" && SAC_PLATFORM.addSocialLocal) {
      return SAC_PLATFORM.addSocialLocal(content, audience);
    }
    throw new Error("Publication en ligne requise.");
  }

  async function toggleLike(session, postId) {
    if (typeof SAC_API !== "undefined" && SAC_API.toggleSocialLike) {
      return SAC_API.toggleSocialLike(postId);
    }
    if (typeof SAC_PLATFORM !== "undefined" && SAC_PLATFORM.toggleLikeLocal) {
      return SAC_PLATFORM.toggleLikeLocal(postId);
    }
    throw new Error("Action impossible.");
  }

  async function deletePost(session, postId) {
    if (typeof SAC_API !== "undefined" && SAC_API.deleteSocialPost) {
      return SAC_API.deleteSocialPost(postId);
    }
    throw new Error("Suppression en ligne requise.");
  }

  async function hidePost(session, postId, hidden) {
    if (typeof SAC_API !== "undefined" && SAC_API.moderateSocialPost) {
      return SAC_API.moderateSocialPost(postId, hidden);
    }
    throw new Error("Modération en ligne requise.");
  }

  function canModerate(session) {
    return session && (session.role === "universite" || session.role === "section");
  }

  function postCard(p, session) {
    const email = (session.email || session.identifiant || "").toLowerCase();
    const isAuthor = (p.authorEmail || "").toLowerCase() === email;
    const mod = canModerate(session);
    const aud =
      p.audience === "filiere"
        ? '<span class="social-tag social-tag--filiere">Filière' +
          (p.filiere ? " · " + esc(p.filiere) : "") +
          "</span>"
        : '<span class="social-tag">Campus</span>';
    const likeCls = p.likedByMe ? " social-like--active" : "";
    const actions = [];
    actions.push(
      '<button type="button" class="social-like' +
        likeCls +
        '" data-like-post="' +
        esc(p.id) +
        '">👍 ' +
        (p.likeCount || 0) +
        "</button>"
    );
    if (isAuthor || mod) {
      actions.push(
        '<button type="button" class="btn btn--ghost btn--xs" data-del-post="' +
          esc(p.id) +
          '">Supprimer</button>'
      );
    }
    if (mod && !p.hidden) {
      actions.push(
        '<button type="button" class="btn btn--ghost btn--xs" data-hide-post="' +
          esc(p.id) +
          '">Masquer</button>'
      );
    }
    return (
      '<article class="social-post' +
      (p.hidden ? " social-post--hidden" : "") +
      '">' +
      '<header class="social-post__head">' +
      "<strong>" +
      esc(p.authorName || p.authorEmail) +
      "</strong> · " +
      esc(roleLabel(p.authorRole)) +
      " · " +
      aud +
      '<time style="margin-left:auto;font-size:0.78rem;color:var(--muted);">' +
      new Date(p.createdAt).toLocaleString("fr-FR") +
      "</time></header>" +
      '<p class="social-post__body">' +
      esc(p.content) +
      "</p>" +
      '<div class="social-post__actions">' +
      actions.join("") +
      "</div></article>"
    );
  }

  function mountFeedUI(root, session, options) {
    if (!root || !session) return;
    const canPost = ["etudiant", "professeur", "assistant"].includes(session.role);

    root.innerHTML =
      (canPost
        ? '<div class="panel panel--workspace" style="margin-bottom:1rem;">' +
          '<div class="panel__head"><h2>Publier sur le fil campus</h2></div>' +
          '<div class="panel__body">' +
          '<form id="socialPublishForm">' +
          '<textarea class="fi" id="socialContent" rows="3" maxlength="2000" required placeholder="Partagez une info, une question ou une opportunité…"></textarea>' +
          '<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.5rem;align-items:center;">' +
          '<select class="fi" id="socialAudience" style="max-width:220px;">' +
          '<option value="campus">Tout le campus</option>' +
          '<option value="filiere">Ma filière uniquement</option></select>' +
          '<button type="submit" class="btn btn--role">Publier</button></div></form></div></div>'
        : "") +
      '<div class="panel"><div class="panel__head"><h2>Fil campus</h2></div>' +
      '<div class="panel__body" id="socialFeedList"><p class="empty">Chargement…</p></div></div>';

    async function paint() {
      const el = root.querySelector("#socialFeedList");
      try {
        const posts = await listPosts(session);
        if (!posts.length) {
          el.innerHTML =
            "<p style='margin:0;color:var(--muted);'>Aucune publication pour le moment. Soyez le premier à publier !</p>";
          return;
        }
        el.innerHTML = posts.map((p) => postCard(p, session)).join("");
        el.querySelectorAll("[data-like-post]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            try {
              await toggleLike(session, btn.dataset.likePost);
              await paint();
            } catch (err) {
              alert(err.message);
            }
          });
        });
        el.querySelectorAll("[data-del-post]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            if (!confirm("Supprimer cette publication ?")) return;
            try {
              await deletePost(session, btn.dataset.delPost);
              await paint();
            } catch (err) {
              alert(err.message);
            }
          });
        });
        el.querySelectorAll("[data-hide-post]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            if (!confirm("Masquer cette publication du fil public ?")) return;
            try {
              await hidePost(session, btn.dataset.hidePost, true);
              await paint();
            } catch (err) {
              alert(err.message);
            }
          });
        });
      } catch (err) {
        el.innerHTML = "<p style='color:#b91c1c;'>" + esc(err.message) + "</p>";
      }
    }

    const form = root.querySelector("#socialPublishForm");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const content = root.querySelector("#socialContent").value.trim();
        const audience = root.querySelector("#socialAudience").value;
        if (!content) return;
        try {
          await createPost(session, content, audience);
          form.reset();
          await paint();
        } catch (err) {
          alert(err.message || "Publication impossible.");
        }
      });
    }

    paint();
  }

  return { mountFeedUI, listPosts, createPost };
})();

/**
 * Lanceur vidéo unifié SAC — réunion · cours live · conférence
 * WebRTC SAC intégré (audio, vidéo, partage d'écran, chat)
 */
const SAC_VIDEO_LIVE = (function () {
  const TYPES = {
    meeting: {
      label: "Réunion",
      icon: "🎥",
      hint: "Conseil de section, coordination professeurs, points administratifs.",
      defaultTitle: "Réunion de section",
    },
    course: {
      label: "Cours live",
      icon: "🎓",
      hint: "Cours magistral, TD ou TP en direct avec vos étudiants.",
      defaultTitle: "Cours en direct",
    },
    conference: {
      label: "Conférence",
      icon: "🏛️",
      hint: "Conférence institutionnelle, séminaire ou événement multi-participants.",
      defaultTitle: "Conférence institutionnelle",
    },
  };

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function displayName(s) {
    if (typeof SAC_IDENTITY !== "undefined") return SAC_IDENTITY.getDisplayName(s);
    return [s?.prenom, s?.nom].filter(Boolean).join(" ") || s?.email || s?.identifiant || "Participant";
  }

  function canLaunch(session) {
    return ["professeur", "universite", "assistant", "section"].includes(session?.role);
  }

  function defaultTitle(type, session) {
    const base = TYPES[type]?.defaultTitle || "Session live";
    const date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    const who = displayName(session).split(" ")[0] || "";
    return who ? `${base} — ${who} (${date})` : `${base} — ${date}`;
  }

  function ensureModal() {
    let el = document.getElementById("sacVideoLaunchModal");
    if (el) return el;

    el = document.createElement("div");
    el.id = "sacVideoLaunchModal";
    el.className = "vl-modal";
    el.hidden = true;
    el.innerHTML = `
      <div class="vl-modal__backdrop" data-vl-close></div>
      <div class="vl-modal__card" role="dialog" aria-labelledby="vlModalTitle" aria-modal="true">
        <div class="vl-modal__head">
          <h3 id="vlModalTitle">🔴 Lancer un appel vidéo live</h3>
          <button type="button" class="vl-modal__close" data-vl-close aria-label="Fermer">✕</button>
        </div>
        <p class="vl-modal__lead">Choisissez le type de session. La salle s'ouvre immédiatement avec audio, vidéo, chat et partage d'écran.</p>
        <div class="vl-type-grid" id="vlTypeGrid"></div>
        <form class="vl-form" id="vlLaunchForm">
          <label>Titre de la session
            <input name="title" id="vlTitle" placeholder="Ex. TD Économie — Chapitre 3" />
          </label>
          <label>Description (optionnel)
            <textarea name="description" id="vlDescription" rows="2" placeholder="Ordre du jour, chapitres, consignes…"></textarea>
          </label>
          <label id="vlCourseCodeWrap" hidden>Code cours (optionnel)
            <input name="courseCode" id="vlCourseCode" placeholder="ECO101" />
          </label>
          <p class="vl-form__hint" id="vlTypeHint"></p>
          <div class="vl-form__actions">
            <button type="button" class="mtg-btn mtg-btn--ghost" data-vl-close>Annuler</button>
            <button type="submit" class="vl-launch-btn" id="vlSubmitBtn">🔴 Lancer maintenant</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(el);

    el.querySelectorAll("[data-vl-close]").forEach((btn) => {
      btn.addEventListener("click", () => closeModal());
    });

    return el;
  }

  function closeModal() {
    const el = document.getElementById("sacVideoLaunchModal");
    if (el) el.hidden = true;
    document.body.style.overflow = "";
  }

  function openModal(session, onLaunched) {
    const modal = ensureModal();
    const grid = modal.querySelector("#vlTypeGrid");
    const form = modal.querySelector("#vlLaunchForm");
    const hint = modal.querySelector("#vlTypeHint");
    const titleInput = modal.querySelector("#vlTitle");
    const courseWrap = modal.querySelector("#vlCourseCodeWrap");
    let selected = "meeting";

    grid.innerHTML = Object.entries(TYPES)
      .map(
        ([key, t]) =>
          `<button type="button" class="vl-type${key === selected ? " vl-type--active" : ""}" data-vl-type="${key}">
            <span class="vl-type__icon">${t.icon}</span>
            <span class="vl-type__label">${esc(t.label)}</span>
          </button>`
      )
      .join("");

    function selectType(type) {
      selected = type;
      grid.querySelectorAll("[data-vl-type]").forEach((btn) => {
        btn.classList.toggle("vl-type--active", btn.dataset.vlType === type);
      });
      hint.textContent = TYPES[type].hint;
      titleInput.placeholder = TYPES[type].defaultTitle + " — …";
      if (!titleInput.value.trim()) titleInput.value = defaultTitle(type, session);
      courseWrap.hidden = type !== "course";
    }

    grid.querySelectorAll("[data-vl-type]").forEach((btn) => {
      btn.addEventListener("click", () => selectType(btn.dataset.vlType));
    });

    selectType(selected);
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    titleInput.focus();

    form.onsubmit = async (e) => {
      e.preventDefault();
      const submitBtn = modal.querySelector("#vlSubmitBtn");
      submitBtn.disabled = true;
      submitBtn.textContent = "Ouverture de la salle…";
      try {
        await launchNow(session, selected, {
          title: titleInput.value.trim(),
          description: modal.querySelector("#vlDescription").value.trim(),
          courseCode: modal.querySelector("#vlCourseCode").value.trim(),
        });
        closeModal();
        if (typeof onLaunched === "function") onLaunched();
      } catch (err) {
        alert(err.message || "Impossible de lancer l'appel vidéo.");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "🔴 Lancer maintenant";
      }
    };
  }

  async function launchNow(session, type, opts) {
    if (!canLaunch(session)) {
      throw new Error("Seuls les professeurs, assistants, sections et universités peuvent lancer un live.");
    }

    const title = opts.title || defaultTitle(type, session);
    const userName = displayName(session);

    if (type === "course") {
      if (typeof SAC_LIVE === "undefined") throw new Error("Module cours live indisponible.");
      const row = await SAC_LIVE.createSession({
        title,
        description: opts.description || "",
        courseCode: opts.courseCode || "",
        filiere: session.filiere,
        niveau: session.niveau,
      });
      const live = await SAC_LIVE.startSession(row.id);
      SAC_LIVE.openRoom(live, session);
      return { kind: "course", data: live };
    }

    if (typeof SAC_MEETINGS === "undefined") {
      throw new Error("Module réunions indisponible.");
    }

    const meetingType = type === "conference" ? "conference" : "section_prof";
    const payload = {
      type: meetingType,
      title,
      agenda: opts.description || "",
      description: opts.description || "",
      universite: session.universite,
      allowedEmails: [],
    };

    if (meetingType === "section_prof" && typeof SAC_SECTIONS !== "undefined") {
      const sections = SAC_SECTIONS.getSectionsByUniversity(session) || [];
      const section =
        (session.sectionId && sections.find((s) => s.id === session.sectionId)) ||
        sections[0];
      if (section) {
        payload.sectionId = section.id;
        payload.sectionName = section.name;
        payload.filiere = section.filiere;
        const profs = SAC_MEETINGS.profEmailsForSection(session.universite, section.filiere);
        const caller = (session.identifiant || session.email || "").toLowerCase();
        payload.allowedEmails = Array.from(new Set([...profs, caller].filter(Boolean)));
      }
    }

    const created = await SAC_MEETINGS.createMeeting(payload);
    const live = await SAC_MEETINGS.startMeeting(created.id);
    SAC_MEETINGS.openRoom(live, userName, session);
    return { kind: type, data: live };
  }

  function mountLauncher(container, session, onLaunched) {
    if (!container) return;
    if (!canLaunch(session)) {
      container.innerHTML = "";
      return;
    }

    container.innerHTML = `<button type="button" class="vl-toolbar-btn" id="sacVideoLaunchBtn">
      <span class="vl-toolbar-btn__dot" aria-hidden="true"></span>
      Lancer un appel vidéo
    </button>`;

    container.querySelector("#sacVideoLaunchBtn").addEventListener("click", () => {
      openModal(session, onLaunched);
    });
  }

  async function mountJoinPanel(container, session) {
    if (!container) return;
    const userName = displayName(session);
    let meetings = [];
    let courses = [];

    if (typeof SAC_MEETINGS !== "undefined") {
      meetings = (await SAC_MEETINGS.listMeetings()).filter((m) => m.status === "live");
    }
    if (typeof SAC_LIVE !== "undefined") {
      courses = (await SAC_LIVE.listSessions()).filter((s) => s.status === "live");
    }

    if (!meetings.length && !courses.length) {
      container.innerHTML = `<p class="pub-empty">Aucun cours ou réunion en direct pour le moment. Vous serez notifié quand une session démarre.</p>`;
      return;
    }

    const cards = [
      ...meetings.map(
        (m) =>
          `<article class="vl-join-card">
            <span class="vl-join-card__badge">🎥 Réunion</span>
            <strong>${esc(m.title)}</strong>
            <p>${esc(m.sectionName || m.agenda || "Session institutionnelle")}</p>
            <button type="button" class="live-btn live-btn--join" data-join-mtg="${esc(m.id)}">▶ Rejoindre</button>
          </article>`
      ),
      ...courses.map(
        (s) =>
          `<article class="vl-join-card">
            <span class="vl-join-card__badge">🎓 Cours</span>
            <strong>${esc(s.title)}</strong>
            <p>${esc(s.professorName || "Professeur")}${s.courseCode ? " · " + esc(s.courseCode) : ""}</p>
            <button type="button" class="live-btn live-btn--join" data-join-live="${esc(s.id)}">▶ Rejoindre le cours</button>
          </article>`
      ),
    ].join("");

    container.innerHTML = `<div class="vl-join-grid">${cards}</div>`;

    container.querySelectorAll("[data-join-mtg]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        const label = btn.textContent;
        btn.textContent = "Connexion…";
        try {
          if (typeof SAC_API !== "undefined") await SAC_API.wakeServer();
          const m = await SAC_MEETINGS.joinMeeting(btn.dataset.joinMtg);
          SAC_MEETINGS.openRoom(m, userName, session);
        } catch (err) {
          alert(err.message || "Impossible de rejoindre la réunion.");
        } finally {
          btn.disabled = false;
          btn.textContent = label;
        }
      });
    });

    container.querySelectorAll("[data-join-live]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        const label = btn.textContent;
        btn.textContent = "Connexion…";
        try {
          if (typeof SAC_LIVE_CALL !== "undefined" && SAC_LIVE_CALL.joinCourse) {
            await SAC_LIVE_CALL.joinCourse(btn.dataset.joinLive, session);
          } else {
            if (typeof SAC_API !== "undefined") await SAC_API.wakeServer();
            const s = await SAC_LIVE.joinSession(btn.dataset.joinLive, session);
            SAC_LIVE.openRoom(s, session);
          }
        } catch (err) {
          alert(err.message || "Impossible de rejoindre le cours live.");
        } finally {
          btn.disabled = false;
          btn.textContent = label;
        }
      });
    });
  }

  return {
    TYPES,
    canLaunch,
    launchNow,
    mountLauncher,
    mountJoinPanel,
    openModal,
    closeModal,
  };
})();

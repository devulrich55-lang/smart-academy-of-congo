/**
 * IA orientation académique — conseils parcours / stages / compétences (chat + LLM)
 */
const SAC_ORIENTATION = (function () {
  function esc(s) {
    const el = document.createElement("div");
    el.textContent = String(s || "");
    return el.innerHTML;
  }

  async function getStatus() {
    if (typeof SAC_API !== "undefined" && SAC_API.getOrientationStatus) {
      try {
        const online = await SAC_API.ensureOnline();
        if (online) return await SAC_API.getOrientationStatus();
      } catch {
        /* fallback */
      }
    }
    return { llmAvailable: false, mode: "rules" };
  }

  async function getAdvice(session, interests) {
    if (typeof SAC_API !== "undefined" && SAC_API.getOrientationAdvice) {
      const online = await SAC_API.ensureOnline();
      if (online) return await SAC_API.getOrientationAdvice(interests);
    }
    if (typeof SAC_PLATFORM !== "undefined" && SAC_PLATFORM.getOrientation) {
      return SAC_PLATFORM.getOrientation(interests);
    }
    throw new Error("Service orientation indisponible.");
  }

  function sourceBadge(source) {
    if (source === "llm") {
      return '<span class="ori-badge ori-badge--llm">✨ Conseil IA (OpenAI)</span>';
    }
    return '<span class="ori-badge ori-badge--rules">📋 Mode règles SAC</span>';
  }

  function renderAdvice(advice) {
    if (!advice) return "<p class='empty'>Aucun conseil disponible.</p>";
    const list = (items) =>
      (items || []).map((x) => "<li>" + esc(x) + "</li>").join("") || "<li>—</li>";
    const keyPoints = (advice.keyPoints || [])
      .map((p) => '<span class="ori-chip">' + esc(p) + "</span>")
      .join("");
    return (
      '<div class="orientation-result">' +
      sourceBadge(advice.source) +
      '<p class="ori-message">' +
      esc(advice.message) +
      "</p>" +
      (keyPoints ? '<div class="ori-chips">' + keyPoints + "</div>" : "") +
      '<div class="orientation-grid">' +
      '<div class="orientation-block"><h3>Filières recommandées</h3><ul>' +
      list(advice.recommendedFilieres) +
      "</ul></div>" +
      '<div class="orientation-block"><h3>Stages suggérés</h3><ul>' +
      list(advice.suggestedInternships) +
      "</ul></div>" +
      '<div class="orientation-block"><h3>Compétences à développer</h3><ul>' +
      list(advice.skillsToDevelop) +
      "</ul></div>" +
      "</div>" +
      '<p class="ori-path">' +
      esc(advice.academicPath) +
      "</p>" +
      '<p class="ori-disclaimer">' +
      esc(advice.disclaimer) +
      "</p></div>"
    );
  }

  function appendBubble(thread, role, html) {
    const row = document.createElement("div");
    row.className = "ori-bubble-row ori-bubble-row--" + role;
    row.innerHTML =
      '<div class="ori-bubble ori-bubble--' +
      role +
      '">' +
      html +
      "</div>";
    thread.appendChild(row);
    thread.scrollTop = thread.scrollHeight;
  }

  function mountStudentUI(root, session) {
    if (!root || !session) return;
    root.innerHTML =
      '<div class="panel panel--workspace ori-panel">' +
      '<div class="panel__head ori-head">' +
      "<div><h2>Assistant orientation</h2>" +
      '<p class="ori-head__sub">Parcours, filières et stages — personnalisé pour votre campus.</p></div>' +
      '<span id="orientationModeBadge" class="ori-badge ori-badge--loading">…</span></div>' +
      '<div class="panel__body ori-body">' +
      '<div id="orientationThread" class="ori-thread">' +
      '<div class="ori-bubble-row ori-bubble-row--bot">' +
      '<div class="ori-bubble ori-bubble--bot">' +
      "Bonjour" +
      (session.prenom ? " " + esc(session.prenom) : "") +
      " ! Décrivez vos centres d'intérêt ou posez une question sur votre orientation. " +
      "Votre filière enregistrée : <strong>" +
      esc(session.filiere || "—") +
      "</strong> (" +
      esc(session.niveau || "—") +
      ").</div></div></div>" +
      '<form id="orientationForm" class="ori-compose">' +
      '<input class="fi ori-input" id="orientationInterests" autocomplete="off" ' +
      'placeholder="Ex. je veux travailler en cybersécurité dans ma ville…" />' +
      '<button type="submit" class="btn btn--role ori-send" aria-label="Envoyer">➤</button>' +
      "</form></div></div>";

    const thread = root.querySelector("#orientationThread");
    const badge = root.querySelector("#orientationModeBadge");
    const form = root.querySelector("#orientationForm");
    const input = root.querySelector("#orientationInterests");

    getStatus().then((st) => {
      if (!badge) return;
      if (st.llmAvailable) {
        badge.className = "ori-badge ori-badge--llm";
        badge.textContent = "✨ IA active";
        badge.title = st.model ? "Modèle : " + st.model : "";
      } else {
        badge.className = "ori-badge ori-badge--rules";
        badge.textContent = "📋 Mode règles";
        badge.title = "Ajoutez OPENAI_API_KEY sur le serveur pour activer l'IA.";
      }
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      appendBubble(thread, "user", esc(text));
      input.value = "";
      input.disabled = true;
      const btn = form.querySelector("button");
      if (btn) btn.disabled = true;
      appendBubble(thread, "bot", "<span class='ori-typing'>Analyse en cours…</span>");
      const typing = thread.lastElementChild;
      try {
        const advice = await getAdvice(session, text);
        if (typing) typing.remove();
        appendBubble(thread, "bot", renderAdvice(advice));
      } catch (err) {
        if (typing) typing.remove();
        appendBubble(
          thread,
          "bot",
          "<p style='margin:0;color:#b91c1c;'>" + esc(err.message) + "</p>"
        );
      } finally {
        input.disabled = false;
        if (btn) btn.disabled = false;
        input.focus();
      }
    });
  }

  return { mountStudentUI, getAdvice, getStatus, renderAdvice };
})();

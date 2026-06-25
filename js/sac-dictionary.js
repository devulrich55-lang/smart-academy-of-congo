/**
 * Dictionnaire bilingue FR / EN — API + repli local
 */
const SAC_DICTIONARY = (function () {
  const LOCAL = {
    livre: { translation: "book", sourceLang: "fr", targetLang: "en" },
    livres: { translation: "books", sourceLang: "fr", targetLang: "en" },
    book: { translation: "livre", sourceLang: "en", targetLang: "fr" },
    books: { translation: "livres", sourceLang: "en", targetLang: "fr" },
    bibliotheque: { translation: "library", sourceLang: "fr", targetLang: "en" },
    library: { translation: "bibliothèque", sourceLang: "en", targetLang: "fr" },
    etudiant: { translation: "student", sourceLang: "fr", targetLang: "en" },
    student: { translation: "étudiant", sourceLang: "en", targetLang: "fr" },
    ecole: { translation: "school", sourceLang: "fr", targetLang: "en" },
    school: { translation: "école", sourceLang: "en", targetLang: "fr" },
    professeur: { translation: "teacher", sourceLang: "fr", targetLang: "en" },
    teacher: { translation: "professeur", sourceLang: "en", targetLang: "fr" },
    recherche: { translation: "research", sourceLang: "fr", targetLang: "en" },
    research: { translation: "recherche", sourceLang: "en", targetLang: "fr" },
    universite: { translation: "university", sourceLang: "fr", targetLang: "en" },
    university: { translation: "université", sourceLang: "en", targetLang: "fr" },
    diplome: { translation: "diploma", sourceLang: "fr", targetLang: "en" },
    diploma: { translation: "diplôme", sourceLang: "en", targetLang: "fr" },
    cours: { translation: "course", sourceLang: "fr", targetLang: "en" },
    course: { translation: "cours", sourceLang: "en", targetLang: "fr" },
    examen: { translation: "exam", sourceLang: "fr", targetLang: "en" },
    exam: { translation: "examen", sourceLang: "en", targetLang: "fr" },
  };

  function esc(s) {
    const el = document.createElement("div");
    el.textContent = String(s || "");
    return el.innerHTML;
  }

  function normalizeKey(word) {
    return String(word || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function langLabel(code) {
    return code === "fr" ? "Français" : code === "en" ? "Anglais" : String(code || "");
  }

  function lookupLocal(word) {
    const key = normalizeKey(word);
    const hit = LOCAL[key];
    if (!hit) return null;
    return {
      ok: true,
      query: word,
      sourceLang: hit.sourceLang,
      targetLang: hit.targetLang,
      translation: hit.translation,
      phonetic: "",
      meanings: [],
      alternatives: [],
      offline: true,
    };
  }

  async function lookup(word) {
    const clean = String(word || "").trim();
    if (!clean) throw new Error("INVALID_INPUT");

    if (typeof SAC_API !== "undefined" && SAC_API.translateDictionary) {
      try {
        const online = await SAC_API.translateDictionary(clean);
        if (online && online.translation) return online;
      } catch {
        /* repli local */
      }
    }

    const local = lookupLocal(clean);
    if (local) return local;
    throw new Error("NOT_FOUND");
  }

  function renderResult(data) {
    if (!data || !data.translation) {
      return '<p style="margin:0;color:var(--muted);">Aucune traduction trouvée.</p>';
    }

    const from = langLabel(data.sourceLang);
    const to = langLabel(data.targetLang);
    let html =
      '<div class="dict-result">' +
      '<div class="dict-result__main"><strong>' +
      esc(data.query) +
      "</strong> → <strong>" +
      esc(data.translation) +
      "</strong></div>" +
      '<div class="dict-result__meta">' +
      esc(from) +
      " → " +
      esc(to) +
      (data.phonetic ? " · " + esc(data.phonetic) : "") +
      (data.offline ? " · mode hors ligne" : "") +
      "</div>";

    if (Array.isArray(data.meanings) && data.meanings.length) {
      html +=
        '<div class="dict-result__meanings">' +
        data.meanings
          .map((m) => {
            const defs = (m.definitions || [])
              .map((d) => "<li>" + esc(d) + "</li>")
              .join("");
            return (
              '<div class="dict-meaning"><em>' +
              esc(m.partOfSpeech || "définition") +
              "</em><ul>" +
              defs +
              "</ul></div>"
            );
          })
          .join("") +
        "</div>";
    }

    if (Array.isArray(data.alternatives) && data.alternatives.length) {
      html +=
        '<div class="dict-result__alt"><span>Autres traductions :</span> ' +
        data.alternatives.map((a) => "<span>" + esc(a) + "</span>").join(" · ") +
        "</div>";
    }

    html += "</div>";
    return html;
  }

  function bindForm(form, input, output) {
    if (!form || !input || !output) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const raw = String(input.value || "").trim();
      if (!raw) return;

      output.style.color = "var(--muted)";
      output.innerHTML = "Recherche en cours…";

      try {
        const result = await lookup(raw);
        output.style.color = "var(--text)";
        output.innerHTML = renderResult(result);
      } catch {
        output.style.color = "var(--muted)";
        output.textContent =
          "Mot non trouvé. Essayez un mot simple en français ou en anglais (ex. book, livre, school, école).";
      }
    });
  }

  return {
    lookup,
    lookupLocal,
    renderResult,
    bindForm,
    langLabel,
  };
})();

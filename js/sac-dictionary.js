/**
 * Dictionnaire — définitions par langue (style Larousse)
 * La langue choisie = langue de recherche et de définition de l'utilisateur.
 */
const SAC_DICTIONARY = (function () {
  const LANG_KEY = "sac_dictionary_lang";

  const LANGUAGES = [
    { id: "fr", label: "Français", native: "Français" },
    { id: "en", label: "Anglais", native: "English" },
    { id: "es", label: "Espagnol", native: "Español" },
    { id: "ln", label: "Lingala", native: "Lingála" },
    { id: "lua", label: "Tshiluba", native: "Tshiluba" },
  ];

  function esc(s) {
    const el = document.createElement("div");
    el.textContent = String(s || "");
    return el.innerHTML;
  }

  function langLabel(code) {
    const hit = LANGUAGES.find((l) => l.id === code);
    return hit ? hit.label : String(code || "");
  }

  function getUserLang() {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved && LANGUAGES.some((l) => l.id === saved)) return saved;
    } catch {
      /* ignore */
    }
    return "fr";
  }

  function saveUserLang(code) {
    try {
      localStorage.setItem(LANG_KEY, code);
    } catch {
      /* ignore */
    }
  }

  function langOptions(selected) {
    return LANGUAGES.map(
      (l) =>
        '<option value="' +
        l.id +
        '"' +
        (selected === l.id ? " selected" : "") +
        ">" +
        esc(l.label) +
        " (" +
        esc(l.native) +
        ")</option>"
    ).join("");
  }

  async function lookup(word, opts = {}) {
    const clean = String(word || "").trim();
    if (!clean) throw new Error("INVALID_INPUT");

    const lang = opts.lang || getUserLang();

    if (typeof SAC_API !== "undefined" && SAC_API.lookupDictionary) {
      const online = await SAC_API.lookupDictionary(clean, lang);
      if (online && Array.isArray(online.meanings) && online.meanings.length) return online;
    }

    throw new Error("NOT_FOUND");
  }

  function renderResult(data) {
    if (!data || !Array.isArray(data.meanings) || !data.meanings.length) {
      return '<p style="margin:0;color:var(--muted);">Aucune définition trouvée.</p>';
    }

    const word = data.word || data.query || "";
    let html =
      '<article class="dict-entry">' +
      '<header class="dict-entry__head">' +
      '<h4 class="dict-entry__word">' +
      esc(word) +
      "</h4>";

    if (data.phonetic) {
      html += '<span class="dict-entry__phon">' + esc(data.phonetic) + "</span>";
    }

    html +=
      '<span class="dict-entry__lang">' +
      esc(data.langLabel || langLabel(data.lang)) +
      "</span>" +
      "</header>";

    data.meanings.forEach((meaning) => {
      const pos = meaning.partOfSpeech || "définition";
      const defs = meaning.definitions || [];
      if (!defs.length) return;

      html += '<section class="dict-entry__sense">';
      html += '<div class="dict-entry__pos">' + esc(pos) + "</div><ol>";
      defs.forEach((def) => {
        const text = typeof def === "string" ? def : def.text;
        const example = typeof def === "object" ? def.example : "";
        html += "<li><span>" + esc(text) + "</span>";
        if (example) {
          html += ' <em class="dict-entry__ex">« ' + esc(example) + " »</em>";
        }
        html += "</li>";
      });
      html += "</ol></section>";
    });

    if (Array.isArray(data.synonyms) && data.synonyms.length) {
      html +=
        '<footer class="dict-entry__syn">' +
        "<strong>Synonymes :</strong> " +
        data.synonyms.map((s) => esc(s)).join(", ") +
        "</footer>";
    }

    if (data.offline || data.provider === "local") {
      html += '<p class="dict-entry__note">Définition locale intégrée.</p>';
    }

    html += "</article>";
    return html;
  }

  function bindForm(form, input, output, langSelect) {
    if (!form || !input || !output) return;

    if (langSelect) {
      langSelect.innerHTML = langOptions(getUserLang());
      langSelect.addEventListener("change", () => {
        saveUserLang(langSelect.value);
      });
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const raw = String(input.value || "").trim();
      if (!raw) return;

      const lang = langSelect ? langSelect.value : getUserLang();
      saveUserLang(lang);

      output.style.color = "var(--muted)";
      output.innerHTML = "Recherche dans le dictionnaire…";

      try {
        const result = await lookup(raw, { lang });
        output.style.color = "var(--text)";
        output.innerHTML = renderResult(result);
      } catch {
        output.style.color = "var(--muted)";
        output.innerHTML =
          '<p style="margin:0;">Mot introuvable dans le dictionnaire <strong>' +
          esc(langLabel(lang)) +
          "</strong>. Essayez un autre mot ou vérifiez l'orthographe.</p>";
      }
    });
  }

  return {
    LANGUAGES,
    LANG_KEY,
    lookup,
    renderResult,
    bindForm,
    langLabel,
    langOptions,
    getUserLang,
    saveUserLang,
  };
})();

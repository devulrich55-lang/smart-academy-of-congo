/**
 * Dictionnaire — définitions par langue (Wiktionary + API)
 * La langue choisie = langue de recherche de l'utilisateur.
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

  const WIKI_SITE = {
    fr: ["fr", "fr"],
    en: ["en", "en"],
    es: ["es", "es"],
    ln: ["fr", "ln"],
    lua: ["fr", "lua"],
  };

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

  function stripWiki(text) {
    return String(text || "")
      .replace(/==+[^=]+==+/g, " ")
      .replace(/\{\{[^}]+\}\}/g, " ")
      .replace(/\[\[(?:[^|\]]+\|)?([^\]]+)\]\]/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildResult(query, lang, meanings, provider, phonetic, synonyms) {
    return {
      ok: true,
      query,
      word: query,
      lang,
      langLabel: langLabel(lang),
      phonetic: phonetic || "",
      meanings,
      synonyms: synonyms || [],
      provider,
    };
  }

  function parseWiktionaryRest(data, sectionLang, query, lang) {
    if (!data || typeof data !== "object") return null;

    let blocks = data[sectionLang];
    if (!blocks && (sectionLang === "ln" || sectionLang === "lua")) {
      blocks = data.fr || data.en || data.es;
    }
    if (!blocks) {
      const keys = Object.keys(data);
      if (keys.length) blocks = data[keys[0]];
    }
    if (!Array.isArray(blocks)) return null;

    const meanings = [];
    blocks.forEach((block) => {
      if (!block || !Array.isArray(block.definitions)) return;
      const part = block.partOfSpeech || block.language || "définition";
      const defs = [];
      block.definitions.forEach((item) => {
        if (typeof item === "string") {
          const text = stripWiki(item);
          if (text) defs.push({ text, example: "" });
        } else if (item && item.definition) {
          const text = stripWiki(item.definition);
          let example = "";
          if (Array.isArray(item.examples) && item.examples[0]) {
            example = stripWiki(item.examples[0]);
          }
          if (text) defs.push({ text, example });
        }
      });
      if (defs.length) meanings.push({ partOfSpeech: part, definitions: defs.slice(0, 5) });
    });

    if (!meanings.length) return null;
    return buildResult(query, lang, meanings.slice(0, 6), "wiktionary", "", []);
  }

  async function fetchWiktionaryRest(word, lang) {
    const site = WIKI_SITE[lang] || ["fr", "fr"];
    const [wikiSite, section] = site;
    const candidates = [word.trim().toLowerCase(), word.trim(), word.trim()[0]?.toUpperCase() + word.trim().slice(1).toLowerCase()];

    for (const candidate of candidates) {
      if (!candidate) continue;
      const url =
        "https://" +
        wikiSite +
        ".wiktionary.org/api/rest_v1/page/definition/" +
        encodeURIComponent(candidate);
      try {
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) continue;
        const data = await res.json();
        const parsed = parseWiktionaryRest(data, section, word, lang);
        if (parsed) return parsed;
      } catch {
        /* essai suivant */
      }
    }
    return null;
  }

  async function fetchWiktionaryExtract(word, lang) {
    const site = (WIKI_SITE[lang] || ["fr", "fr"])[0];
    const url =
      "https://" +
      site +
      ".wiktionary.org/w/api.php?action=query&prop=extracts&exintro&explaintext&redirects=1&titles=" +
      encodeURIComponent(word) +
      "&format=json&origin=*";

    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const pages = data?.query?.pages || {};
      let extract = "";
      Object.values(pages).forEach((page) => {
        if (page && page.extract) extract = page.extract;
      });
      extract = stripWiki(extract);
      if (extract.length < 12) return null;

      const lines = extract
        .split(/\n+/)
        .map((l) => stripWiki(l))
        .filter((l) => l.length > 10)
        .slice(0, 6);

      const defs = (lines.length ? lines : [extract]).map((text) => ({ text, example: "" }));
      return buildResult(word, lang, [{ partOfSpeech: "définition", definitions: defs }], "wiktionary", "", []);
    } catch {
      return null;
    }
  }

  async function lookup(word, opts = {}) {
    const clean = String(word || "").trim();
    if (!clean) throw new Error("INVALID_INPUT");

    const lang = opts.lang || getUserLang();

    if (typeof SAC_API !== "undefined" && SAC_API.lookupDictionary) {
      try {
        const online = await SAC_API.lookupDictionary(clean, lang);
        if (online && Array.isArray(online.meanings) && online.meanings.length) return online;
      } catch {
        /* repli direct Wiktionary */
      }
    }

    const direct = await fetchWiktionaryRest(clean, lang);
    if (direct) return direct;

    const extract = await fetchWiktionaryExtract(clean, lang);
    if (extract) return extract;

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

    if (data.provider === "pons") {
      html += '<p class="dict-entry__note">Source : PONS — dictionnaire professionnel.</p>';
    } else if (data.provider && String(data.provider).includes("wiktionary")) {
      html += '<p class="dict-entry__note">Source : Wiktionary — dictionnaire ouvert.</p>';
    } else if (data.provider === "local") {
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
          "</strong>. Vérifiez l'orthographe ou essayez un mot plus courant.</p>";
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

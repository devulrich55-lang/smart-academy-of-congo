/**
 * Dictionnaire multilingue — FR, EN, ES, Lingala, Tshiluba
 */
const SAC_DICTIONARY = (function () {
  const LANGUAGES = [
    { id: "fr", label: "Français", native: "Français" },
    { id: "en", label: "Anglais", native: "English" },
    { id: "es", label: "Espagnol", native: "Español" },
    { id: "ln", label: "Lingala", native: "Lingála" },
    { id: "lua", label: "Tshiluba", native: "Tshiluba" },
  ];

  const LOCAL_ENTRIES = [
    ["livre", "fr", "en", "book"],
    ["book", "en", "fr", "livre"],
    ["école", "fr", "en", "school"],
    ["school", "en", "fr", "école"],
    ["bonjour", "fr", "en", "hello"],
    ["hello", "en", "fr", "bonjour"],
    ["libro", "es", "fr", "livre"],
    ["livre", "fr", "es", "libro"],
    ["escuela", "es", "fr", "école"],
    ["école", "fr", "es", "escuela"],
    ["hola", "es", "fr", "bonjour"],
    ["bonjour", "fr", "es", "hola"],
    ["mbote", "ln", "fr", "bonjour"],
    ["bonjour", "fr", "ln", "mbote"],
    ["malamu", "ln", "fr", "bien"],
    ["bien", "fr", "ln", "malamu"],
    ["eteyi", "ln", "fr", "école"],
    ["école", "fr", "ln", "eteyi"],
    ["ndako", "ln", "fr", "maison"],
    ["maison", "fr", "ln", "ndako"],
    ["moninga", "ln", "fr", "ami"],
    ["ami", "fr", "ln", "moninga"],
    ["moyo", "lua", "fr", "vie"],
    ["vie", "fr", "lua", "moyo"],
    ["diaku", "lua", "fr", "ami"],
    ["ami", "fr", "lua", "diaku"],
    ["dibuku", "lua", "fr", "livre"],
    ["livre", "fr", "lua", "dibuku"],
    ["tshikondo", "lua", "fr", "école"],
    ["école", "fr", "lua", "tshikondo"],
  ];

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
    const hit = LANGUAGES.find((l) => l.id === code);
    return hit ? hit.label : String(code || "");
  }

  function langOptions(selected) {
    return (
      '<option value="auto"' +
      (selected === "auto" ? " selected" : "") +
      ">Détection auto</option>" +
      LANGUAGES.map(
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
      ).join("")
    );
  }

  function lookupLocal(word, sourceLang, targetLang) {
    const key = normalizeKey(word);
    const source = sourceLang === "auto" ? null : sourceLang;
    const target = targetLang === "auto" ? null : targetLang;

    for (const [entry, src, tgt, translation] of LOCAL_ENTRIES) {
      if (normalizeKey(entry) !== key) continue;
      if (source && src !== source) continue;
      if (target && tgt !== target) continue;
      return {
        ok: true,
        query: word,
        sourceLang: src,
        targetLang: tgt,
        translation,
        phonetic: "",
        meanings: [],
        alternatives: [],
        offline: true,
      };
    }

    if (!source && !target) {
      for (const [entry, src, tgt, translation] of LOCAL_ENTRIES) {
        if (normalizeKey(entry) === key) {
          return {
            ok: true,
            query: word,
            sourceLang: src,
            targetLang: tgt,
            translation,
            phonetic: "",
            meanings: [],
            alternatives: [],
            offline: true,
          };
        }
      }
    }
    return null;
  }

  async function lookup(word, opts = {}) {
    const clean = String(word || "").trim();
    if (!clean) throw new Error("INVALID_INPUT");

    const sourceLang = opts.sourceLang || "auto";
    const targetLang = opts.targetLang || "auto";

    if (typeof SAC_API !== "undefined" && SAC_API.translateDictionary) {
      try {
        const online = await SAC_API.translateDictionary(clean, { sourceLang, targetLang });
        if (online && online.translation) return online;
      } catch {
        /* repli local */
      }
    }

    const local = lookupLocal(clean, sourceLang, targetLang);
    if (local) return local;
    throw new Error("NOT_FOUND");
  }

  function renderResult(data) {
    if (!data || !data.translation) {
      return '<p style="margin:0;color:var(--muted);">Aucune traduction trouvée.</p>';
    }

    const from = data.sourceLabel || langLabel(data.sourceLang);
    const to = data.targetLabel || langLabel(data.targetLang);
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

  function bindForm(form, input, output, sourceSelect, targetSelect, swapBtn) {
    if (!form || !input || !output) return;

    if (swapBtn && sourceSelect && targetSelect) {
      swapBtn.addEventListener("click", () => {
        const from = sourceSelect.value;
        const to = targetSelect.value;
        if (from === "auto" || to === "auto") return;
        sourceSelect.value = to;
        targetSelect.value = from;
      });
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const raw = String(input.value || "").trim();
      if (!raw) return;

      const sourceLang = sourceSelect ? sourceSelect.value : "auto";
      const targetLang = targetSelect ? targetSelect.value : "auto";
      if (sourceLang !== "auto" && targetLang !== "auto" && sourceLang === targetLang) {
        output.style.color = "var(--muted)";
        output.textContent = "Choisissez deux langues différentes.";
        return;
      }

      output.style.color = "var(--muted)";
      output.innerHTML = "Recherche en cours…";

      try {
        const result = await lookup(raw, { sourceLang, targetLang });
        output.style.color = "var(--text)";
        output.innerHTML = renderResult(result);
      } catch {
        output.style.color = "var(--muted)";
        output.textContent =
          "Mot non trouvé. Essayez un mot simple (ex. book, livre, hola, mbote, moyo) ou changez les langues.";
      }
    });
  }

  return {
    LANGUAGES,
    lookup,
    lookupLocal,
    renderResult,
    bindForm,
    langLabel,
    langOptions,
  };
})();

/**
 * Établissements d'enseignement supérieur — universités & instituts partenaires (Afrique centrale et régionale)
 */
const SAC_UNIVERSITIES = (function () {
  let UNIVERSITIES = [
    { id: "unkin", name: "Université de Kinshasa", sigle: "UNIKIN", type: "universite" },
    { id: "unilu", name: "Université de Lubumbashi", sigle: "UNILU", type: "universite" },
    { id: "unikis", name: "Université de Kisangani", sigle: "UNIKIS", type: "universite" },
    { id: "upn", name: "Université Pédagogique Nationale", sigle: "UPN", type: "universite" },
    { id: "unigom", name: "Université de Goma", sigle: "UNIGOM", type: "universite" },
    { id: "unibuk", name: "Université de Bukavu", sigle: "UNIBUK", type: "universite" },
    { id: "uom", name: "Université Officielle de Mbuji-Mayi", sigle: "UOM", type: "universite" },
    { id: "unikan", name: "Université de Kananga", sigle: "UNIKAN", type: "universite" },
    { id: "uniknd", name: "Université de Kindu", sigle: "UNIKND", type: "universite" },
    { id: "unkwt", name: "Université de Kikwit", sigle: "UNKWT", type: "universite" },
    { id: "upro", name: "Université Protestante au Congo", sigle: "UPC", type: "universite" },
    { id: "ucc", name: "Université Catholique du Congo", sigle: "UCC", type: "universite" },
    { id: "ulk", name: "Université Libre de Kinshasa", sigle: "ULK", type: "universite" },
    { id: "usk", name: "Université Simon Kimbangu", sigle: "USK", type: "universite" },
    { id: "uccm", name: "Université Chrétienne Cardinal Malula", sigle: "UCCM", type: "universite" },
  ];

  let INSTITUTES = [
    { id: "istap", name: "Institut Supérieur des Techniques Appliquées", sigle: "ISTA", type: "institut" },
    { id: "inbat", name: "Institut National du Bâtiment et Travaux Publics", sigle: "INBTP", type: "institut" },
    { id: "ifsic", name: "Institut Facultaire des Sciences de l'Information et de la Communication", sigle: "IFSIC", type: "institut" },
    { id: "isck", name: "Institut Supérieur de Commerce de Kinshasa", sigle: "ISC-Kin", type: "institut" },
    { id: "aba", name: "Académie des Beaux-Arts", sigle: "ABA", type: "institut" },
    { id: "inarts", name: "Institut National des Arts", sigle: "INA", type: "institut" },
    { id: "istmed", name: "Institut Supérieur des Techniques Médicales de Kinshasa", sigle: "ISTM-Kin", type: "institut" },
    { id: "istmmayi", name: "Institut Supérieur des Techniques Médicales de Mbuji-Mayi", sigle: "ISTM MBUJIMAYI", type: "institut" },
    { id: "isstat", name: "Institut Supérieur des Statistiques", sigle: "ISS", type: "institut" },
    { id: "isau", name: "Institut Supérieur d'Architecture et d'Urbanisme", sigle: "ISAU", type: "institut" },
    { id: "isam", name: "Institut Supérieur des Arts et Métiers", sigle: "ISAM", type: "institut" },
  ];

  let LIST = [...UNIVERSITIES, ...INSTITUTES];
  let catalogHydrated = false;
  let catalogHydratePromise = null;

  function applyCatalog(data) {
    if (!data) return false;
    const uni = data.universities || data.all;
    if (!Array.isArray(uni) || !uni.length) return false;
    UNIVERSITIES = (data.universities || []).slice();
    INSTITUTES = (data.institutes || []).slice();
    LIST = data.all && data.all.length ? data.all.slice() : [...UNIVERSITIES, ...INSTITUTES];
    catalogHydrated = true;
    return true;
  }

  function hydrateFromApi() {
    if (catalogHydrated) return Promise.resolve(true);
    if (catalogHydratePromise) return catalogHydratePromise;
    if (typeof SAC_API === "undefined" || !SAC_API.getCampusCatalog) {
      return Promise.resolve(false);
    }
    catalogHydratePromise = SAC_API.ensureOnline()
      .then((online) => {
        if (!online) return false;
        return SAC_API.getCampusCatalog();
      })
      .then((data) => applyCatalog(data))
      .catch(() => false)
      .finally(() => {
        catalogHydratePromise = null;
      });
    return catalogHydratePromise;
  }

  function getById(id) {
    return LIST.find((u) => u.id === id);
  }

  function getCountryCode(id) {
    const u = getById(id);
    if (u?.countryCode) return String(u.countryCode).toUpperCase();
    if (typeof SAC_AFRICA_COUNTRIES !== "undefined") {
      return SAC_AFRICA_COUNTRIES.getCountryForUniversite(id);
    }
    return "CD";
  }

  function formatLabel(u) {
    if (!u) return "";
    return u.sigle ? `${u.name} (${u.sigle})` : u.name;
  }

  function getLabel(id) {
    const u = getById(id);
    if (!u) return id || "—";
    return formatLabel(u);
  }

  function getName(id) {
    return getById(id)?.name || id || "—";
  }

  function optionsForGroup(items, selectedId) {
    return items
      .map((u) => {
        const sel = u.id === selectedId ? " selected" : "";
        return `<option value="${u.id}"${sel}>${formatLabel(u)}</option>`;
      })
      .join("");
  }

  function optionsHtml(selectedId, opts = {}) {
    const empty = opts.empty !== false;
    const emptyLabel = opts.emptyLabel || "— Choisir —";
    const includeAutre = opts.includeAutre === true;
    const useGroups = opts.groups !== false;

    let html = empty ? `<option value="">${emptyLabel}</option>` : "";

    if (useGroups) {
      html += `<optgroup label="Universités">${optionsForGroup(UNIVERSITIES, selectedId)}</optgroup>`;
      html += `<optgroup label="Instituts supérieurs & académies">${optionsForGroup(INSTITUTES, selectedId)}</optgroup>`;
    } else {
      html += optionsForGroup(LIST, selectedId);
    }

    if (includeAutre) {
      html += `<option value="autre"${selectedId === "autre" ? " selected" : ""}>Autre établissement partenaire</option>`;
    }
    return html;
  }

  function populateAll(selectors, selectedId) {
    const run = () => {
      document.querySelectorAll(selectors).forEach((el) => {
        const sel = selectedId ?? el.dataset.selected ?? el.value;
        const includeAutre = el.dataset.includeAutre === "true";
        const emptyLabel = el.dataset.emptyLabel || "— Choisir —";
        const countryFilter = el.dataset.countryFilter || "";
        if (countryFilter) {
          el.innerHTML = optionsHtmlForCountry(countryFilter, sel, {
            emptyLabel,
            includeAutre,
          });
          return;
        }
        el.innerHTML = optionsHtml(sel, { emptyLabel, includeAutre });
      });
    };
    return hydrateFromApi().finally(run);
  }

  function optionsHtmlForCountry(countryCode, selectedId, opts = {}) {
    const cc = String(countryCode || "").toUpperCase();
    const filtered = cc
      ? LIST.filter((u) => getCountryCode(u.id) === cc)
      : LIST.slice();
    const emptyLabel = opts.emptyLabel || "— Choisir —";
    let html = `<option value="">${emptyLabel}</option>`;
    const unis = filtered.filter((u) => u.type === "universite");
    const institutes = filtered.filter((u) => u.type !== "universite");
    if (unis.length) {
      html += `<optgroup label="Universités">${optionsForGroup(unis, selectedId)}</optgroup>`;
    }
    if (institutes.length) {
      html +=
        '<optgroup label="Instituts supérieurs & académies">' +
        optionsForGroup(institutes, selectedId) +
        "</optgroup>";
    }
    if (!unis.length && !institutes.length) {
      html += '<option value="" disabled>— Aucun établissement pour ce pays —</option>';
    }
    if (opts.includeAutre) {
      html += `<option value="autre"${selectedId === "autre" ? " selected" : ""}>Autre établissement partenaire</option>`;
    }
    return html;
  }

  function populateForCountry(selector, countryCode, selectedId) {
    document.querySelectorAll(selector).forEach((el) => {
      el.dataset.countryFilter = String(countryCode || "").toUpperCase();
      const sel = selectedId ?? el.value;
      el.innerHTML = optionsHtmlForCountry(countryCode, sel, {
        emptyLabel: el.dataset.emptyLabel || "— Choisir —",
      });
    });
  }

  function normKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
  }

  /** Identifiant canonique (unkin, unilu…) depuis id, sigle ou nom */
  function resolveId(raw) {
    if (!raw) return null;
    const key = normKey(raw);
    if (!key) return null;
    if (key === "autre") return "autre";
    const byId = getById(key);
    if (byId) return byId.id;
    for (const u of LIST) {
      if (normKey(u.sigle) === key || normKey(u.name) === key) return u.id;
    }
    for (const u of LIST) {
      const sig = normKey(u.sigle);
      if (key.includes(sig) || sig.includes(key)) return u.id;
    }
    return key;
  }

  function sameCampus(a, b) {
    if (!a || !b) return false;
    return resolveId(a) === resolveId(b);
  }

  function buildAdminCampusPayload(catalogId, responsable) {
    const id = resolveId(catalogId);
    const u = getById(id);
    if (!u) {
      throw new Error("Choisissez un établissement inscrit dans le catalogue EvoSU.");
    }
    const year = new Date().getFullYear();
    return {
      universite: u.id,
      universiteLocked: u.id,
      nomUniversite: u.name,
      sigle: u.sigle,
      countryCode: getCountryCode(u.id),
      codeUni: "EvoSU-" + u.sigle + "-" + year,
      responsable: (responsable || "").trim(),
    };
  }

  function normalizeProfileCampus(profile) {
    if (!profile) return profile;
    const raw =
      profile.universite ||
      profile.universiteLocked ||
      profile.sigle ||
      profile.codeUni;
    if (!raw || profile.role === "ministere" || profile.role === "superadmin") {
      return profile;
    }
    const id = resolveId(raw);
    if (!id) return profile;
    const u = getById(id);
    profile.universite = id;
    profile.universiteLocked = id;
    if (u && profile.role === "universite") {
      profile.nomUniversite = profile.nomUniversite || u.name;
      profile.sigle = u.sigle;
      if (!profile.codeUni) {
        profile.codeUni = "EvoSU-" + u.sigle + "-" + new Date().getFullYear();
      }
    }
    return profile;
  }

  return {
    get LIST() {
      return LIST;
    },
    get UNIVERSITIES() {
      return UNIVERSITIES;
    },
    get INSTITUTES() {
      return INSTITUTES;
    },
    get NAMES() {
      return Object.fromEntries(LIST.map((u) => [u.id, getLabel(u.id)]));
    },
    getById,
    getCountryCode,
    getLabel,
    getName,
    optionsHtml,
    populateAll,
    hydrateFromApi,
    resolveId,
    sameCampus,
    buildAdminCampusPayload,
    normalizeProfileCampus,
    optionsHtmlForCountry,
    populateForCountry,
    normKey,
  };
})();

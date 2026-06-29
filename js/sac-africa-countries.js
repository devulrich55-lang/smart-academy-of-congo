/**
 * Pays partenaires Evo-smartUni — 18 pays prioritaires (francophones compatibles)
 */
const SAC_AFRICA_COUNTRIES = (function () {
  const PAN = "PAN";
  const ALL = "all";
  const STORAGE_KEY = "sac_public_country";
  const PORTAL_STORAGE_KEY = "sac_portal_country";

  const REGIONS = {
    central: "Afrique centrale",
    west: "Afrique de l'Ouest",
    east: "Afrique de l'Est",
    indian: "Océan Indien",
  };

  const LIST = [
    { code: "CD", name: "RD Congo", flag: "🇨🇩", region: "central" },
    { code: "CG", name: "Congo (Brazzaville)", flag: "🇨🇬", region: "central" },
    { code: "GA", name: "Gabon", flag: "🇬🇦", region: "central" },
    { code: "CM", name: "Cameroun", flag: "🇨🇲", region: "central" },
    { code: "TD", name: "Tchad", flag: "🇹🇩", region: "central" },
    { code: "CF", name: "Centrafrique", flag: "🇨🇫", region: "central" },
    { code: "GQ", name: "Guinée équatoriale", flag: "🇬🇶", region: "central" },
    { code: "ST", name: "São Tomé-et-Príncipe", flag: "🇸🇹", region: "central" },
    { code: "BI", name: "Burundi", flag: "🇧🇮", region: "east" },
    { code: "DJ", name: "Djibouti", flag: "🇩🇯", region: "east" },
    { code: "SN", name: "Sénégal", flag: "🇸🇳", region: "west" },
    { code: "CI", name: "Côte d'Ivoire", flag: "🇨🇮", region: "west" },
    { code: "BJ", name: "Bénin", flag: "🇧🇯", region: "west" },
    { code: "TG", name: "Togo", flag: "🇹🇬", region: "west" },
    { code: "BF", name: "Burkina Faso", flag: "🇧🇫", region: "west" },
    { code: "NE", name: "Niger", flag: "🇳🇪", region: "west" },
    { code: "ML", name: "Mali", flag: "🇲🇱", region: "west" },
    { code: "MG", name: "Madagascar", flag: "🇲🇬", region: "indian" },
  ];

  const BY_CODE = Object.fromEntries(LIST.map((c) => [c.code, c]));

  const PRIORITY_CODES = new Set(LIST.map((c) => c.code));

  /** Campus partenaires actuels — RD Congo */
  const UNIVERSITY_COUNTRY = {
    unikin: "CD",
    unilu: "CD",
    unikis: "CD",
    upn: "CD",
    unigom: "CD",
    unibuk: "CD",
    uom: "CD",
    unikan: "CD",
    uniknd: "CD",
    unkwt: "CD",
    upro: "CD",
    ucc: "CD",
    ulk: "CD",
    usk: "CD",
    uccm: "CD",
    istap: "CD",
    inbat: "CD",
    ifsic: "CD",
    isck: "CD",
    aba: "CD",
    inarts: "CD",
    istmed: "CD",
    istmmayi: "CD",
    isstat: "CD",
    isau: "CD",
    isam: "CD",
    ucad: "SN",
    ministere: PAN,
    national: PAN,
  };

  function normalizeCountryCode(code) {
    const cc = String(code || "").toUpperCase();
    if (cc === ALL || cc === PAN) return cc;
    return PRIORITY_CODES.has(cc) ? cc : "CD";
  }

  function get(code) {
    return BY_CODE[String(code || "").toUpperCase()] || null;
  }

  function label(code) {
    const c = get(code);
    if (!c) return code || "—";
    return c.flag + " " + c.name;
  }

  function getCountryForUniversite(universiteId) {
    const id = String(universiteId || "").toLowerCase();
    if (UNIVERSITY_COUNTRY[id]) return UNIVERSITY_COUNTRY[id];
    if (typeof SAC_UNIVERSITIES !== "undefined" && SAC_UNIVERSITIES.getCountryCode) {
      return SAC_UNIVERSITIES.getCountryCode(id);
    }
    return "CD";
  }

  function inferFromNewsItem(item) {
    if (item?.countryCode) return String(item.countryCode).toUpperCase();
    if (item?.country) return String(item.country).toUpperCase();
    if (item?.universite === "ministere" || item?.authorRole === "ministere") {
      return item.scope === "national" ? PAN : getCountryForUniversite(item.universite);
    }
    if (item?.universite === "national") return PAN;
    if (item?.universite) return getCountryForUniversite(item.universite);
    return PAN;
  }

  /** Filtre strict : pays choisi = contenu local uniquement ; « all » = tout le continent */
  function matchesFilter(itemCountry, filterCountry) {
    const filter = String(filterCountry || ALL).toUpperCase();
    const item = String(itemCountry || PAN).toUpperCase();
    if (filter === ALL) return true;
    if (filter === PAN) return item === PAN;
    return item === filter;
  }

  function getStoredCountry() {
    try {
      return normalizeCountryCode(localStorage.getItem(STORAGE_KEY) || "CD");
    } catch {
      return "CD";
    }
  }

  function setStoredCountry(code) {
    try {
      localStorage.setItem(STORAGE_KEY, normalizeCountryCode(code));
    } catch {
      /* ignore */
    }
  }

  function buildSelectOptions(selected, opts) {
    opts = opts || {};
    const sel = String(selected || ALL).toUpperCase();
    let html = "";
    if (opts.includeAll !== false) {
      html +=
        '<option value="' +
        ALL +
        '"' +
        (sel === ALL ? " selected" : "") +
        ">🌍 Tous les pays</option>";
    }
    if (opts.includePanAfrica) {
      html +=
        '<option value="' +
        PAN +
        '"' +
        (sel === PAN ? " selected" : "") +
        ">🌐 Pan-africain (tous pays)</option>";
    }
    const regions = {};
    LIST.forEach((c) => {
      if (!regions[c.region]) regions[c.region] = [];
      regions[c.region].push(c);
    });
    Object.keys(REGIONS).forEach((key) => {
      const group = regions[key];
      if (!group?.length) return;
      html += '<optgroup label="' + REGIONS[key] + '">';
      group.forEach((c) => {
        html +=
          '<option value="' +
          c.code +
          '"' +
          (c.code === sel ? " selected" : "") +
          ">" +
          c.flag +
          " " +
          c.name +
          "</option>";
      });
      html += "</optgroup>";
    });
    return html;
  }

  function getPortalCountry(portalId) {
    try {
      const raw = localStorage.getItem(PORTAL_STORAGE_KEY);
      if (!raw) return getStoredCountry();
      const data = JSON.parse(raw);
      const key = portalId || "default";
      return normalizeCountryCode(data[key] || data.default || getStoredCountry());
    } catch {
      return getStoredCountry();
    }
  }

  function setPortalCountry(portalId, code) {
    try {
      const raw = localStorage.getItem(PORTAL_STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : {};
      const key = portalId || "default";
      data[key] = normalizeCountryCode(code);
      localStorage.setItem(PORTAL_STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }

  function buildInstitutionCountrySelect(selected) {
    return buildSelectOptions(selected, { includeAll: false, includePanAfrica: false });
  }

  function bookCountryCode(item) {
    if (!item) return PAN;
    const raw = item.countryCode || item.country_code;
    if (raw) return String(raw).toUpperCase();
    return "CD";
  }

  /** Bibliothèque : un pays = ses livres (+ contenu pan-africain si filtre « all »). */
  function matchesLibraryCountry(item, filterCountry) {
    const filter = String(filterCountry || getStoredCountry()).toUpperCase();
    const itemC = bookCountryCode(item);
    if (filter === ALL) return true;
    if (filter === PAN) return itemC === PAN;
    return itemC === filter || itemC === PAN;
  }

  function adminCountryCode(admin) {
    if (!admin) return "";
    if (admin.countryCode || admin.country_code) {
      return String(admin.countryCode || admin.country_code).toUpperCase();
    }
    if (admin.role === "universite" && admin.universite) {
      return getCountryForUniversite(admin.universite);
    }
    return "";
  }

  function buildPublisherOptions(selected, sessionCountry) {
    const sel = String(selected || sessionCountry || "CD").toUpperCase();
    let html =
      '<option value="' +
      PAN +
      '"' +
      (sel === PAN ? " selected" : "") +
      ">🌐 Pan-africain — visible sur « Tous les pays »</option>";
    html += buildSelectOptions(sel, { includeAll: false, includePanAfrica: false });
    return html;
  }

  function countriesInRegion(regionKey) {
    return LIST.filter((c) => c.region === regionKey).map((c) => c.code);
  }

  return {
    PAN,
    ALL,
    STORAGE_KEY,
    PORTAL_STORAGE_KEY,
    PRIORITY_CODES,
    normalizeCountryCode,
    REGIONS,
    LIST,
    get,
    label,
    getCountryForUniversite,
    inferFromNewsItem,
    matchesFilter,
    matchesLibraryCountry,
    bookCountryCode,
    adminCountryCode,
    getStoredCountry,
    setStoredCountry,
    getPortalCountry,
    setPortalCountry,
    buildSelectOptions,
    buildInstitutionCountrySelect,
    buildPublisherOptions,
    countriesInRegion,
  };
})();

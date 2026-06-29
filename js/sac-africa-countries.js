/**
 * Pays africains — filtrage local (page publique, actualités, campus)
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
    north: "Afrique du Nord",
    south: "Afrique australe",
    indian: "Océan Indien",
  };

  const LIST = [
    { code: "DZ", name: "Algérie", flag: "🇩🇿", region: "north" },
    { code: "AO", name: "Angola", flag: "🇦🇴", region: "central" },
    { code: "BJ", name: "Bénin", flag: "🇧🇯", region: "west" },
    { code: "BW", name: "Botswana", flag: "🇧🇼", region: "south" },
    { code: "BF", name: "Burkina Faso", flag: "🇧🇫", region: "west" },
    { code: "BI", name: "Burundi", flag: "🇧🇮", region: "east" },
    { code: "CM", name: "Cameroun", flag: "🇨🇲", region: "central" },
    { code: "CV", name: "Cap-Vert", flag: "🇨🇻", region: "west" },
    { code: "CF", name: "Centrafrique", flag: "🇨🇫", region: "central" },
    { code: "TD", name: "Tchad", flag: "🇹🇩", region: "central" },
    { code: "KM", name: "Comores", flag: "🇰🇲", region: "indian" },
    { code: "CG", name: "Congo", flag: "🇨🇬", region: "central" },
    { code: "CD", name: "RD Congo", flag: "🇨🇩", region: "central" },
    { code: "CI", name: "Côte d'Ivoire", flag: "🇨🇮", region: "west" },
    { code: "DJ", name: "Djibouti", flag: "🇩🇯", region: "east" },
    { code: "EG", name: "Égypte", flag: "🇪🇬", region: "north" },
    { code: "GQ", name: "Guinée équatoriale", flag: "🇬🇶", region: "central" },
    { code: "ER", name: "Érythrée", flag: "🇪🇷", region: "east" },
    { code: "SZ", name: "Eswatini", flag: "🇸🇿", region: "south" },
    { code: "ET", name: "Éthiopie", flag: "🇪🇹", region: "east" },
    { code: "GA", name: "Gabon", flag: "🇬🇦", region: "central" },
    { code: "GM", name: "Gambie", flag: "🇬🇲", region: "west" },
    { code: "GH", name: "Ghana", flag: "🇬🇭", region: "west" },
    { code: "GN", name: "Guinée", flag: "🇬🇳", region: "west" },
    { code: "GW", name: "Guinée-Bissau", flag: "🇬🇼", region: "west" },
    { code: "KE", name: "Kenya", flag: "🇰🇪", region: "east" },
    { code: "LS", name: "Lesotho", flag: "🇱🇸", region: "south" },
    { code: "LR", name: "Liberia", flag: "🇱🇷", region: "west" },
    { code: "LY", name: "Libye", flag: "🇱🇾", region: "north" },
    { code: "MG", name: "Madagascar", flag: "🇲🇬", region: "indian" },
    { code: "MW", name: "Malawi", flag: "🇲🇼", region: "south" },
    { code: "ML", name: "Mali", flag: "🇲🇱", region: "west" },
    { code: "MR", name: "Mauritanie", flag: "🇲🇷", region: "west" },
    { code: "MU", name: "Maurice", flag: "🇲🇺", region: "indian" },
    { code: "MA", name: "Maroc", flag: "🇲🇦", region: "north" },
    { code: "MZ", name: "Mozambique", flag: "🇲🇿", region: "south" },
    { code: "NA", name: "Namibie", flag: "🇳🇦", region: "south" },
    { code: "NE", name: "Niger", flag: "🇳🇪", region: "west" },
    { code: "NG", name: "Nigeria", flag: "🇳🇬", region: "west" },
    { code: "RW", name: "Rwanda", flag: "🇷🇼", region: "east" },
    { code: "ST", name: "São Tomé-et-Príncipe", flag: "🇸🇹", region: "central" },
    { code: "SN", name: "Sénégal", flag: "🇸🇳", region: "west" },
    { code: "SC", name: "Seychelles", flag: "🇸🇨", region: "indian" },
    { code: "SL", name: "Sierra Leone", flag: "🇸🇱", region: "west" },
    { code: "SO", name: "Somalie", flag: "🇸🇴", region: "east" },
    { code: "ZA", name: "Afrique du Sud", flag: "🇿🇦", region: "south" },
    { code: "SS", name: "Soudan du Sud", flag: "🇸🇸", region: "east" },
    { code: "SD", name: "Soudan", flag: "🇸🇩", region: "north" },
    { code: "TZ", name: "Tanzanie", flag: "🇹🇿", region: "east" },
    { code: "TG", name: "Togo", flag: "🇹🇬", region: "west" },
    { code: "TN", name: "Tunisie", flag: "🇹🇳", region: "north" },
    { code: "UG", name: "Ouganda", flag: "🇺🇬", region: "east" },
    { code: "ZM", name: "Zambie", flag: "🇿🇲", region: "south" },
    { code: "ZW", name: "Zimbabwe", flag: "🇿🇼", region: "south" },
  ];

  const BY_CODE = Object.fromEntries(LIST.map((c) => [c.code, c]));

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
      return localStorage.getItem(STORAGE_KEY) || "CD";
    } catch {
      return "CD";
    }
  }

  function setStoredCountry(code) {
    try {
      localStorage.setItem(STORAGE_KEY, code);
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
        ">🌍 Toute l'Afrique</option>";
    }
    if (opts.includePanAfrica) {
      html +=
        '<option value="' +
        PAN +
        '"' +
        (sel === PAN ? " selected" : "") +
        ">🌐 Pan-africain (continent)</option>";
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
      return String(data[key] || data.default || getStoredCountry()).toUpperCase();
    } catch {
      return getStoredCountry();
    }
  }

  function setPortalCountry(portalId, code) {
    try {
      const raw = localStorage.getItem(PORTAL_STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : {};
      const key = portalId || "default";
      data[key] = String(code || "CD").toUpperCase();
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
      ">🌐 Pan-africain — visible sur « Toute l'Afrique »</option>";
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

/**
 * Indicatifs téléphoniques — pays africains (Evo-smartUni)
 */
const SAC_PHONE_COUNTRIES = (function () {
  const LIST = [
    { dial: "213", iso: "DZ", name: "Algérie", flag: "🇩🇿", localMin: 9, localMax: 9 },
    { dial: "244", iso: "AO", name: "Angola", flag: "🇦🇴", localMin: 9, localMax: 9 },
    { dial: "229", iso: "BJ", name: "Bénin", flag: "🇧🇯", localMin: 8, localMax: 10 },
    { dial: "267", iso: "BW", name: "Botswana", flag: "🇧🇼", localMin: 8, localMax: 8 },
    { dial: "226", iso: "BF", name: "Burkina Faso", flag: "🇧🇫", localMin: 8, localMax: 8 },
    { dial: "257", iso: "BI", name: "Burundi", flag: "🇧🇮", localMin: 8, localMax: 8 },
    { dial: "237", iso: "CM", name: "Cameroun", flag: "🇨🇲", localMin: 9, localMax: 9 },
    { dial: "238", iso: "CV", name: "Cap-Vert", flag: "🇨🇻", localMin: 7, localMax: 7 },
    { dial: "236", iso: "CF", name: "Centrafrique", flag: "🇨🇫", localMin: 8, localMax: 8 },
    { dial: "235", iso: "TD", name: "Tchad", flag: "🇹🇩", localMin: 8, localMax: 8 },
    { dial: "269", iso: "KM", name: "Comores", flag: "🇰🇲", localMin: 7, localMax: 7 },
    { dial: "242", iso: "CG", name: "Congo", flag: "🇨🇬", localMin: 9, localMax: 9 },
    {
      dial: "243",
      iso: "CD",
      name: "RD Congo",
      flag: "🇨🇩",
      localMin: 9,
      localMax: 9,
      localPattern: "^[89][0-9]{8}$",
      example: "085 184 8859",
    },
    { dial: "225", iso: "CI", name: "Côte d'Ivoire", flag: "🇨🇮", localMin: 10, localMax: 10 },
    { dial: "253", iso: "DJ", name: "Djibouti", flag: "🇩🇯", localMin: 8, localMax: 8 },
    { dial: "20", iso: "EG", name: "Égypte", flag: "🇪🇬", localMin: 10, localMax: 10 },
    { dial: "240", iso: "GQ", name: "Guinée équatoriale", flag: "🇬🇶", localMin: 9, localMax: 9 },
    { dial: "291", iso: "ER", name: "Érythrée", flag: "🇪🇷", localMin: 7, localMax: 7 },
    { dial: "268", iso: "SZ", name: "Eswatini", flag: "🇸🇿", localMin: 8, localMax: 8 },
    { dial: "251", iso: "ET", name: "Éthiopie", flag: "🇪🇹", localMin: 9, localMax: 9 },
    { dial: "241", iso: "GA", name: "Gabon", flag: "🇬🇦", localMin: 8, localMax: 8 },
    { dial: "220", iso: "GM", name: "Gambie", flag: "🇬🇲", localMin: 7, localMax: 7 },
    { dial: "233", iso: "GH", name: "Ghana", flag: "🇬🇭", localMin: 9, localMax: 9 },
    { dial: "224", iso: "GN", name: "Guinée", flag: "🇬🇳", localMin: 9, localMax: 9 },
    { dial: "245", iso: "GW", name: "Guinée-Bissau", flag: "🇬🇼", localMin: 7, localMax: 7 },
    { dial: "254", iso: "KE", name: "Kenya", flag: "🇰🇪", localMin: 9, localMax: 10, example: "712 345 678" },
    { dial: "266", iso: "LS", name: "Lesotho", flag: "🇱🇸", localMin: 8, localMax: 8 },
    { dial: "231", iso: "LR", name: "Liberia", flag: "🇱🇷", localMin: 8, localMax: 9 },
    { dial: "218", iso: "LY", name: "Libye", flag: "🇱🇾", localMin: 9, localMax: 10 },
    { dial: "261", iso: "MG", name: "Madagascar", flag: "🇲🇬", localMin: 9, localMax: 9 },
    { dial: "265", iso: "MW", name: "Malawi", flag: "🇲🇼", localMin: 9, localMax: 9 },
    { dial: "223", iso: "ML", name: "Mali", flag: "🇲🇱", localMin: 8, localMax: 8 },
    { dial: "222", iso: "MR", name: "Mauritanie", flag: "🇲🇷", localMin: 8, localMax: 8 },
    { dial: "230", iso: "MU", name: "Maurice", flag: "🇲🇺", localMin: 8, localMax: 8 },
    { dial: "212", iso: "MA", name: "Maroc", flag: "🇲🇦", localMin: 9, localMax: 9 },
    { dial: "258", iso: "MZ", name: "Mozambique", flag: "🇲🇿", localMin: 9, localMax: 9 },
    { dial: "264", iso: "NA", name: "Namibie", flag: "🇳🇦", localMin: 9, localMax: 9 },
    { dial: "227", iso: "NE", name: "Niger", flag: "🇳🇪", localMin: 8, localMax: 8 },
    { dial: "234", iso: "NG", name: "Nigeria", flag: "🇳🇬", localMin: 10, localMax: 10, example: "801 234 5678" },
    { dial: "250", iso: "RW", name: "Rwanda", flag: "🇷🇼", localMin: 9, localMax: 9 },
    { dial: "239", iso: "ST", name: "São Tomé", flag: "🇸🇹", localMin: 7, localMax: 7 },
    { dial: "221", iso: "SN", name: "Sénégal", flag: "🇸🇳", localMin: 9, localMax: 9 },
    { dial: "248", iso: "SC", name: "Seychelles", flag: "🇸🇨", localMin: 7, localMax: 7 },
    { dial: "232", iso: "SL", name: "Sierra Leone", flag: "🇸🇱", localMin: 8, localMax: 8 },
    { dial: "252", iso: "SO", name: "Somalie", flag: "🇸🇴", localMin: 8, localMax: 9 },
    { dial: "27", iso: "ZA", name: "Afrique du Sud", flag: "🇿🇦", localMin: 9, localMax: 9 },
    { dial: "211", iso: "SS", name: "Soudan du Sud", flag: "🇸🇸", localMin: 9, localMax: 9 },
    { dial: "249", iso: "SD", name: "Soudan", flag: "🇸🇩", localMin: 9, localMax: 9 },
    { dial: "255", iso: "TZ", name: "Tanzanie", flag: "🇹🇿", localMin: 9, localMax: 9 },
    { dial: "228", iso: "TG", name: "Togo", flag: "🇹🇬", localMin: 8, localMax: 8 },
    { dial: "216", iso: "TN", name: "Tunisie", flag: "🇹🇳", localMin: 8, localMax: 8 },
    { dial: "256", iso: "UG", name: "Ouganda", flag: "🇺🇬", localMin: 9, localMax: 9 },
    { dial: "260", iso: "ZM", name: "Zambie", flag: "🇿🇲", localMin: 9, localMax: 9 },
    { dial: "263", iso: "ZW", name: "Zimbabwe", flag: "🇿🇼", localMin: 9, localMax: 9 },
  ];

  const BY_DIAL = Object.fromEntries(LIST.map((c) => [c.dial, c]));
  const SORTED_BY_DIAL_LEN = [...LIST].sort((a, b) => b.dial.length - a.dial.length);
  const DEFAULT_DIAL = "243";

  function getByDial(dial) {
    return BY_DIAL[String(dial || DEFAULT_DIAL)] || BY_DIAL[DEFAULT_DIAL];
  }

  function exampleFor(country) {
    return country.example || "XXX XXX XXX";
  }

  function parsePhone(raw, preferredDial) {
    let d = String(raw || "").replace(/\D/g, "");
    if (!d) return null;
    if (d.startsWith("00")) d = d.slice(2);

    for (const c of SORTED_BY_DIAL_LEN) {
      if (d.startsWith(c.dial)) {
        const local = d.slice(c.dial.length);
        if (local.length >= c.localMin && local.length <= c.localMax) {
          return { dial: c.dial, local, country: c };
        }
      }
    }

    const pref = getByDial(preferredDial || DEFAULT_DIAL);
    let local = d;
    if (local.startsWith("0") && local.length > pref.localMin) local = local.slice(1);
    if (local.length >= pref.localMin && local.length <= pref.localMax) {
      return { dial: pref.dial, local, country: pref };
    }
    return null;
  }

  function normalizePhone(raw, preferredDial) {
    const p = parsePhone(raw, preferredDial);
    return p ? p.dial + p.local : "";
  }

  function validateLocal(local, country) {
    if (!local || local.length < country.localMin || local.length > country.localMax) {
      return false;
    }
    if (country.localPattern) {
      try {
        return new RegExp(country.localPattern).test(local);
      } catch {
        return false;
      }
    }
    if (!/^[1-9][0-9]+$/.test(local)) return false;
    if (/^(\d)\1{5,}$/.test(local)) return false;
    return true;
  }

  function validatePhone(raw, preferredDial) {
    const p = parsePhone(raw, preferredDial);
    if (!p) {
      const c = getByDial(preferredDial);
      return {
        ok: false,
        message:
          "Numéro invalide. Saisissez un mobile valide pour " +
          c.name +
          " (ex. " +
          exampleFor(c) +
          ").",
      };
    }
    if (!validateLocal(p.local, p.country)) {
      return {
        ok: false,
        message:
          "Numéro non reconnu pour " +
          p.country.name +
          ". Vérifiez l'indicatif +" +
          p.dial +
          " et le numéro local.",
      };
    }
    if (/^(\d)\1{7,}$/.test(p.local)) {
      return { ok: false, message: "Ce numéro ne semble pas réel." };
    }
    return {
      ok: true,
      value: p.dial + p.local,
      dial: p.dial,
      local: p.local,
      country: p.country,
      display: formatPhoneDisplay(p.dial + p.local),
    };
  }

  function formatPhoneDisplay(normalized) {
    const p = parsePhone(normalized);
    if (!p) return normalized ? "+" + String(normalized).replace(/\D/g, "") : "";
    const local = p.local;
    let formatted = local;
    if (local.length === 9) {
      formatted = local.slice(0, 3) + " " + local.slice(3, 6) + " " + local.slice(6);
    } else if (local.length === 10) {
      formatted = local.slice(0, 3) + " " + local.slice(3, 6) + " " + local.slice(6);
    } else if (local.length === 8) {
      formatted = local.slice(0, 2) + " " + local.slice(2, 5) + " " + local.slice(5);
    }
    return "+" + p.dial + " " + formatted;
  }

  function buildSelectOptions(selectedDial) {
    const sel = String(selectedDial || DEFAULT_DIAL);
    return LIST.map(
      (c) =>
        '<option value="' +
        c.dial +
        '"' +
        (c.dial === sel ? " selected" : "") +
        ">" +
        c.flag +
        " +" +
        c.dial +
        " " +
        c.name +
        "</option>"
    ).join("");
  }

  return {
    LIST,
    DEFAULT_DIAL,
    getByDial,
    exampleFor,
    parsePhone,
    normalizePhone,
    validatePhone,
    formatPhoneDisplay,
    buildSelectOptions,
  };
})();

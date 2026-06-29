/**
 * Indicatifs téléphoniques — 18 pays partenaires Evo-smartUni
 */
const SAC_PHONE_COUNTRIES = (function () {
  const LIST = [
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
    { dial: "242", iso: "CG", name: "Congo (Brazzaville)", flag: "🇨🇬", localMin: 9, localMax: 9 },
    { dial: "241", iso: "GA", name: "Gabon", flag: "🇬🇦", localMin: 8, localMax: 8 },
    { dial: "237", iso: "CM", name: "Cameroun", flag: "🇨🇲", localMin: 9, localMax: 9 },
    { dial: "235", iso: "TD", name: "Tchad", flag: "🇹🇩", localMin: 8, localMax: 8 },
    { dial: "236", iso: "CF", name: "Centrafrique", flag: "🇨🇫", localMin: 8, localMax: 8 },
    { dial: "240", iso: "GQ", name: "Guinée équatoriale", flag: "🇬🇶", localMin: 9, localMax: 9 },
    { dial: "239", iso: "ST", name: "São Tomé-et-Príncipe", flag: "🇸🇹", localMin: 7, localMax: 7 },
    { dial: "257", iso: "BI", name: "Burundi", flag: "🇧🇮", localMin: 8, localMax: 8 },
    { dial: "253", iso: "DJ", name: "Djibouti", flag: "🇩🇯", localMin: 8, localMax: 8 },
    { dial: "221", iso: "SN", name: "Sénégal", flag: "🇸🇳", localMin: 9, localMax: 9 },
    { dial: "225", iso: "CI", name: "Côte d'Ivoire", flag: "🇨🇮", localMin: 10, localMax: 10 },
    { dial: "229", iso: "BJ", name: "Bénin", flag: "🇧🇯", localMin: 8, localMax: 10 },
    { dial: "228", iso: "TG", name: "Togo", flag: "🇹🇬", localMin: 8, localMax: 8 },
    { dial: "226", iso: "BF", name: "Burkina Faso", flag: "🇧🇫", localMin: 8, localMax: 8 },
    { dial: "227", iso: "NE", name: "Niger", flag: "🇳🇪", localMin: 8, localMax: 8 },
    { dial: "223", iso: "ML", name: "Mali", flag: "🇲🇱", localMin: 8, localMax: 8 },
    { dial: "261", iso: "MG", name: "Madagascar", flag: "🇲🇬", localMin: 9, localMax: 9 },
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

  function parsePhone(raw, preferredDial) {
    const digits = String(raw || "").replace(/\D/g, "");
    if (!digits) return null;
    for (const c of SORTED_BY_DIAL_LEN) {
      if (digits.startsWith(c.dial)) {
        return { dial: c.dial, local: digits.slice(c.dial.length), country: c };
      }
    }
    const c = getByDial(preferredDial);
    return { dial: c.dial, local: digits, country: c };
  }

  function parseE164(raw) {
    return parsePhone(raw);
  }

  function normalizePhone(phone, preferredDial) {
    const parsed = parsePhone(phone, preferredDial);
    if (!parsed) return "";
    const local = String(parsed.local || "").replace(/\D/g, "");
    if (!local) return "";
    return parsed.dial + local;
  }

  function formatPhoneDisplay(normalized) {
    const parsed = parsePhone(normalized);
    if (!parsed) return "";
    const local = String(parsed.local || "").replace(/\D/g, "");
    const chunks = local.match(/.{1,3}/g) || [];
    return "+" + parsed.dial + (chunks.length ? " " + chunks.join(" ") : "");
  }

  function formatDisplay(parsed) {
    if (!parsed) return "";
    return formatPhoneDisplay(parsed.dial + String(parsed.local || "").replace(/\D/g, ""));
  }

  function validatePhone(phone, preferredDial) {
    const parsed = parsePhone(phone, preferredDial);
    if (!parsed || !parsed.local) {
      return {
        ok: false,
        message: "Numéro invalide. Choisissez l'indicatif pays, puis saisissez votre numéro mobile.",
      };
    }
    const check = validateLocal(parsed.country, parsed.local);
    if (!check.ok) return check;
    return { ok: true, value: normalizePhone(phone, preferredDial) };
  }

  function validateLocal(country, localDigits) {
    const len = String(localDigits || "").replace(/\D/g, "").length;
    if (!country) return { ok: false, message: "Indicatif pays requis." };
    if (len < country.localMin || len > country.localMax) {
      return {
        ok: false,
        message:
          "Numéro invalide pour " +
          country.name +
          " (" +
          country.localMin +
          "–" +
          country.localMax +
          " chiffres).",
      };
    }
    if (country.localPattern) {
      const re = new RegExp(country.localPattern);
      if (!re.test(String(localDigits || "").replace(/\D/g, ""))) {
        return { ok: false, message: "Format de numéro incorrect pour " + country.name + "." };
      }
    }
    return { ok: true };
  }

  return {
    LIST,
    DEFAULT_DIAL,
    getByDial,
    exampleFor,
    buildSelectOptions,
    parsePhone,
    parseE164,
    normalizePhone,
    formatPhoneDisplay,
    formatDisplay,
    validatePhone,
    validateLocal,
  };
})();

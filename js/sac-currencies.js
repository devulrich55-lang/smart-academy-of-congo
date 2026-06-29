/**
 * Devises africaines — conversion indicative depuis USD (tarifs Evo-smartUni)
 */
const SAC_CURRENCIES = (function () {
  const LIST = [
    { code: "USD", label: "Dollar américain", flag: "🌐", region: "International", decimals: 2, unit: "USD", fixedRate: 1 },
    { code: "CDF", label: "Franc congolais", flag: "🇨🇩", region: "Afrique centrale", decimals: 0, unit: "FC", dynamic: "cdf" },
    { code: "XAF", label: "Franc CFA (CEMAC)", flag: "🌍", region: "Afrique centrale", decimals: 0, unit: "FCFA", fixedRate: 600 },
    { code: "XOF", label: "Franc CFA (UEMOA)", flag: "🌍", region: "Afrique de l'Ouest", decimals: 0, unit: "FCFA", fixedRate: 600 },
    { code: "AOA", label: "Kwanza angolais", flag: "🇦🇴", region: "Afrique centrale", decimals: 2, unit: "Kz", fixedRate: 830 },
    { code: "KES", label: "Shilling kenyan", flag: "🇰🇪", region: "Afrique de l'Est", decimals: 0, unit: "KSh", fixedRate: 130 },
    { code: "UGX", label: "Shilling ougandais", flag: "🇺🇬", region: "Afrique de l'Est", decimals: 0, unit: "USh", fixedRate: 3700 },
    { code: "TZS", label: "Shilling tanzanien", flag: "🇹🇿", region: "Afrique de l'Est", decimals: 0, unit: "TSh", fixedRate: 2600 },
    { code: "RWF", label: "Franc rwandais", flag: "🇷🇼", region: "Afrique de l'Est", decimals: 0, unit: "FRw", fixedRate: 1300 },
    { code: "BIF", label: "Franc burundais", flag: "🇧🇮", region: "Afrique de l'Est", decimals: 0, unit: "FBu", fixedRate: 2900 },
    { code: "ZAR", label: "Rand sud-africain", flag: "🇿🇦", region: "Afrique australe", decimals: 2, unit: "R", fixedRate: 18.5 },
    { code: "MZN", label: "Metical mozambicain", flag: "🇲🇿", region: "Afrique australe", decimals: 2, unit: "MT", fixedRate: 64 },
    { code: "ZMW", label: "Kwacha zambien", flag: "🇿🇲", region: "Afrique australe", decimals: 2, unit: "ZK", fixedRate: 27 },
    { code: "GHS", label: "Cedi ghanéen", flag: "🇬🇭", region: "Afrique de l'Ouest", decimals: 2, unit: "GH₵", fixedRate: 15 },
    { code: "NGN", label: "Naira nigérian", flag: "🇳🇬", region: "Afrique de l'Ouest", decimals: 0, unit: "₦", fixedRate: 1550 },
    { code: "MGA", label: "Ariary malgache", flag: "🇲🇬", region: "Océan Indien", decimals: 0, unit: "Ar", fixedRate: 4500 },
    { code: "EGP", label: "Livre égyptienne", flag: "🇪🇬", region: "Afrique du Nord", decimals: 2, unit: "E£", fixedRate: 48 },
    { code: "MAD", label: "Dirham marocain", flag: "🇲🇦", region: "Afrique du Nord", decimals: 2, unit: "DH", fixedRate: 10 },
    { code: "TND", label: "Dinar tunisien", flag: "🇹🇳", region: "Afrique du Nord", decimals: 3, unit: "DT", fixedRate: 3.1 },
    { code: "DZD", label: "Dinar algérien", flag: "🇩🇿", region: "Afrique du Nord", decimals: 2, unit: "DA", fixedRate: 134 },
  ];

  function get(code) {
    return LIST.find((c) => c.code === code) || LIST[0];
  }

  function getRate(code) {
    const c = get(code);
    if (c.code === "USD") return 1;
    if (c.dynamic === "cdf" && typeof SAC_TARIFFS !== "undefined") {
      return SAC_TARIFFS.getCdfPerUsd();
    }
    return Number(c.fixedRate) > 0 ? Number(c.fixedRate) : 1;
  }

  function convertFromUsd(usd, code) {
    const c = get(code);
    const raw = Number(usd) * getRate(code);
    if (c.decimals === 0) return Math.round(raw);
    const factor = Math.pow(10, c.decimals);
    return Math.round(raw * factor) / factor;
  }

  function formatNumber(amount, code) {
    const c = get(code);
    const n = Number(amount);
    if (!Number.isFinite(n)) return "—";
    if (c.decimals === 0) return Math.round(n).toLocaleString("fr-FR");
    return n
      .toFixed(c.decimals)
      .replace(".", ",")
      .replace(/,0+$/, "")
      .replace(/,(\d*?)0+$/, ",$1");
  }

  function format(amount, code) {
    const c = get(code);
    const num = formatNumber(amount, code);
    if (code === "USD") return num + " USD";
    return num + " " + c.unit;
  }

  function formatWithCode(amount, code) {
    return format(amount, code) + " (" + code + ")";
  }

  function buildSelectOptions(selected) {
    const regions = {};
    LIST.forEach((c) => {
      if (!regions[c.region]) regions[c.region] = [];
      regions[c.region].push(c);
    });
    let html = "";
    Object.keys(regions).forEach((region) => {
      html += '<optgroup label="' + region + '">';
      regions[region].forEach((c) => {
        html +=
          '<option value="' +
          c.code +
          '"' +
          (c.code === selected ? " selected" : "") +
          ">" +
          c.flag +
          " " +
          c.code +
          " — " +
          c.label +
          "</option>";
      });
      html += "</optgroup>";
    });
    return html;
  }

  function mobileMoneyAvailable(code) {
    return code === "CDF";
  }

  return {
    LIST,
    get,
    getRate,
    convertFromUsd,
    format,
    formatWithCode,
    buildSelectOptions,
    mobileMoneyAvailable,
  };
})();

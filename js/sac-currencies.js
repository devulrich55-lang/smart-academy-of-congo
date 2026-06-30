/**
 * Devises africaines — conversion indicative depuis USD (tarifs Evo-smartUni)
 */
const SAC_CURRENCIES = (function () {
  const LIST = [
    { code: "USD", label: "Dollar américain", flag: "🌐", region: "International", decimals: 2, unit: "USD", fixedRate: 1 },
    { code: "CDF", label: "Franc congolais", flag: "🇨🇩", region: "RD Congo", decimals: 0, unit: "FC", dynamic: "cdf" },
    { code: "XAF", label: "Franc CFA (CEMAC)", flag: "🌍", region: "Afrique centrale", decimals: 0, unit: "FCFA", fixedRate: 600 },
    { code: "XOF", label: "Franc CFA (UEMOA)", flag: "🌍", region: "Afrique de l'Ouest", decimals: 0, unit: "FCFA", fixedRate: 600 },
    { code: "BIF", label: "Franc burundais", flag: "🇧🇮", region: "Burundi", decimals: 0, unit: "FBu", fixedRate: 2900 },
    { code: "DJF", label: "Franc djiboutien", flag: "🇩🇯", region: "Djibouti", decimals: 0, unit: "Fdj", fixedRate: 178 },
    { code: "MGA", label: "Ariary malgache", flag: "🇲🇬", region: "Madagascar", decimals: 0, unit: "Ar", fixedRate: 4500 },
  ];

  function get(code) {
    return LIST.find((c) => c.code === code) || LIST[0];
  }

  function getRate(code) {
    const c = get(code);
    if (c.code === "USD") return 1;
    if (c.dynamic === "cdf" && typeof SAC_TARIFFS !== "undefined") {
      if (typeof SAC_TARIFFS.getCdfPerUsd === "function") {
        return SAC_TARIFFS.getCdfPerUsd();
      }
      const rate = SAC_TARIFFS.CDF_PER_USD;
      return Number.isFinite(rate) && rate > 0 ? rate : 2300;
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

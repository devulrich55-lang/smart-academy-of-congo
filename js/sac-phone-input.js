/**
 * Champ téléphone avec liste déroulante d'indicatif pays africain
 */
const SAC_PHONE_INPUT = (function () {
  const ENHANCED = "data-sac-phone-enhanced";

  function resolveInput(inputOrId) {
    if (!inputOrId) return null;
    if (typeof inputOrId === "string") return document.getElementById(inputOrId);
    return inputOrId;
  }

  function getDialSelect(input) {
    const row = input?.closest?.(".sac-phone-row");
    return row ? row.querySelector(".sac-phone-dial") : null;
  }

  function getDialCode(input) {
    const sel = getDialSelect(input);
    return sel?.value || SAC_PHONE_COUNTRIES.DEFAULT_DIAL;
  }

  function getValue(inputOrId) {
    const input = resolveInput(inputOrId);
    if (!input) return "";
    const local = String(input.value || "").trim();
    if (!local) return "";
    if (typeof SAC_PHONE_COUNTRIES === "undefined") return local.replace(/\D/g, "");
    return SAC_PHONE_COUNTRIES.normalizePhone(local, getDialCode(input));
  }

  function setValue(inputOrId, fullPhone) {
    const input = resolveInput(inputOrId);
    if (!input || !fullPhone) return;
    const dialSel = getDialSelect(input);
    if (typeof SAC_PHONE_COUNTRIES === "undefined" || !dialSel) {
      input.value = fullPhone;
      return;
    }
    const parsed = SAC_PHONE_COUNTRIES.parsePhone(fullPhone);
    if (!parsed) {
      input.value = String(fullPhone).replace(/\D/g, "");
      return;
    }
    dialSel.value = parsed.dial;
    input.value = parsed.local;
    updatePlaceholder(input, parsed.country);
  }

  function updatePlaceholder(input, country) {
    if (!country || input.getAttribute("data-sac-phone-placeholder") === "off") return;
    const ex = SAC_PHONE_COUNTRIES.exampleFor(country);
    input.placeholder = "Ex. " + ex;
  }

  function onDialChange(input, dialSel) {
    const country = SAC_PHONE_COUNTRIES.getByDial(dialSel.value);
    updatePlaceholder(input, country);
    input.dispatchEvent(new CustomEvent("sac-phone-dial-change", { bubbles: true, detail: { dial: dialSel.value } }));
  }

  function enhance(inputOrId, options) {
    const input = resolveInput(inputOrId);
    if (!input || input.getAttribute(ENHANCED) === "1") return input;
    if (input.getAttribute("data-sac-phone") === "off") return input;
    if (typeof SAC_PHONE_COUNTRIES === "undefined") return input;

    const opts = options || {};
    const defaultDial = opts.defaultDial || SAC_PHONE_COUNTRIES.DEFAULT_DIAL;
    const row = document.createElement("div");
    row.className = "sac-phone-row";

    const dialSel = document.createElement("select");
    dialSel.className = "sac-phone-dial form-input fi";
    dialSel.setAttribute("aria-label", "Indicatif pays");
    dialSel.innerHTML = SAC_PHONE_COUNTRIES.buildSelectOptions(defaultDial);

    const existing = input.value.trim();
    if (existing) {
      const parsed = SAC_PHONE_COUNTRIES.parsePhone(existing);
      if (parsed) {
        dialSel.value = parsed.dial;
        input.value = parsed.local;
      }
    }

    input.classList.add("sac-phone-local");
    input.parentNode.insertBefore(row, input);
    row.appendChild(dialSel);
    row.appendChild(input);
    input.setAttribute(ENHANCED, "1");

    dialSel.addEventListener("change", () => onDialChange(input, dialSel));
    onDialChange(input, dialSel);

    if (opts.fullWidth !== false) {
      const grp = row.closest(".form-group, .fg");
      if (grp) grp.classList.add("sac-phone-group");
    }
    return input;
  }

  function enhanceAll(selector) {
    const sel = selector || 'input[type="tel"]:not([data-sac-phone="off"])';
    document.querySelectorAll(sel).forEach((el) => enhance(el));
  }

  function init() {
    if (typeof SAC_PHONE_COUNTRIES === "undefined") return;
    enhanceAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    enhance,
    enhanceAll,
    init,
    getValue,
    setValue,
    getDialCode,
  };
})();

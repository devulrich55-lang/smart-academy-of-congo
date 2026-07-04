/**
 * Remplace le select natif Android (plein écran) par une sheet compacte style iOS.
 */
const SAC_NATIVE_PICKER = (function () {
  "use strict";

  var ENHANCED = "sac-picker-enhanced";
  var overlayEl = null;
  var activeSelect = null;

  function shouldEnhance() {
    if (document.documentElement.dataset.sacPickerOff === "1") return false;
    return (
      window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(max-width: 768px)").matches
    );
  }

  function selectedLabel(select) {
    var opt = select.options[select.selectedIndex];
    if (!opt || !opt.value) {
      return select.dataset.emptyLabel || opt?.textContent?.trim() || "— Choisir —";
    }
    return opt.textContent.trim();
  }

  function syncTrigger(select) {
    var wrap = select.closest(".sac-picker-wrap");
    if (!wrap) return;
    var btn = wrap.querySelector(".sac-picker-trigger");
    var label = wrap.querySelector(".sac-picker-trigger__label");
    if (!btn || !label) return;
    var opt = select.options[select.selectedIndex];
    var empty = !opt || !opt.value;
    label.textContent = selectedLabel(select);
    label.classList.toggle("is-placeholder", empty);
    btn.disabled = select.disabled;
  }

  function closeOverlay() {
    if (overlayEl) overlayEl.hidden = true;
    activeSelect = null;
    document.body.style.overflow = "";
  }

  function ensureOverlay() {
    if (overlayEl) return overlayEl;
    overlayEl = document.createElement("div");
    overlayEl.className = "sac-picker-overlay";
    overlayEl.hidden = true;
    overlayEl.innerHTML =
      '<div class="sac-picker-sheet" role="dialog" aria-modal="true">' +
      '<div class="sac-picker-sheet__header"></div>' +
      '<div class="sac-picker-sheet__body"></div>' +
      "</div>";
    overlayEl.addEventListener("click", function (e) {
      if (e.target === overlayEl) closeOverlay();
    });
    document.body.appendChild(overlayEl);
    return overlayEl;
  }

  function buildOptionsBody(select) {
    var body = document.createDocumentFragment();
    var currentGroup = null;
    var groupEl = null;

    function flushGroup() {
      if (groupEl) body.appendChild(groupEl);
      groupEl = null;
      currentGroup = null;
    }

    Array.from(select.options).forEach(function (opt) {
      if (opt.parentElement && opt.parentElement.tagName === "OPTGROUP") {
        var gLabel = opt.parentElement.label;
        if (gLabel !== currentGroup) {
          flushGroup();
          currentGroup = gLabel;
          groupEl = document.createElement("div");
          groupEl.className = "sac-picker-group";
          var gl = document.createElement("div");
          gl.className = "sac-picker-group__label";
          gl.textContent = gLabel;
          groupEl.appendChild(gl);
        }
      } else if (currentGroup) {
        flushGroup();
      }

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sac-picker-option" + (opt.selected ? " is-selected" : "");
      btn.dataset.value = opt.value;
      btn.innerHTML =
        '<span class="sac-picker-option__text">' +
        (opt.textContent || "").trim() +
        '</span><span class="sac-picker-option__check" aria-hidden="true">✓</span>';
      if (opt.disabled || !opt.value) {
        btn.disabled = !!opt.disabled;
        if (!opt.value) btn.classList.add("sac-picker-option--empty");
      }
      btn.addEventListener("click", function () {
        if (!opt.value || opt.disabled) return;
        select.value = opt.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        syncTrigger(select);
        closeOverlay();
      });

      if (groupEl) groupEl.appendChild(btn);
      else body.appendChild(btn);
    });
    flushGroup();
    return body;
  }

  function openPicker(select) {
    if (select.disabled) return;
    var overlay = ensureOverlay();
    var header = overlay.querySelector(".sac-picker-sheet__header");
    var body = overlay.querySelector(".sac-picker-sheet__body");
    var title =
      select.dataset.pickerTitle ||
      select.dataset.emptyLabel ||
      select.getAttribute("aria-label") ||
      "— Choisir —";
    header.textContent = title;
    body.innerHTML = "";
    body.appendChild(buildOptionsBody(select));
    overlay.hidden = false;
    activeSelect = select;
    document.body.style.overflow = "hidden";
    var first = body.querySelector(".sac-picker-option.is-selected") || body.querySelector(".sac-picker-option:not([disabled])");
    if (first && first.scrollIntoView) first.scrollIntoView({ block: "nearest" });
  }

  function enhanceSelect(select) {
    if (!select || select.tagName !== "SELECT") return;
    if (select.classList.contains(ENHANCED)) {
      syncTrigger(select);
      return;
    }
    if (!shouldEnhance()) return;

    select.classList.add(ENHANCED);
    var wrap = document.createElement("div");
    wrap.className = "sac-picker-wrap";
    if (select.dataset.sacPickerForce === "true") wrap.classList.add("sac-picker-wrap--force");
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.classList.add("sac-picker-native");

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sac-picker-trigger";
    btn.innerHTML =
      '<span class="sac-picker-trigger__label"></span><span class="sac-picker-trigger__chev" aria-hidden="true">▾</span>';
    btn.addEventListener("click", function () {
      openPicker(select);
    });
    wrap.insertBefore(btn, select);

    select.addEventListener("change", function () {
      syncTrigger(select);
    });

    var obs = new MutationObserver(function () {
      syncTrigger(select);
    });
    obs.observe(select, {
      childList: true,
      attributes: true,
      attributeFilter: ["disabled"],
    });

    syncTrigger(select);
  }

  function enhanceAll(root, selector) {
    var sel = selector || "select[data-sac-universities], select[data-sac-native-picker]";
    (root || document).querySelectorAll(sel).forEach(enhanceSelect);
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && overlayEl && !overlayEl.hidden) closeOverlay();
  });

  return {
    shouldEnhance: shouldEnhance,
    enhanceSelect: enhanceSelect,
    enhanceAll: enhanceAll,
    syncTrigger: syncTrigger,
  };
})();

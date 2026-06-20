/**
 * Logos d'établissement — import Super Admin, profils campus & relevés de notes
 */
const SAC_UNIVERSITY_LOGO = (function () {
  const INDEX_KEY = "sac_university_logos";
  const MAX_BYTES = 2 * 1024 * 1024;
  const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
  const FALLBACK = "logos.svg";

  function normCode(code) {
    return String(code || "")
      .trim()
      .toLowerCase();
  }

  function readIndex() {
    try {
      return JSON.parse(localStorage.getItem(INDEX_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function writeIndex(index) {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index || {}));
  }

  function collectKeys(record) {
    if (!record) return [];
    return [record.universite, record.sigle, record.codeUni]
      .filter(Boolean)
      .map(normCode);
  }

  function findUniversityAccount(universiteCode) {
    if (!universiteCode) return null;
    const code = normCode(universiteCode);
    let users = [];
    try {
      users = JSON.parse(localStorage.getItem("sac_users") || "[]");
    } catch {
      return null;
    }
    return (
      users.find((u) => {
        if (u.role !== "universite") return false;
        return collectKeys(u).includes(code);
      }) || null
    );
  }

  function resolveUniversiteCode(sessionOrUser) {
    if (!sessionOrUser) return null;
    if (sessionOrUser.role === "universite") {
      return (
        sessionOrUser.universite ||
        sessionOrUser.sigle ||
        sessionOrUser.codeUni ||
        null
      );
    }
    return sessionOrUser.universite || sessionOrUser.universiteLocked || null;
  }

  function getLogoUrl(universiteCode) {
    const code = normCode(universiteCode);
    if (!code) return null;

    const index = readIndex();
    if (index[code]?.logoUrl) return index[code].logoUrl;

    const uni = findUniversityAccount(code);
    if (uni?.logoUrl) return uni.logoUrl;

    return null;
  }

  function registerForUniversity(record) {
    const logoUrl = record?.logoUrl;
    if (!logoUrl) return null;

    const keys = collectKeys(record);
    if (!keys.length) return null;

    const index = readIndex();
    const entry = {
      logoUrl,
      nomUniversite: record.nomUniversite || record.displayName || "",
      updatedAt: new Date().toISOString(),
    };
    keys.forEach((k) => {
      index[k] = { ...entry, key: k };
    });
    writeIndex(index);

    try {
      const users = JSON.parse(localStorage.getItem("sac_users") || "[]");
      let changed = false;
      users.forEach((u) => {
        if (u.role !== "universite") return;
        if (!collectKeys(u).some((k) => keys.includes(k))) return;
        u.logoUrl = logoUrl;
        changed = true;
      });
      if (changed) localStorage.setItem("sac_users", JSON.stringify(users));
    } catch {
      /* ignore */
    }

    return logoUrl;
  }

  function validateFile(file) {
    if (!file) return { ok: false, message: "Sélectionnez le logo de l'université." };
    if (!ACCEPT.includes(file.type)) {
      return { ok: false, message: "Format accepté : PNG, JPG, WebP ou SVG." };
    }
    if (file.size > MAX_BYTES) {
      return { ok: false, message: "Logo trop volumineux (max. 2 Mo)." };
    }
    return { ok: true };
  }

  function fileToDataUrl(file) {
    const check = validateFile(file);
    if (!check.ok) return Promise.reject(new Error(check.message));
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
      reader.readAsDataURL(file);
    });
  }

  function applyToImg(img, universiteCode, alt) {
    if (!img) return;
    const logoUrl = getLogoUrl(universiteCode);
    if (logoUrl) {
      img.src = logoUrl;
      if (alt) img.alt = alt;
      img.dataset.uniLogoApplied = "1";
    } else if (!img.dataset.uniLogoApplied) {
      img.src = img.getAttribute("data-uni-logo-fallback") || img.dataset.uniLogoFallback || FALLBACK;
    }
  }

  function applyToProfile(session, selector) {
    const code = resolveUniversiteCode(session);
    const directLogo = session?.logoUrl || null;
    if (directLogo) registerForUniversity(session);
    const sel = selector || "[data-uni-profile-logo]";
    document.querySelectorAll(sel).forEach((img) => {
      const alt =
        session?.nomUniversite ||
        (typeof SAC_UNIVERSITIES !== "undefined"
          ? SAC_UNIVERSITIES.NAMES[code] || code
          : code) ||
        "Logo établissement";
      if (directLogo) {
        img.src = directLogo;
        if (alt) img.alt = alt;
        img.dataset.uniLogoApplied = "1";
      } else {
        applyToImg(img, code, alt);
      }
    });
  }

  function buildHeaderLogoHtml(universiteCode, escFn) {
    const logoUrl = getLogoUrl(universiteCode);
    if (!logoUrl) return "";
    const esc = escFn || ((s) => String(s || ""));
    return `<img src="${esc(logoUrl)}" class="releve-header__logo" alt="Logo établissement" width="72" height="72" />`;
  }

  function bindPreviewInput(input, previewEl) {
    if (!input || !previewEl) return;
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) {
        previewEl.innerHTML = "";
        previewEl.hidden = true;
        return;
      }
      try {
        const dataUrl = await fileToDataUrl(file);
        previewEl.hidden = false;
        previewEl.innerHTML = `<img src="${dataUrl}" alt="Aperçu logo" class="ws-logo-preview__img" />`;
      } catch (err) {
        previewEl.hidden = false;
        previewEl.innerHTML = `<p class="ws-logo-preview__err">${err.message || "Fichier invalide."}</p>`;
        input.value = "";
      }
    });
  }

  return {
    INDEX_KEY,
    FALLBACK,
    validateFile,
    fileToDataUrl,
    getLogoUrl,
    registerForUniversity,
    resolveUniversiteCode,
    applyToProfile,
    applyToImg,
    buildHeaderLogoHtml,
    bindPreviewInput,
  };
})();

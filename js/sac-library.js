/**
 * Bibliothèque numérique — publication Ministère + consultation publique
 */
const SAC_LIBRARY = (function () {
  const STORAGE_KEY = "sac_digital_library_cache";

  const CATEGORY_GROUPS = [
    {
      label: "Éducation & pédagogie",
      items: [
        { id: "education", label: "Éducation générale" },
        { id: "pedagogie", label: "Pédagogie" },
        { id: "manuel", label: "Manuels scolaires" },
        { id: "programme", label: "Programmes officiels" },
        { id: "examen", label: "Annales & examens" },
        { id: "methodes", label: "Méthodes & recherche" },
        { id: "memoire", label: "Mémoires & thèses" },
      ],
    },
    {
      label: "Sciences & techniques",
      items: [
        { id: "mathematiques", label: "Mathématiques" },
        { id: "physique", label: "Physique" },
        { id: "chimie", label: "Chimie" },
        { id: "biologie", label: "Biologie & SVT" },
        { id: "sciences", label: "Sciences générales" },
        { id: "informatique", label: "Informatique & numérique" },
        { id: "ingenierie", label: "Ingénierie & technologie" },
        { id: "medecine", label: "Médecine & pharmacie" },
        { id: "sante", label: "Santé publique" },
        { id: "agriculture", label: "Agriculture & agronomie" },
        { id: "environnement", label: "Environnement & écologie" },
      ],
    },
    {
      label: "Sciences humaines & sociales",
      items: [
        { id: "histoire", label: "Histoire" },
        { id: "geographie", label: "Géographie" },
        { id: "philosophie", label: "Philosophie" },
        { id: "droit", label: "Droit" },
        { id: "economie", label: "Économie" },
        { id: "gestion", label: "Gestion & comptabilité" },
        { id: "politique", label: "Sciences politiques" },
        { id: "sociologie", label: "Sociologie & anthropologie" },
        { id: "psychologie", label: "Psychologie" },
      ],
    },
    {
      label: "Lettres, arts & culture",
      items: [
        { id: "roman", label: "Romans & nouvelles" },
        { id: "litterature", label: "Littérature" },
        { id: "poesie", label: "Poésie" },
        { id: "theatre", label: "Théâtre" },
        { id: "langues", label: "Langues & linguistique" },
        { id: "arts", label: "Arts & beaux-arts" },
        { id: "musique", label: "Musique" },
        { id: "religion", label: "Religion & théologie" },
        { id: "enfants", label: "Jeunesse & lecture enfants" },
      ],
    },
    {
      label: "Références & divers",
      items: [
        { id: "dictionnaire", label: "Dictionnaires & encyclopédies" },
        { id: "culture", label: "Culture & patrimoine" },
        { id: "developpement", label: "Développement & coopération" },
        { id: "autre", label: "Autre" },
      ],
    },
  ];

  const CATEGORIES = CATEGORY_GROUPS.flatMap((g) => g.items);

  function categoriesSelectHtml() {
    return CATEGORY_GROUPS.map(
      (g) =>
        '<optgroup label="' +
        esc(g.label) +
        '">' +
        g.items.map((c) => '<option value="' + c.id + '">' + esc(c.label) + "</option>").join("") +
        "</optgroup>"
    ).join("");
  }

  function esc(s) {
    const el = document.createElement("div");
    el.textContent = String(s || "");
    return el.innerHTML;
  }

  function categoryLabel(id) {
    return CATEGORIES.find((c) => c.id === id)?.label || id || "Document";
  }

  function cacheItems(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items || []));
    } catch {
      /* ignore */
    }
  }

  function removeCachedBook(bookId) {
    const id = String(bookId || "").trim();
    if (!id) return;
    cacheItems(readCache().filter((x) => String(x?.id || "") !== id));
  }

  function isCatalogBookDeleted(item) {
    if (!item?.id) return false;
    if (
      typeof SAC_EDB !== "undefined" &&
      SAC_EDB.isBookDeleted &&
      SAC_EDB.isBookDeleted(item.id)
    ) {
      return true;
    }
    return false;
  }

  function filterCatalogBooks(items) {
    return (items || []).filter((item) => item && !isCatalogBookDeleted(item));
  }

  function readCache() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function absUrl(url) {
    if (!url) return "";
    const s = String(url).trim();
    if (/^(https?:|data:|blob:)/i.test(s)) return s;
    if (s.startsWith("//")) return "https:" + s;
    if (typeof SAC_API !== "undefined" && SAC_API.getBase) {
      const base = SAC_API.getBase();
      if (base) return base.replace(/\/$/, "") + (s.startsWith("/") ? s : "/" + s);
    }
    return s;
  }

  function previewUrl(url) {
    const s = String(url || "").trim();
    if (/^(data:|blob:)/i.test(s)) return s;
    return absUrl(s);
  }

  /** Réponse upload API — champs variables selon version backend (fileUrl, mediaUrl, url…). */
  function extractUploadUrl(data) {
    if (!data || typeof data !== "object") return "";
    const direct =
      data.fileUrl ||
      data.file_url ||
      data.url ||
      data.mediaUrl ||
      data.media_url ||
      data.coverUrl ||
      data.cover_url ||
      "";
    if (direct) return String(direct).trim();
    const nested = data.item || data.file || data.document;
    if (nested) return extractUploadUrl(nested);
    const list = data.files || data.items || data.attachments;
    if (Array.isArray(list) && list.length) return extractUploadUrl(list[0]);
    return "";
  }

  function buildBookPayload(raw) {
    const fileUrl = String(raw.fileUrl || "").trim();
    const coverUrl = String(raw.coverUrl || "").trim();
    const isFree = !!raw.isFree;
    const countryCode = String(raw.countryCode || "CD").toUpperCase();
    return {
      ...raw,
      fileUrl,
      coverUrl,
      countryCode,
      file_url: fileUrl,
      cover_url: coverUrl,
      country_code: countryCode,
      is_free: isFree,
      free: isFree,
      scope: "national",
      authorRole: "ministere",
      accessType: isFree ? "free" : "paid",
      access: isFree ? "free" : "paid",
      published: raw.published !== false,
      originalPrice: Number(raw.originalPrice) > 0 ? Number(raw.originalPrice) : undefined,
      original_price: Number(raw.originalPrice) > 0 ? Number(raw.originalPrice) : undefined,
    };
  }

  async function ensureLibraryAuth() {
    if (typeof SAC_API === "undefined") return;
    await SAC_API.ensureOnline(true);
    if (SAC_API.ensureApiSession) {
      const ok = await SAC_API.ensureApiSession();
      if (!ok && SAC_API.hasAuthTokens && !SAC_API.hasAuthTokens()) {
        throw new Error("Session expirée — reconnectez-vous via le portail Ministère.");
      }
    }
  }

  function isUploadAccessError(err) {
    const status = err?.status;
    const msg = String(err?.message || "").toLowerCase();
    return (
      status === 401 ||
      status === 403 ||
      status === 404 ||
      status === 405 ||
      /accès refusé|non autorisé|forbidden|auth_required|connexion requise/i.test(msg)
    );
  }

  const PURCHASES_KEY = "sac_library_purchases";
  const DEFAULT_BOOK_PRICE = 5;
  const DEFAULT_BOOK_CURRENCY = "USD";

  function normOwnerKey(session) {
    const email = session?.identifiant || session?.email || "";
    return email ? String(email).trim().toLowerCase() : "__guest__";
  }

  function isBookFree(item) {
    if (!item) return false;
    if (item.isFree === true || item.free === true || item.is_free === true) return true;
    const access = String(item.accessType || item.access || "").toLowerCase();
    return access === "free" || access === "gratuit";
  }

  function bookPrice(item) {
    if (isBookFree(item)) return 0;
    const price = Number(item.price ?? item.purchase_price);
    return price > 0 ? price : DEFAULT_BOOK_PRICE;
  }

  function bookCurrency(item) {
    return String(item.currency || DEFAULT_BOOK_CURRENCY).toUpperCase();
  }

  function formatBookPrice(item) {
    if (isBookFree(item)) return "Gratuit";
    return formatPriceAmount(bookPrice(item), bookCurrency(item)) + " " + bookCurrency(item);
  }

  function formatPriceAmount(amount, currency) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return "0";
    return n.toLocaleString("fr-FR", {
      minimumFractionDigits: currency === "CDF" ? 2 : 2,
      maximumFractionDigits: currency === "CDF" ? 2 : 2,
    });
  }

  function bookOriginalPrice(item) {
    if (isBookFree(item)) return 0;
    const orig = Number(item.originalPrice ?? item.compareAtPrice ?? item.original_price);
    const current = bookPrice(item);
    return orig > current ? orig : 0;
  }

  function bookDiscountPercent(item) {
    const orig = bookOriginalPrice(item);
    const current = bookPrice(item);
    if (!orig || orig <= current) return 0;
    return Math.round((1 - current / orig) * 100);
  }

  function isPublishedBook(item) {
    return !!item && item.published !== false;
  }

  function readPurchasesMap() {
    try {
      return JSON.parse(localStorage.getItem(PURCHASES_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function getPurchasedBookIds(session) {
    const map = readPurchasesMap();
    const ids = map[normOwnerKey(session)];
    return Array.isArray(ids) ? ids : [];
  }

  function isBookPurchased(bookId, session) {
    if (!bookId) return false;
    return getPurchasedBookIds(session).includes(bookId);
  }

  function hasBookAccess(item, session) {
    if (!item) return false;
    if (
      item.source === "evodigitalbooks" &&
      typeof SAC_EDB !== "undefined" &&
      SAC_EDB.hasAccess
    ) {
      return SAC_EDB.hasAccess(item, session);
    }
    if (isBookFree(item)) return true;
    return isBookPurchased(item.id, session);
  }

  function recordBookPurchase(bookId, session) {
    if (!bookId) return;
    const map = readPurchasesMap();
    const key = normOwnerKey(session);
    const list = Array.isArray(map[key]) ? map[key].slice() : [];
    if (!list.includes(bookId)) list.push(bookId);
    map[key] = list;
    localStorage.setItem(PURCHASES_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent("sac-library-purchase", { detail: { bookId } }));
  }

  function bookFileUrl(item) {
    return absUrl(item?.fileUrl || item?.file_url || "");
  }

  function openBookFile(item, session) {
    const url = bookFileUrl(item);
    if (
      item?.source === "evodigitalbooks" &&
      typeof SAC_EDB !== "undefined" &&
      SAC_EDB.openBook
    ) {
      SAC_EDB.openBook(item, session);
      return;
    }
    if (!url) {
      alert("Fichier indisponible pour ce livre.");
      return;
    }
    if (!hasBookAccess(item, session)) {
      openBookPurchaseDialog(item, session);
      return;
    }
    window.open(url, "_blank", "noopener");
  }

  function ensurePurchaseModal() {
    let modal = document.getElementById("libPurchaseModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "libPurchaseModal";
    modal.className = "lib-purchase-modal";
    modal.hidden = true;
    modal.innerHTML =
      '<div class="lib-purchase-modal__backdrop" data-lib-purchase-close></div>' +
      '<div class="lib-purchase-modal__panel" role="dialog" aria-modal="true" aria-labelledby="libPurchaseTitle">' +
      '<button type="button" class="lib-purchase-modal__close" data-lib-purchase-close aria-label="Fermer">×</button>' +
      '<h3 id="libPurchaseTitle">Acheter ce livre</h3>' +
      '<p class="lib-purchase-modal__book" id="libPurchaseBook"></p>' +
      '<p class="lib-purchase-modal__price" id="libPurchasePrice"></p>' +
      '<p class="lib-purchase-modal__hint">Les ouvrages sont en vente par défaut. Seuls les livres publiés en accès gratuit sont téléchargeables sans paiement.</p>' +
      '<div class="lib-purchase-modal__methods">' +
      '<label>Mode de paiement</label>' +
      '<div class="lib-purchase-modal__tabs">' +
      '<button type="button" class="lib-purchase-tab lib-purchase-tab--active" data-lib-pay-method="orange">🟠 Orange Money</button>' +
      '<button type="button" class="lib-purchase-tab" data-lib-pay-method="mpesa">📱 M-Pesa</button>' +
      "</div></div>" +
      '<label class="lib-purchase-field">Téléphone (Mobile Money)<input type="tel" id="libPurchasePhone" placeholder="+243…" autocomplete="tel" /></label>' +
      '<p class="lib-purchase-modal__status" id="libPurchaseStatus" hidden></p>' +
      '<div class="lib-purchase-modal__actions">' +
      '<button type="button" class="btn btn--ghost" data-lib-purchase-close>Annuler</button>' +
      '<button type="button" class="btn btn--primary" id="libPurchaseConfirm">Payer et accéder</button>' +
      "</div></div>";
    document.body.appendChild(modal);
    modal.querySelectorAll("[data-lib-purchase-close]").forEach((el) => {
      el.addEventListener("click", () => {
        modal.hidden = true;
      });
    });
    let activeMethod = "orange";
    modal.querySelectorAll("[data-lib-pay-method]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeMethod = btn.dataset.libPayMethod || "orange";
        modal.querySelectorAll("[data-lib-pay-method]").forEach((b) => {
          b.classList.toggle("lib-purchase-tab--active", b === btn);
        });
      });
    });
    modal._getPayMethod = () => activeMethod;
    return modal;
  }

  async function openBookPurchaseDialog(item, session) {
    if (
      item?.source === "evodigitalbooks" &&
      typeof SAC_EDB !== "undefined" &&
      SAC_EDB.openPurchaseDialog
    ) {
      return SAC_EDB.openPurchaseDialog(item, session);
    }
    if (!item || isBookFree(item)) {
      openBookFile(item, session);
      return;
    }
    if (hasBookAccess(item, session)) {
      openBookFile(item, session);
      return;
    }

    const modal = ensurePurchaseModal();
    const statusEl = modal.querySelector("#libPurchaseStatus");
    const confirmBtn = modal.querySelector("#libPurchaseConfirm");
    modal.querySelector("#libPurchaseBook").textContent = item.title || "Livre";
    modal.querySelector("#libPurchasePrice").textContent = "Montant : " + formatBookPrice(item);
    if (statusEl) {
      statusEl.hidden = true;
      statusEl.textContent = "";
    }
    modal.hidden = false;

    const onConfirm = async () => {
      const phone = modal.querySelector("#libPurchasePhone")?.value?.trim();
      if (!phone) {
        alert("Indiquez votre numéro Mobile Money.");
        return;
      }
      confirmBtn.disabled = true;
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.textContent = "Traitement du paiement…";
      }
      try {
        const price = bookPrice(item);
        const currency = bookCurrency(item);
        let paid = false;
        if (typeof SAC_MOBILE_MONEY !== "undefined" && SAC_MOBILE_MONEY.runFlow) {
          const online = typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline());
          if (!online) throw new Error("Connexion API requise pour le paiement.");
          const amountCdf = currency === "CDF" ? price : Math.round(price * 2800);
          await SAC_MOBILE_MONEY.runFlow({
            provider: modal._getPayMethod(),
            payerPhone: phone,
            amountCdf,
            amountUsd: currency === "USD" ? price : 0,
            purpose: "library",
            email: session?.identifiant || session?.email || "",
            metadata: { bookId: item.id, bookTitle: item.title || "" },
            onProcessing() {
              if (statusEl) statusEl.textContent = "Initialisation du paiement…";
            },
            onWaitingOperator() {
              if (statusEl) statusEl.textContent = "Validez le paiement sur votre téléphone…";
            },
            onPinPrompt() {
              const pin = prompt("Entrez votre code PIN Mobile Money :");
              return pin || "";
            },
          });
          paid = true;
        } else {
          throw new Error("Paiement mobile indisponible — réessayez plus tard.");
        }
        if (paid) {
          recordBookPurchase(item.id, session);
          modal.hidden = true;
          openBookFile(item, session);
        }
      } catch (err) {
        if (statusEl) statusEl.textContent = err.message || "Paiement impossible.";
        alert(err.message || "Paiement impossible.");
      } finally {
        confirmBtn.disabled = false;
      }
    };

    confirmBtn.onclick = onConfirm;
  }

  function renderBookCard(item, options) {
    const compact = !!options?.compact;
    const session = options?.session || null;
    const cover = absUrl(item.coverUrl || item.cover_url || "");
    const free = isBookFree(item);
    const owned = hasBookAccess(item, session);
    const currency = bookCurrency(item);
    const price = bookPrice(item);
    const original = bookOriginalPrice(item);
    const discount = bookDiscountPercent(item);

    const coverInner = cover
      ? '<img src="' + esc(cover) + '" alt="" loading="lazy" />'
      : '<span class="lib-shop-card__placeholder">📘</span>';

    const discountBadge =
      !free && discount > 0
        ? '<span class="lib-shop-badge">' + esc(discount) + "% OFF</span>"
        : free
          ? '<span class="lib-shop-badge lib-shop-badge--free">Gratuit</span>'
          : "";

    let pricesHtml = "";
    if (free) {
      pricesHtml = '<div class="lib-shop-card__prices"><span class="lib-shop-price-current lib-shop-price-current--free">Gratuit</span></div>';
    } else {
      pricesHtml =
        '<div class="lib-shop-card__prices">' +
        (original
          ? '<span class="lib-shop-price-old">' +
            esc(formatPriceAmount(original, currency) + " " + currency) +
            "</span>"
          : "") +
        '<span class="lib-shop-price-current">' +
        esc(formatPriceAmount(price, currency) + " " + currency) +
        "</span></div>";
    }

    let btnLabel = "Acheter maintenant";
    let btnClass = "lib-shop-btn lib-shop-btn--buy";
    let btnAttrs = ' type="button" data-lib-buy="' + esc(item.id) + '"';

    if (free) {
      btnLabel = "Lire gratuitement";
      btnClass = "lib-shop-btn lib-shop-btn--read";
      btnAttrs = ' type="button" data-lib-read="' + esc(item.id) + '"';
    } else if (owned) {
      btnLabel = "Lire maintenant";
      btnClass = "lib-shop-btn lib-shop-btn--read";
      btnAttrs = ' type="button" data-lib-read="' + esc(item.id) + '"';
    }

    const cardClass = "lib-shop-card" + (compact ? " lib-shop-card--compact" : "");

    return (
      '<article class="' +
      cardClass +
      '" data-lib-book="' +
      esc(item.id) +
      '">' +
      '<div class="lib-shop-card__cover">' +
      coverInner +
      discountBadge +
      "</div>" +
      '<div class="lib-shop-card__body">' +
      '<h3 class="lib-shop-card__title">' +
      esc(item.title || "Ressource") +
      "</h3>" +
      pricesHtml +
      '<button class="' +
      btnClass +
      '"' +
      btnAttrs +
      ">" +
      esc(btnLabel) +
      "</button>" +
      "</div></article>"
    );
  }

  function bindBookActions(root, getSessionFn, getBooksFn) {
    if (!root) return;
    root.addEventListener("click", (e) => {
      const readBtn = e.target.closest("[data-lib-read]");
      const buyBtn = e.target.closest("[data-lib-buy]");
      const card = e.target.closest("[data-lib-buy], [data-lib-read]");
      if (!readBtn && !buyBtn) return;
      e.preventDefault();
      const id = (readBtn || buyBtn).dataset.libRead || (buyBtn || readBtn).dataset.libBuy;
      const books = typeof getBooksFn === "function" ? getBooksFn() : [];
      const item = books.find((b) => b.id === id);
      if (!item) return;
      const session = typeof getSessionFn === "function" ? getSessionFn() : null;
      if (buyBtn || !hasBookAccess(item, session)) {
        openBookPurchaseDialog(item, session);
      } else {
        openBookFile(item, session);
      }
    });
  }

  function filterByCountry(items, countryCode) {
    if (!Array.isArray(items)) return [];
    if (typeof SAC_AFRICA_COUNTRIES === "undefined") return items;
    const cc = countryCode ? String(countryCode).toUpperCase() : "";
    if (!cc) return items;
    return items.filter((item) => SAC_AFRICA_COUNTRIES.matchesLibraryCountry(item, cc));
  }

  function sessionCountryCode(session) {
    if (!session) return "";
    if (session.countryCode) return String(session.countryCode).toUpperCase();
    if (session.role === "ministere" || session.role === "superadmin") {
      if (typeof SAC_AFRICA_COUNTRIES !== "undefined") {
        return String(SAC_AFRICA_COUNTRIES.getStoredCountry() || "CD").toUpperCase();
      }
      return "CD";
    }
    if (session.role === "universite" && session.universite && typeof SAC_UNIVERSITIES !== "undefined") {
      return SAC_UNIVERSITIES.getCountryCode(session.universite);
    }
    return "";
  }

  async function listPublished(countryCode) {
    const cc =
      countryCode ||
      (typeof SAC_AFRICA_COUNTRIES !== "undefined" ? SAC_AFRICA_COUNTRIES.getStoredCountry() : "");
    let items = [];
    if (typeof SAC_API !== "undefined" && SAC_API.listDigitalLibrary) {
      try {
        const online = await SAC_API.ensureOnline();
        if (online) {
          const session =
            typeof SAC_SESSION !== "undefined" && SAC_SESSION.getSession
              ? SAC_SESSION.getSession()
              : null;
          const data =
            session && SAC_API.listDigitalLibraryForUser
              ? await SAC_API.listDigitalLibraryForUser(cc)
              : await SAC_API.listDigitalLibrary(cc);
          items = filterCatalogBooks((data?.items || []).filter(isPublishedBook));
          items = filterByCountry(items, cc);
        }
      } catch {
        /* fallback */
      }
    }
    if (!items.length) {
      const cached = filterCatalogBooks(filterByCountry(readCache().filter(isPublishedBook), cc));
      if (cached.length) items = cached;
    }
    if (!items.length && typeof SAC_PLATFORM !== "undefined" && SAC_PLATFORM.getLibrary) {
      try {
        items = filterByCountry(await SAC_PLATFORM.getLibrary(), cc);
      } catch {
        items = [];
      }
    }
    if (typeof SAC_EDB !== "undefined" && SAC_EDB.listLibraryBooks) {
      try {
        const session =
          typeof SAC_SESSION !== "undefined" && SAC_SESSION.getSession
            ? SAC_SESSION.getSession()
            : null;
        const edb = filterCatalogBooks(await SAC_EDB.listLibraryBooks(cc, session));
        const ids = new Set(items.map((x) => x.id));
        edb.forEach((b) => {
          if (!ids.has(b.id)) items.push(b);
        });
      } catch {
        /* ignore */
      }
    }
    if (items.length) cacheItems(items);
    return items;
  }

  async function listManage(session) {
    const cc = sessionCountryCode(session);
    if (typeof SAC_API !== "undefined" && SAC_API.listDigitalLibraryManage) {
      const data = await SAC_API.listDigitalLibraryManage(cc);
      const items = data?.items || [];
      return filterByCountry(items, cc);
    }
    return [];
  }

  async function createBook(payload) {
    if (typeof SAC_API !== "undefined" && SAC_API.createDigitalLibraryBook) {
      const online = await SAC_API.ensureOnline();
      if (!online) throw new Error("Publication en ligne requise — API injoignable.");
      await ensureLibraryAuth();
      try {
        const data = await SAC_API.createDigitalLibraryBook(buildBookPayload(payload));
        return data?.item || data;
      } catch (err) {
        if (err?.status === 403 || /accès refusé|non autorisé/i.test(String(err?.message || ""))) {
          throw new Error(
            "Accès refusé — reconnectez-vous via le portail Ministère. " +
              "Vérifiez aussi que l'API bibliothèque est à jour sur Render."
          );
        }
        throw err;
      }
    }
    throw new Error("Publication en ligne requise.");
  }

  async function updateBook(id, payload) {
    if (typeof SAC_API !== "undefined" && SAC_API.updateDigitalLibraryBook) {
      const online = await SAC_API.ensureOnline();
      if (!online) throw new Error("Mise à jour en ligne requise — API injoignable.");
      await ensureLibraryAuth();
      const data = await SAC_API.updateDigitalLibraryBook(id, buildBookPayload(payload));
      return data?.item || data;
    }
    throw new Error("Mise à jour en ligne requise.");
  }

  async function deleteBook(id) {
    if (typeof SAC_API !== "undefined" && SAC_API.deleteDigitalLibraryBook) {
      return SAC_API.deleteDigitalLibraryBook(id);
    }
    throw new Error("Suppression en ligne requise.");
  }

  async function uploadFile(file) {
    if (typeof SAC_API === "undefined") throw new Error("Téléversement indisponible.");
    const online = await SAC_API.ensureOnline();
    if (!online) throw new Error("Téléversement impossible — API injoignable.");
    await ensureLibraryAuth();

    const tryUpload = async (fn) => {
      const raw = await fn();
      const fileUrl = extractUploadUrl(raw);
      if (!fileUrl) {
        throw new Error("Téléversement terminé mais l'URL du fichier est absente.");
      }
      return { ...raw, fileUrl };
    };

    let lastErr = null;
    const uploadAttempts = [
      () => {
        const fd = new FormData();
        fd.append("files", file);
        return SAC_API.uploadDigitalLibraryFile(fd);
      },
      () => {
        const fd = new FormData();
        fd.append("file", file);
        return SAC_API.uploadDigitalLibraryFile(fd);
      },
    ];

    for (const attempt of uploadAttempts) {
      try {
        return await tryUpload(attempt);
      } catch (err) {
        lastErr = err;
        if (!isUploadAccessError(err)) break;
      }
    }

    if (lastErr && isUploadAccessError(lastErr) && SAC_API.uploadHomeNewsMedia) {
      try {
        return await tryUpload(() => SAC_API.uploadHomeNewsMedia([file]));
      } catch (fallbackErr) {
        lastErr = fallbackErr;
      }
    }

    if (lastErr?.status === 403 || /accès refusé|non autorisé/i.test(String(lastErr?.message || ""))) {
      throw new Error(
        "Accès refusé — déconnectez-vous puis reconnectez-vous via le portail Ministère (avec votre pays). " +
          "Si le problème persiste, l'API bibliothèque doit être redéployée sur Render."
      );
    }
    throw lastErr || new Error("Téléversement impossible.");
  }

  function canManageLibrary(session) {
    return !!session && (session.role === "ministere" || session.role === "superadmin");
  }

  function initMinistryPublisher(session, rootId, options) {
    const root = document.getElementById(rootId || "libraryPublisherRoot");
    if (!root) return;
    if (!canManageLibrary(session)) {
      root.innerHTML =
        '<p class="page-desc" style="margin:0;color:#b91c1c;">Réservé au compte Ministère ou Super Admin.</p>';
      return;
    }

    const onChange = typeof options?.onChange === "function" ? options.onChange : null;
    const showList = options?.showList !== false;
    const countryCode =
      sessionCountryCode(session) ||
      (typeof SAC_AFRICA_COUNTRIES !== "undefined" ? SAC_AFRICA_COUNTRIES.getStoredCountry() : "CD") ||
      "CD";
    const countryLabel =
      typeof SAC_AFRICA_COUNTRIES !== "undefined"
        ? SAC_AFRICA_COUNTRIES.label(countryCode)
        : countryCode;
    const showCountryPick =
      session.role === "superadmin" || !sessionCountryCode(session);
    let editingId = null;

    const listPanel = showList
      ? '<div class="panel panel--ws lib-manage-panel"><div class="panel__head"><h2>Mes publications — bibliothèque</h2></div>' +
        '<div class="panel__body lib-manage-list"><p style="color:var(--muted);">Chargement…</p></div></div>'
      : "";

    root.innerHTML =
      '<div class="panel panel--ws lib-form-panel" style="margin-bottom:1rem;">' +
      '<div class="panel__head"><h2 class="lib-form-title">Publier un livre numérique</h2></div>' +
      '<div class="panel__body">' +
      '<p class="lib-form-intro" style="margin:0 0 0.75rem;color:var(--muted);font-size:0.88rem;">Bibliothèque nationale — <strong>' +
      esc(countryLabel) +
      "</strong>. Les ouvrages publiés ici sont visibles pour les utilisateurs de ce pays.</p>" +
      '<form class="lib-publish-form ws-form-grid">' +
      '<p class="lib-form-intro" style="grid-column:1/-1;margin:0 0 0.35rem;color:var(--muted);font-size:0.88rem;">Renseignez les informations du livre, ajoutez une couverture et téléversez le fichier (PDF, EPUB, DOC).</p>' +
      (showCountryPick
        ? '<div class="fg" style="grid-column:1/-1;"><label>Pays de publication *</label><select class="fi lib-country" required>' +
          (typeof SAC_AFRICA_COUNTRIES !== "undefined"
            ? SAC_AFRICA_COUNTRIES.buildSelectOptions(countryCode, { includeAll: false, includePanAfrica: true })
            : '<option value="CD">RDC</option>') +
          "</select></div>"
        : "") +
      '<div class="fg" style="grid-column:1/-1;"><label>Titre du livre *</label><input class="fi lib-title" required minlength="3" placeholder="Ex: Mathématiques — Terminale" /></div>' +
      '<div class="fg"><label>Auteur</label><input class="fi lib-author" placeholder="Nom de l\'auteur" /></div>' +
      '<div class="fg"><label>Catégorie *</label><select class="fi lib-category" required>' +
      categoriesSelectHtml() +
      "</select></div>" +
      '<div class="fg"><label>Langue</label><select class="fi lib-lang"><option value="fr">Français</option><option value="en">Anglais</option><option value="bilingue">Bilingue FR/EN</option></select></div>' +
      '<div class="fg" style="grid-column:1/-1;"><label>Description / résumé</label><textarea class="fi lib-desc" rows="3" placeholder="Présentation courte du livre…"></textarea></div>' +
      '<div class="fg" style="grid-column:1/-1;">' +
      '<label>Image de couverture (JPG, PNG, WebP)</label>' +
      '<input type="file" class="fi lib-cover-file" accept="image/jpeg,image/png,image/webp,image/*" />' +
      '<input class="fi lib-cover-url" placeholder="Ou URL de l\'image de couverture" style="margin-top:0.45rem;" />' +
      '<div class="lib-cover-preview" style="display:none;margin-top:0.55rem;border:1px solid var(--border);border-radius:10px;overflow:hidden;max-width:240px;background:#fff;">' +
      '<img class="lib-cover-preview-img" alt="Aperçu couverture" style="display:block;width:100%;height:240px;object-fit:cover;background:#f1f5f9;" />' +
      "</div></div>" +
      '<div class="fg" style="grid-column:1/-1;"><label>Fichier du livre (PDF, EPUB, DOC…) *</label><input type="file" class="fi lib-file" accept=".pdf,.epub,.doc,.docx" /></div>' +
      '<div class="fg" style="grid-column:1/-1;"><label>Ou lien direct du livre (URL)</label><input class="fi lib-url" placeholder="https://…" /></div>' +
      '<div class="fg" style="grid-column:1/-1;border-top:1px solid var(--border);padding-top:0.75rem;">' +
      '<label class="chk"><input type="checkbox" class="lib-free" /> Publication gratuite (accès libre sans achat)</label>' +
      '<p style="margin:0.35rem 0 0;font-size:0.82rem;color:var(--muted);">Par défaut, les livres sont <strong>payants</strong>. Cochez cette case uniquement pour une ressource offerte gratuitement.</p>' +
      "</div>" +
      '<div class="fg lib-price-wrap"><label>Prix de vente *</label><input class="fi lib-price" type="number" min="0.5" step="0.5" value="5" /></div>' +
      '<div class="fg lib-price-wrap"><label>Devise</label><select class="fi lib-currency"><option value="USD">USD</option><option value="CDF">CDF</option></select></div>' +
      '<div class="fg lib-price-wrap lib-original-wrap"><label>Prix initial barré (promo, optionnel)</label><input class="fi lib-original-price" type="number" min="0" step="0.5" placeholder="Ex: 41384" /></div>' +
      '<div class="fg" style="grid-column:1/-1;"><label class="chk"><input type="checkbox" class="lib-published" checked /> Publier immédiatement dans la bibliothèque de ' +
      esc(countryLabel) +
      "</label></div>" +
      '<div class="fg" style="grid-column:1/-1;display:flex;gap:0.5rem;flex-wrap:wrap;">' +
      '<button type="submit" class="btn btn--role lib-submit">Publier le livre</button>' +
      '<button type="button" class="btn btn--ghost lib-cancel" style="display:none;">Annuler</button>' +
      "</div></form></div></div>" +
      listPanel;

    const form = root.querySelector(".lib-publish-form");
    const btnCancel = root.querySelector(".lib-cancel");
    const formTitle = root.querySelector(".lib-form-title");
    const btnSubmit = root.querySelector(".lib-submit");
    const coverPreview = root.querySelector(".lib-cover-preview");
    const coverPreviewImg = root.querySelector(".lib-cover-preview-img");
    const freeCheckbox = root.querySelector(".lib-free");
    const priceWraps = root.querySelectorAll(".lib-price-wrap");

    function syncPriceFields() {
      const free = !!freeCheckbox?.checked;
      priceWraps.forEach((el) => {
        el.style.display = free ? "none" : "";
      });
      root.querySelectorAll(".lib-original-wrap").forEach((el) => {
        el.style.display = free ? "none" : "";
      });
    }

    freeCheckbox?.addEventListener("change", syncPriceFields);
    syncPriceFields();

    function q(sel) {
      return root.querySelector(sel);
    }

    let coverBlobUrl = null;

    function revokeCoverBlob() {
      if (coverBlobUrl) {
        URL.revokeObjectURL(coverBlobUrl);
        coverBlobUrl = null;
      }
    }

    function showCoverPreview(url) {
      if (!url || !coverPreview || !coverPreviewImg) return;
      coverPreview.style.display = "block";
      const src = previewUrl(url);
      coverPreviewImg.onerror = () => {
        if (/^(data:|blob:)/i.test(src)) return;
        coverPreviewImg.removeAttribute("src");
        coverPreview.style.display = "none";
      };
      coverPreviewImg.src = src;
    }

    function hideCoverPreview() {
      revokeCoverBlob();
      if (coverPreview) coverPreview.style.display = "none";
      if (coverPreviewImg) coverPreviewImg.removeAttribute("src");
    }

    q(".lib-cover-file")?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      revokeCoverBlob();
      if (!file) {
        hideCoverPreview();
        return;
      }
      if (!file.type.startsWith("image/")) {
        alert("Choisissez une image JPG, PNG ou WebP.");
        e.target.value = "";
        hideCoverPreview();
        return;
      }
      coverBlobUrl = URL.createObjectURL(file);
      showCoverPreview(coverBlobUrl);
    });

    q(".lib-cover-url")?.addEventListener("input", (e) => {
      const url = e.target.value.trim();
      if (url) showCoverPreview(url);
      else hideCoverPreview();
    });

    async function renderManage() {
      if (!showList) return;
      const listEl = root.querySelector(".lib-manage-list");
      if (!listEl) return;
      try {
        const items = await listManage(session);
        if (!items.length) {
          listEl.innerHTML = '<p style="color:var(--muted);margin:0;">Aucun livre publié pour le moment.</p>';
          return;
        }
        listEl.innerHTML =
          '<div style="display:grid;gap:0.65rem;">' +
          items
            .map(
              (b) => {
                const thumb = b.coverUrl
                  ? '<img src="' +
                    esc(absUrl(b.coverUrl)) +
                    '" alt="" style="width:52px;height:72px;object-fit:cover;border-radius:6px;margin-right:0.55rem;vertical-align:middle;" />'
                  : '<span style="display:inline-flex;width:52px;height:72px;align-items:center;justify-content:center;background:var(--border);border-radius:6px;margin-right:0.55rem;vertical-align:middle;">📘</span>';
                return (
                '<article style="border:1px solid var(--border);border-radius:10px;padding:0.75rem;background:var(--bg);display:flex;align-items:flex-start;gap:0.5rem;">' +
                thumb +
                '<div style="flex:1;min-width:0;">' +
                "<strong>" +
                esc(b.title) +
                "</strong> · " +
                esc(categoryLabel(b.category)) +
                " · " +
                esc(b.language || "fr") +
                "<br/><span style='font-size:0.84rem;color:var(--muted);'>" +
                esc(b.author || "—") +
                " · " +
                (b.published ? "Publié" : "Brouillon") +
                " · " +
                (isBookFree(b) ? "Gratuit" : formatBookPrice(b)) +
                "</span>" +
                '<div style="margin-top:0.5rem;display:flex;gap:0.4rem;flex-wrap:wrap;">' +
                '<button type="button" class="btn btn--ghost btn--sm" data-edit-lib="' +
                esc(b.id) +
                '">Modifier</button>' +
                '<button type="button" class="btn btn--ghost btn--sm" data-del-lib="' +
                esc(b.id) +
                '">Supprimer</button>' +
                (b.fileUrl
                  ? '<a class="btn btn--ghost btn--sm" href="' +
                    esc(absUrl(b.fileUrl)) +
                    '" target="_blank" rel="noopener">Ouvrir le livre</a>'
                  : "") +
                "</div></div></article>"
                );
              }
            )
            .join("") +
          "</div>";

        listEl.querySelectorAll("[data-edit-lib]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const item = items.find((x) => x.id === btn.dataset.editLib);
            if (!item) return;
            editingId = item.id;
            q(".lib-title").value = item.title || "";
            q(".lib-author").value = item.author || "";
            q(".lib-category").value = item.category || "autre";
            q(".lib-lang").value = item.language || "fr";
            q(".lib-desc").value = item.description || "";
            q(".lib-url").value = item.fileUrl || "";
            q(".lib-cover-url").value = item.coverUrl || "";
            if (item.coverUrl) showCoverPreview(item.coverUrl);
            else hideCoverPreview();
            q(".lib-published").checked = !!item.published;
            if (freeCheckbox) freeCheckbox.checked = isBookFree(item);
            if (q(".lib-price")) q(".lib-price").value = bookPrice(item);
            if (q(".lib-currency")) q(".lib-currency").value = bookCurrency(item);
            if (q(".lib-original-price")) q(".lib-original-price").value = bookOriginalPrice(item) || "";
            syncPriceFields();
            formTitle.textContent = "Modifier le livre";
            btnSubmit.textContent = "Enregistrer";
            btnCancel.style.display = "inline-block";
          });
        });

        listEl.querySelectorAll("[data-del-lib]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            if (!confirm("Supprimer ce livre de la bibliothèque ?")) return;
            try {
              await deleteBook(btn.dataset.delLib);
              await renderManage();
              if (onChange) onChange();
            } catch (err) {
              alert(err.message || "Suppression impossible.");
            }
          });
        });
      } catch (err) {
        listEl.innerHTML =
          '<p style="color:#b91c1c;margin:0;">' + esc(err.message || "Chargement impossible.") + "</p>";
      }
    }

    function resetForm() {
      editingId = null;
      form.reset();
      q(".lib-published").checked = true;
      if (freeCheckbox) freeCheckbox.checked = false;
      if (q(".lib-price")) q(".lib-price").value = DEFAULT_BOOK_PRICE;
      if (q(".lib-currency")) q(".lib-currency").value = DEFAULT_BOOK_CURRENCY;
      syncPriceFields();
      hideCoverPreview();
      formTitle.textContent = "Publier un livre numérique";
      btnSubmit.textContent = "Publier le livre";
      btnCancel.style.display = "none";
    }

    btnCancel?.addEventListener("click", resetForm);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (btnSubmit.disabled) return;
      btnSubmit.disabled = true;
      const prevLabel = btnSubmit.textContent;
      btnSubmit.textContent = editingId ? "Enregistrement…" : "Publication…";
      const selectedCountry =
        q(".lib-country")?.value?.trim().toUpperCase() || countryCode;
      const payload = {
        title: q(".lib-title").value.trim(),
        author: q(".lib-author").value.trim(),
        category: q(".lib-category").value,
        language: q(".lib-lang").value,
        description: q(".lib-desc").value.trim(),
        fileUrl: q(".lib-url").value.trim(),
        coverUrl: q(".lib-cover-url").value.trim(),
        published: q(".lib-published").checked,
        countryCode: selectedCountry,
        isFree: !!freeCheckbox?.checked,
        price: freeCheckbox?.checked ? 0 : Number(q(".lib-price")?.value) || DEFAULT_BOOK_PRICE,
        currency: q(".lib-currency")?.value || DEFAULT_BOOK_CURRENCY,
        originalPrice: freeCheckbox?.checked ? 0 : Number(q(".lib-original-price")?.value) || 0,
      };

      try {
        const coverFile = q(".lib-cover-file")?.files?.[0];
        if (coverFile) {
          const upCover = await uploadFile(coverFile);
          payload.coverUrl = upCover.fileUrl;
          if (q(".lib-cover-url")) q(".lib-cover-url").value = upCover.fileUrl;
          revokeCoverBlob();
          showCoverPreview(upCover.fileUrl);
        }

        const file = q(".lib-file")?.files?.[0];
        if (file) {
          const up = await uploadFile(file);
          payload.fileUrl = up.fileUrl;
        }

        if (!payload.fileUrl) {
          alert("Ajoutez un fichier du livre (PDF, EPUB, DOC) ou une URL.");
          return;
        }

        const wasEdit = !!editingId;
        if (editingId) await updateBook(editingId, payload);
        else await createBook(payload);
        resetForm();
        await renderManage();
        if (onChange) onChange();
        alert(wasEdit ? "Livre mis à jour." : "Livre publié dans la bibliothèque de " + countryLabel + ".");
      } catch (err) {
        alert(err.message || "Publication impossible.");
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = prevLabel;
      }
    });

    renderManage();
  }

  return {
    CATEGORY_GROUPS,
    CATEGORIES,
    categoriesSelectHtml,
    categoryLabel,
    listPublished,
    listManage,
    filterByCountry,
    sessionCountryCode,
    createBook,
    updateBook,
    deleteBook,
    removeCachedBook,
    initMinistryPublisher,
    absUrl,
    isBookFree,
    bookPrice,
    bookCurrency,
    formatBookPrice,
    hasBookAccess,
    isBookPurchased,
    recordBookPurchase,
    openBookFile,
    openBookPurchaseDialog,
    renderBookCard,
    bindBookActions,
  };
})();

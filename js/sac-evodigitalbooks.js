/**
 * EvoDigitalBooks — espace auteurs isolé, lié à la bibliothèque nationale.
 * Inscription auteur · validation Super Admin · publication · achat Mobile Money · limite appareils.
 */
const SAC_EDB = (function () {
  "use strict";

  const AUTHORS_KEY = "sac_edb_authors";
  const BOOKS_KEY = "sac_edb_books";
  const PURCHASES_KEY = "sac_edb_purchases";
  const DEVICES_KEY = "sac_edb_devices";
  const SALES_KEY = "sac_edb_sales";
  const DEVICE_ID_KEY = "sac_edb_device_id";

  const PLATFORM_FEE_RATE = 0.25;
  const AUTHOR_SHARE_RATE = 0.75;
  const MAX_DEVICES_PER_ACCOUNT = 3;
  const SOURCE = "evodigitalbooks";

  function esc(s) {
    const el = document.createElement("div");
    el.textContent = String(s ?? "");
    return el.innerHTML;
  }

  function normEmail(v) {
    return String(v || "").trim().toLowerCase();
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id =
        "edb_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2, 12);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  }

  function readAuthors() {
    return readJson(AUTHORS_KEY, []);
  }

  function writeAuthors(list) {
    writeJson(AUTHORS_KEY, list);
  }

  function readBooks() {
    return readJson(BOOKS_KEY, []);
  }

  function writeBooks(list) {
    writeJson(BOOKS_KEY, list);
    syncBooksToLibraryCache(list);
  }

  function readSales() {
    return readJson(SALES_KEY, {});
  }

  function bumpSales(bookId) {
    const map = readSales();
    map[bookId] = (map[bookId] || 0) + 1;
    writeJson(SALES_KEY, map);
  }

  function authorByEmail(email) {
    const key = normEmail(email);
    return readAuthors().find((a) => normEmail(a.email) === key) || null;
  }

  function isAuthorApproved(session) {
    if (!session || session.role !== "auteur") return false;
    const a = authorByEmail(session.identifiant || session.email);
    return (a?.status || session.authorStatus) === "approved";
  }

  function splitFee(amount) {
    const total = Number(amount) || 0;
    const platformFee = Math.round(total * PLATFORM_FEE_RATE * 100) / 100;
    const authorShare = Math.round((total - platformFee) * 100) / 100;
    return { total, platformFee, authorShare };
  }

  function categoriesSelectHtml() {
    if (typeof SAC_LIBRARY !== "undefined" && SAC_LIBRARY.categoriesSelectHtml) {
      return SAC_LIBRARY.categoriesSelectHtml();
    }
    return '<option value="roman">Romans & nouvelles</option>';
  }

  function categoryLabel(id) {
    if (typeof SAC_LIBRARY !== "undefined" && SAC_LIBRARY.categoryLabel) {
      return SAC_LIBRARY.categoryLabel(id);
    }
    return id || "Livre";
  }

  function absUrl(url) {
    if (typeof SAC_LIBRARY !== "undefined" && SAC_LIBRARY.absUrl) {
      return SAC_LIBRARY.absUrl(url);
    }
    return String(url || "");
  }

  function syncBooksToLibraryCache(books) {
    const published = (books || readBooks())
      .filter((b) => b.published !== false && b.status === "published")
      .map((b) => publicBookView(b, true));
    try {
      const cacheKey = "sac_digital_library_cache";
      const existing = readJson(cacheKey, []);
      const others = existing.filter((x) => x.source !== SOURCE);
      writeJson(cacheKey, others.concat(published));
    } catch {
      /* ignore */
    }
  }

  /** Vue publique — masque le fichier pour les livres payants non achetés. */
  function publicBookView(book, includeFileForSync) {
    const b = { ...book };
    b.source = SOURCE;
    b.authorRole = "auteur";
    b.isFree = !!b.isFree;
    b.is_free = b.isFree;
    b.free = b.isFree;
    b.accessType = b.isFree ? "free" : "paid";
    if (!includeFileForSync && !b.isFree) {
      delete b.fileUrl;
      delete b.file_url;
    }
    return b;
  }

  async function registerAuthor(payload) {
    const email = normEmail(payload.email);
    const password = payload.password || "";
    const penName = String(payload.penName || payload.prenom || "").trim();
    const mobileMoney = String(payload.mobileMoney || payload.mobile_money || "").trim();
    const bio = String(payload.bio || "").trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("E-mail invalide.");
    }
    if (typeof SAC_IDENTITY !== "undefined") {
      const pw = SAC_IDENTITY.validatePassword(password);
      if (!pw.ok) throw new Error(pw.message);
      const ph = SAC_IDENTITY.validatePhone(mobileMoney);
      if (!ph.ok) throw new Error("Numéro Mobile Money invalide (réception des paiements).");
    } else {
      if (password.length < 8) throw new Error("Mot de passe : 8 caractères minimum.");
    }
    if (!penName || penName.length < 2) throw new Error("Indiquez votre nom d'auteur.");
    if (authorByEmail(email)) throw new Error("Un compte auteur existe déjà pour cet e-mail.");

    const author = {
      id: "edb_author_" + Date.now(),
      email,
      penName,
      mobileMoney,
      bio,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    if (typeof SAC_API !== "undefined" && SAC_API.registerEdbAuthor) {
      try {
        await SAC_API.ensureOnline(true);
        const data = await SAC_API.registerEdbAuthor({
          email,
          password,
          penName,
          mobileMoney,
          bio,
          role: "auteur",
        });
        if (data?.author) Object.assign(author, data.author);
      } catch (err) {
        if (!/localhost|127\.0\.0\.1/i.test(location.hostname)) {
          console.warn("[SAC_EDB] register API:", err.message || err);
        }
      }
    }

    const list = readAuthors();
    list.push(author);
    writeAuthors(list);

    if (typeof SAC_IDENTITY !== "undefined") {
      const users = SAC_IDENTITY.getLocalUsers();
      users.push({
        email,
        role: "auteur",
        prenom: penName.split(/\s+/)[0] || penName,
        nom: penName.split(/\s+/).slice(1).join(" ") || penName,
        password,
        authorStatus: "pending",
        mobileMoney,
        serverSynced: false,
      });
      localStorage.setItem("sac_users", JSON.stringify(users));
    }

    return author;
  }

  async function listPendingAuthors() {
    if (typeof SAC_API !== "undefined" && SAC_API.listPendingEdbAuthors) {
      try {
        const online = await SAC_API.ensureOnline(false, { maxWaitMs: 15000 });
        if (online) {
          const data = await SAC_API.listPendingEdbAuthors();
          return data?.authors || [];
        }
      } catch {
        /* local */
      }
    }
    return readAuthors().filter((a) => a.status === "pending");
  }

  async function setAuthorStatus(email, status, reviewerSession) {
    const key = normEmail(email);
    const list = readAuthors();
    const idx = list.findIndex((a) => normEmail(a.email) === key);
    if (idx < 0) throw new Error("Auteur introuvable.");
    list[idx].status = status;
    list[idx].reviewedAt = new Date().toISOString();
    list[idx].reviewedBy = reviewerSession?.identifiant || "";
    writeAuthors(list);

    if (typeof SAC_IDENTITY !== "undefined") {
      const users = SAC_IDENTITY.getLocalUsers();
      const u = users.find((x) => normEmail(x.email) === key);
      if (u) {
        u.authorStatus = status;
        localStorage.setItem("sac_users", JSON.stringify(users));
      }
    }

    if (typeof SAC_API !== "undefined" && SAC_API.approveEdbAuthor) {
      try {
        await SAC_API.approveEdbAuthor(email, { status });
      } catch (err) {
        console.warn("[SAC_EDB] approve API:", err.message || err);
      }
    }
    return list[idx];
  }

  function readPurchasesMap() {
    return readJson(PURCHASES_KEY, {});
  }

  function readDevicesMap() {
    return readJson(DEVICES_KEY, {});
  }

  function getPurchasedIds(session) {
    const email = normEmail(session?.identifiant || session?.email);
    const map = readPurchasesMap();
    return Array.isArray(map[email]) ? map[email] : [];
  }

  function getRegisteredDevices(session) {
    const email = normEmail(session?.identifiant || session?.email);
    const map = readDevicesMap();
    return Array.isArray(map[email]) ? map[email] : [];
  }

  function registerDevice(session) {
    const email = normEmail(session?.identifiant || session?.email);
    if (!email) return { ok: false, reason: "no_session" };
    const deviceId = getDeviceId();
    const map = readDevicesMap();
    const list = Array.isArray(map[email]) ? map[email].slice() : [];
    if (list.includes(deviceId)) return { ok: true, deviceId };
    if (list.length >= MAX_DEVICES_PER_ACCOUNT) {
      return { ok: false, reason: "device_limit", max: MAX_DEVICES_PER_ACCOUNT };
    }
    list.push(deviceId);
    map[email] = list;
    writeJson(DEVICES_KEY, map);
    return { ok: true, deviceId };
  }

  function hasAccess(book, session) {
    if (!book) return false;
    if (book.isFree || book.is_free || book.free) return true;
    const id = book.id;
    if (!id) return false;
    if (!getPurchasedIds(session).includes(id)) return false;
    const dev = registerDevice(session);
    return dev.ok;
  }

  function recordPurchase(bookId, session, meta) {
    const email = normEmail(session?.identifiant || session?.email);
    if (!email || !bookId) return;
    const map = readPurchasesMap();
    const list = Array.isArray(map[email]) ? map[email].slice() : [];
    if (!list.includes(bookId)) list.push(bookId);
    map[email] = list;
    writeJson(PURCHASES_KEY, map);
    registerDevice(session);
    bumpSales(bookId);
    if (typeof SAC_API !== "undefined" && SAC_API.recordEdbPurchase) {
      SAC_API.recordEdbPurchase({ bookId, email, ...meta }).catch(() => {});
    }
    window.dispatchEvent(new CustomEvent("sac-edb-purchase", { detail: { bookId } }));
  }

  async function listLibraryBooks(countryCode) {
    let items = readBooks().filter((b) => b.published !== false && b.status === "published");
    if (countryCode) {
      const cc = String(countryCode).toUpperCase();
      items = items.filter((b) => !b.countryCode || b.countryCode === cc || b.countryCode === "ALL");
    }
    return items.map((b) => publicBookView(b, false));
  }

  function getAuthorBooks(session) {
    const email = normEmail(session?.identifiant || session?.email);
    return readBooks().filter((b) => normEmail(b.authorEmail) === email);
  }

  async function publishBook(session, raw) {
    if (!isAuthorApproved(session)) {
      throw new Error("Compte auteur en attente de validation par le Super Admin.");
    }
    const email = normEmail(session.identifiant || session.email);
    const author = authorByEmail(email);
    const title = String(raw.title || "").trim();
    if (!title || title.length < 2) throw new Error("Titre requis.");
    const category = raw.category || "roman";
    const isFree = !!raw.isFree;
    const price = isFree ? 0 : Math.max(0, Number(raw.price) || 0);
    if (!isFree && price <= 0) throw new Error("Indiquez un prix pour un livre payant.");
    const fileUrl = String(raw.fileUrl || "").trim();
    const coverUrl = String(raw.coverUrl || "").trim();
    if (!fileUrl) throw new Error("Fichier du livre requis (PDF, EPUB…).");
    if (!coverUrl) throw new Error("Couverture requise.");

    const book = {
      id: raw.id || "edb_" + Date.now(),
      title,
      author: author?.penName || session.displayName || email,
      authorEmail: email,
      authorMobileMoney: author?.mobileMoney || raw.authorMobileMoney || "",
      category,
      description: String(raw.description || "").trim(),
      language: raw.language || "fr",
      countryCode: String(raw.countryCode || "CD").toUpperCase(),
      isFree,
      price,
      currency: String(raw.currency || "USD").toUpperCase(),
      fileUrl,
      coverUrl,
      cover_url: coverUrl,
      file_url: fileUrl,
      source: SOURCE,
      authorRole: "auteur",
      published: true,
      status: "published",
      platformFeeRate: PLATFORM_FEE_RATE,
      createdAt: raw.id ? raw.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const list = readBooks();
    const idx = list.findIndex((b) => b.id === book.id);
    if (idx >= 0) list[idx] = book;
    else list.push(book);
    writeBooks(list);

    const libPayload = {
      ...book,
      scope: "national",
      accessType: isFree ? "free" : "paid",
    };

    if (typeof SAC_API !== "undefined" && SAC_API.createDigitalLibraryBook) {
      try {
        await SAC_API.ensureOnline(true);
        if (SAC_API.ensureApiSession) await SAC_API.ensureApiSession();
        if (idx >= 0 && SAC_API.updateDigitalLibraryBook) {
          await SAC_API.updateDigitalLibraryBook(book.id, libPayload);
        } else {
          await SAC_API.createDigitalLibraryBook(libPayload);
        }
      } catch (err) {
        console.warn("[SAC_EDB] library sync:", err.message || err);
      }
    }

    return book;
  }

  async function uploadFile(file, kind) {
    if (!file) throw new Error("Fichier manquant.");
    if (typeof SAC_LIBRARY !== "undefined" && SAC_LIBRARY.uploadFile) {
      return SAC_LIBRARY.uploadFile(file, kind);
    }
    if (typeof SAC_API !== "undefined" && SAC_API.uploadDigitalLibraryFile) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind || "book");
      const data = await SAC_API.uploadDigitalLibraryFile(fd);
      return data?.fileUrl || data?.url || "";
    }
    throw new Error("Upload indisponible — connectez-vous à l'API.");
  }

  function sortBestsellers(books) {
    const sales = readSales();
    return books
      .slice()
      .sort((a, b) => (sales[b.id] || 0) - (sales[a.id] || 0));
  }

  function sortNewest(books) {
    return books
      .slice()
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  function renderBookCard(book, session, options) {
    const cover = absUrl(book.coverUrl || book.cover_url);
    const free = !!book.isFree;
    const owned = hasAccess(book, session);
    const priceLabel = free
      ? "Gratuit"
      : Number(book.price).toLocaleString("fr-FR") + " " + (book.currency || "USD");
    const sales = readSales()[book.id] || 0;

    return (
      '<article class="edb-card" data-book-id="' +
      esc(book.id) +
      '">' +
      '<div class="edb-card__cover">' +
      (cover
        ? '<img src="' + esc(cover) + '" alt="" loading="lazy" />'
        : '<span class="edb-card__placeholder">📖</span>') +
      (free ? '<span class="edb-card__badge edb-card__badge--free">Gratuit</span>' : "") +
      (!free && sales > 5 ? '<span class="edb-card__badge edb-card__badge--hot">Best-seller</span>' : "") +
      "</div>" +
      '<div class="edb-card__body">' +
      "<h3>" +
      esc(book.title) +
      "</h3>" +
      '<p class="edb-card__author">' +
      esc(book.author) +
      " · " +
      esc(categoryLabel(book.category)) +
      "</p>" +
      '<p class="edb-card__price">' +
      esc(priceLabel) +
      "</p>" +
      '<div class="edb-card__actions">' +
      (owned || free
        ? '<button type="button" class="btn btn--role btn--sm" data-edb-read="' +
          esc(book.id) +
          '">Lire</button>'
        : '<button type="button" class="btn btn--primary btn--sm" data-edb-buy="' +
          esc(book.id) +
          '">Acheter</button>') +
      "</div></div></article>"
    );
  }

  function bindStoreActions(root, books, session) {
    if (!root) return;
    const byId = {};
    (books || []).forEach((b) => {
      byId[b.id] = b;
    });
    const fullById = {};
    readBooks().forEach((b) => {
      fullById[b.id] = b;
    });

    root.querySelectorAll("[data-edb-read]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const book = fullById[btn.dataset.edbRead] || byId[btn.dataset.edbRead];
        openBook(book, session);
      });
    });
    root.querySelectorAll("[data-edb-buy]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const book = fullById[btn.dataset.edbBuy] || byId[btn.dataset.edbBuy];
        openPurchaseDialog(book, session);
      });
    });
  }

  function openBook(book, session) {
    if (!book) return;
    const full = readBooks().find((b) => b.id === book.id) || book;
    if (!hasAccess(full, session)) {
      openPurchaseDialog(full, session);
      return;
    }
    const url = absUrl(full.fileUrl || full.file_url);
    if (!url) {
      alert("Fichier indisponible.");
      return;
    }
    window.open(url, "_blank", "noopener");
  }

  async function openPurchaseDialog(book, session) {
    if (!book || book.isFree) {
      openBook(book, session);
      return;
    }
    const full = readBooks().find((b) => b.id === book.id) || book;
    const author = authorByEmail(full.authorEmail);
    const fees = splitFee(full.price);
    const mmReceiver = full.authorMobileMoney || author?.mobileMoney || "";

    const phone = prompt(
      "Numéro Mobile Money (paiement) :\n\n" +
        "Livre : " +
        (full.title || "") +
        "\nMontant : " +
        fees.total +
        " " +
        (full.currency || "USD") +
        "\n→ Auteur (" +
        fees.authorShare +
        " " +
        (full.currency || "USD") +
        ") : " +
        mmReceiver +
        "\n→ Plateforme (25 %) : " +
        fees.platformFee +
        " " +
        (full.currency || "USD")
    );
    if (!phone) return;

    try {
      if (typeof SAC_MOBILE_MONEY !== "undefined" && SAC_MOBILE_MONEY.runFlow) {
        const online = typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline());
        if (!online) throw new Error("Connexion API requise pour le paiement.");
        const currency = String(full.currency || "USD").toUpperCase();
        const amountCdf = currency === "CDF" ? fees.total : Math.round(fees.total * 2800);
        await SAC_MOBILE_MONEY.runFlow({
          provider: "orange",
          payerPhone: phone,
          amountCdf,
          amountUsd: currency === "USD" ? fees.total : 0,
          purpose: "evodigitalbooks",
          email: session?.identifiant || session?.email || phone,
          metadata: {
            bookId: full.id,
            bookTitle: full.title,
            authorEmail: full.authorEmail,
            authorMobileMoney: mmReceiver,
            authorShare: fees.authorShare,
            platformFee: fees.platformFee,
            currency,
          },
          onPinPrompt() {
            return prompt("Code PIN Mobile Money :") || "";
          },
        });
      } else {
        if (!confirm("Confirmer l'achat de « " + full.title + " » pour " + fees.total + " " + (full.currency || "USD") + " ?")) {
          return;
        }
      }
      const dev = registerDevice(session);
      if (!dev.ok && dev.reason === "device_limit") {
        throw new Error(
          "Limite de " + MAX_DEVICES_PER_ACCOUNT + " appareils atteinte pour ce compte. Retirez un appareil ou contactez le support."
        );
      }
      recordPurchase(full.id, session, {
        amount: fees.total,
        authorShare: fees.authorShare,
        platformFee: fees.platformFee,
        authorMobileMoney: mmReceiver,
      });
      alert("Achat confirmé — vous pouvez maintenant lire le livre.");
      openBook(full, session);
      window.dispatchEvent(new CustomEvent("sac-edb-catalog-refresh"));
    } catch (err) {
      alert(err.message || "Paiement impossible.");
    }
  }

  async function mountStorefront(rootId, session) {
    const root = document.getElementById(rootId);
    if (!root) return;
    root.innerHTML = '<p class="edb-loading">Chargement du catalogue…</p>';
    const cc =
      typeof SAC_AFRICA_COUNTRIES !== "undefined"
        ? SAC_AFRICA_COUNTRIES.getStoredCountry()
        : "CD";
    const all = await listLibraryBooks(cc);
    const free = all.filter((b) => b.isFree);
    const paid = all.filter((b) => !b.isFree);
    const bestsellers = sortBestsellers(all).slice(0, 8);
    const newest = sortNewest(all).slice(0, 8);

    function section(title, items, id) {
      if (!items.length) {
        return (
          '<section class="edb-section" id="' +
          id +
          '"><h2>' +
          esc(title) +
          '</h2><p class="edb-empty">Aucun livre pour le moment.</p></section>'
        );
      }
      return (
        '<section class="edb-section" id="' +
        id +
        '"><h2>' +
        esc(title) +
        '</h2><div class="edb-grid">' +
        items.map((b) => renderBookCard(b, session)).join("") +
        "</div></section>"
      );
    }

    root.innerHTML =
      section("🆕 Nouveautés", newest, "edbNew") +
      section("🔥 Les plus vendus", bestsellers, "edbBest") +
      section("🎁 Livres gratuits", free, "edbFree") +
      section("💳 Livres payants", paid, "edbPaid");

    bindStoreActions(root, all, session);
  }

  function mountAuthorPublisher(session, rootId) {
    const root = document.getElementById(rootId);
    if (!root) return;

    if (!session || session.role !== "auteur") {
      root.innerHTML = '<p class="edb-empty">Connexion auteur requise.</p>';
      return;
    }

    if (!isAuthorApproved(session)) {
      root.innerHTML =
        '<div class="edb-pending">' +
        "<h2>⏳ Validation en cours</h2>" +
        "<p>Votre compte auteur est en attente d'approbation par le Super Admin EvoSU. Vous pourrez publier dès validation.</p>" +
        '<p><a href="../evodigitalbooks/">Retour au portail</a></p></div>';
      return;
    }

    const books = getAuthorBooks(session);
    root.innerHTML =
      '<div class="edb-publish">' +
      '<div class="panel panel--ws"><div class="panel__head"><h2>Publier un livre</h2></div><div class="panel__body">' +
      '<p class="page-desc">Les ouvrages publiés apparaissent dans <strong>EvoDigitalBooks</strong> et la <strong>bibliothèque nationale</strong>. Commission plateforme : <strong>25 %</strong> — versement auteur sur votre Mobile Money.</p>' +
      '<form id="edbPublishForm" class="edb-form">' +
      '<div class="edb-form__grid">' +
      '<div class="fg"><label>Titre *</label><input type="text" class="fi" id="edbTitle" required /></div>' +
      '<div class="fg"><label>Catégorie *</label><select class="fi" id="edbCategory" required>' +
      categoriesSelectHtml() +
      "</select></div>" +
      '<div class="fg" style="grid-column:1/-1;"><label>Description</label><textarea class="fi" id="edbDesc" rows="3"></textarea></div>' +
      '<div class="fg"><label class="chk"><input type="checkbox" id="edbFree" /> Livre gratuit</label></div>' +
      '<div class="fg" id="edbPriceWrap"><label>Prix (USD) *</label><input type="number" class="fi" id="edbPrice" min="0.5" step="0.01" value="5" /></div>' +
      '<div class="fg"><label>Couverture *</label><input type="file" class="fi" id="edbCover" accept="image/*" required /></div>' +
      '<div class="fg"><label>Fichier livre (PDF/EPUB) *</label><input type="file" class="fi" id="edbFile" accept=".pdf,.epub,application/pdf" required /></div>' +
      "</div>" +
      '<p class="edb-fee-hint" id="edbFeeHint">Ex. prix 10 USD → vous recevez 7,50 USD · plateforme 2,50 USD</p>' +
      '<button type="submit" class="btn btn--role">Publier dans la bibliothèque</button>' +
      "</form></div></div>" +
      '<div class="panel panel--ws" style="margin-top:1.25rem;"><div class="panel__head"><h2>Mes livres (' +
      books.length +
      ')</h2></div><div class="panel__body" id="edbMyBooks"></div></div></div>';

    const freeCb = document.getElementById("edbFree");
    const priceWrap = document.getElementById("edbPriceWrap");
    const priceInp = document.getElementById("edbPrice");
    const feeHint = document.getElementById("edbFeeHint");

    function updateFeeHint() {
      if (!feeHint || !priceInp) return;
      if (freeCb?.checked) {
        feeHint.textContent = "Livre gratuit — accessible sans paiement.";
        return;
      }
      const f = splitFee(priceInp.value || 0);
      feeHint.textContent =
        "Prix " +
        f.total +
        " USD → vous recevez " +
        f.authorShare +
        " USD · plateforme " +
        f.platformFee +
        " USD (25 %)";
    }

    freeCb?.addEventListener("change", () => {
      if (priceWrap) priceWrap.hidden = !!freeCb.checked;
      updateFeeHint();
    });
    priceInp?.addEventListener("input", updateFeeHint);
    updateFeeHint();

    function renderMyBooks() {
      const host = document.getElementById("edbMyBooks");
      if (!host) return;
      const list = getAuthorBooks(session);
      if (!list.length) {
        host.innerHTML = '<p class="edb-empty">Aucune publication.</p>';
        return;
      }
      host.innerHTML =
        '<div class="edb-grid edb-grid--compact">' +
        list.map((b) => renderBookCard(publicBookView(b, true), session, { author: true })).join("") +
        "</div>";
    }
    renderMyBooks();

    document.getElementById("edbPublishForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Publication…";
      }
      try {
        const coverFile = document.getElementById("edbCover")?.files?.[0];
        const bookFile = document.getElementById("edbFile")?.files?.[0];
        const coverUrl = await uploadFile(coverFile, "cover");
        const fileUrl = await uploadFile(bookFile, "book");
        await publishBook(session, {
          title: document.getElementById("edbTitle")?.value,
          category: document.getElementById("edbCategory")?.value,
          description: document.getElementById("edbDesc")?.value,
          isFree: document.getElementById("edbFree")?.checked,
          price: document.getElementById("edbPrice")?.value,
          coverUrl,
          fileUrl,
        });
        alert("Livre publié — visible dans EvoDigitalBooks et la bibliothèque.");
        e.target.reset();
        updateFeeHint();
        renderMyBooks();
      } catch (err) {
        alert(err.message || "Publication impossible.");
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Publier dans la bibliothèque";
        }
      }
    });
  }

  async function mountAuthorValidation(rootId, session) {
    const root = document.getElementById(rootId);
    if (!root || session?.role !== "superadmin") return;
    root.innerHTML = '<p class="edb-loading">Chargement des demandes auteur…</p>';
    const pending = await listPendingAuthors();
    if (!pending.length) {
      root.innerHTML =
        '<p class="empty-tasks">Aucune demande auteur en attente.</p>';
      return;
    }
    root.innerHTML =
      '<table class="ws-table"><thead><tr><th>Auteur</th><th>E-mail</th><th>Mobile Money</th><th>Date</th><th></th></tr></thead><tbody>' +
      pending
        .map(
          (a) =>
            "<tr><td><strong>" +
            esc(a.penName) +
            "</strong></td><td>" +
            esc(a.email) +
            "</td><td><code>" +
            esc(a.mobileMoney) +
            "</code></td><td>" +
            esc((a.createdAt || "").slice(0, 10)) +
            '</td><td class="col-actions">' +
            '<button type="button" class="btn btn--role btn--xs" data-edb-approve="' +
            esc(a.email) +
            '">Approuver</button> ' +
            '<button type="button" class="btn btn--ghost btn--xs" data-edb-reject="' +
            esc(a.email) +
            '">Refuser</button></td></tr>'
        )
        .join("") +
      "</tbody></table>";

    root.querySelectorAll("[data-edb-approve]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await setAuthorStatus(btn.dataset.edbApprove, "approved", session);
          await mountAuthorValidation(rootId, session);
        } catch (err) {
          alert(err.message);
        }
      });
    });
    root.querySelectorAll("[data-edb-reject]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Refuser cette demande auteur ?")) return;
        try {
          await setAuthorStatus(btn.dataset.edbReject, "rejected", session);
          await mountAuthorValidation(rootId, session);
        } catch (err) {
          alert(err.message);
        }
      });
    });
  }

  return {
    SOURCE,
    PLATFORM_FEE_RATE,
    AUTHOR_SHARE_RATE,
    MAX_DEVICES_PER_ACCOUNT,
    registerAuthor,
    listPendingAuthors,
    setAuthorStatus,
    isAuthorApproved,
    listLibraryBooks,
    getAuthorBooks,
    publishBook,
    hasAccess,
    recordPurchase,
    mountStorefront,
    mountAuthorPublisher,
    mountAuthorValidation,
    openBook,
    openPurchaseDialog,
    splitFee,
    publicBookView,
    syncBooksToLibraryCache,
  };
})();

if (typeof document !== "undefined") {
  try {
    SAC_EDB.syncBooksToLibraryCache();
  } catch {
    /* ignore */
  }
}

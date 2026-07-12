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
  const DELETED_KEY = "sac_edb_deleted_ids";

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

  function readDeletedIds() {
    const raw = readJson(DELETED_KEY, []);
    return new Set(Array.isArray(raw) ? raw.map((id) => String(id)) : []);
  }

  function writeDeletedIds(set) {
    writeJson(DELETED_KEY, Array.from(set || []));
  }

  function markBookDeleted(bookId) {
    const id = String(bookId || "").trim();
    if (!id) return;
    const set = readDeletedIds();
    set.add(id);
    writeDeletedIds(set);
  }

  function unmarkBookDeleted(bookId) {
    const id = String(bookId || "").trim();
    if (!id) return;
    const set = readDeletedIds();
    if (!set.delete(id)) return;
    writeDeletedIds(set);
  }

  function isBookDeleted(bookId) {
    return readDeletedIds().has(String(bookId || "").trim());
  }

  function purgeBookFromAllCaches(bookId) {
    const id = String(bookId || "").trim();
    if (!id) return;
    writeBooks(readBooks().filter((b) => b.id !== id));
    try {
      const cacheKey = "sac_digital_library_cache";
      const existing = readJson(cacheKey, []);
      writeJson(
        cacheKey,
        existing.filter((x) => String(x?.id || "") !== id)
      );
    } catch {
      /* ignore */
    }
    try {
      const legacy = readJson("sac_library_items", []);
      writeJson(
        "sac_library_items",
        legacy.filter((x) => String(x?.id || "") !== id)
      );
    } catch {
      /* ignore */
    }
    if (typeof SAC_LIBRARY !== "undefined" && SAC_LIBRARY.removeCachedBook) {
      SAC_LIBRARY.removeCachedBook(id);
    }
    markBookDeleted(id);
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

  function parseMobileNumbers(payload) {
    const fromArray = Array.isArray(payload?.mobileMoneyNumbers)
      ? payload.mobileMoneyNumbers
      : [];
    const fields = [
      payload?.mobileMoney,
      payload?.mobileMoney2,
      payload?.mobileMoney3,
      payload?.mobile_money,
      payload?.mobile_money_2,
      payload?.mobile_money_3,
      ...fromArray,
    ];
    const seen = new Set();
    const out = [];
    fields.forEach((raw) => {
      const n = String(raw || "").trim();
      if (!n) return;
      const key = n.replace(/\s/g, "");
      if (seen.has(key)) return;
      seen.add(key);
      out.push(n);
    });
    return out.slice(0, 3);
  }

  function authorMobileNumbers(authorOrBook) {
    if (!authorOrBook) return [];
    if (Array.isArray(authorOrBook.mobileMoneyNumbers) && authorOrBook.mobileMoneyNumbers.length) {
      return authorOrBook.mobileMoneyNumbers.filter(Boolean).slice(0, 3);
    }
    return parseMobileNumbers(authorOrBook);
  }

  function validateAuthorMobileNumbers(numbers) {
    if (!numbers.length) {
      throw new Error("Indiquez au moins un numéro Mobile Money (réception des paiements).");
    }
    if (typeof SAC_IDENTITY !== "undefined") {
      numbers.forEach((n, i) => {
        const ph = SAC_IDENTITY.validatePhone(n);
        if (!ph.ok) {
          throw new Error("Numéro Mobile Money " + (i + 1) + " invalide.");
        }
      });
    }
    return numbers;
  }

  function formatMobileNumbersList(numbers) {
    const list = authorMobileNumbers({ mobileMoneyNumbers: numbers });
    if (!list.length) return "—";
    return list.map((n) => esc(n)).join("<br>");
  }

  function attachMobileFields(target, numbers) {
    const list = numbers.slice(0, 3);
    target.mobileMoney = list[0] || "";
    target.mobileMoney2 = list[1] || "";
    target.mobileMoney3 = list[2] || "";
    target.mobileMoneyNumbers = list;
    return target;
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
    const deleted = readDeletedIds();
    const published = (books || readBooks())
      .filter(
        (b) =>
          b.published !== false &&
          b.status === "published" &&
          !deleted.has(String(b.id || ""))
      )
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
    b.isFree = !!(b.isFree ?? b.is_free ?? b.free ?? (Number(b.price || 0) <= 0));
    b.is_free = b.isFree;
    b.free = b.isFree;
    b.accessType = b.isFree ? "free" : "paid";
    if (!includeFileForSync && !b.isFree) {
      delete b.fileUrl;
      delete b.file_url;
    }
    return b;
  }

  function mapApiBookToLocal(item) {
    const isFree = !!(
      item.isFree ??
      item.is_free ??
      item.free ??
      (Number(item.price || 0) <= 0 && item.accessType !== "paid")
    );
    return {
      id: item.id,
      title: item.title || "",
      author: item.author || "",
      authorEmail: normEmail(item.authorEmail || item.authorId || ""),
      authorMobileMoney: item.authorMobileMoney || authorMobileNumbers(item)[0] || "",
      authorMobileMoney2: item.authorMobileMoney2 || "",
      authorMobileMoney3: item.authorMobileMoney3 || "",
      authorMobileMoneyNumbers: authorMobileNumbers(item),
      category: item.category || "roman",
      description: item.description || "",
      language: item.language || "fr",
      countryCode: String(item.countryCode || "CD").toUpperCase(),
      isFree,
      price: Number(item.price) || 0,
      currency: String(item.currency || "USD").toUpperCase(),
      fileUrl: item.fileUrl || item.file_url || "",
      coverUrl: item.coverUrl || item.cover_url || "",
      cover_url: item.coverUrl || item.cover_url || "",
      file_url: item.fileUrl || item.file_url || "",
      source: SOURCE,
      authorRole: item.authorRole || "auteur",
      published: item.published !== false,
      status: "published",
      createdAt: item.createdAt || item.created_at || "",
      updatedAt: item.updatedAt || item.updated_at || "",
    };
  }

  function isEdbLibraryItem(item) {
    if (!item) return false;
    return (
      item.source === SOURCE ||
      item.authorRole === "auteur" ||
      String(item.id || "").indexOf("edb_") === 0
    );
  }

  function mergeBooksFromApi(apiItems) {
    const deleted = readDeletedIds();
    const filtered = (apiItems || [])
      .filter(isEdbLibraryItem)
      .filter((item) => !deleted.has(String(item?.id || "")))
      .map(mapApiBookToLocal);
    const apiIds = new Set(filtered.map((b) => b.id));
    const local = readBooks();
    const byId = {};
    local.forEach((b) => {
      if (deleted.has(String(b.id || ""))) return;
      const isPublished = b.published !== false && b.status === "published";
      if (!isPublished) {
        byId[b.id] = b;
        return;
      }
      if (apiIds.has(b.id)) byId[b.id] = b;
    });
    filtered.forEach((item) => {
      const mapped = item;
      const prev = byId[mapped.id];
      if (prev) {
        byId[mapped.id] = {
          ...prev,
          ...mapped,
          fileUrl: mapped.fileUrl || prev.fileUrl || "",
          file_url: mapped.fileUrl || prev.file_url || prev.fileUrl || "",
        };
      } else {
        byId[mapped.id] = mapped;
      }
    });
    writeBooks(Object.values(byId));
  }

  async function syncEdbCatalogFromApi(countryCode, session) {
    if (typeof SAC_API === "undefined") return;
    try {
      const online = await SAC_API.ensureOnline(false, { maxWaitMs: 15000 });
      if (!online) return;
      let data;
      if (session && SAC_API.listDigitalLibraryForUser) {
        if (SAC_API.ensureApiSession) await SAC_API.ensureApiSession({ soft: true });
        data = await SAC_API.listDigitalLibraryForUser(countryCode);
      } else if (SAC_API.listDigitalLibrary) {
        data = await SAC_API.listDigitalLibrary(countryCode);
      } else {
        return;
      }
      mergeBooksFromApi(data?.items || []);
    } catch (err) {
      console.warn("[SAC_EDB] sync catalog:", err.message || err);
    }
  }

  async function syncAuthorBooksFromApi(session) {
    if (!session || session.role !== "auteur") return;
    if (typeof SAC_API === "undefined" || !SAC_API.listDigitalLibraryManage) return;
    try {
      const online = await SAC_API.ensureOnline(false, { maxWaitMs: 15000 });
      if (!online) return;
      if (SAC_API.ensureApiSession) await SAC_API.ensureApiSession({ soft: true });
      const data = await SAC_API.listDigitalLibraryManage();
      const email = normEmail(session.identifiant || session.email);
      const mine = (data?.items || []).filter(
        (x) =>
          isEdbLibraryItem(x) &&
          normEmail(x.authorEmail || x.authorId || "") === email
      );
      mergeBooksFromApi(mine.length ? mine : (data?.items || []).filter(isEdbLibraryItem));
    } catch (err) {
      console.warn("[SAC_EDB] sync author books:", err.message || err);
    }
  }

  async function syncPurchasesFromApi(session) {
    const email = normEmail(session?.identifiant || session?.email);
    if (!email || typeof SAC_API === "undefined" || !SAC_API.listMyEdbPurchases) return;
    try {
      const online = await SAC_API.ensureOnline(false, { maxWaitMs: 12000 });
      if (!online) return;
      if (SAC_API.ensureApiSession) await SAC_API.ensureApiSession({ soft: true });
      const data = await SAC_API.listMyEdbPurchases();
      const ids = Array.isArray(data?.bookIds) ? data.bookIds : [];
      if (!ids.length) return;
      const map = readPurchasesMap();
      const list = Array.isArray(map[email]) ? map[email].slice() : [];
      ids.forEach((id) => {
        if (id && !list.includes(id)) list.push(id);
      });
      map[email] = list;
      writeJson(PURCHASES_KEY, map);
    } catch (err) {
      console.warn("[SAC_EDB] sync purchases:", err.message || err);
    }
  }

  async function registerAuthor(payload) {
    const email = normEmail(payload.email);
    const password = payload.password || "";
    const penName = String(payload.penName || payload.prenom || "").trim();
    const mobileNumbers = validateAuthorMobileNumbers(parseMobileNumbers(payload));
    const bio = String(payload.bio || "").trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("E-mail invalide.");
    }
    if (typeof SAC_IDENTITY !== "undefined") {
      const pw = SAC_IDENTITY.validatePassword(password);
      if (!pw.ok) throw new Error(pw.message);
    } else {
      if (password.length < 8) throw new Error("Mot de passe : 8 caractères minimum.");
    }
    if (!penName || penName.length < 2) throw new Error("Indiquez votre nom d'auteur.");
    if (authorByEmail(email)) throw new Error("Un compte auteur existe déjà pour cet e-mail.");

    const author = attachMobileFields(
      {
        id: "edb_author_" + Date.now(),
        email,
        penName,
        bio,
        status: "pending",
        createdAt: new Date().toISOString(),
      },
      mobileNumbers
    );

    if (typeof SAC_API !== "undefined" && SAC_API.registerEdbAuthor) {
      try {
        await SAC_API.ensureOnline(true);
        const data = await SAC_API.registerEdbAuthor({
          email,
          password,
          penName,
          mobileMoney: author.mobileMoney,
          mobileMoney2: author.mobileMoney2 || "",
          mobileMoney3: author.mobileMoney3 || "",
          bio,
          role: "auteur",
        });
        if (data?.author) {
          Object.assign(author, attachMobileFields({}, authorMobileNumbers(data.author)));
          author.serverSynced = true;
          if (data.author.id) author.id = data.author.id;
          if (data.author.status) author.status = data.author.status;
        }
      } catch (err) {
        const isLocal = /localhost|127\.0\.0\.1/i.test(location.hostname);
        if (err.status === 409) {
          throw new Error("Un compte auteur existe déjà pour cet e-mail.");
        }
        if (!isLocal) {
          throw new Error(
            err.message || "Inscription serveur impossible — réessayez ou contactez le support."
          );
        }
        console.warn("[SAC_EDB] register API (local only):", err.message || err);
      }
    } else if (!/localhost|127\.0\.0\.1/i.test(location.hostname)) {
      throw new Error("Connexion API requise pour enregistrer votre inscription auteur.");
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
        serverSynced: !!author.serverSynced,
        mobileMoney: author.mobileMoney,
        mobileMoney2: author.mobileMoney2,
        mobileMoney3: author.mobileMoney3,
      });
      localStorage.setItem("sac_users", JSON.stringify(users));
    }

    return author;
  }

  async function ensureLocalAuthorProfile(session) {
    if (!session) return null;
    const email = normEmail(session.identifiant || session.email);
    if (!email) return null;

    let author = authorByEmail(email);
    if (author) return author;

    await syncAuthorProfileFromApi(session);
    author = authorByEmail(email);
    if (author) return author;

    const mobileFromUser = {};
    if (typeof SAC_IDENTITY !== "undefined") {
      const user = SAC_IDENTITY.getLocalUsers().find((u) => normEmail(u.email) === email);
      if (user) {
        mobileFromUser.mobileMoney = user.mobileMoney || "";
        mobileFromUser.mobileMoney2 = user.mobileMoney2 || "";
        mobileFromUser.mobileMoney3 = user.mobileMoney3 || "";
      }
    }

    return upsertLocalAuthor({
      id: "edb_author_" + email.replace(/[^a-z0-9]+/gi, "_").slice(0, 48),
      email,
      penName: session.penName || session.displayName || session.prenom || email,
      status: session.authorStatus || "approved",
      createdAt: new Date().toISOString(),
      ...mobileFromUser,
    });
  }

  async function updateAuthorPaymentNumbers(session, payload) {
    if (!isAuthorApproved(session)) {
      throw new Error("Compte auteur non validé.");
    }
    const email = normEmail(session.identifiant || session.email);
    const numbers = validateAuthorMobileNumbers(parseMobileNumbers(payload));
    await ensureLocalAuthorProfile(session);
    const list = readAuthors();
    let idx = list.findIndex((a) => normEmail(a.email) === email);
    if (idx < 0) {
      upsertLocalAuthor({
        id: "edb_author_" + Date.now(),
        email,
        penName: session.penName || session.displayName || email,
        status: "approved",
        createdAt: new Date().toISOString(),
      });
      idx = readAuthors().findIndex((a) => normEmail(a.email) === email);
    }
    if (idx < 0) throw new Error("Profil auteur introuvable — reconnectez-vous.");
    list[idx] = attachMobileFields({ ...list[idx] }, numbers);
    writeAuthors(list);
    const savedIdx = idx;
    if (typeof SAC_IDENTITY !== "undefined") {
      const users = SAC_IDENTITY.getLocalUsers();
      const ui = users.findIndex((u) => normEmail(u.email) === email);
      if (ui >= 0) {
        users[ui].mobileMoney = numbers[0] || "";
        users[ui].mobileMoney2 = numbers[1] || "";
        users[ui].mobileMoney3 = numbers[2] || "";
        localStorage.setItem("sac_users", JSON.stringify(users));
      }
    }
    if (typeof SAC_API !== "undefined" && SAC_API.updateEdbAuthorPaymentNumbers) {
      try {
        await SAC_API.ensureOnline(true);
        const data = await SAC_API.updateEdbAuthorPaymentNumbers(email, {
          mobileMoney: numbers[0] || "",
          mobileMoney2: numbers[1] || "",
          mobileMoney3: numbers[2] || "",
        });
        if (data?.author) {
          const fresh = readAuthors();
          const fi = fresh.findIndex((a) => normEmail(a.email) === email);
          if (fi >= 0) {
            fresh[fi] = attachMobileFields({ ...fresh[fi] }, authorMobileNumbers(data.author));
            writeAuthors(fresh);
          }
        }
      } catch (err) {
        if (!/localhost|127\.0\.0\.1/i.test(location.hostname)) {
          console.warn("[SAC_EDB] update payment numbers API:", err.message || err);
        }
      }
    }
    return readAuthors().find((a) => normEmail(a.email) === email) || readAuthors()[savedIdx];
  }

  function mergeAuthorsFromApi(apiAuthors) {
    if (!Array.isArray(apiAuthors)) return;
    const list = readAuthors();
    const byEmail = {};
    list.forEach((a) => {
      byEmail[normEmail(a.email)] = a;
    });
    apiAuthors.forEach((a) => {
      const key = normEmail(a.email);
      if (!key) return;
      const merged = attachMobileFields({ ...byEmail[key], ...a, email: key }, authorMobileNumbers(a));
      byEmail[key] = merged;
    });
    writeAuthors(Object.values(byEmail));
  }

  function upsertLocalAuthor(author) {
    if (!author?.email) return null;
    const key = normEmail(author.email);
    const list = readAuthors();
    const idx = list.findIndex((a) => normEmail(a.email) === key);
    const merged = attachMobileFields(
      {
        ...(idx >= 0 ? list[idx] : {}),
        ...author,
        email: key,
        status: author.status || (idx >= 0 ? list[idx].status : "pending"),
      },
      authorMobileNumbers(author)
    );
    if (idx >= 0) list[idx] = merged;
    else list.push(merged);
    writeAuthors(list);
    return merged;
  }

  function mirrorAuthorStatusToSession(session, author) {
    if (!session || !author) return session;
    const status = author.status || session.authorStatus || "pending";
    const merged = {
      ...session,
      authorStatus: status,
      penName: author.penName || session.penName,
      displayName: author.penName || session.displayName || session.penName,
    };
    if (typeof SAC_SESSION !== "undefined" && SAC_SESSION.saveSession) {
      SAC_SESSION.saveSession(merged);
    }
    if (typeof SAC_IDENTITY !== "undefined") {
      const users = SAC_IDENTITY.getLocalUsers();
      const email = normEmail(session.identifiant || session.email);
      const ui = users.findIndex((u) => normEmail(u.email) === email);
      if (ui >= 0) {
        users[ui].authorStatus = status;
        if (author.penName) {
          users[ui].prenom = author.penName.split(/\s+/)[0] || author.penName;
          users[ui].nom = author.penName.split(/\s+/).slice(1).join(" ") || author.penName;
        }
        if (typeof SAC_IDENTITY.persistLocalUsers === "function") {
          SAC_IDENTITY.persistLocalUsers(users);
        } else {
          localStorage.setItem("sac_users", JSON.stringify(users));
        }
      }
    }
    return merged;
  }

  async function syncAuthorProfileFromApi(session) {
    if (!session || session.role !== "auteur") return session;
    const email = normEmail(session.identifiant || session.email);
    let localAuthor = authorByEmail(email);

    if (typeof SAC_API !== "undefined") {
      try {
        const online = await SAC_API.ensureOnline(false, { maxWaitMs: 15000 });
        if (online) {
          if (SAC_API.ensureApiSession) await SAC_API.ensureApiSession({ soft: true });
          let author = null;
          if (SAC_API.getEdbAuthorMe) {
            try {
              const data = await SAC_API.getEdbAuthorMe();
              author = data?.author || null;
            } catch (err) {
              if (err.status !== 404 && err.status !== 401 && SAC_API.getEdbAuthor) {
                const data = await SAC_API.getEdbAuthor(email);
                author = data?.author || null;
              }
            }
          } else if (SAC_API.getEdbAuthor) {
            const data = await SAC_API.getEdbAuthor(email);
            author = data?.author || null;
          }
          if (author) localAuthor = upsertLocalAuthor(author);
        }
      } catch (err) {
        console.warn("[SAC_EDB] sync author profile:", err.message || err);
      }
    }

    if (localAuthor) return mirrorAuthorStatusToSession(session, localAuthor);
    return session;
  }

  async function listPendingAuthors() {
    if (typeof SAC_API !== "undefined" && SAC_API.listPendingEdbAuthors) {
      try {
        const online = await SAC_API.ensureOnline(false, { maxWaitMs: 15000 });
        if (online) {
          if (SAC_API.ensureApiSession) await SAC_API.ensureApiSession({ soft: true });
          const data = await SAC_API.listPendingEdbAuthors();
          const apiAuthors = data?.authors || [];
          mergeAuthorsFromApi(apiAuthors);
          return apiAuthors;
        }
      } catch (err) {
        console.warn("[SAC_EDB] pending API:", err.message || err);
      }
    }
    return readAuthors().filter((a) => a.status === "pending");
  }

  async function setAuthorStatus(email, status, reviewerSession, authorHint) {
    const key = normEmail(email);
    if (!key) throw new Error("E-mail invalide.");

    let serverAuthor = null;

    if (typeof SAC_API !== "undefined" && SAC_API.approveEdbAuthor) {
      try {
        await SAC_API.ensureOnline(true);
        if (SAC_API.ensureApiSession) await SAC_API.ensureApiSession();
        const data = await SAC_API.approveEdbAuthor(key, { status });
        serverAuthor = data?.author || null;
      } catch (err) {
        const code = err.code || "";
        if (code === "AUTHOR_NOT_FOUND" || err.status === 404) {
          throw new Error(
            "Auteur introuvable sur le serveur — vérifiez le déploiement API EvoDigitalBooks."
          );
        }
        throw new Error(err.message || "Validation impossible sur le serveur.");
      }
    }

    const list = readAuthors();
    const idx = list.findIndex((a) => normEmail(a.email) === key);
    const now = new Date().toISOString();
    const reviewer = reviewerSession?.identifiant || reviewerSession?.email || "";
    let result;

    if (idx >= 0) {
      list[idx].status = status;
      list[idx].reviewedAt = now;
      list[idx].reviewedBy = reviewer;
      if (serverAuthor) Object.assign(list[idx], serverAuthor);
      writeAuthors(list);
      result = list[idx];
    } else {
      result = {
        ...(authorHint && typeof authorHint === "object" ? authorHint : {}),
        ...(serverAuthor && typeof serverAuthor === "object" ? serverAuthor : {}),
        email: key,
        status,
        reviewedAt: now,
        reviewedBy: reviewer,
      };
      list.push(result);
      writeAuthors(list);
    }

    if (typeof SAC_IDENTITY !== "undefined") {
      const users = SAC_IDENTITY.getLocalUsers();
      const u = users.find((x) => normEmail(x.email) === key);
      if (u) {
        u.authorStatus = status;
        localStorage.setItem("sac_users", JSON.stringify(users));
      }
    }

    return result;
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

  async function recordPurchase(bookId, session, meta) {
    const email = normEmail(session?.identifiant || session?.email);
    if (!email || !bookId) return;
    const deviceId = getDeviceId();
    const map = readPurchasesMap();
    const list = Array.isArray(map[email]) ? map[email].slice() : [];
    if (!list.includes(bookId)) list.push(bookId);
    map[email] = list;
    writeJson(PURCHASES_KEY, map);
    registerDevice(session);
    bumpSales(bookId);
    if (typeof SAC_API !== "undefined" && SAC_API.recordEdbPurchase) {
      try {
        await SAC_API.recordEdbPurchase({
          bookId,
          email,
          deviceId,
          authorEmail: meta?.authorEmail || "",
          ...meta,
        });
      } catch (err) {
        console.warn("[SAC_EDB] record purchase API:", err.message || err);
      }
    }
    window.dispatchEvent(new CustomEvent("sac-edb-purchase", { detail: { bookId } }));
  }

  async function listLibraryBooks(countryCode, session) {
    await syncEdbCatalogFromApi(countryCode, session || null);
    if (session) await syncPurchasesFromApi(session);
    const deleted = readDeletedIds();
    let items = readBooks().filter(
      (b) =>
        b.published !== false &&
        b.status === "published" &&
        !deleted.has(String(b.id || ""))
    );
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
    const authorMm = authorMobileNumbers(author);
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

    const book = attachMobileFields(
      {
        id: raw.id || "edb_" + Date.now(),
        title,
        author: author?.penName || session.displayName || email,
        authorEmail: email,
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
      },
      authorMm.length ? authorMm : authorMobileNumbers({ authorMobileMoney: raw.authorMobileMoney })
    );

    const list = readBooks();
    const idx = list.findIndex((b) => b.id === book.id);
    if (idx >= 0) list[idx] = book;
    else list.push(book);
    unmarkBookDeleted(book.id);
    writeBooks(list);

    const libPayload = {
      ...book,
      scope: "national",
      accessType: isFree ? "free" : "paid",
    };

    if (typeof SAC_API !== "undefined" && SAC_API.createDigitalLibraryBook) {
      await SAC_API.ensureOnline(true);
      if (SAC_API.ensureWritableApiSession) {
        const writable = await SAC_API.ensureWritableApiSession({ soft: false });
        if (!writable) {
          throw new Error("Session API expirée — déconnectez-vous et reconnectez-vous.");
        }
      } else if (SAC_API.ensureApiSession) {
        const ok = await SAC_API.ensureApiSession();
        if (!ok) throw new Error("Session API requise — reconnectez-vous.");
      }
      try {
        if (idx >= 0 && SAC_API.updateDigitalLibraryBook) {
          await SAC_API.updateDigitalLibraryBook(book.id, libPayload);
        } else {
          await SAC_API.createDigitalLibraryBook(libPayload);
        }
      } catch (err) {
        const msg = err.message || "Erreur serveur lors de la publication.";
        if (err.status === 413 || err.code === "FILE_TOO_LARGE") {
          throw new Error("Fichier trop volumineux (max 50 Mo par fichier).");
        }
        if (err.status === 403) {
          throw new Error("Accès refusé — compte auteur non validé ou session expirée.");
        }
        throw new Error(msg);
      }
    }

    return book;
  }

  async function deleteAuthorBook(session, bookId) {
    if (!isAuthorApproved(session)) {
      throw new Error("Compte auteur non validé.");
    }
    const id = String(bookId || "").trim();
    if (!id) throw new Error("Livre introuvable.");
    const email = normEmail(session.identifiant || session.email);
    const book = readBooks().find((b) => b.id === id);
    if (!book) throw new Error("Livre introuvable.");
    if (normEmail(book.authorEmail) !== email) {
      throw new Error("Vous ne pouvez supprimer que vos propres publications.");
    }

    const sales = readSales()[id] || 0;
    let confirmMsg =
      "Supprimer définitivement « " +
      (book.title || "ce livre") +
      " » ?\n\nLe document sera retiré du serveur, de la base de données et du catalogue pour tous les utilisateurs.";
    if (sales > 0) {
      confirmMsg +=
        "\n\n" +
        sales +
        " vente(s) déjà enregistrée(s) — les acheteurs conservent l'accès au fichier.";
    }
    if (!confirm(confirmMsg)) return false;

    let serverDeleted = false;
    if (typeof SAC_API !== "undefined" && SAC_API.deleteDigitalLibraryBook) {
      await SAC_API.ensureOnline(true);
      if (SAC_API.ensureWritableApiSession) {
        const writable = await SAC_API.ensureWritableApiSession({ soft: false });
        if (!writable) throw new Error("Session API expirée — reconnectez-vous.");
      } else if (SAC_API.ensureApiSession) {
        const ok = await SAC_API.ensureApiSession();
        if (!ok) throw new Error("Session API requise — reconnectez-vous.");
      }
      try {
        await SAC_API.deleteDigitalLibraryBook(id);
        serverDeleted = true;
      } catch (err) {
        if (err.status === 404) {
          serverDeleted = true;
        } else if (err.status === 403) {
          throw new Error("Suppression refusée — reconnectez-vous ou contactez le support.");
        } else {
          throw new Error(
            err.message ||
              "Suppression impossible sur le serveur. Le livre reste visible tant que la suppression n'est pas confirmée par l'API."
          );
        }
      }
    } else {
      throw new Error("Connexion API requise pour supprimer définitivement ce livre.");
    }

    if (!serverDeleted) {
      throw new Error("Suppression serveur non confirmée.");
    }

    purgeBookFromAllCaches(id);
    window.dispatchEvent(new CustomEvent("sac-edb-catalog-refresh", { detail: { bookId: id } }));
    window.dispatchEvent(new CustomEvent("sac-library-refresh", { detail: { bookId: id } }));
    return true;
  }

  async function uploadFile(file, kind) {
    if (!file) throw new Error("Fichier manquant.");
    if (typeof SAC_API === "undefined") throw new Error("API indisponible.");
    const online = await SAC_API.ensureOnline(true);
    if (!online) throw new Error("Connexion API requise pour téléverser.");
    if (SAC_API.ensureWritableApiSession) {
      const writable = await SAC_API.ensureWritableApiSession({ soft: false });
      if (!writable) throw new Error("Session expirée — reconnectez-vous.");
    }
    const fd = new FormData();
    fd.append("files", file);
    try {
      const data = await SAC_API.uploadDigitalLibraryFile(fd);
      const url = data?.fileUrl || data?.url || "";
      if (!url) throw new Error("Téléversement échoué — URL absente.");
      return url;
    } catch (err) {
      if (err.status === 413 || err.code === "FILE_TOO_LARGE") {
        throw new Error(
          (kind === "book" ? "Livre" : "Couverture") + " trop volumineux (max 50 Mo)."
        );
      }
      throw new Error(err.message || "Erreur serveur lors du téléversement.");
    }
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
        void openBook(book, session);
      });
    });
    root.querySelectorAll("[data-edb-buy]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const book = fullById[btn.dataset.edbBuy] || byId[btn.dataset.edbBuy];
        openPurchaseDialog(book, session);
      });
    });
  }

  async function openBook(book, session) {
    if (!book) return;
    let full = readBooks().find((b) => b.id === book.id) || book;
    if (!hasAccess(full, session)) {
      openPurchaseDialog(full, session);
      return;
    }
    let url = absUrl(full.fileUrl || full.file_url);
    if (!url) {
      await syncEdbCatalogFromApi(null, session);
      full = readBooks().find((b) => b.id === book.id) || full;
      url = absUrl(full.fileUrl || full.file_url);
    }
    if (!url) {
      alert("Fichier indisponible — reconnectez-vous ou réessayez dans un instant.");
      return;
    }
    window.open(url, "_blank", "noopener");
  }

  function maskMmPhone(phone) {
    const raw = String(phone || "").trim();
    const d = raw.replace(/\D/g, "");
    if (d.length < 8) return raw || "—";
    const cc = d.length > 9 ? "+" + d.slice(0, 3) : "+243";
    const local = d.length > 9 ? d.slice(3) : d;
    if (local.length < 6) return raw;
    return cc + " " + local.slice(0, 2) + "XXXXX" + local.slice(-5);
  }

  function renderEdbPayDest(modal, method, full, fees, mmReceiver, currency) {
    const box = modal.querySelector("#edbPayDestInfo");
    if (!box) return;
    const provider = method === "mpesa" ? "M-Pesa (Vodacom)" : "Orange Money";
    const masked = maskMmPhone(mmReceiver);
    box.innerHTML =
      "<div class='pay-dest-secure'><span class='pay-shield-badge'>Compte auteur</span></div>" +
      "<strong>" +
      esc(provider) +
      "</strong><br/>Livre : <strong>" +
      esc(full.title || "") +
      "</strong><br/>Titulaire : <strong>" +
      esc(full.author || "Auteur") +
      "</strong><br/>Versement auteur (75 %) : <code class='pay-account-masked'>" +
      esc(masked) +
      "</code><br/><small>Commission plateforme EvoDigitalBooks (25 %) : " +
      esc(formatMoney(fees.platformFee, currency)) +
      " · Max. 3 appareils par compte</small>";
  }

  function openEdbPayModal(modal) {
    modal.hidden = false;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("edb-pay-open");
  }

  function closeEdbPayModal(modal) {
    modal.classList.remove("open");
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("edb-pay-open");
    showEdbPayStep(modal, "main");
  }

  function ensureEdbPurchaseModal() {
    let modal = document.getElementById("edbPayModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "edbPayModal";
    modal.className = "pay-modal-overlay edb-pay-overlay";
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML =
      '<div class="pay-modal pay-modal--wide edb-pay-slip" role="dialog" aria-modal="true" aria-labelledby="edbPayHeading">' +
      '<div class="pay-modal__head">' +
      "<div><h3 id=\"edbPayHeading\">Acheter ce livre</h3>" +
      '<p class="pay-modal__fee-label" id="edbPayFeeLabel">—</p></div>' +
      '<div class="pay-modal__amount" id="edbPayAmount">—</div></div>' +
      '<p class="pay-modal__intro">Versement <strong>100 % en ligne</strong> via Mobile Money — ' +
      "<strong>75 % vers l'auteur</strong> · <strong>25 % plateforme</strong> EvoDigitalBooks.</p>" +
      '<div class="pay-methods pay-methods--bar pay-methods--edb" id="edbPayMethods">' +
      '<button type="button" class="pay-method is-active" data-edb-pay-method="orange">🟠 Orange Money</button>' +
      '<button type="button" class="pay-method" data-edb-pay-method="mpesa">📱 M-Pesa</button>' +
      "</div>" +
      '<div id="edbPayDestInfo" class="pay-bank-card pay-bank-card--dest"></div>' +
      '<div id="edbPayAuthorMmWrap" class="pay-confirm-box pay-modal__field" hidden>' +
      '<label for="edbPayAuthorMm">Numéro auteur (réception 75 %)</label>' +
      '<select class="fi" id="edbPayAuthorMm"></select>' +
      "<p class=\"pay-confirm-hint\">Choisissez le numéro Mobile Money de l'auteur si plusieurs sont enregistrés.</p>" +
      "</div>" +
      '<div id="edbPayMainStep">' +
      '<div class="pay-modal__fields pay-modal__fields--single">' +
      '<div class="pay-confirm-box pay-modal__field">' +
      '<label for="edbPayPhone">Votre numéro Mobile Money *</label>' +
      '<input type="tel" class="fi" id="edbPayPhone" placeholder="+243 8XX XXX XXX" autocomplete="tel" inputmode="tel" />' +
      "<p class=\"pay-confirm-hint\">Une demande de paiement sera envoyée sur votre téléphone pour validation.</p>" +
      "</div></div>" +
      '<p class="edb-pay-status" id="edbPayStatus" hidden></p>' +
      '<div class="pay-modal__actions">' +
      '<button type="button" class="btn btn--primary" id="edbPayConfirm">Payer par Mobile Money</button>' +
      '<button type="button" class="btn btn--ghost" data-edb-pay-close>Annuler</button>' +
      "</div></div>" +
      '<div id="edbPayPinStep" hidden>' +
      '<div class="pay-confirm-box">' +
      "<p class=\"edb-pay-pin-lead\">Entrez votre <strong>code PIN Mobile Money</strong> pour confirmer le paiement.</p>" +
      '<label for="edbPayPin">Code PIN *</label>' +
      '<input type="password" class="fi" id="edbPayPin" maxlength="8" inputmode="numeric" autocomplete="one-time-code" placeholder="••••" />' +
      "</div>" +
      '<p class="edb-pay-status" id="edbPayPinStatus" hidden></p>' +
      '<div class="pay-modal__actions">' +
      '<button type="button" class="btn btn--primary" id="edbPayPinConfirm">Confirmer le paiement</button>' +
      '<button type="button" class="btn btn--ghost" id="edbPayPinCancel">Retour</button>' +
      "</div></div></div>";
    document.body.appendChild(modal);

    if (!document.getElementById("edbPayModalStyles")) {
      const fix = document.createElement("style");
      fix.id = "edbPayModalStyles";
      fix.textContent =
        "#edbPayModal.pay-modal-overlay{position:fixed;inset:0;display:none;align-items:center;justify-content:center;padding:1rem;z-index:25000;background:rgba(15,23,42,.55)}" +
        "#edbPayModal.pay-modal-overlay.open{display:flex!important}" +
        "#edbPayModal.pay-modal-overlay[hidden]{display:none!important}";
      document.head.appendChild(fix);
    }

    let activeMethod = "orange";
    modal.querySelectorAll("[data-edb-pay-method]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeMethod = btn.dataset.edbPayMethod || "orange";
        modal.querySelectorAll("[data-edb-pay-method]").forEach((b) => {
          b.classList.toggle("is-active", b === btn);
        });
        if (modal._payContext) {
          const ctx = modal._payContext;
          const mm =
            modal.querySelector("#edbPayAuthorMm")?.value || ctx.mmReceiver || authorMobileNumbers(ctx.full)[0];
          ctx.mmReceiver = mm;
          renderEdbPayDest(modal, activeMethod, ctx.full, ctx.fees, mm, ctx.currency);
        }
      });
    });
    modal._getPayMethod = () => activeMethod;

    modal.querySelectorAll("[data-edb-pay-close]").forEach((el) => {
      el.addEventListener("click", () => closeEdbPayModal(modal));
    });
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeEdbPayModal(modal);
    });
    modal.querySelector(".pay-modal")?.addEventListener("click", (e) => e.stopPropagation());

    modal.querySelector("#edbPayAuthorMm")?.addEventListener("change", () => {
      if (!modal._payContext) return;
      const ctx = modal._payContext;
      const mm = modal.querySelector("#edbPayAuthorMm")?.value || ctx.mmReceiver;
      ctx.mmReceiver = mm;
      renderEdbPayDest(modal, modal._getPayMethod(), ctx.full, ctx.fees, mm, ctx.currency);
    });

    return modal;
  }

  function showEdbPayStep(modal, step) {
    const main = modal.querySelector("#edbPayMainStep");
    const pin = modal.querySelector("#edbPayPinStep");
    if (main) main.hidden = step !== "main";
    if (pin) pin.hidden = step !== "pin";
  }

  function requestPinInModal(modal) {
    return new Promise((resolve) => {
      const pinInput = modal.querySelector("#edbPayPin");
      const confirmBtn = modal.querySelector("#edbPayPinConfirm");
      const cancelBtn = modal.querySelector("#edbPayPinCancel");
      if (!pinInput || !confirmBtn || !cancelBtn) {
        resolve("");
        return;
      }
      pinInput.value = "";
      showEdbPayStep(modal, "pin");
      setTimeout(() => pinInput.focus(), 80);

      function cleanup() {
        confirmBtn.removeEventListener("click", onConfirm);
        cancelBtn.removeEventListener("click", onCancel);
        pinInput.removeEventListener("keydown", onKey);
        showEdbPayStep(modal, "main");
      }
      function onConfirm() {
        const pin = pinInput.value.trim();
        cleanup();
        resolve(pin);
      }
      function onCancel() {
        cleanup();
        resolve("");
      }
      function onKey(e) {
        if (e.key === "Enter") {
          e.preventDefault();
          onConfirm();
        }
      }
      confirmBtn.addEventListener("click", onConfirm);
      cancelBtn.addEventListener("click", onCancel);
      pinInput.addEventListener("keydown", onKey);
    });
  }

  function setEdbPayStatus(modal, message, isError) {
    const el = modal.querySelector("#edbPayStatus");
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      el.classList.remove("edb-pay-status--error");
      return;
    }
    el.hidden = false;
    el.textContent = message;
    el.classList.toggle("edb-pay-status--error", !!isError);
  }

  async function openPurchaseDialog(book, session) {
    if (!book || book.isFree) {
      openBook(book, session);
      return;
    }
    if (!session?.identifiant && !session?.email) {
      if (
        confirm(
          "Connectez-vous pour acheter ce livre et le lire sur vos appareils (max. 3 par compte)."
        )
      ) {
        location.href =
          "connexion.html?role=etudiant&next=" +
          encodeURIComponent(location.pathname + location.search + location.hash);
      }
      return;
    }
    const full = readBooks().find((b) => b.id === book.id) || book;
    const author = authorByEmail(full.authorEmail);
    const fees = splitFee(full.price);
    const mmList = authorMobileNumbers(full).length
      ? authorMobileNumbers(full)
      : authorMobileNumbers(author);
    const mmReceiver = mmList[0] || "";
    const currency = String(full.currency || "USD").toUpperCase();
    const modal = ensureEdbPurchaseModal();
    const confirmBtn = modal.querySelector("#edbPayConfirm");
    const phoneInput = modal.querySelector("#edbPayPhone");
    const mmWrap = modal.querySelector("#edbPayAuthorMmWrap");
    const mmSelect = modal.querySelector("#edbPayAuthorMm");

    modal._payContext = { full, fees, mmReceiver, currency, mmList };
    modal.querySelector("#edbPayFeeLabel").textContent =
      (full.title || "Livre") + " — " + (full.author || "Auteur");
    modal.querySelector("#edbPayAmount").textContent = formatMoney(fees.total, currency);
    modal.querySelectorAll("[data-edb-pay-method]").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.edbPayMethod === "orange");
    });
    if (mmSelect) {
      if (mmList.length > 1) {
        mmWrap.hidden = false;
        mmSelect.innerHTML = mmList
          .map(
            (n, i) =>
              '<option value="' +
              esc(n) +
              '">Numéro ' +
              (i + 1) +
              " — " +
              esc(maskMmPhone(n)) +
              "</option>"
          )
          .join("");
        mmSelect.value = mmList[0];
      } else {
        mmWrap.hidden = true;
        mmSelect.innerHTML = "";
      }
    }
    renderEdbPayDest(modal, "orange", full, fees, mmReceiver, currency);
    if (phoneInput) {
      phoneInput.value =
        session?.telephone || session?.phone || localStorage.getItem("sac_edb_last_mm") || "";
    }
    setEdbPayStatus(modal, "", false);
    showEdbPayStep(modal, "main");
    openEdbPayModal(modal);

    confirmBtn.onclick = async () => {
      const phone = phoneInput?.value?.trim();
      const mmReceiverSelected =
        modal.querySelector("#edbPayAuthorMm")?.value ||
        modal._payContext?.mmReceiver ||
        mmList[0] ||
        "";
      if (!phone) {
        setEdbPayStatus(modal, "Indiquez votre numéro Mobile Money.", true);
        phoneInput?.focus();
        return;
      }
      localStorage.setItem("sac_edb_last_mm", phone);
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Paiement en cours…";
      setEdbPayStatus(modal, "Initialisation du paiement…", false);

      try {
        if (typeof SAC_MOBILE_MONEY !== "undefined" && SAC_MOBILE_MONEY.runFlow) {
          const online = typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline());
          if (!online) throw new Error("Connexion API requise pour le paiement.");
          const amountCdf = currency === "CDF" ? fees.total : Math.round(fees.total * 2800);
          await SAC_MOBILE_MONEY.runFlow({
            provider: modal._getPayMethod(),
            payerPhone: phone,
            amountCdf,
            amountUsd: currency === "USD" ? fees.total : 0,
            purpose: "evodigitalbooks",
            email: session?.identifiant || session?.email || phone,
            metadata: {
              bookId: full.id,
              bookTitle: full.title,
              authorEmail: full.authorEmail,
              authorMobileMoney: mmReceiverSelected,
              authorShare: fees.authorShare,
              platformFee: fees.platformFee,
              currency,
              deviceId: getDeviceId(),
            },
            onProcessing() {
              setEdbPayStatus(modal, "Connexion à l'opérateur…", false);
            },
            onWaitingOperator() {
              setEdbPayStatus(modal, "Validez le paiement sur votre téléphone…", false);
            },
            async onPinPrompt() {
              return requestPinInModal(modal);
            },
          });
        } else {
          if (
            !confirm(
              "Confirmer l'achat de « " +
                full.title +
                " » pour " +
                formatMoney(fees.total, currency) +
                " ?"
            )
          ) {
            return;
          }
        }
        const dev = registerDevice(session);
        if (!dev.ok && dev.reason === "device_limit") {
          throw new Error(
            "Limite de " +
              MAX_DEVICES_PER_ACCOUNT +
              " appareils atteinte pour ce compte. Retirez un appareil ou contactez le support."
          );
        }
        setEdbPayStatus(modal, "Enregistrement de l'achat…", false);
        await recordPurchase(full.id, session, {
          amount: fees.total,
          authorShare: fees.authorShare,
          platformFee: fees.platformFee,
          authorMobileMoney: mmReceiverSelected,
          authorEmail: full.authorEmail || "",
          currency,
        });
        modal.hidden = true;
        closeEdbPayModal(modal);
        setEdbPayStatus(modal, "", false);
        openBook(full, session);
        window.dispatchEvent(new CustomEvent("sac-edb-catalog-refresh"));
      } catch (err) {
        setEdbPayStatus(modal, err.message || "Paiement impossible.", true);
      } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Payer par Mobile Money";
      }
    };
  }

  async function mountStorefront(rootId, session) {
    const root = document.getElementById(rootId);
    if (!root) return;
    root.innerHTML = '<p class="edb-loading">Chargement du catalogue…</p>';
    const cc =
      typeof SAC_AFRICA_COUNTRIES !== "undefined"
        ? SAC_AFRICA_COUNTRIES.getStoredCountry()
        : "CD";
    const all = await listLibraryBooks(cc, session);
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

  function authorDisplayName(session) {
    return (
      session?.penName ||
      session?.displayName ||
      [session?.prenom, session?.nom].filter(Boolean).join(" ") ||
      session?.identifiant ||
      "Auteur"
    );
  }

  function computeAuthorStats(books) {
    const sales = readSales();
    let totalSales = 0;
    let revenue = 0;
    (books || []).forEach((b) => {
      const s = sales[b.id] || 0;
      totalSales += s;
      if (!b.isFree) {
        revenue += s * (Number(b.price) || 0) * AUTHOR_SHARE_RATE;
      }
    });
    return {
      published: (books || []).filter((b) => b.published !== false).length,
      totalSales,
      revenue: Math.round(revenue * 100) / 100,
    };
  }

  function formatMoney(n, currency) {
    return Number(n || 0).toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " " + (currency || "USD");
  }

  function renderSalesBars(totalSales) {
    const base = Math.max(1, totalSales);
    const heights = [0.35, 0.55, 0.4, 0.7, 0.5, 0.85, 0.6].map((h) =>
      Math.round(20 + h * Math.min(base, 40))
    );
    return heights
      .map((h) => '<span class="edb-chart__bar" style="height:' + h + '%"></span>')
      .join("");
  }

  function recentActivityItems(books) {
    const items = [];
    const sales = readSales();
    (books || []).slice(0, 5).forEach((b) => {
      items.push({
        icon: "📘",
        text: 'Livre « ' + b.title + ' » publié',
        time: (b.updatedAt || b.createdAt || "").slice(0, 10),
      });
      if (sales[b.id]) {
        items.push({
          icon: "💰",
          text: sales[b.id] + " vente(s) — « " + b.title + " »",
          time: "Récent",
        });
      }
    });
    if (!items.length) {
      items.push({ icon: "✨", text: "Publiez votre premier livre", time: "—" });
    }
    return items.slice(0, 6);
  }

  async function mountAuthorPublisher(session, rootId, initialPanel) {
    const root = document.getElementById(rootId);
    if (!root) return;

    if (!session || session.role !== "auteur") {
      root.innerHTML = '<p class="edb-empty">Connexion auteur requise.</p>';
      return;
    }

    root.innerHTML = '<p class="edb-loading">Vérification du compte auteur…</p>';
    session = await syncAuthorProfileFromApi(session);

    if (!isAuthorApproved(session)) {
      root.innerHTML =
        '<div class="edb-pending">' +
        "<h2>⏳ Validation en cours</h2>" +
        "<p>Votre compte auteur est en attente d'approbation par le Super Admin EvoSU. Vous pourrez publier dès validation.</p>" +
        '<p><a href="evodigitalbooks/">Retour au portail</a></p></div>';
      return;
    }

    const authorProfile = (await ensureLocalAuthorProfile(session)) || {};
    const authorMmList = authorMobileNumbers(authorProfile);

    await syncAuthorBooksFromApi(session);
    const displayName = authorDisplayName(session);
    const books = getAuthorBooks(session);
    const stats = computeAuthorStats(books);
    const activity = recentActivityItems(books);

    root.innerHTML =
      '<div class="edb-dash">' +
      '<aside class="edb-dash__sidebar">' +
      '<div class="edb-dash__brand"><span class="edb-dash__logo">📖</span> EvoBooks</div>' +
      '<div class="edb-dash__profile">' +
      '<div class="edb-dash__avatar">' +
      esc(displayName.charAt(0).toUpperCase()) +
      "</div>" +
      "<div><strong>" +
      esc(displayName) +
      '</strong><span class="edb-dash__badge">Auteur vérifié</span></div></div>' +
      '<nav class="edb-dash__nav">' +
      '<button type="button" class="edb-dash__nav-item is-active" data-edb-panel="dashboard">📊 Tableau de bord</button>' +
      '<button type="button" class="edb-dash__nav-item" data-edb-panel="books">📚 Mes livres</button>' +
      '<button type="button" class="edb-dash__nav-item" data-edb-panel="publish">➕ Ajouter un livre</button>' +
      '<button type="button" class="edb-dash__nav-item" data-edb-panel="sales">🛒 Ventes</button>' +
      '<button type="button" class="edb-dash__nav-item" data-edb-panel="payments">💳 Mobile Money</button>' +
      '<a class="edb-dash__nav-item" href="evodigitalbooks.html">🌐 Catalogue public</a>' +
      '<a class="edb-dash__nav-item" href="plateforme.html">🏛 Bibliothèque nationale</a>' +
      "</nav>" +
      '<div class="edb-dash__help"><p>Besoin d\'aide ?</p><a href="mailto:contact@evosmartuni.com" class="btn btn--ghost btn--sm">Support</a></div>' +
      "</aside>" +
      '<div class="edb-dash__main">' +
      '<header class="edb-dash__header">' +
      "<div><h1>Bienvenue, " +
      esc(displayName) +
      ' 👋</h1><p class="edb-dash__sub">Espace auteur EvoDigitalBooks</p></div>' +
      '<div class="edb-dash__header-actions">' +
      '<span class="edb-dash__pill">✓ Auteur vérifié</span>' +
      '<button type="button" class="btn btn--ghost btn--sm" id="edbDashLogout">Déconnexion</button>' +
      "</div></header>" +
      '<section class="edb-panel" id="edbPanelDashboard">' +
      '<div class="edb-stats">' +
      '<article class="edb-stat"><span class="edb-stat__icon edb-stat__icon--purple">📚</span><div><em>Livres publiés</em><strong>' +
      stats.published +
      "</strong></div></article>" +
      '<article class="edb-stat"><span class="edb-stat__icon edb-stat__icon--green">🛒</span><div><em>Ventes totales</em><strong>' +
      stats.totalSales +
      "</strong></div></article>" +
      '<article class="edb-stat"><span class="edb-stat__icon edb-stat__icon--blue">💵</span><div><em>Revenus (75 %)</em><strong>' +
      formatMoney(stats.revenue) +
      "</strong></div></article>" +
      '<article class="edb-stat"><span class="edb-stat__icon edb-stat__icon--orange">⭐</span><div><em>Commission plateforme</em><strong>25 %</strong></div></article>' +
      "</div>" +
      '<div class="edb-dash__grid">' +
      '<div class="edb-card-panel"><h2>Aperçu des ventes</h2><div class="edb-chart">' +
      renderSalesBars(stats.totalSales) +
      '</div><p class="edb-chart__hint">Ventes enregistrées sur la plateforme</p></div>' +
      '<div class="edb-card-panel"><h2>Activité récente</h2><ul class="edb-activity">' +
      activity
        .map(
          (a) =>
            "<li><span>" +
            a.icon +
            "</span><div><p>" +
            esc(a.text) +
            '</p><time>' +
            esc(a.time) +
            "</time></div></li>"
        )
        .join("") +
      "</ul></div>" +
      '<div class="edb-card-panel edb-card-panel--balance"><h2>Solde disponible</h2><p class="edb-balance">' +
      formatMoney(stats.revenue) +
      '</p><p class="edb-balance__hint">Versement sur votre Mobile Money (75 % des ventes)</p></div>' +
      '<div class="edb-card-panel"><h2>Conseils pour vendre</h2><ul class="edb-tips">' +
      "<li>✓ Ajoutez une belle couverture</li>" +
      "<li>✓ Rédigez une description détaillée</li>" +
      "<li>✓ Fixez un prix compétitif</li>" +
      "<li>✓ Proposez un extrait gratuit</li>" +
      "</ul></div></div></section>" +
      '<section class="edb-panel" id="edbPanelBooks" hidden><div class="edb-card-panel"><h2>Mes livres</h2>' +
      '<p class="edb-dash__sub">Supprimez une publication pour la retirer du catalogue, puis republiez une version corrigée depuis « Ajouter un livre ».</p>' +
      '<div id="edbBooksTable"></div></div></section>' +
      '<section class="edb-panel" id="edbPanelPublish" hidden><div class="edb-card-panel edb-card-panel--publish"><h2>Publier un livre</h2>' +
      '<p class="edb-dash__sub">Visible dans EvoDigitalBooks et la bibliothèque nationale · 75 % auteur / 25 % plateforme</p>' +
      '<form id="edbPublishForm" class="edb-form edb-publish-form">' +
      '<div class="edb-form__section"><h3 class="edb-form__section-title">Informations</h3>' +
      '<div class="edb-form__grid">' +
      '<div class="fg"><label for="edbTitle">Titre *</label><input type="text" class="fi" id="edbTitle" required minlength="2" placeholder="Titre du livre" /></div>' +
      '<div class="fg"><label for="edbCategory">Catégorie *</label><select class="fi" id="edbCategory" required>' +
      categoriesSelectHtml() +
      "</select></div>" +
      '<div class="fg fg--full"><label for="edbDesc">Description</label><textarea class="fi" id="edbDesc" rows="4" placeholder="Résumé, public cible, contenu…"></textarea></div>' +
      "</div></div>" +
      '<div class="edb-form__section"><h3 class="edb-form__section-title">Tarification</h3>' +
      '<div class="edb-form__grid edb-form__grid--pricing">' +
      '<div class="fg fg--full"><label class="chk edb-chk-free"><input type="checkbox" id="edbFree" /> Livre gratuit (accessible sans paiement)</label></div>' +
      '<div class="fg" id="edbPriceWrap"><label for="edbPrice">Prix (USD) *</label><input type="number" class="fi" id="edbPrice" min="0.5" step="0.01" value="5" /></div>' +
      '<div class="fg edb-fee-box"><p class="edb-fee-hint" id="edbFeeHint"></p></div>' +
      "</div></div>" +
      '<div class="edb-form__section"><h3 class="edb-form__section-title">Fichiers</h3>' +
      '<div class="edb-form__grid edb-form__grid--files">' +
      '<div class="fg"><label for="edbCover">Couverture *</label><div class="edb-file-field"><input type="file" class="edb-file-input" id="edbCover" accept="image/*" required /><label class="edb-file-btn" for="edbCover">Choisir une image</label><span class="edb-file-name" id="edbCoverName">Aucun fichier</span></div></div>' +
      '<div class="fg"><label for="edbFile">Livre (PDF/EPUB, max 50 Mo) *</label><div class="edb-file-field"><input type="file" class="edb-file-input" id="edbFile" accept=".pdf,.epub,application/pdf" required /><label class="edb-file-btn" for="edbFile">Choisir le fichier</label><span class="edb-file-name" id="edbFileName">Aucun fichier</span></div></div>' +
      "</div></div>" +
      '<div class="edb-form__actions"><button type="submit" class="edb-btn-primary edb-btn-primary--wide">Publier dans la bibliothèque</button></div>' +
      "</form></div></section>" +
      '<section class="edb-panel" id="edbPanelSales" hidden><div class="edb-card-panel"><h2>Commandes & ventes</h2><p class="edb-empty">Les ventes Mobile Money apparaissent ici après achat. Revenus estimés : <strong>' +
      formatMoney(stats.revenue) +
      "</strong></p></div></section>" +
      '<section class="edb-panel" id="edbPanelPayments" hidden><div class="edb-card-panel"><h2>Numéros Mobile Money</h2>' +
      '<p class="edb-dash__sub">Enregistrez jusqu\'à <strong>3 numéros</strong> pour faciliter les achats (Orange Money, M-Pesa, etc.). Les clients choisissent le numéro lors du paiement.</p>' +
      '<form id="edbPaymentsForm" class="edb-form">' +
      '<div class="edb-form__grid">' +
      '<div class="fg"><label for="edbMm1">Numéro principal *</label><input type="tel" class="fi" id="edbMm1" required placeholder="+243…" value="' +
      esc(authorMmList[0] || "") +
      '" /></div>' +
      '<div class="fg"><label for="edbMm2">Numéro 2 (optionnel)</label><input type="tel" class="fi" id="edbMm2" placeholder="+243…" value="' +
      esc(authorMmList[1] || "") +
      '" /></div>' +
      '<div class="fg"><label for="edbMm3">Numéro 3 (optionnel)</label><input type="tel" class="fi" id="edbMm3" placeholder="+243…" value="' +
      esc(authorMmList[2] || "") +
      '" /></div></div>' +
      '<div class="edb-form__actions"><button type="submit" class="edb-btn-primary">Enregistrer les numéros</button></div>' +
      "</form></div></section>" +
      "</div></div>";

    function showPanel(name) {
      root.querySelectorAll(".edb-panel").forEach((p) => {
        p.hidden = true;
      });
      const panel = document.getElementById(
        "edbPanel" + name.charAt(0).toUpperCase() + name.slice(1)
      );
      if (panel) panel.hidden = false;
      root.querySelectorAll(".edb-dash__nav-item[data-edb-panel]").forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.edbPanel === name);
      });
    }

    root.querySelectorAll(".edb-dash__nav-item[data-edb-panel]").forEach((btn) => {
      btn.addEventListener("click", () => showPanel(btn.dataset.edbPanel));
    });

    const startPanel =
      initialPanel ||
      (window.location.hash === "#publish"
        ? "publish"
        : window.location.hash === "#books"
          ? "books"
          : "dashboard");
    showPanel(startPanel);

    document.getElementById("edbDashLogout")?.addEventListener("click", () => {
      if (typeof SAC_SESSION !== "undefined") SAC_SESSION.logout("evodigitalbooks/");
    });

    function renderBooksTable() {
      const host = document.getElementById("edbBooksTable");
      if (!host) return;
      const list = getAuthorBooks(session);
      const sales = readSales();
      if (!list.length) {
        host.innerHTML = '<p class="edb-empty">Aucune publication — ajoutez votre premier livre.</p>';
        return;
      }
      host.innerHTML =
        '<table class="edb-table"><thead><tr><th>Livre</th><th>Prix</th><th>Ventes</th><th>Revenus</th><th>Statut</th><th>Actions</th></tr></thead><tbody>' +
        list
          .map((b) => {
            const s = sales[b.id] || 0;
            const rev = b.isFree ? 0 : s * (Number(b.price) || 0) * AUTHOR_SHARE_RATE;
            const cover = absUrl(b.coverUrl || b.cover_url);
            return (
              "<tr><td><div class=\"edb-table__book\">" +
              (cover ? '<img src="' + esc(cover) + '" alt="" />' : "📖") +
              "<div><strong>" +
              esc(b.title) +
              "</strong><span>" +
              esc((b.createdAt || "").slice(0, 10)) +
              "</span></div></div></td><td>" +
              (b.isFree ? "Gratuit" : formatMoney(b.price, b.currency)) +
              "</td><td>" +
              s +
              "</td><td>" +
              formatMoney(rev, b.currency) +
              '</td><td><span class="edb-status edb-status--ok">Publié</span></td>' +
              '<td><div class="edb-table__actions">' +
              '<button type="button" class="edb-btn-del" data-edb-delete="' +
              esc(b.id) +
              '" title="Retirer du catalogue">🗑 Supprimer</button>' +
              "</div></td></tr>"
            );
          })
          .join("") +
        "</tbody></table>";

      host.querySelectorAll("[data-edb-delete]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const bookId = btn.dataset.edbDelete;
          if (!bookId) return;
          btn.disabled = true;
          try {
            const removed = await deleteAuthorBook(session, bookId);
            if (removed) {
              await syncAuthorBooksFromApi(session);
              renderBooksTable();
              window.dispatchEvent(new CustomEvent("sac-edb-catalog-refresh"));
            }
          } catch (err) {
            alert(err.message || "Suppression impossible.");
          } finally {
            btn.disabled = false;
          }
        });
      });
    }
    renderBooksTable();

    document.getElementById("edbPaymentsForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Enregistrement…";
      }
      try {
        await updateAuthorPaymentNumbers(session, {
          mobileMoney: document.getElementById("edbMm1")?.value || "",
          mobileMoney2: document.getElementById("edbMm2")?.value || "",
          mobileMoney3: document.getElementById("edbMm3")?.value || "",
        });
        alert("Numéros Mobile Money enregistrés.");
      } catch (err) {
        alert(err.message || "Enregistrement impossible.");
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Enregistrer les numéros";
        }
      }
    });

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
        "Prix " + f.total + " USD → vous " + f.authorShare + " USD · plateforme " + f.platformFee + " USD";
    }
    freeCb?.addEventListener("change", () => {
      if (priceWrap) priceWrap.hidden = !!freeCb.checked;
      updateFeeHint();
    });
    priceInp?.addEventListener("input", updateFeeHint);
    updateFeeHint();

    function bindFileName(inputId, labelId) {
      const inp = document.getElementById(inputId);
      const lbl = document.getElementById(labelId);
      if (!inp || !lbl) return;
      inp.addEventListener("change", () => {
        const f = inp.files?.[0];
        lbl.textContent = f ? f.name : "Aucun fichier";
        lbl.classList.toggle("is-set", !!f);
      });
    }
    bindFileName("edbCover", "edbCoverName");
    bindFileName("edbFile", "edbFileName");

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
        await mountAuthorPublisher(session, rootId, "books");
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
    const pendingByEmail = {};
    pending.forEach((a) => {
      pendingByEmail[normEmail(a.email)] = a;
    });
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
            "</td><td>" +
            formatMobileNumbersList(authorMobileNumbers(a)) +
            "</td><td>" +
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
          const email = btn.dataset.edbApprove;
          await setAuthorStatus(email, "approved", session, pendingByEmail[normEmail(email)]);
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
          const email = btn.dataset.edbReject;
          await setAuthorStatus(email, "rejected", session, pendingByEmail[normEmail(email)]);
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
    updateAuthorPaymentNumbers,
    listPendingAuthors,
    setAuthorStatus,
    isAuthorApproved,
    listLibraryBooks,
    getAuthorBooks,
    publishBook,
    deleteAuthorBook,
    isBookDeleted,
    hasAccess,
    recordPurchase,
    syncPurchasesFromApi,
    syncEdbCatalogFromApi,
    syncAuthorProfileFromApi,
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
  (async function bootstrapEdb() {
    try {
      const session =
        typeof SAC_SESSION !== "undefined" && SAC_SESSION.getSession
          ? SAC_SESSION.getSession()
          : null;
      const cc =
        typeof SAC_AFRICA_COUNTRIES !== "undefined"
          ? SAC_AFRICA_COUNTRIES.getStoredCountry()
          : null;
      await SAC_EDB.syncEdbCatalogFromApi(cc, session);
      if (session) await SAC_EDB.syncPurchasesFromApi(session);
      SAC_EDB.syncBooksToLibraryCache();
    } catch {
      try {
        SAC_EDB.syncBooksToLibraryCache();
      } catch {
        /* ignore */
      }
    }
  })();
}

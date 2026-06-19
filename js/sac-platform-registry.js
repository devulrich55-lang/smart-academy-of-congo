/**
 * Registre national des comptes — Super Admin uniquement (espace discret)
 */
const SAC_PLATFORM_REGISTRY = (function () {
  const UNLOCK_KEY = "sac_registry_unlocked";

  const ROLE_CATEGORIES = [
    { id: "all", label: "Tous", icon: "👥" },
    { id: "superadmin", label: "Super Admin", icon: "🛡️", group: "institutionnel" },
    { id: "ministere", label: "Ministère", icon: "🏛️", group: "institutionnel" },
    { id: "universite", label: "Admin université", icon: "🎓", group: "institutionnel" },
    { id: "etudiant", label: "Étudiants", icon: "📚", group: "campus" },
    { id: "professeur", label: "Professeurs", icon: "👨‍🏫", group: "campus" },
    { id: "assistant", label: "Assistants", icon: "🧑‍💼", group: "campus" },
    { id: "section", label: "Chefs de section", icon: "📋", group: "campus" },
  ];

  const ROLE_LABELS = Object.fromEntries(
    ROLE_CATEGORIES.filter((c) => c.id !== "all").map((c) => [c.id, c.label])
  );

  let accountsCache = [];
  let summaryCache = null;
  let partialCache = false;
  let mounted = false;
  let currentRole = "all";
  let searchQuery = "";

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s || "";
    return d.innerHTML;
  }

  function isUnlocked() {
    try {
      return sessionStorage.getItem(UNLOCK_KEY) === "1";
    } catch {
      return false;
    }
  }

  function unlock() {
    try {
      sessionStorage.setItem(UNLOCK_KEY, "1");
    } catch {
      /* ignore */
    }
    revealUI();
  }

  function revealUI() {
    document.querySelectorAll(".ws-registry-secret").forEach((el) => {
      el.hidden = false;
      el.removeAttribute("aria-hidden");
    });
  }

  function hideUI() {
    document.querySelectorAll(".ws-registry-secret").forEach((el) => {
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
    });
  }

  function normalizeAccount(raw) {
    if (!raw) return null;
    const email = String(raw.email || raw.identifiant || "").trim().toLowerCase();
    if (!email) return null;
    const role = raw.role || "etudiant";
    const prenom = raw.prenom || "";
    const nom = raw.nom || "";
    const displayName =
      raw.displayName ||
      [prenom, nom].filter(Boolean).join(" ").trim() ||
      email;
    return {
      email,
      role,
      prenom,
      nom,
      displayName,
      universite: raw.universite || raw.sigle || raw.codeUni || "",
      nomUniversite: raw.nomUniversite || raw.ville || "",
      filiere: raw.filiere || "",
      niveau: raw.niveau || "",
      classe: raw.classe || "",
      telephone: raw.telephone || raw.tel || "",
      matricule: raw.matricule || "",
      paymentStatus: raw.payment?.status || raw.paymentStatus || "",
      createdAt: raw.createdAt || raw.registeredAt || "",
      source: raw.source || "api",
    };
  }

  function mergeAccounts(list) {
    const map = new Map();
    list.forEach((item) => {
      const acc = normalizeAccount(item);
      if (!acc) return;
      const prev = map.get(acc.email);
      if (!prev || acc.source === "api") map.set(acc.email, acc);
    });
    return [...map.values()].sort((a, b) => {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return db - da;
    });
  }

  function buildSummary(accounts) {
    const byRole = {};
    ROLE_CATEGORIES.forEach((c) => {
      if (c.id !== "all") byRole[c.id] = 0;
    });
    accounts.forEach((a) => {
      if (a.role in byRole) byRole[a.role] += 1;
    });
    return { total: accounts.length, byRole };
  }

  async function loadFromApi() {
    const [summary, accounts] = await Promise.all([
      SAC_API.getPlatformAccountsSummary(),
      SAC_API.listPlatformAccounts(),
    ]);
    const list = (Array.isArray(accounts) ? accounts : []).map((a) => ({ ...a, source: "api" }));
    return {
      accounts: mergeAccounts(list),
      summary: summary || buildSummary(list),
      partial: false,
    };
  }

  async function loadFallback(session) {
    const merged = [];
    if (typeof SAC_INSTITUTIONAL !== "undefined") {
      const { admins } = await SAC_INSTITUTIONAL.load(session);
      (admins || []).forEach((a) => merged.push({ ...a, source: "institutional" }));
    }
    if (typeof SAC_IDENTITY !== "undefined") {
      SAC_IDENTITY.getLocalUsers().forEach((u) => merged.push({ ...u, source: "local" }));
    }
    const accounts = mergeAccounts(merged);
    return { accounts, summary: buildSummary(accounts), partial: true };
  }

  async function load(session) {
    if (!session || session.role !== "superadmin") {
      return { accounts: [], summary: null, partial: true };
    }
    try {
      if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
        try {
          const data = await loadFromApi();
          accountsCache = data.accounts;
          summaryCache = data.summary;
          partialCache = data.partial;
          return data;
        } catch (err) {
          if (err.status !== 404 && err.code !== "NOT_FOUND") {
            console.warn("[SAC_PLATFORM_REGISTRY] API:", err.message || err);
          }
        }
      }
    } catch (err) {
      console.warn("[SAC_PLATFORM_REGISTRY] load:", err.message || err);
    }
    const data = await loadFallback(session);
    accountsCache = data.accounts;
    summaryCache = data.summary;
    partialCache = data.partial;
    return data;
  }

  function roleBadge(role) {
    const meta = ROLE_CATEGORIES.find((c) => c.id === role);
    const label = meta?.label || ROLE_LABELS[role] || role;
    if (role === "superadmin") return `<span class="badge-super">${esc(label)}</span>`;
    if (role === "ministere") return `<span class="badge-min">${esc(label)}</span>`;
    if (role === "universite") return `<span class="badge-uni">${esc(label)}</span>`;
    return `<span class="ws-registry-role ws-registry-role--${esc(role)}">${esc(label)}</span>`;
  }

  function campusLine(acc) {
    const parts = [];
    if (acc.nomUniversite) parts.push(acc.nomUniversite);
    else if (acc.universite) parts.push(acc.universite);
    if (acc.filiere) parts.push(acc.filiere);
    if (acc.niveau) parts.push(String(acc.niveau).toUpperCase());
    if (acc.classe) parts.push(acc.classe);
    return parts.length ? parts.join(" · ") : "—";
  }

  function formatDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  }

  function filteredAccounts() {
    let list = accountsCache.slice();
    if (currentRole !== "all") list = list.filter((a) => a.role === currentRole);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((a) => {
        const blob = [a.displayName, a.email, a.telephone, a.universite, a.nomUniversite, a.filiere, a.classe, a.role]
          .join(" ")
          .toLowerCase();
        return blob.includes(q);
      });
    }
    return list;
  }

  function renderStats(root) {
    const s = summaryCache || buildSummary(accountsCache);
    const by = s.byRole || {};
    const map = {
      regStatTotal: s.total ?? 0,
      regStatSuper: by.superadmin ?? 0,
      regStatMin: by.ministere ?? 0,
      regStatUni: by.universite ?? 0,
      regStatStudents: by.etudiant ?? 0,
      regStatProfs: by.professeur ?? 0,
      regStatAssist: by.assistant ?? 0,
      regStatSection: by.section ?? 0,
    };
    Object.keys(map).forEach((id) => {
      const el = root.querySelector("#" + id);
      if (el) el.textContent = String(map[id]);
    });
    const head = root.querySelector("[data-reg-count]");
    if (head) head.textContent = (s.total ?? 0) + " compte(s) national(aux)";
    const warn = root.querySelector("[data-reg-partial]");
    if (warn) {
      warn.hidden = !partialCache;
      warn.textContent = partialCache
        ? "Vue partielle : connectez l'API nationale (/admin/platform/accounts) pour la liste complète en production."
        : "";
    }
  }

  function renderFilters(root) {
    const el = root.querySelector("[data-reg-filters]");
    if (!el) return;
    el.innerHTML = ROLE_CATEGORIES.map(
      (c) =>
        `<button type="button" class="ws-reg-filter ${c.id === currentRole ? "active" : ""}" data-reg-role="${c.id}">${c.icon} ${esc(c.label)}</button>`
    ).join("");
    el.querySelectorAll("[data-reg-role]").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentRole = btn.dataset.regRole;
        renderFilters(root);
        renderTable(root);
      });
    });
  }

  function renderGroupedView(root, list) {
    const container = root.querySelector("[data-reg-grouped]");
    if (!container) return;
    if (currentRole !== "all") {
      container.innerHTML = "";
      container.hidden = true;
      return;
    }
    container.hidden = false;
    const groups = ROLE_CATEGORIES.filter((c) => c.id !== "all");
    container.innerHTML = groups
      .map((cat) => {
        const items = list.filter((a) => a.role === cat.id);
        if (!items.length) return "";
        return `
          <div class="ws-reg-group">
            <h3 class="ws-reg-group__title">${cat.icon} ${esc(cat.label)} <span>${items.length}</span></h3>
            <div class="ws-reg-group__table">${renderTableHtml(items)}</div>
          </div>`;
      })
      .join("");
  }

  function renderTableHtml(list) {
    if (!list.length) {
      return '<p class="empty" style="padding:0.75rem 0;">Aucun compte dans cette catégorie.</p>';
    }
    return `
      <table class="ws-table ws-table--compact">
        <thead>
          <tr>
            <th>Identité</th>
            <th>E-mail</th>
            <th>Établissement / filière</th>
            <th>Téléphone</th>
            <th>Inscription</th>
          </tr>
        </thead>
        <tbody>
          ${list
            .map(
              (a) => `<tr>
            <td><strong>${esc(a.displayName)}</strong><br><small>${roleBadge(a.role)}</small></td>
            <td>${esc(a.email)}</td>
            <td>${esc(campusLine(a))}</td>
            <td>${esc(a.telephone || "—")}</td>
            <td>${formatDate(a.createdAt)}</td>
          </tr>`
            )
            .join("")}
        </tbody>
      </table>`;
  }

  function renderTable(root) {
    const list = filteredAccounts();
    renderStats(root);
    const flat = root.querySelector("[data-reg-table-wrap]");
    const empty = root.querySelector("[data-reg-empty]");
    if (currentRole === "all") {
      if (flat) flat.hidden = true;
      renderGroupedView(root, list);
    } else {
      const grouped = root.querySelector("[data-reg-grouped]");
      if (grouped) {
        grouped.hidden = true;
        grouped.innerHTML = "";
      }
      if (flat) flat.hidden = false;
      const tbody = root.querySelector("[data-reg-tbody]");
      if (!list.length) {
        if (tbody) tbody.innerHTML = "";
        if (empty) {
          empty.hidden = false;
          empty.textContent = searchQuery
            ? "Aucun compte ne correspond à la recherche."
            : "Aucun compte dans cette catégorie.";
        }
        return;
      }
      if (empty) empty.hidden = true;
      if (tbody) {
        tbody.innerHTML = list
          .map(
            (a) => `<tr>
          <td><strong>${esc(a.displayName)}</strong></td>
          <td>${roleBadge(a.role)}</td>
          <td>${esc(a.email)}</td>
          <td>${esc(campusLine(a))}</td>
          <td>${esc(a.telephone || "—")}</td>
          <td>${formatDate(a.createdAt)}</td>
        </tr>`
          )
          .join("");
      }
    }
    if (!list.length && currentRole === "all") {
      const grouped = root.querySelector("[data-reg-grouped]");
      if (grouped && !grouped.innerHTML.trim()) {
        if (empty) {
          empty.hidden = false;
          empty.textContent = "Aucun compte enregistré sur la plateforme.";
        }
      } else if (empty) empty.hidden = true;
    } else if (empty && currentRole === "all") {
      empty.hidden = true;
    }
  }

  function mount(root, session) {
    if (!root || session?.role !== "superadmin") return;
    if (!mounted) {
      root.innerHTML = `
        <h1 class="page-title">Registre national des comptes</h1>
        <p class="page-desc">
          Vue confidentielle réservée au Super Admin — tous les comptes créés sur la plateforme, classés par catégorie.
          <span class="ws-registry-hint">Accès discret · Ctrl+Shift+R</span>
        </p>
        <p class="ws-registry-warn" data-reg-partial hidden></p>

        <div class="ws-kpi-grid ws-kpi-grid--registry">
          <div class="ws-kpi"><div class="ws-kpi__icon">👥</div><strong id="regStatTotal">0</strong><span>Total</span></div>
          <div class="ws-kpi ws-kpi--gold"><div class="ws-kpi__icon">🛡️</div><strong id="regStatSuper">0</strong><span>Super Admin</span></div>
          <div class="ws-kpi"><div class="ws-kpi__icon">🏛️</div><strong id="regStatMin">0</strong><span>Ministère</span></div>
          <div class="ws-kpi"><div class="ws-kpi__icon">🎓</div><strong id="regStatUni">0</strong><span>Admin uni</span></div>
          <div class="ws-kpi"><div class="ws-kpi__icon">📚</div><strong id="regStatStudents">0</strong><span>Étudiants</span></div>
          <div class="ws-kpi"><div class="ws-kpi__icon">👨‍🏫</div><strong id="regStatProfs">0</strong><span>Professeurs</span></div>
          <div class="ws-kpi"><div class="ws-kpi__icon">🧑‍💼</div><strong id="regStatAssist">0</strong><span>Assistants</span></div>
          <div class="ws-kpi"><div class="ws-kpi__icon">📋</div><strong id="regStatSection">0</strong><span>Sections</span></div>
        </div>

        <div class="panel panel--ws">
          <div class="panel__head">
            <h2>Tous les comptes par catégorie</h2>
            <span data-reg-count style="font-size:0.82rem;color:var(--muted);">—</span>
          </div>
          <div class="panel__body">
            <div class="ws-toolbar" style="margin-bottom:1rem;">
              <input type="search" class="ws-search" data-reg-search placeholder="Rechercher nom, e-mail, université, filière…" />
              <button type="button" class="btn btn--ghost btn--sm" data-reg-refresh>Actualiser</button>
            </div>
            <div class="ws-reg-filters" data-reg-filters aria-label="Filtrer par catégorie"></div>
            <div data-reg-grouped class="ws-reg-grouped"></div>
            <div data-reg-table-wrap hidden>
              <div class="ws-table-wrap">
                <table class="ws-table">
                  <thead>
                    <tr>
                      <th>Identité</th>
                      <th>Catégorie</th>
                      <th>E-mail</th>
                      <th>Établissement</th>
                      <th>Téléphone</th>
                      <th>Inscription</th>
                    </tr>
                  </thead>
                  <tbody data-reg-tbody></tbody>
                </table>
              </div>
            </div>
            <p class="empty" data-reg-empty hidden>Aucun compte.</p>
          </div>
        </div>`;

      root.querySelector("[data-reg-search]")?.addEventListener("input", (e) => {
        searchQuery = e.target.value;
        renderTable(root);
      });
      root.querySelector("[data-reg-refresh]")?.addEventListener("click", async () => {
        await load(session);
        renderFilters(root);
        renderTable(root);
      });
      mounted = true;
    }
    renderFilters(root);
    renderTable(root);
  }

  async function open(session, showSectionFn) {
    if (session?.role !== "superadmin") return;
    unlock();
    await load(session);
    const root = document.getElementById("platformRegistryRoot");
    mount(root, session);
    if (typeof showSectionFn === "function") showSectionFn("registry");
  }

  function bindUnlock(session, showSectionFn, toastFn) {
    if (session?.role !== "superadmin") return;

    if (location.hash === "#registry" || isUnlocked()) {
      open(session, showSectionFn);
    } else {
      hideUI();
    }

    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        open(session, showSectionFn);
        if (toastFn) toastFn("Registre national des comptes ouvert.");
      }
    });

    const statTotal = document.getElementById("statTotal");
    if (statTotal) {
      let clicks = 0;
      let timer = null;
      statTotal.style.cursor = "default";
      statTotal.parentElement?.addEventListener("click", () => {
        clicks += 1;
        clearTimeout(timer);
        timer = setTimeout(() => {
          clicks = 0;
        }, 900);
        if (clicks >= 3) {
          clicks = 0;
          open(session, showSectionFn);
          if (toastFn) toastFn("Registre national activé.");
        }
      });
    }
  }

  return {
    ROLE_CATEGORIES,
    ROLE_LABELS,
    load,
    mount,
    open,
    unlock,
    isUnlocked,
    bindUnlock,
  };
})();

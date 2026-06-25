/**
 * Diplômes numériques — émission université + consultation
 */
const SAC_DIPLOMAS = (function () {
  const TYPES = [
    { id: "licence", label: "Licence" },
    { id: "master", label: "Master" },
    { id: "doctorat", label: "Doctorat" },
    { id: "dut", label: "DUT / BTS" },
    { id: "graduat", label: "Graduat" },
    { id: "certificat", label: "Certificat" },
    { id: "attestation", label: "Attestation" },
    { id: "autre", label: "Autre" },
  ];

  function esc(s) {
    const el = document.createElement("div");
    el.textContent = String(s || "");
    return el.innerHTML;
  }

  function typeLabel(id) {
    return TYPES.find((t) => t.id === id)?.label || id || "—";
  }

  function isLocalDev() {
    return (
      typeof SAC_API !== "undefined" &&
      typeof SAC_API.isLocalDevHost === "function" &&
      SAC_API.isLocalDevHost()
    );
  }

  async function listCampus(session) {
    if (typeof SAC_API !== "undefined" && SAC_API.listCampusDiplomasManage) {
      try {
        const online = await SAC_API.ensureOnline();
        if (online) return await SAC_API.listCampusDiplomasManage();
      } catch {
        /* fallback */
      }
    }
    if (!isLocalDev() || typeof SAC_PLATFORM === "undefined") return [];
    const code = session?.universite || session?.codeUni || "";
    return (SAC_PLATFORM.read(SAC_PLATFORM.KEYS.diplomas) || []).filter(
      (d) => String(d.universite || "") === String(code)
    );
  }

  async function issue(session, payload) {
    if (typeof SAC_API !== "undefined" && SAC_API.issueDiploma) {
      try {
        const online = await SAC_API.ensureOnline();
        if (online) return await SAC_API.issueDiploma(payload);
      } catch (err) {
        if (!isLocalDev()) throw err;
      }
    }
    if (typeof SAC_PLATFORM === "undefined" || !SAC_PLATFORM.issueDiplomaLocal) {
      throw new Error("Émission en ligne requise.");
    }
    return SAC_PLATFORM.issueDiplomaLocal({
      ...payload,
      universite: session?.universite || session?.codeUni,
      studentEmail: payload.studentEmail,
      studentName: payload.studentName,
      matricule: payload.matricule,
      filiere: payload.filiere,
      niveau: payload.niveau,
      diplomaType: payload.diplomaType,
      graduationYear: payload.graduationYear,
    });
  }

  async function revoke(session, diplomaId) {
    if (typeof SAC_API !== "undefined" && SAC_API.revokeDiploma) {
      try {
        const online = await SAC_API.ensureOnline();
        if (online) return await SAC_API.revokeDiploma(diplomaId);
      } catch (err) {
        if (!isLocalDev()) throw err;
      }
    }
    throw new Error("Révocation en ligne requise.");
  }

  function campusStudents(session) {
    if (typeof SAC_UNIVERSITY !== "undefined" && SAC_UNIVERSITY.getCampusUsers) {
      return SAC_UNIVERSITY.getCampusUsers(session).filter((u) => u.role === "etudiant");
    }
    return [];
  }

  function mountUniversityUI(root, session) {
    if (!root || !session) return;

    async function init() {
      if (typeof SAC_ADMIN_ACCOUNTS !== "undefined" && SAC_ADMIN_ACCOUNTS.load) {
        try {
          await SAC_ADMIN_ACCOUNTS.load(session);
        } catch {
          /* liste locale */
        }
      }
      renderUI();
    }

    function renderUI() {
    const year = new Date().getFullYear();
    const typeOptions = TYPES.map(
      (t) => '<option value="' + esc(t.id) + '">' + esc(t.label) + "</option>"
    ).join("");

    root.innerHTML =
      '<div class="panel panel--workspace" style="margin-bottom:1rem;">' +
      '<div class="panel__head"><h2>Émettre un diplôme numérique</h2></div>' +
      '<div class="panel__body">' +
      '<p class="page-desc" style="margin:0 0 1rem;font-size:0.88rem;">' +
      "Chaque diplôme reçoit un <strong>numéro unique</strong> et un <strong>code de vérification</strong> " +
      'consultables sur <a href="verifier-diplome.html" target="_blank" rel="noopener">verifier-diplome.html</a>.' +
      "</p>" +
      '<form id="dipIssueForm" class="rec-form ws-form-grid">' +
      '<div class="fg" style="grid-column:1/-1;"><label>Étudiant du campus *</label>' +
      '<select class="fi" id="dipStudent" required><option value="">— Choisir un étudiant —</option></select></div>' +
      '<div class="fg"><label>Nom complet</label><input class="fi" id="dipName" placeholder="Rempli automatiquement" /></div>' +
      '<div class="fg"><label>Matricule</label><input class="fi" id="dipMatricule" /></div>' +
      '<div class="fg"><label>Filière</label><input class="fi" id="dipFiliere" /></div>' +
      '<div class="fg"><label>Niveau</label><input class="fi" id="dipNiveau" placeholder="L3, Master…" /></div>' +
      '<div class="fg"><label>Type de diplôme *</label><select class="fi" id="dipType" required>' +
      typeOptions +
      "</select></div>" +
      '<div class="fg"><label>Année de promotion *</label><input class="fi" id="dipYear" type="number" min="1990" max="2100" value="' +
      year +
      '" required /></div>' +
      '<div class="fg" style="grid-column:1/-1;"><label>Notes internes (optionnel)</label>' +
      '<input class="fi" id="dipNotes" placeholder="Référence délibération, session…" /></div>' +
      '<div class="fg" style="grid-column:1/-1;"><button type="submit" class="btn btn--role">🎓 Émettre le diplôme</button></div>' +
      "</form>" +
      '<div id="dipIssueResult" style="display:none;margin-top:1rem;padding:0.85rem;border-radius:10px;border:1px solid var(--border);background:var(--bg);"></div>' +
      "</div></div>" +
      '<div class="panel"><div class="panel__head"><h2>Diplômes émis par le campus</h2></div>' +
      '<div class="panel__body" id="dipManageList"><p class="empty-tasks">Chargement…</p></div></div>';

    const students = campusStudents(session);
    const sel = root.querySelector("#dipStudent");
    students.forEach((s) => {
      const email = s.email || s.identifiant || "";
      const name =
        typeof SAC_UNIVERSITY !== "undefined" && SAC_UNIVERSITY.displayName
          ? SAC_UNIVERSITY.displayName(s)
          : [s.prenom, s.nom].filter(Boolean).join(" ") || email;
      const opt = document.createElement("option");
      opt.value = email;
      opt.textContent = name + " · " + email;
      opt.dataset.name = name;
      opt.dataset.matricule = s.matricule || "";
      opt.dataset.filiere = s.filiere || "";
      opt.dataset.niveau = s.niveau || "";
      sel.appendChild(opt);
    });

    sel.addEventListener("change", () => {
      const opt = sel.selectedOptions[0];
      if (!opt || !opt.value) return;
      root.querySelector("#dipName").value = opt.dataset.name || "";
      root.querySelector("#dipMatricule").value = opt.dataset.matricule || "";
      root.querySelector("#dipFiliere").value = opt.dataset.filiere || "";
      root.querySelector("#dipNiveau").value = opt.dataset.niveau || "";
    });

    async function renderList() {
      const listEl = root.querySelector("#dipManageList");
      try {
        const items = await listCampus(session);
        if (!items.length) {
          listEl.innerHTML =
            '<p class="empty-tasks" style="margin:0;">Aucun diplôme émis pour ce campus.</p>';
          return;
        }
        listEl.innerHTML =
          '<div style="display:grid;gap:0.65rem;">' +
          items
            .map((d) => {
              const revoked = d.status === "revoque";
              return (
                '<article style="border:1px solid var(--border);border-radius:10px;padding:0.85rem;background:var(--surface);">' +
                "<strong>" +
                esc(d.studentName) +
                "</strong> · " +
                esc(typeLabel(d.diplomaType)) +
                " · " +
                esc(d.graduationYear) +
                "<br/><span style='font-size:0.84rem;color:var(--muted);'>" +
                esc(d.matricule || "—") +
                " · N° " +
                esc(d.diplomaNumber) +
                (revoked
                  ? " · <span style='color:#b91c1c;font-weight:600;'>Révoqué</span>"
                  : " · <span style='color:var(--success);font-weight:600;'>Actif</span>") +
                "</span>" +
                (d.verificationCode && !revoked
                  ? "<div style='margin-top:0.45rem;font-size:0.82rem;'><strong>Code vérif. :</strong> " +
                    esc(d.verificationCode) +
                    "</div>"
                  : "") +
                '<div style="margin-top:0.55rem;display:flex;gap:0.4rem;flex-wrap:wrap;">' +
                (!revoked
                  ? '<button type="button" class="btn btn--ghost btn--sm" data-revoke-dip="' +
                    esc(d.id) +
                    '">Révoquer</button>'
                  : "") +
                '<a class="btn btn--ghost btn--sm" href="verifier-diplome.html" target="_blank" rel="noopener">Page vérification</a>' +
                "</div></article>"
              );
            })
            .join("") +
          "</div>";

        listEl.querySelectorAll("[data-revoke-dip]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            if (!confirm("Révoquer ce diplôme ? Il ne sera plus vérifiable comme authentique.")) return;
            try {
              await revoke(session, btn.dataset.revokeDip);
              await renderList();
              alert("Diplôme révoqué.");
            } catch (err) {
              alert(err.message || "Révocation impossible.");
            }
          });
        });
      } catch (err) {
        listEl.innerHTML =
          '<p style="color:#b91c1c;margin:0;">' + esc(err.message || "Chargement impossible.") + "</p>";
      }
    }

    root.querySelector("#dipIssueForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = sel.value.trim();
      if (!email) {
        alert("Choisissez un étudiant.");
        return;
      }
      const payload = {
        studentEmail: email,
        studentName: root.querySelector("#dipName").value.trim(),
        matricule: root.querySelector("#dipMatricule").value.trim(),
        filiere: root.querySelector("#dipFiliere").value.trim(),
        niveau: root.querySelector("#dipNiveau").value.trim(),
        diplomaType: root.querySelector("#dipType").value,
        graduationYear: Number(root.querySelector("#dipYear").value),
        notes: root.querySelector("#dipNotes").value.trim(),
        universityName: session.nomUniversite || session.universite || "",
      };
      try {
        const item = await issue(session, payload);
        const box = root.querySelector("#dipIssueResult");
        box.style.display = "block";
        box.innerHTML =
          "<strong>✓ Diplôme émis</strong><br/><br/>" +
          "Titulaire : <strong>" +
          esc(item.studentName) +
          "</strong><br/>" +
          "N° diplôme : <code>" +
          esc(item.diplomaNumber) +
          "</code><br/>" +
          "Code de vérification : <code>" +
          esc(item.verificationCode) +
          "</code><br/>" +
          "<span style='font-size:0.84rem;color:var(--muted);'>Communiquez ces deux codes à l'étudiant pour la vérification officielle.</span>";
        e.target.reset();
        root.querySelector("#dipYear").value = String(year);
        await renderList();
      } catch (err) {
        alert(err.message || "Émission impossible.");
      }
    });

    renderList();
    }

    init();
  }

  async function mountStudentUI(root, session) {
    if (!root || !session) return;
    let items = [];
    try {
      if (typeof SAC_API !== "undefined" && SAC_API.listMyDiplomas) {
        const online = await SAC_API.ensureOnline();
        if (online) items = await SAC_API.listMyDiplomas();
      } else if (typeof SAC_PLATFORM !== "undefined" && SAC_PLATFORM.getMyDiplomas) {
        items = await SAC_PLATFORM.getMyDiplomas();
      }
    } catch {
      items = [];
    }
    if (!items.length) {
      root.innerHTML =
        '<p style="margin:0;color:var(--muted);font-size:0.9rem;">Aucun diplôme numérique émis pour votre compte. Votre université peut l\'émettre depuis l\'onglet <strong>Diplômes</strong>.</p>';
      return;
    }
    root.innerHTML =
      '<div style="display:grid;gap:0.65rem;">' +
      items
        .map(
          (d) =>
            '<article style="border:1px solid var(--border);border-radius:10px;padding:0.75rem;background:var(--bg);">' +
            "<strong>" +
            esc(typeLabel(d.diplomaType)) +
            "</strong> · Promotion " +
            esc(d.graduationYear) +
            "<br/><span style='font-size:0.84rem;color:var(--muted);'>N° " +
            esc(d.diplomaNumber) +
            " · " +
            esc(d.universite) +
            "</span>" +
            '<p style="margin:0.5rem 0 0;font-size:0.84rem;">Présentez le numéro et le code reçu de l\'université sur <a href="verifier-diplome.html" target="_blank" rel="noopener">la page de vérification</a>.</p>' +
            "</article>"
        )
        .join("") +
      "</div>";
  }

  return {
    TYPES,
    typeLabel,
    listCampus,
    issue,
    revoke,
    mountUniversityUI,
    mountStudentUI,
  };
})();

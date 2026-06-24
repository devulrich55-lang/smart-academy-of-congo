/** Publication ciblée par cours/classe — prof, assistant, université */
function SAC_initPublisherPage(config) {
  const {
    session,
    rootId,
    accentColor,
    pageTitle,
    pageDesc,
    multiFile = true,
    maxFiles = 10,
    sectionMode = false,
    getSectionId = null,
    getSectionLabel = null,
  } = config;
  const root = document.getElementById(rootId);
  if (!root) return;
  if (!SAC_DATA.canPublish(session.role)) {
    root.innerHTML =
      '<p class="page-desc" style="color:#b91c1c;">Publication non autorisée pour ce profil.</p>';
    return;
  }

  const rid = rootId.replace(/[^a-zA-Z0-9]/g, "_");
  const gid = (id) => document.getElementById(rid + "_" + id);

  const source = SAC_DATA.SOURCE_BY_ROLE[session.role];
  const isCampus = session.role === "universite" && !sectionMode;
  const teaching = isCampus || sectionMode ? [] : SAC_COURSES.getTeachingClasses(session);
  let editingId = null;

  const sectionBannerHtml =
    sectionMode && getSectionLabel
      ? `<div class="fg full" id="pubSectionBanner" style="background:rgba(13,122,74,0.08);padding:0.75rem;border-radius:8px;border:1px solid rgba(13,122,74,0.25);">
          <strong>Section cible :</strong> <span data-pub-section-label>${escapeHtml(getSectionLabel() || "— Sélectionnez une section à gauche —")}</span>
          <p class="pub-hint" style="margin:0.35rem 0 0;">Seuls les étudiants rattachés à cette section (même filière) verront ce message.</p>
        </div>`
      : "";

  const courseFieldHtml =
    sectionMode || isCampus
    ? sectionBannerHtml
    : teaching.length
      ? `<div class="fg full"><label>Cours / classe cible <span class="hint">*</span></label>
          <select id="pubCourse" class="fi" required>
            <option value="">— Choisir le cours —</option>
            ${teaching
              .map(
                (c, i) =>
                  `<option value="${i}">${escapeHtml(SAC_COURSES.classLabel(c))}</option>`
              )
              .join("")}
          </select>
          <p class="pub-hint">Visible uniquement par les étudiants inscrits au même niveau et filière.</p></div>`
      : `<div class="pub-manual-class">
          <p class="pub-warn">⚠️ Aucun cours enregistré sur votre profil. Complétez votre inscription ou saisissez la classe ci-dessous.</p>
          <div class="form-row-2">
            <div class="fg"><label>Code cours *</label><input type="text" id="pubCourseCode" class="fi" placeholder="ECO101" /></div>
            <div class="fg"><label>Intitulé *</label><input type="text" id="pubCourseName" class="fi" placeholder="Introduction…" /></div>
          </div>
          <div class="form-row-2">
            <div class="fg"><label>Filière *</label><input type="text" id="pubFiliere" class="fi" /></div>
            <div class="fg"><label>Niveau *</label><select id="pubNiveau" class="fi">${SAC_COURSES.niveauOptionsHtml()}</select></div>
          </div>
          <div class="fg"><label>Nom de la classe *</label><input type="text" id="pubClasse" class="fi" placeholder="L2 Gestion — Groupe A" /></div>
        </div>`;

  const defaultDesc = sectionMode
    ? "Publiez des informations pour la section sélectionnée (faculté / filière)."
    : isCampus
      ? "Diffusez des informations officielles à tous les étudiants et personnels de votre campus (profil université)."
      : "Informations, documents, images, audio et vidéos pour votre classe.";
  const descHtml = pageDesc || defaultDesc;

  root.innerHTML = `
    ${pageTitle ? `<h2 class="page-title" style="font-size:1.35rem;margin:0 0 0.5rem;">${escapeHtml(pageTitle)}</h2>` : ""}
    <p class="page-desc" style="margin-bottom:1.25rem;">
      ${descHtml}
      ${sectionMode ? "" : !isCampus ? " Seuls les étudiants de la même université, filière et niveau verront vos contenus." : " Visible par tous les comptes liés à votre établissement."}
      ${!isCampus && !sectionMode ? " Les étudiants peuvent réagir à vos publications." : ""}
    </p>
    <div class="panel" style="margin-bottom:1.5rem;border-color:${accentColor};">
      <div class="panel__head"><h2 id="${rid}_formTitle">Publier un contenu</h2></div>
      <div class="panel__body">
        <form id="${rid}_docPublishForm" class="pub-form" novalidate>
          ${courseFieldHtml.replace(/id="pub/g, `id="${rid}_pub`)}
          <div class="form-row-2">
            <div class="fg"><label>Titre *</label><input type="text" id="${rid}_pubTitle" class="fi" required /></div>
            <div class="fg"><label>Type de contenu *</label>
              <select id="${rid}_pubMedia" class="fi">${SAC_COURSES.mediaOptionsHtml()}</select>
            </div>
          </div>
          <div class="fg" id="${rid}_wrapDocType" style="display:none;">
            <label>Format document</label>
            <select id="${rid}_pubType" class="fi"><option>PDF</option><option>PPT</option><option>DOC</option><option>XLS</option></select>
          </div>
          <div class="fg"><label>Description</label><textarea id="${rid}_pubDesc" class="fi" rows="2"></textarea></div>
          <div class="fg" id="${rid}_wrapFile">
            <label id="${rid}_pubFileLabel">Fichiers (optionnel)</label>
            <input type="file" id="${rid}_pubFile" class="fi" accept="" ${multiFile ? "multiple" : ""} />
            <p class="pub-hint" style="margin:0.35rem 0 0;font-size:0.8rem;color:var(--muted);">
              Un ou plusieurs fichiers : PDF, images, audio, vidéo (max ${maxFiles} fichiers, 5 Mo chacun).
            </p>
            <div id="${rid}_pubFilePreview" class="pub-file-preview" style="display:flex;flex-wrap:wrap;gap:0.35rem;margin-top:0.5rem;"></div>
            <input type="text" id="${rid}_pubUrl" class="fi" style="margin-top:0.5rem;" placeholder="Ou lien URL (https://…)" inputmode="url" autocomplete="url" />
          </div>
          ${!isCampus ? `<label class="chk"><input type="checkbox" id="${rid}_pubReactions" checked /> Autoriser les réactions (👍 ❓ 🙏)</label>` : ""}
          <div style="display:flex;gap:0.5rem;margin-top:1rem;flex-wrap:wrap;">
            <button type="submit" class="btn-pub" id="${rid}_btnPubSubmit">Publier</button>
            <button type="button" class="btn-ghost-pub" id="${rid}_btnPubCancel" style="display:none;">Annuler</button>
          </div>
        </form>
      </div>
    </div>
    <div class="panel">
      <div class="panel__head"><h2>Mes publications</h2><span id="${rid}_pubCount" style="font-size:0.85rem;color:var(--muted);"></span></div>
      <div class="panel__body"><div id="${rid}_pubDocList"></div></div>
    </div>
  `;

  const pubMedia = gid("pubMedia");
  const wrapDocType = gid("wrapDocType");
  const pubFile = gid("pubFile");
  const pubFileLabel = gid("pubFileLabel");
  const pubFilePreview = gid("pubFilePreview");

  const ACCEPT_ALL =
    ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.mp3,.wav,.mp4,.webm,.mov,image/*,video/*,audio/*,application/pdf";

  function syncMediaUI() {
    const m = pubMedia.value;
    wrapDocType.style.display = m === "document" ? "block" : "none";
    const labels = {
      info: multiFile ? "Pièces jointes (un ou plusieurs fichiers)" : "Pièce jointe (optionnel)",
      document: multiFile ? "Documents (PDF, DOC… — un ou plusieurs)" : "Fichier document (PDF, DOC…)",
      image: multiFile ? "Images (un ou plusieurs)" : "Image (JPG, PNG, WebP)",
      audio: multiFile ? "Fichiers audio (un ou plusieurs)" : "Audio (MP3, WAV)",
      video: multiFile ? "Vidéos (un ou plusieurs — MP4, WebM…)" : "Vidéo (MP4, WebM…)",
    };
    pubFileLabel.textContent = labels[m] || labels.document;
    if (multiFile) {
      pubFile.accept = ACCEPT_ALL;
    } else {
      pubFile.accept =
        m === "image"
          ? "image/*"
          : m === "audio"
            ? "audio/*"
            : m === "video"
              ? "video/*,.mp4,.webm,.mov"
              : m === "document"
                ? ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
                : ACCEPT_ALL;
    }
  }

  function renderFilePreview() {
    if (!pubFilePreview) return;
    const files = Array.from(pubFile.files || []);
    if (!files.length) {
      pubFilePreview.innerHTML = "";
      return;
    }
    pubFilePreview.innerHTML = files
      .map(
        (f) =>
          `<span class="file-chip" style="display:inline-flex;align-items:center;gap:0.25rem;padding:0.25rem 0.5rem;background:rgba(13,122,74,0.1);border-radius:6px;font-size:0.78rem;">📎 ${escapeHtml(f.name)} (${Math.round(f.size / 1024)} Ko)</span>`
      )
      .join("");
  }

  pubMedia.addEventListener("change", syncMediaUI);
  pubFile.addEventListener("change", () => {
    const n = pubFile.files?.length || 0;
    if (n > maxFiles) {
      alert(`Maximum ${maxFiles} fichiers.`);
      pubFile.value = "";
      renderFilePreview();
      return;
    }
    renderFilePreview();
  });
  syncMediaUI();

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function refreshSectionBanner() {
    const el = root.querySelector("[data-pub-section-label]");
    if (el && getSectionLabel) el.textContent = getSectionLabel() || "— Sélectionnez une section à gauche —";
  }

  function getClassPayload() {
    if (sectionMode) {
      const sectionId = getSectionId?.();
      if (!sectionId || typeof SAC_SECTIONS === "undefined") return null;
      const sec = SAC_SECTIONS.getSectionById(sectionId);
      if (!sec) return null;
      return {
        universite: sec.universite || session.universite || "",
        filiere: sec.filiere,
        audienceType: "section",
        sectionId: sec.id,
        sectionName: sec.name,
      };
    }
    if (isCampus) {
      return {
        universite:
          (typeof SAC_UNIVERSITIES !== "undefined" && SAC_UNIVERSITIES.resolveId
            ? SAC_UNIVERSITIES.resolveId(
                session.universite || session.codeUni || session.sigle || ""
              )
            : null) ||
          session.universite ||
          session.codeUni ||
          session.sigle ||
          "",
        audienceType: "campus",
      };
    }
    const uni = session.universite || "";
    const sel = gid("pubCourse");
    if (sel && teaching.length) {
      if (sel.value === "" || sel.value == null) return null;
      const idx = Number(sel.value);
      if (!Number.isFinite(idx) || idx < 0 || idx >= teaching.length) return null;
      const c = teaching[idx];
      if (!c) return null;
      return {
        universite: c.universite || uni,
        filiere: c.filiere,
        niveau: c.niveau,
        courseCode: c.courseCode,
        courseName: c.courseName,
        classe: c.classe,
      };
    }
    const code = gid("pubCourseCode")?.value.trim();
    const name = gid("pubCourseName")?.value.trim();
    const filiere = gid("pubFiliere")?.value.trim();
    const niveau = gid("pubNiveau")?.value;
    const classe = gid("pubClasse")?.value.trim();
    if (!code || !name || !filiere || !niveau || !classe) return null;
    return { universite: uni, filiere, niveau, courseCode: code, courseName: name, classe };
  }

  function mediaToType(media, docType) {
    if (media === "info") return "INFO";
    if (media === "image") return "IMAGE";
    if (media === "audio") return "AUDIO";
    if (media === "video") return "VIDEO";
    return docType || "PDF";
  }

  function attachmentsLabel(d) {
    const n = (d.attachments || []).length;
    if (!n) return "";
    return ` <span class="pub-class-tag">+${n} fichier${n > 1 ? "s" : ""}</span>`;
  }

  function myDocs() {
    const sectionId = sectionMode ? getSectionId?.() : null;
    if (sectionMode) {
      return SAC_DATA.getAll().filter((d) => {
        if (d.source !== source) return false;
        return sectionId && d.audienceType === "section" && d.sectionId === sectionId;
      });
    }
    if (isCampus) {
      const code =
        session.universite || session.codeUni || session.sigle || "";
      return SAC_DATA.getAll().filter((d) => {
        if (d.source !== source) return false;
        return (
          d.audienceType !== "section" &&
          SAC_DATA.isCampusWideAdminDoc
            ? SAC_DATA.isCampusWideAdminDoc(d, code)
            : !d.universite || d.universite === code
        );
      });
    }
    return SAC_DATA.getPublicationsByAuthor(session);
  }

  function mediaBadge(d) {
    const icons = { info: "📢", document: "📄", image: "🖼️", audio: "🔊", video: "🎬" };
    return icons[d.mediaCategory] || "📄";
  }

  function renderList() {
    const docs = myDocs();
    gid("pubCount").textContent = docs.length + " publication(s)";
    const el = gid("pubDocList");
    if (!docs.length) {
      el.innerHTML = '<p class="empty">Aucune publication pour le moment.</p>';
      return;
    }
    el.innerHTML = docs
      .map((d) => {
        const c = SAC_DATA.reactionCounts(d);
        const reactInfo =
          d.allowReactions && !isCampus
            ? `<span class="react-sum">👍 ${c.useful} · ❓ ${c.question} · 🙏 ${c.thanks}</span>`
            : "";
        const viewInfo = SAC_DATA.formatViewStats
          ? SAC_DATA.formatViewStats(d)
          : "";
        const cls = d.audienceType === "section"
          ? `<span class="pub-class-tag">Section · ${escapeHtml(d.sectionName || d.filiere || "")}</span>`
          : d.classe
            ? `<span class="pub-class-tag">${escapeHtml(d.courseCode || "")} · ${escapeHtml(d.classe)}</span>`
            : d.audienceType === "campus"
              ? '<span class="pub-class-tag">Campus entier</span>'
              : "";
        return `<div class="pub-item">
          <div>
            <strong>${mediaBadge(d)} ${escapeHtml(d.title)}</strong> ${cls}${attachmentsLabel(d)}
            <div class="pub-meta">${d.type} · ${d.date} · ${escapeHtml(d.author)} ${viewInfo} ${reactInfo}</div>
            ${d.description ? `<p class="pub-desc">${escapeHtml(d.description)}</p>` : ""}
          </div>
          <div class="pub-actions">
            ${SAC_DATA.canEdit(session, d) ? `<button type="button" class="btn-sm-edit" data-edit="${d.id}">Modifier</button>` : ""}
            ${SAC_DATA.canDelete(session, d) ? `<button type="button" class="btn-sm-del" data-del="${d.id}">Supprimer</button>` : ""}
          </div>
        </div>`;
      })
      .join("");

    el.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => startEdit(btn.dataset.edit));
    });
    el.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (confirm("Supprimer cette publication ?")) {
          await SAC_DATA.remove(session, btn.dataset.del);
          renderList();
        }
      });
    });
  }

  function startEdit(id) {
    const d = SAC_DATA.getById(id);
    if (!d || !SAC_DATA.canEdit(session, d)) return;
    editingId = id;
    gid("formTitle").textContent = "Modifier la publication";
    gid("pubTitle").value = d.title;
    gid("pubDesc").value = d.description || "";
    pubMedia.value = d.mediaCategory || "document";
    syncMediaUI();
    gid("pubType").value = d.type || "PDF";
    gid("pubUrl").value = d.mediaUrl && !String(d.mediaUrl).startsWith("data:") ? d.mediaUrl : "";
    const chk = gid("pubReactions");
    if (chk) chk.checked = !!d.allowReactions;
    gid("btnPubSubmit").textContent = "Enregistrer";
    gid("btnPubCancel").style.display = "inline-block";
  }

  function resetForm() {
    editingId = null;
    gid("formTitle").textContent = "Publier un contenu";
    gid("docPublishForm").reset();
    const chk = gid("pubReactions");
    if (chk) chk.checked = true;
    gid("btnPubSubmit").textContent = "Publier";
    gid("btnPubCancel").style.display = "none";
    renderFilePreview();
    syncMediaUI();
  }

  async function processSelectedFiles(media) {
    const files = Array.from(pubFile.files || []);
    if (!files.length) return { mediaUrl: gid("pubUrl").value.trim(), size: "—", uploadFiles: [], attachments: [] };

    const usingApi = SAC_DATA.isUsingApi && SAC_DATA.isUsingApi();
    const maxLocal = 850000;
    const uploadFiles = [];
    const prepared = [];

    for (const f of files) {
      if (f.size > 5 * 1024 * 1024) throw new Error(`« ${f.name} » dépasse 5 Mo.`);
      if (usingApi) {
        uploadFiles.push(f);
        prepared.push({
          name: f.name,
          size: (f.size / 1024).toFixed(0) + " Ko",
          mediaUrl: "",
          type: mediaToType(media, gid("pubType")?.value),
        });
      } else if (f.size > maxLocal) {
        throw new Error(`« ${f.name} » trop volumineux hors ligne (max ~800 Ko). Utilisez un lien URL ou l'API.`);
      } else {
        prepared.push({
          name: f.name,
          size: (f.size / 1024).toFixed(0) + " Ko",
          mediaUrl: await readFileAsDataUrl(f),
          type: mediaToType(media, gid("pubType")?.value),
        });
      }
    }

    const primary = prepared[0];
    return {
      mediaUrl: primary.mediaUrl,
      size: primary.size,
      uploadFiles,
      attachments: prepared.slice(1),
    };
  }

  function normalizeOptionalUrl(raw) {
    const v = String(raw || "").trim();
    if (!v) return "";
    if (/^https?:\/\//i.test(v)) return v;
    return "https://" + v.replace(/^\/+/, "");
  }

  function validateFormFields() {
    const title = gid("pubTitle")?.value.trim();
    if (!title) {
      alert("Indiquez un titre pour la publication.");
      gid("pubTitle")?.focus();
      return false;
    }

    if (!isCampus && !sectionMode) {
      const classData = getClassPayload();
      if (!classData) {
        if (teaching.length) {
          alert("Sélectionnez le cours / la classe cible dans la liste.");
          gid("pubCourse")?.focus();
        } else {
          alert("Renseignez le code cours, l'intitulé, la filière, le niveau et la classe.");
        }
        return false;
      }
    }

    if (sectionMode && !getClassPayload()) {
      alert("Sélectionnez une section dans la liste à gauche avant de publier.");
      return false;
    }

    const rawUrl = gid("pubUrl")?.value.trim();
    if (rawUrl && !/^https?:\/\/.+/i.test(normalizeOptionalUrl(rawUrl))) {
      alert("Lien URL invalide. Exemple : https://mon-universite.cd/document.pdf");
      gid("pubUrl")?.focus();
      return false;
    }

    return true;
  }

  gid("docPublishForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validateFormFields()) return;

    const classData = getClassPayload();
    if (sectionMode && !classData) {
      alert("Sélectionnez une section dans la liste à gauche avant de publier.");
      return;
    }
    if (!isCampus && !sectionMode && !classData) {
      alert("Sélectionnez ou renseignez le cours et la classe cible.");
      return;
    }

    const media = pubMedia.value;
    let filePack;
    try {
      filePack = await processSelectedFiles(media);
    } catch (err) {
      alert(err.message || "Fichier invalide.");
      return;
    }
    let mediaUrl = filePack.mediaUrl || normalizeOptionalUrl(gid("pubUrl").value);

    const data = {
      title: gid("pubTitle").value.trim(),
      description: gid("pubDesc").value.trim(),
      mediaCategory: media,
      type: mediaToType(media, gid("pubType")?.value),
      size: filePack.size,
      mediaUrl,
      attachments: filePack.attachments,
      allowReactions: gid("pubReactions")?.checked ?? false,
      author:
        (typeof SAC_IDENTITY !== "undefined"
          ? SAC_IDENTITY.getDisplayName(session)
          : session.displayName || session.nom) || session.identifiant,
      ...classData,
    };
    if (!data.title) {
      alert("Indiquez un titre pour la publication.");
      return;
    }

    const btn = gid("btnPubSubmit");
    const prevLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = editingId ? "Enregistrement…" : "Publication…";
    try {
      const wasEdit = !!editingId;
      if (editingId) await SAC_DATA.update(session, editingId, data);
      else await SAC_DATA.create(session, data, filePack.uploadFiles.length ? filePack.uploadFiles : null);
      resetForm();
      renderList();
      alert(wasEdit ? "Publication mise à jour." : "Publication enregistrée avec succès.");
    } catch (err) {
      const msg =
        err.message ||
        (err.code === "FORBIDDEN"
          ? "Publication refusée — reconnectez-vous."
          : "Publication échouée. Vérifiez le cours cible et réessayez.");
      if (err.sessionInvalid || err.code === "USER_NOT_FOUND" || err.code === "TOKEN_EXPIRED") {
        alert(msg);
        window.location.href =
          (typeof SAC_SESSION !== "undefined" ? SAC_SESSION.loginUrl(session.role) : "connexion.html") +
          "&reason=session_expired";
        return;
      }
      alert(msg);
    } finally {
      btn.disabled = false;
      btn.textContent = prevLabel;
    }
  });

  gid("btnPubCancel").addEventListener("click", resetForm);
  SAC_DATA.ensureReady().then(renderList);

  return { renderList, refreshSectionBanner, resetForm };
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

/** Publications ciblées pour une section faculté (onglet Sections) */
function SAC_initSectionPublisher(session, rootId, getSectionId, getSectionLabel) {
  return SAC_initPublisherPage({
    session,
    rootId: rootId || "sectionPublisherRoot",
    accentColor: "#0e7490",
    pageTitle: "Informations pour la section",
    pageDesc:
      "<strong>Publication section :</strong> diffusez annonces, documents, photos ou vidéos. <em>Seuls les étudiants de votre section / filière</em> les verront.",
    multiFile: true,
    maxFiles: 10,
    sectionMode: true,
    getSectionId,
    getSectionLabel,
  });
}

/** Chef de section connecté — publie pour sa section (sectionId dans la session) */
function SAC_initSectionHeadPublisher(session, rootId) {
  const getSectionId = () => session.sectionId;
  const getSectionLabel = () => {
    if (session.sectionName && session.filiere) {
      return session.sectionName + " — " + session.filiere;
    }
    if (session.sectionName) return session.sectionName;
    if (typeof SAC_SECTIONS !== "undefined" && session.sectionId) {
      const sec = SAC_SECTIONS.getSectionById(session.sectionId);
      if (sec) return sec.name + " — " + sec.filiere;
    }
    return session.filiere || "Ma section";
  };
  return SAC_initSectionPublisher(session, rootId || "sectionHeadPublisherRoot", getSectionId, getSectionLabel);
}

function SAC_renderDocumentFeedList(docs, rootEl, emptyText) {
  if (!rootEl) return;
  if (!docs?.length) {
    rootEl.innerHTML =
      '<p class="empty" style="margin:0;">' +
      escapeHtml(emptyText || "Aucune publication pour le moment.") +
      "</p>";
    return;
  }
  const icons = { info: "📢", document: "📄", image: "🖼️", audio: "🔊", video: "🎬" };
  rootEl.innerHTML = docs
    .map((doc) => {
      const tag =
        doc.audienceType === "section"
          ? `<span class="pub-class-tag">Section · ${escapeHtml(doc.sectionName || doc.filiere || "")}</span>`
          : doc.audienceType === "campus"
            ? '<span class="pub-class-tag">Campus entier</span>'
            : "";
      return `<article class="pub-item">
        <div>
          <strong>${icons[doc.mediaCategory] || "📄"} ${escapeHtml(doc.title)}</strong> ${tag}
          <div class="pub-meta">${escapeHtml(doc.type || "—")} · ${escapeHtml(doc.date || "")} · ${escapeHtml(doc.author || "")}</div>
          ${doc.description ? `<p class="pub-desc">${escapeHtml(doc.description)}</p>` : ""}
        </div>
      </article>`;
    })
    .join("");
}

/** Vue lecture : publications université + national + publisher section */
async function SAC_mountSectionPublicationsPage(session, opts) {
  if (!session) return;
  const isRector =
    typeof SAC_SECTION_APPROVAL !== "undefined" && SAC_SECTION_APPROVAL.isRector(session);
  const uni = session.universite || "";

  await SAC_DATA.ensureReady();
  if (typeof SAC_HOME_NEWS !== "undefined" && SAC_HOME_NEWS.ensureSynced) {
    await SAC_HOME_NEWS.ensureSynced();
  }

  const campusDocs = SAC_DATA.getCampusPublicationsForStaff(session);
  const sectionUniDocs = SAC_DATA.getSectionPublicationsForHead(session);
  SAC_renderDocumentFeedList(
    campusDocs,
    document.getElementById(opts?.campusDocsRoot || "secCampusDocsFeed"),
    "Aucun document campus publié par l'université."
  );
  SAC_renderDocumentFeedList(
    sectionUniDocs,
    document.getElementById(opts?.sectionUniDocsRoot || "secSectionUniDocsFeed"),
    "Aucune publication université ciblée pour votre section."
  );

  const newsRoot = document.getElementById(opts?.campusNewsRoot || "secCampusNewsFeed");
  if (newsRoot && typeof SAC_HOME_NEWS !== "undefined") {
    const news = SAC_HOME_NEWS.getUniversityNewsForStudent(uni);
    if (!news.length) {
      newsRoot.innerHTML =
        '<p class="empty" style="margin:0;">Aucune annonce université pour le moment.</p>';
    } else {
      newsRoot.innerHTML =
        '<div class="hn-readonly-feed">' + news.map((n) => SAC_HOME_NEWS.renderCard(n)).join("") + "</div>";
      if (SAC_HOME_NEWS.afterRenderFeed) SAC_HOME_NEWS.afterRenderFeed(newsRoot);
    }
  }

  if (typeof SAC_HOME_NEWS !== "undefined" && SAC_HOME_NEWS.renderNationalFeedReadonly) {
    SAC_HOME_NEWS.renderNationalFeedReadonly(opts?.nationalRoot || "secNationalFeed");
  }

  const pubRoot = document.getElementById(opts?.publisherRoot || "sectionHeadPublisherRoot");
  let pubSession = session;
  if (isRector && !pubSession.sectionId && typeof SAC_SECTIONS !== "undefined") {
    const first = SAC_SECTIONS.getSectionsByUniversity(session).find((s) => s.active !== false);
    if (first) {
      pubSession = {
        ...session,
        sectionId: first.id,
        sectionName: first.name,
        filiere: first.filiere,
      };
    }
  }
  if (pubRoot && pubSession.sectionId) {
    if (!pubRoot.dataset.ready) {
      pubRoot._sacPublisher = SAC_initSectionHeadPublisher(pubSession, pubRoot.id);
      pubRoot.dataset.ready = "1";
    } else if (pubRoot._sacPublisher?.renderList) {
      pubRoot._sacPublisher.renderList();
    }
  } else if (pubRoot && isRector) {
    pubRoot.innerHTML =
      '<p class="page-desc" style="margin:0;padding:1rem;background:var(--bg);border-radius:8px;border:1px dashed var(--border);">Aucune section enregistrée sur ce campus — ajoutez des sections (Super Admin ou DG) pour publier au nom d\'une filière.</p>';
  } else if (pubRoot && !session.sectionId) {
    pubRoot.innerHTML =
      '<p class="page-desc" style="margin:0;padding:1rem;background:var(--bg);border-radius:8px;border:1px dashed var(--border);">Section non identifiée — impossible de publier. Contactez l\'administration université.</p>';
  }
}

/** Publication DG — visible par tous les étudiants du campus */
function SAC_initCampusWidePublisher(session, rootId) {
  if (!session || session.role !== "universite") return null;
  return SAC_initPublisherPage({
    session,
    rootId: rootId || "campusWidePublisherRoot",
    accentColor: "#0c3d6e",
    pageTitle: "Publication — tous les étudiants de l'université",
    pageDesc:
      "<strong>Portée : campus entier.</strong> Ce message sera visible par <strong>tous les étudiants inscrits à votre établissement</strong> " +
      "(profil « Mon université », documents officiels). Aucune restriction de filière, niveau ou classe.",
    multiFile: true,
    maxFiles: 10,
  });
}

/** Espace publication sur l'onglet « Mon campus » (profil université) */
function SAC_initUniversityProfilePublisher(session, rootId) {
  SAC_initPublisherPage({
    session,
    rootId: rootId || "profilePublisherRoot",
    accentColor: "#0d7a4a",
    pageTitle: "Informations — Mon université (portail)",
    pageDesc:
      "<strong>Fil campus :</strong> annonces, documents, photos et vidéos visibles par <strong>tous les étudiants et personnels</strong> rattachés à votre établissement dans Smart Academy.",
    multiFile: true,
    maxFiles: 10,
  });
}

/**
 * IA orientation académique — conseils parcours / stages / compétences
 */
const SAC_ORIENTATION = (function () {
  function esc(s) {
    const el = document.createElement("div");
    el.textContent = String(s || "");
    return el.innerHTML;
  }

  async function getAdvice(session, interests) {
    if (typeof SAC_API !== "undefined" && SAC_API.getOrientationAdvice) {
      const online = await SAC_API.ensureOnline();
      if (online) return await SAC_API.getOrientationAdvice(interests);
    }
    if (typeof SAC_PLATFORM !== "undefined" && SAC_PLATFORM.getOrientation) {
      return SAC_PLATFORM.getOrientation(interests);
    }
    throw new Error("Service orientation indisponible.");
  }

  function renderAdvice(advice) {
    if (!advice) return "<p class='empty'>Aucun conseil disponible.</p>";
    const list = (items) =>
      (items || []).map((x) => "<li>" + esc(x) + "</li>").join("") || "<li>—</li>";
    return (
      '<div class="orientation-result">' +
      '<p style="margin:0 0 0.75rem;font-size:0.95rem;">' +
      esc(advice.message) +
      "</p>" +
      '<div class="orientation-grid">' +
      '<div class="orientation-block"><h3>Filières recommandées</h3><ul>' +
      list(advice.recommendedFilieres) +
      "</ul></div>" +
      '<div class="orientation-block"><h3>Stages suggérés</h3><ul>' +
      list(advice.suggestedInternships) +
      "</ul></div>" +
      '<div class="orientation-block"><h3>Compétences à développer</h3><ul>' +
      list(advice.skillsToDevelop) +
      "</ul></div>" +
      "</div>" +
      '<p style="margin:0.85rem 0 0;font-weight:600;color:var(--primary);">' +
      esc(advice.academicPath) +
      "</p>" +
      '<p style="margin:0.5rem 0 0;font-size:0.8rem;color:var(--muted);">' +
      esc(advice.disclaimer) +
      "</p></div>"
    );
  }

  function mountStudentUI(root, session) {
    if (!root || !session) return;
    root.innerHTML =
      '<div class="panel panel--workspace">' +
      '<div class="panel__head"><h2>Assistant orientation</h2></div>' +
      '<div class="panel__body">' +
      '<p style="margin:0 0 0.75rem;color:var(--muted);font-size:0.88rem;">' +
      "Indiquez vos centres d'intérêt ou laissez vide pour utiliser votre filière enregistrée (" +
      esc(session.filiere || "—") +
      ", " +
      esc(session.niveau || "—") +
      ").</p>" +
      '<form id="orientationForm" class="rec-form" style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:flex-end;">' +
      '<div class="fg" style="flex:1;min-width:200px;"><label>Centres d\'intérêt (optionnel)</label>' +
      '<input class="fi" id="orientationInterests" placeholder="Ex. informatique, data, cybersécurité…" /></div>' +
      '<button type="submit" class="btn btn--role">Obtenir un conseil</button></form>' +
      '<div id="orientationResult" style="margin-top:1rem;"></div></div></div>';

    root.querySelector("#orientationForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const box = root.querySelector("#orientationResult");
      box.innerHTML = "<p style='color:var(--muted);'>Analyse en cours…</p>";
      const interests = root.querySelector("#orientationInterests").value.trim();
      try {
        const advice = await getAdvice(session, interests);
        box.innerHTML = renderAdvice(advice);
      } catch (err) {
        box.innerHTML = "<p style='color:#b91c1c;'>" + esc(err.message) + "</p>";
      }
    });
  }

  return { mountStudentUI, getAdvice, renderAdvice };
})();

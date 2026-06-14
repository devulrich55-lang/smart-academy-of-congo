/**
 * Établissements d'enseignement supérieur — RDC (universités & instituts)
 */
const SAC_UNIVERSITIES = (function () {
  const UNIVERSITIES = [
    { id: "unkin", name: "Université de Kinshasa", sigle: "UNIKIN", type: "universite" },
    { id: "unilu", name: "Université de Lubumbashi", sigle: "UNILU", type: "universite" },
    { id: "unikis", name: "Université de Kisangani", sigle: "UNIKIS", type: "universite" },
    { id: "upn", name: "Université Pédagogique Nationale", sigle: "UPN", type: "universite" },
    { id: "unigom", name: "Université de Goma", sigle: "UNIGOM", type: "universite" },
    { id: "unibuk", name: "Université de Bukavu", sigle: "UNIBUK", type: "universite" },
    { id: "uom", name: "Université Officielle de Mbuji-Mayi", sigle: "UOM", type: "universite" },
    { id: "unikan", name: "Université de Kananga", sigle: "UNIKAN", type: "universite" },
    { id: "uniknd", name: "Université de Kindu", sigle: "UNIKND", type: "universite" },
    { id: "unkwt", name: "Université de Kikwit", sigle: "UNKWT", type: "universite" },
    { id: "upro", name: "Université Protestante au Congo", sigle: "UPC", type: "universite" },
    { id: "ucc", name: "Université Catholique du Congo", sigle: "UCC", type: "universite" },
    { id: "ulk", name: "Université Libre de Kinshasa", sigle: "ULK", type: "universite" },
    { id: "usk", name: "Université Simon Kimbangu", sigle: "USK", type: "universite" },
    { id: "uccm", name: "Université Chrétienne Cardinal Malula", sigle: "UCCM", type: "universite" },
  ];

  const INSTITUTES = [
    { id: "istap", name: "Institut Supérieur des Techniques Appliquées", sigle: "ISTA", type: "institut" },
    { id: "inbat", name: "Institut National du Bâtiment et Travaux Publics", sigle: "INBTP", type: "institut" },
    { id: "ifsic", name: "Institut Facultaire des Sciences de l'Information et de la Communication", sigle: "IFSIC", type: "institut" },
    { id: "isck", name: "Institut Supérieur de Commerce de Kinshasa", sigle: "ISC-Kin", type: "institut" },
    { id: "aba", name: "Académie des Beaux-Arts", sigle: "ABA", type: "institut" },
    { id: "inarts", name: "Institut National des Arts", sigle: "INA", type: "institut" },
    { id: "istmed", name: "Institut Supérieur des Techniques Médicales de Kinshasa", sigle: "ISTM-Kin", type: "institut" },
    { id: "isstat", name: "Institut Supérieur des Statistiques", sigle: "ISS", type: "institut" },
    { id: "isau", name: "Institut Supérieur d'Architecture et d'Urbanisme", sigle: "ISAU", type: "institut" },
    { id: "isam", name: "Institut Supérieur des Arts et Métiers", sigle: "ISAM", type: "institut" },
  ];

  const LIST = [...UNIVERSITIES, ...INSTITUTES];

  function getById(id) {
    return LIST.find((u) => u.id === id);
  }

  function formatLabel(u) {
    if (!u) return "";
    return u.sigle ? `${u.name} (${u.sigle})` : u.name;
  }

  function getLabel(id) {
    const u = getById(id);
    if (!u) return id || "—";
    return formatLabel(u);
  }

  function getName(id) {
    return getById(id)?.name || id || "—";
  }

  function optionsForGroup(items, selectedId) {
    return items
      .map((u) => {
        const sel = u.id === selectedId ? " selected" : "";
        return `<option value="${u.id}"${sel}>${formatLabel(u)}</option>`;
      })
      .join("");
  }

  function optionsHtml(selectedId, opts = {}) {
    const empty = opts.empty !== false;
    const emptyLabel = opts.emptyLabel || "— Choisir —";
    const includeAutre = opts.includeAutre === true;
    const useGroups = opts.groups !== false;

    let html = empty ? `<option value="">${emptyLabel}</option>` : "";

    if (useGroups) {
      html += `<optgroup label="Universités">${optionsForGroup(UNIVERSITIES, selectedId)}</optgroup>`;
      html += `<optgroup label="Instituts supérieurs & académies">${optionsForGroup(INSTITUTES, selectedId)}</optgroup>`;
    } else {
      html += optionsForGroup(LIST, selectedId);
    }

    if (includeAutre) {
      html += `<option value="autre"${selectedId === "autre" ? " selected" : ""}>Autre établissement partenaire</option>`;
    }
    return html;
  }

  function populateAll(selectors, selectedId) {
    document.querySelectorAll(selectors).forEach((el) => {
      const sel = selectedId ?? el.dataset.selected ?? el.value;
      const includeAutre = el.dataset.includeAutre === "true";
      const emptyLabel = el.dataset.emptyLabel || "— Choisir —";
      el.innerHTML = optionsHtml(sel, { emptyLabel, includeAutre });
    });
  }

  const NAMES = Object.fromEntries(LIST.map((u) => [u.id, getLabel(u.id)]));

  return {
    LIST,
    UNIVERSITIES,
    INSTITUTES,
    NAMES,
    getById,
    getLabel,
    getName,
    optionsHtml,
    populateAll,
  };
})();

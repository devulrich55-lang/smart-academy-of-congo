/**
 * SEO — URL canonique et balises Open Graph (adaptées à l’URL Render en ligne)
 */
(function () {
  "use strict";

  if (typeof document === "undefined" || !document.head) return;

  var origin = (window.location.origin || "").replace(/\/+$/, "");
  var path = window.location.pathname || "/";
  var canonical = origin + path.replace(/\/index\.html$/i, "/").replace(/([^/])\/$/, "$1");
  if (canonical.endsWith("/") && canonical.length > origin.length + 1) {
    canonical = canonical.slice(0, -1);
  }

  function upsertLink(rel, href) {
    var el = document.querySelector('link[rel="' + rel + '"]');
    if (!el) {
      el = document.createElement("link");
      el.setAttribute("rel", rel);
      document.head.appendChild(el);
    }
    el.setAttribute("href", href);
  }

  function upsertMeta(name, content, isProperty) {
    if (!content) return;
    var sel = isProperty ? 'meta[property="' + name + '"]' : 'meta[name="' + name + '"]';
    var el = document.querySelector(sel);
    if (!el) {
      el = document.createElement("meta");
      if (isProperty) el.setAttribute("property", name);
      else el.setAttribute("name", name);
      document.head.appendChild(el);
    }
    el.setAttribute("content", content);
  }

  upsertLink("canonical", canonical);

  var title = document.title || "Evo-smartUni";
  var descEl = document.querySelector('meta[name="description"]');
  var description =
    (descEl && descEl.getAttribute("content")) ||
    "Evo-smartUni — plateforme académique pour universités, étudiants et professeurs en RDC.";

  upsertMeta("robots", "index, follow");
  upsertMeta("og:type", "website", true);
  upsertMeta("og:site_name", "Evo-smartUni", true);
  upsertMeta("og:title", title, true);
  upsertMeta("og:description", description, true);
  upsertMeta("og:url", canonical, true);
  upsertMeta("og:locale", "fr_FR", true);
  upsertMeta("og:image", origin + "/logo_pro.png", true);
  upsertMeta("twitter:card", "summary_large_image");
  upsertMeta("twitter:title", title);
  upsertMeta("twitter:description", description);
  upsertMeta("twitter:image", origin + "/logo_pro.png");
})();

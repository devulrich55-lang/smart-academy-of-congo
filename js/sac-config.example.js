/**
 * Configuration optionnelle — chargez AVANT evosu-api.js uniquement si l'API
 * est sur un domaine différent (sans rewrite /api).
 *
 * Local (start-local.bat) : ne rien définir — API same-origin sur le port 8000.
 */
window.EVOSU_API_BASE = window.EVOSU_API_BASE || "";

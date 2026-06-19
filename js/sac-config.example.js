/**
 * Configuration optionnelle — chargez AVANT sac-api.js uniquement si l'API
 * est sur un domaine différent (sans rewrite /api).
 *
 * Local (start-local.bat) : ne rien définir — API same-origin sur le port 8000.
 */
window.SAC_API_BASE = window.SAC_API_BASE || "";

/**
 * Configuration optionnelle — chargez AVANT sac-api.js uniquement si l'API
 * est sur un domaine différent (sans rewrite /api).
 *
 * Local (start-local.bat) et Firebase/Vercel (rewrite /api) : ne rien définir.
 */
window.SAC_API_BASE = window.SAC_API_BASE || "";

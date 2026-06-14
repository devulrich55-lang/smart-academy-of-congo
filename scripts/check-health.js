/**
 * Vérifie /api/health sur une URL de base.
 * Usage : node scripts/check-health.js https://mon-site.web.app
 */
const base = (process.argv[2] || "http://127.0.0.1:8000").replace(/\/+$/, "");

async function main() {
  const url = `${base}/api/health`;
  try {
    const res = await fetch(url, { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      console.error("FAIL", url, res.status, data);
      process.exit(1);
    }
    console.log("OK", url, data);
  } catch (err) {
    console.error("FAIL", url, err.message);
    process.exit(1);
  }
}

main();

/**
 * Vérifie qu'une URL frontend est bien un Web Service Node (pas Static Site).
 * Usage : node scripts/check-node-deploy.js https://smart-academy-of-congoat.onrender.com
 */
const base = (process.argv[2] || "http://127.0.0.1:10000").replace(/\/+$/, "");

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { res, data };
}

async function main() {
  const checks = [];
  let failed = false;

  try {
    const health = await fetchJson(`${base}/health`);
    const nodeOk = health.res.ok && health.data.mode === "node";
    checks.push({
      name: "GET /health (mode node)",
      ok: nodeOk,
      detail: nodeOk ? JSON.stringify(health.data) : health.res.status,
    });
    if (!nodeOk) failed = true;
  } catch (err) {
    checks.push({ name: "GET /health", ok: false, detail: err.message });
    failed = true;
  }

  try {
    const page = await fetch(`${base}/`, { method: "GET" });
    const csp = page.headers.get("content-security-policy");
    const cspRo = page.headers.get("content-security-policy-report-only");
    const hasCsp = !!(csp || cspRo);
    checks.push({
      name: "CSP header (D1)",
      ok: hasCsp,
      detail: csp || cspRo || "absent — probable Static Site",
    });
    if (!hasCsp) failed = true;
  } catch (err) {
    checks.push({ name: "CSP header", ok: false, detail: err.message });
    failed = true;
  }

  try {
    const api = await fetchJson(`${base}/api/health`);
    const proxyOk = api.res.ok && (api.data.ok === true || api.data.database);
    checks.push({
      name: "GET /api/health (proxy)",
      ok: proxyOk,
      detail: proxyOk ? "ok" : `${api.res.status} ${JSON.stringify(api.data).slice(0, 120)}`,
    });
    if (!proxyOk) failed = true;
  } catch (err) {
    checks.push({ name: "GET /api/health", ok: false, detail: err.message });
    failed = true;
  }

  console.log("\nVérification déploiement Node —", base, "\n");
  for (const c of checks) {
    console.log((c.ok ? "✅" : "❌") + " " + c.name + " — " + c.detail);
  }

  if (failed) {
    console.error(
      "\nÉchec : le site semble encore en Static Site ou le proxy API ne répond pas.\n" +
        "→ Render Dashboard : Web Service Node, Start = npm start, pas Static Site.\n"
    );
    process.exit(1);
  }
  console.log("\nOK — frontend Node + CSP + proxy API.\n");
}

main();

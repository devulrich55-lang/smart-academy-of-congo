/**
 * Vérifie que chaque page HTML référence uniquement des assets existants
 * et signale les fichiers JS/CSS orphelins.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "backend-python",
  "docs",
  "agent-transcripts",
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

function normAsset(url) {
  let u = url.split("?")[0].split("#")[0];
  if (/^(https?:|\/\/|data:)/i.test(u)) return null;
  if (u.startsWith("../")) u = u.replace(/^\.\.\//, "");
  return u.replace(/\\/g, "/");
}

const htmlFiles = walk(ROOT);
const referenced = new Set();
const missing = [];

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  const re = /(?:src|href)=["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(html))) {
    const asset = normAsset(m[1]);
    if (!asset) continue;
    if (!/\.(js|css|png|svg|jpg|jpeg|webp|ico|woff2?)$/i.test(asset)) continue;
    referenced.add(asset);
    const disk = path.join(ROOT, asset);
    if (!fs.existsSync(disk)) {
      missing.push({ page: path.relative(ROOT, file), asset });
    }
  }
}

// Chargés dynamiquement par sac-mobile.js
referenced.add("js/sac-floating-back.js");
referenced.add("css/floating-back.css");

const jsDir = path.join(ROOT, "js");
const allJs = fs.existsSync(jsDir)
  ? fs.readdirSync(jsDir).map((f) => `js/${f}`)
  : [];

const orphanJs = allJs.filter(
  (j) =>
    !referenced.has(j) &&
    j !== "js/sac-config.example.js"
);

let failed = false;

if (missing.length) {
  failed = true;
  console.error("FAIL — références manquantes :");
  for (const row of missing) {
    console.error(`  ${row.page} → ${row.asset}`);
  }
} else {
  console.log("OK — toutes les références HTML pointent vers des fichiers existants.");
}

if (orphanJs.length) {
  console.warn("INFO — JS non chargés par HTML (peut être normal) :");
  for (const j of orphanJs) console.warn(`  ${j}`);
} else {
  console.log("OK — aucun JS orphelin (hors sac-config.example.js).");
}

console.log(`Pages HTML : ${htmlFiles.length}`);
console.log(`Fichiers JS : ${allJs.length}`);

process.exit(failed ? 1 : 0);

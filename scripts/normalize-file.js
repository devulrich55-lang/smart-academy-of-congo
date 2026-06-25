/**
 * Supprime les lignes vides d'un fichier source (usage interne maintenance).
 * node scripts/normalize-file.js js/sac-payments.js
 */
const fs = require("fs");
const path = require("path");

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/normalize-file.js <file>");
  process.exit(1);
}

const file = path.resolve(target);
const before = fs.readFileSync(file, "utf8");
const lines = before.split(/\r?\n/).filter((l) => l.trim() !== "");
const after = lines.join("\n") + "\n";
fs.writeFileSync(file, after, "utf8");
console.log(path.basename(file), ":", before.split(/\r?\n/).length, "→", lines.length, "lines");

/**
 * Test local — charge dashboard-admin.html et détecte stack overflow à l'init.
 * Usage : node scripts/test-dashboard-init.mjs
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8765;

function createServer() {
  return http.createServer((req, res) => {
    let p = (req.url || "/").split("?")[0];
    if (p === "/") p = "/dashboard-admin.html";
    const rel = p.replace(/^\//, "").replace(/\//g, path.sep);
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end("404");
      return;
    }
    const ext = path.extname(file);
    const types = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".jpeg": "image/jpeg",
    };
    res.writeHead(200, { "Content-Type": types[ext] || "text/plain" });
    fs.createReadStream(file).pipe(res);
  });
}

const js = fs.readFileSync(path.join(ROOT, "js/sac-admin-dashboard.js"), "utf8");
console.log("source checks:", {
  build: js.includes('BUILD = "20260711a"'),
  scheduleSuperadmin: js.includes("scheduleSuperadminCreateLimit"),
  noEarlyRoleListener: !js.includes('newRole?.addEventListener("change", updateCreateFormForRole)'),
});

const server = createServer();
await new Promise((resolve) => server.listen(PORT, resolve));

try {
  const puppeteer = await import("puppeteer").catch(() => null);
  if (!puppeteer) {
    console.log("puppeteer absent — test source uniquement");
    process.exit(0);
  }

  const browser = await puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  let dialogMsg = null;
  let pageError = null;

  page.on("dialog", async (d) => {
    dialogMsg = d.message();
    await d.dismiss();
  });
  page.on("pageerror", (e) => {
    pageError = pageError || e.message;
  });

  await page.goto(`http://127.0.0.1:${PORT}/dashboard-admin.html`, {
    waitUntil: "networkidle0",
    timeout: 60000,
  });
  await new Promise((r) => setTimeout(r, 2500));

  const build = await page.evaluate(() => window.SAC_ADMIN_DASHBOARD?.BUILD || null);
  console.log("browser:", { build, dialogMsg, pageError });
  await browser.close();

  if (String(dialogMsg || pageError || "").includes("Maximum call stack")) {
    console.error("FAIL — stack overflow détecté");
    process.exit(1);
  }
  console.log("OK — pas de stack overflow (session absente = redirection attendue)");
} finally {
  server.close();
}

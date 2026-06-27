/**
 * Frontend Render — fichiers statiques + proxy /api vers l'API SAC.
 * Évite les blocages CORS entre dbfm.onrender.com et api-1.onrender.com.
 */
const express = require("express");
const path = require("path");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const ROOT = __dirname;
const API_TARGET =
  process.env.API_PROXY_TARGET ||
  "https://smart-academy-of-congo-api-1.onrender.com";
const PORT = Number(process.env.PORT) || 10000;

function makeProxy(prefix) {
  return createProxyMiddleware({
    target: API_TARGET,
    changeOrigin: true,
    secure: true,
    xfwd: true,
    // Express retire le préfixe (/api/health → /health) : on le remet pour l'API FastAPI
    pathRewrite: (path) => prefix + path,
    onProxyReq(proxyReq, req) {
      if (req.headers.origin) {
        proxyReq.setHeader("X-Forwarded-Host", req.headers.host);
      }
    },
  });
}

app.use("/api", makeProxy("/api"));
app.use("/uploads", makeProxy("/uploads"));

app.use(
  express.static(ROOT, {
    index: "index.html",
    extensions: ["html"],
    setHeaders(res, filePath) {
      if (/\.(html|js|css)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      }
    },
  })
);

app.get("/ministere", (_req, res) => res.redirect(301, "/ministere/"));
app.get("/superadmin", (_req, res) => res.redirect(301, "/superadmin/"));
app.get("/admin-uni", (_req, res) => res.redirect(301, "/admin-uni/"));
app.get("/connexion-admin.html", (_req, res) => res.redirect(301, "/ministere/"));

app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) return next();
  if (path.extname(req.path)) return next();
  res.sendFile(path.join(ROOT, "index.html"));
});

app.listen(PORT, () => {
  console.log("SAC frontend on port", PORT, "→ API", API_TARGET);
});

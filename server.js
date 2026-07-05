/**
 * Frontend Render — fichiers statiques + proxy /api vers l'API EvoSU.
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

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()",
  "X-XSS-Protection": "0",
};

const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://meet.jit.si https://8x8.vc",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' https://fonts.gstatic.com data:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

app.use((req, res, next) => {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(key, value);
  }
  if (process.env.NODE_ENV === "production" || process.env.SAC_CSP_REPORT === "1") {
    res.setHeader("Content-Security-Policy-Report-Only", CSP_REPORT_ONLY);
  }
  next();
});

function makeProxy(prefix) {
  return createProxyMiddleware({
    target: API_TARGET,
    changeOrigin: true,
    secure: true,
    xfwd: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
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
      if (/\.webmanifest$/i.test(filePath)) {
        res.setHeader("Content-Type", "application/manifest+json");
      }
      if (/sw\.js$/i.test(filePath)) {
        res.setHeader("Service-Worker-Allowed", "/");
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  })
);

const PORTALS = [
  "ministere",
  "superadmin",
  "admin-uni",
  "evomonitor",
  "devcenter",
  "techmanager",
  "app",
];

for (const slug of PORTALS) {
  app.get(`/${slug}`, (_req, res) => res.redirect(301, `/${slug}/`));
  app.get(`/${slug}/`, (_req, res) => {
    res.sendFile(path.join(ROOT, slug, "index.html"));
  });
}

app.get("/telecharger", (_req, res) => res.redirect(301, "/app/"));
app.get("/telecharger/", (_req, res) => res.redirect(301, "/app/"));

app.get("/connexion-admin.html", (_req, res) => res.redirect(301, "/ministere/"));

app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) return next();
  if (path.extname(req.path)) return next();
  res.sendFile(path.join(ROOT, "index.html"));
});

app.listen(PORT, () => {
  console.log("EvoSU frontend on port", PORT, "→ API", API_TARGET);
});

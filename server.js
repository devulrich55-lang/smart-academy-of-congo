/**
 * Frontend Render — fichiers statiques + proxy /api vers l'API EvoSU.
 * Web Service Node (npm start) — requis pour CSP D1 et proxy /api.
 */
const express = require("express");
const path = require("path");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const ROOT = __dirname;
const API_TARGET = (
  process.env.API_PROXY_TARGET ||
  "https://smart-academy-of-congo-api-1.onrender.com"
).replace(/\/+$/, "");
const PORT = Number(process.env.PORT) || 10000;
const IS_PROD = process.env.NODE_ENV === "production";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()",
  "X-XSS-Protection": "0",
};

const CSP_POLICY = [
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

const CSP_ENFORCE =
  process.env.SAC_CSP_ENFORCE === "1" ||
  (IS_PROD && process.env.SAC_CSP_ENFORCE !== "false");
const CSP_REPORT_ONLY_MODE =
  process.env.SAC_CSP_REPORT === "1" ||
  (IS_PROD && !CSP_ENFORCE);

app.set("trust proxy", 1);

app.use((req, res, next) => {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(key, value);
  }
  if (CSP_ENFORCE) {
    res.setHeader("Content-Security-Policy", CSP_POLICY);
  } else if (CSP_REPORT_ONLY_MODE) {
    res.setHeader("Content-Security-Policy-Report-Only", CSP_POLICY);
  }
  next();
});

/** Santé Render — ne pas confondre avec /api/health (proxy API). */
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "Evo-smartUni frontend",
    mode: "node",
    cspEnforce: CSP_ENFORCE,
    apiTarget: API_TARGET,
  });
});

const apiProxy = createProxyMiddleware({
  target: API_TARGET,
  changeOrigin: true,
  secure: true,
  xfwd: true,
  pathFilter: (pathname) =>
    pathname.startsWith("/api") || pathname.startsWith("/uploads"),
  onProxyReq(proxyReq, req) {
    if (req.headers.origin) {
      proxyReq.setHeader("X-Forwarded-Host", req.headers.host);
    }
  },
  onError(err, req, res) {
    console.error("[proxy]", req.method, req.url, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: false,
          error: "API_PROXY_ERROR",
          message: "Proxy API indisponible — API en veille ou cible incorrecte.",
        })
      );
    }
  },
});

app.use(apiProxy);

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

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    "EvoSU frontend Node on port",
    PORT,
    "→ API",
    API_TARGET,
    "| CSP enforce:",
    CSP_ENFORCE
  );
});

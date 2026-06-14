/**
 * Proxy same-origin /api/* → backend Render/Cloud Run (variable SAC_API_URL).
 * Permet cookies JWT sur le domaine Vercel sans URL codée en dur dans vercel.json.
 */
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

function stripCookieDomain(setCookie) {
  return String(setCookie).replace(/;\s*Domain=[^;]*/gi, "");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  const base = (process.env.SAC_API_URL || process.env.RENDER_API_URL || "").replace(/\/+$/, "");
  if (!base) {
    res.status(503).json({
      error: "API_NOT_CONFIGURED",
      message: "Définissez SAC_API_URL dans les variables d'environnement Vercel.",
    });
    return;
  }

  const segments = req.query.path;
  const subPath = Array.isArray(segments) ? segments.join("/") : segments || "";
  const qs = req.url && req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const target = `${base}/api/${subPath}${qs}`;

  const forwardHeaders = { ...req.headers };
  delete forwardHeaders.host;
  delete forwardHeaders.connection;
  delete forwardHeaders["content-length"];

  let body;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await readBody(req);
  }

  const upstream = await fetch(target, {
    method: req.method,
    headers: forwardHeaders,
    body: body && body.length ? body : undefined,
    redirect: "manual",
  });

  res.status(upstream.status);
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "transfer-encoding") return;
    if (lower === "set-cookie") {
      res.setHeader("set-cookie", stripCookieDomain(value));
      return;
    }
    res.setHeader(key, value);
  });

  const buf = Buffer.from(await upstream.arrayBuffer());
  res.send(buf);
};

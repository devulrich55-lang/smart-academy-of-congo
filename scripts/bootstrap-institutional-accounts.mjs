#!/usr/bin/env node
/**
 * Crée ou met à jour des comptes institutionnels via l'API Render.
 *
 * Usage PowerShell :
 *   $env:SUPERADMIN_EMAIL="djemcibamba@gmail.com"
 *   $env:SUPERADMIN_PASSWORD="votre-mot-de-passe"
 *   $env:MINISTERE_PASSWORD="votre-mot-de-passe"
 *   $env:TECHMANAGER_PASSWORD="votre-mot-de-passe"
 *   $env:DEV_EMAIL="developpeur01@gmail.com"
 *   $env:DEV_PASSWORD="votre-mot-de-passe"
 *   # Optionnel si MFA e-mail : $env:STAFF_MFA_CODE="123456"
 *   npm run bootstrap:accounts
 */
import readline from "node:readline";

const API_CANDIDATES = [
  process.env.SAC_API_BASE,
  "https://smart-academy-of-congo-api-1.onrender.com",
  "https://smart-academy-of-congoat.onrender.com",
].filter(Boolean);

let API_BASE = API_CANDIDATES[0] || "https://smart-academy-of-congo-api-1.onrender.com";

const ACCOUNTS = [
  {
    role: "ministere",
    email: process.env.MINISTERE_EMAIL || "ministere.esu1@gmail.com",
    password: process.env.MINISTERE_PASSWORD,
    prenom: process.env.MINISTERE_PRENOM || "Ministere",
    nom: process.env.MINISTERE_NOM || "ESU",
    countryCode: process.env.MINISTERE_COUNTRY || "CD",
    fonction: process.env.MINISTERE_FONCTION || "MESU — EvoSU",
  },
  {
    role: "developpeur",
    email: process.env.DEV_EMAIL || process.env.DEVELOPPEUR_EMAIL || "developpeur01@gmail.com",
    password: process.env.DEV_PASSWORD || process.env.DEVELOPPEUR_PASSWORD,
    prenom: process.env.DEV_PRENOM || "Dev",
    nom: process.env.DEV_NOM || "EvoSU",
    fonction: process.env.DEV_FONCTION || "Développeur EvoSU",
  },
  {
    role: "techmanager",
    email: process.env.TECHMANAGER_EMAIL || "manager.tech001@gmail.com",
    password: process.env.TECHMANAGER_PASSWORD,
    prenom: process.env.TECHMANAGER_PRENOM || "Ulrich",
    nom: process.env.TECHMANAGER_NOM || "Manager",
    fonction: "Responsable technique EvoSU",
  },
];

function errMessage(data, status) {
  const detail = data?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") {
    return detail.message || detail.error || JSON.stringify(detail);
  }
  return data?.message || data?.error || `HTTP ${status}`;
}

async function api(path, options = {}, token) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = "Bearer " + token;

  const res = await fetch(API_BASE + "/api" + path, {
    ...options,
    headers,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const err = new Error(errMessage(data, res.status));
    err.status = res.status;
    err.code = data?.error || data?.detail?.error;
    err.data = data;
    throw err;
  }
  return data;
}

async function wakeApi() {
  let lastErr = null;
  for (const base of API_CANDIDATES.length ? API_CANDIDATES : [API_BASE]) {
    API_BASE = base.replace(/\/+$/, "");
    for (let i = 0; i < 6; i += 1) {
      try {
        const data = await api("/health", { method: "GET" });
        if (data && (data.ok === true || data.database)) {
          console.log("API OK :", API_BASE);
          return;
        }
      } catch (err) {
        lastErr = err;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  throw lastErr || new Error("API injoignable — attendez le réveil Render puis réessayez.");
}

function promptMfaCode(hint) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(
      "Code MFA (6 chiffres envoyé à " + (hint || "e-mail Super Admin") + ") : ",
      (answer) => {
        rl.close();
        resolve(String(answer || "").trim());
      }
    );
  });
}

async function login(identifier, password, role, extra = {}) {
  const data = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      identifier,
      password,
      role,
      adminPortal: true,
      countryCode: extra.countryCode || null,
    }),
  });

  if (data.mfaRequired && data.mfaChallenge) {
    let code = process.env.STAFF_MFA_CODE ? String(process.env.STAFF_MFA_CODE).trim() : "";
    if (!code && process.stdin.isTTY) {
      console.log("MFA requis pour le Super Admin — vérifiez la boîte mail", data.emailHint || identifier);
      code = await promptMfaCode(data.emailHint);
    }
    if (!/^\d{6}$/.test(code)) {
      throw new Error(
        "Code MFA manquant ou invalide. Définissez STAFF_MFA_CODE=123456 ou relancez en mode interactif."
      );
    }
    const verified = await api("/auth/staff-mfa/verify", {
      method: "POST",
      body: JSON.stringify({
        mfaChallenge: data.mfaChallenge,
        code,
      }),
    });
    if (!verified.accessToken) {
      throw new Error("MFA refusé — code expiré ou incorrect.");
    }
    return verified.accessToken;
  }

  if (!data.accessToken) {
    throw new Error("Login sans jeton — vérifiez e-mail, mot de passe et rôle.");
  }
  return data.accessToken;
}

async function createOrUpdate(token, payload) {
  const body = {
    role: payload.role,
    email: payload.email,
    password: payload.password,
    prenom: payload.prenom,
    nom: payload.nom,
    telephone: payload.telephone || "",
    fonction: payload.fonction || "",
    countryCode: payload.countryCode,
    country_code: payload.countryCode || payload.country_code,
  };
  return api(
    "/admin/institutional",
    { method: "POST", body: JSON.stringify(body) },
    token
  );
}

async function verifyLogin(account) {
  const extra =
    account.role === "ministere"
      ? { countryCode: account.countryCode || "CD" }
      : {};
  await login(account.email, account.password, account.role, extra);
  console.log("  ✓ Connexion OK :", account.email, "(" + account.role + ")");
}

async function main() {
  const saEmail = process.env.SUPERADMIN_EMAIL || "djemcibamba@gmail.com";
  const saPassword = process.env.SUPERADMIN_PASSWORD;
  if (!saPassword) {
    console.error("Définissez SUPERADMIN_PASSWORD (compte Super Admin existant).");
    process.exit(1);
  }

  for (const acc of ACCOUNTS) {
    if (!acc.password) {
      console.error(
        "Mot de passe manquant pour",
        acc.email,
        "— définissez MINISTERE_PASSWORD / DEV_PASSWORD / TECHMANAGER_PASSWORD."
      );
      process.exit(1);
    }
  }

  console.log("Réveil API…");
  await wakeApi();

  console.log("Connexion Super Admin…", saEmail);
  const token = await login(saEmail, saPassword, "superadmin");

  for (const acc of ACCOUNTS) {
    console.log("Création / mise à jour :", acc.email, "→", acc.role);
    try {
      const result = await createOrUpdate(token, acc);
      const admin = result.admin || result;
      console.log(
        "  ✓",
        admin.updated ? "Mis à jour" : "Créé",
        "—",
        admin.email || acc.email
      );
    } catch (err) {
      console.error("  ✗ Échec :", err.message);
      if (err.data) console.error("   ", JSON.stringify(err.data));
      process.exitCode = 1;
    }
  }

  console.log("\nVérification des connexions portail…");
  for (const acc of ACCOUNTS) {
    try {
      await verifyLogin(acc);
    } catch (err) {
      console.error("  ✗", acc.email, "—", err.message);
      process.exitCode = 1;
    }
  }

  console.log("\nTerminé.");
  console.log("Ministère :", process.env.MINISTERE_EMAIL || "ministere.esu1@gmail.com", "→ /ministere/");
  console.log("Tech Manager :", process.env.TECHMANAGER_EMAIL || "manager.tech001@gmail.com", "→ /techmanager/");
}

main().catch((err) => {
  if (String(err?.message || "").includes("UNABLE_TO_VERIFY_LEAF_SIGNATURE")) {
    console.error(
      "Erreur TLS Node — relancez avec : $env:NODE_TLS_REJECT_UNAUTHORIZED='0' (dev uniquement)"
    );
  }
  console.error(err.message || err);
  process.exit(1);
});

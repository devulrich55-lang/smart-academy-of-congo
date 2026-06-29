/**
 * Smoke test i18n inscription + tarifs (EN / AR)
 * Usage: node scripts/test-i18n-signup.mjs
 */
import fs from "fs";
import vm from "vm";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadI18n() {
  const html = { lang: "fr", dir: "ltr", setAttribute(k, v) { this[k] = v; } };
  const ctx = {
    window: {},
    document: {
      documentElement: html,
      querySelectorAll: () => [],
      querySelector: () => null,
      body: { appendChild() {} },
    },
    localStorage: { getItem: () => null, setItem() {} },
    MutationObserver: function () {
      this.observe = () => {};
      this.disconnect = () => {};
    },
    navigator: { language: "fr" },
  };
  ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(root, "js/sac-i18n.js"), "utf8"), ctx);
  vm.runInNewContext(fs.readFileSync(path.join(root, "js/sac-i18n-platform.js"), "utf8"), ctx);
  ctx.window.SAC_I18N.init();
  return { I18N: ctx.window.SAC_I18N, html };
}

const { I18N, html } = loadI18n();
const keys = [
  "tariffs.public.line",
  "signup.title",
  "signup.badge.etudiant",
  "signup.pricing.continue",
  "signup.pay.bankNotice",
  "signup.security",
  "auth.role.student",
  "meta.signup.title",
  "signup.firstname",
  "signup.field.password",
];

let failed = 0;

for (const lang of ["en", "ar"]) {
  I18N.setLang(lang);
  console.log(`\n=== ${lang.toUpperCase()} (dir=${html.dir}) ===`);
  for (const k of keys) {
    const v = I18N.t(k, {
      student: "1 USD",
      assistant: "5 USD",
      prof: "10 USD",
      banks: "",
      amount: "1 USD",
      email: "test@test.com",
      role: "Student",
    });
    const stillFr =
      lang === "en" &&
      /^(Prénom|Inscription étudiant|Étudiant|Continuer — Payer|Sécurité)/.test(v);
    const stillEn = lang === "ar" && /^(First name|Student registration|Student)/.test(v);
    if (!v || v === k || stillFr || stillEn) {
      console.log("FAIL", k, "=>", v);
      failed++;
    } else {
      console.log("OK  ", k, "=>", v.slice(0, 72));
    }
  }
  const line = I18N.t("tariffs.public.line", {
    student: "1 USD",
    assistant: "5 USD",
    prof: "10 USD",
    banks: "<br/><b>banks</b>",
  });
  if (lang === "en" && !line.includes("Student")) {
    console.log("FAIL tariffs.public.line EN =>", line);
    failed++;
  }
  if (lang === "ar" && !line.includes("طالب")) {
    console.log("FAIL tariffs.public.line AR =>", line);
    failed++;
  } else {
    console.log("OK   tariffs.public.line =>", line.slice(0, 72));
  }
}

console.log(failed ? `\n${failed} test(s) failed` : "\nAll i18n signup/tariff tests passed");
process.exit(failed ? 1 : 0);

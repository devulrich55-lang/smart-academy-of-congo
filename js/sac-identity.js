/**
 * Vérification d'identité — un e-mail, un téléphone, un rôle par personne
 */
const SAC_IDENTITY = (function () {
  const DISPOSABLE_DOMAINS = new Set([
    "mailinator.com",
    "guerrillamail.com",
    "tempmail.com",
    "10minutemail.com",
    "yopmail.com",
    "throwaway.email",
    "fakeinbox.com",
    "trashmail.com",
    "getnada.com",
    "maildrop.cc",
    "temp-mail.org",
    "sharklasers.com",
  ]);

  const FAKE_EMAIL_LOCAL = /^(test|fake|faux|demo|admin|noreply|no-reply|xxx|null|asdf|qwerty|123|user|email)$/i;

  const ROLE_LABELS = {
    etudiant: "étudiant",
    professeur: "professeur",
    assistant: "assistant",
    universite: "université",
    section: "chef de section",
  };

  function norm(s) {
    return (s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/\s+/g, " ");
  }

  function normalizeEmail(email) {
    return (email || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
  }

  function validateEmail(email) {
    const e = normalizeEmail(email);
    if (!e || e.length > 254) return { ok: false, message: "Adresse e-mail invalide." };

    const basic =
      /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z]{2,})+$/i.test(
        e
      );
    if (!basic) return { ok: false, message: "Format e-mail incorrect (ex. prenom@gmail.com)." };

    if (e.includes("..") || e.startsWith(".") || e.includes("@."))
      return { ok: false, message: "Adresse e-mail incorrecte." };

    const [local, domain] = e.split("@");
    if (!local || !domain || domain.length < 4)
      return { ok: false, message: "Domaine e-mail invalide." };

    if (FAKE_EMAIL_LOCAL.test(local))
      return { ok: false, message: "Utilisez une adresse e-mail personnelle réelle, pas une adresse de test." };

    if (DISPOSABLE_DOMAINS.has(domain))
      return { ok: false, message: "Les e-mails temporaires ou jetables ne sont pas acceptés." };

    const tld = domain.split(".").pop();
    if (!tld || tld.length < 2)
      return { ok: false, message: "Extension de domaine invalide." };

    return { ok: true, value: e };
  }

  /** Téléphone mobile — indicatif pays africain + numéro local */
  function normalizePhone(phone, preferredDial) {
    if (typeof SAC_PHONE_COUNTRIES !== "undefined") {
      return SAC_PHONE_COUNTRIES.normalizePhone(phone, preferredDial);
    }
    let d = String(phone || "").replace(/\D/g, "");
    if (d.startsWith("243") && d.length >= 12) d = d.slice(0, 12);
    else if (d.startsWith("00243")) d = d.slice(2, 14);
    else if (d.startsWith("0") && d.length >= 10) d = "243" + d.slice(1, 10);
    else if (d.length === 9) d = "243" + d;
    else if (d.length > 12) d = d.slice(0, 12);
    return d.length === 12 && d.startsWith("243") ? d : "";
  }

  function formatPhoneDisplay(normalized) {
    if (typeof SAC_PHONE_COUNTRIES !== "undefined") {
      return SAC_PHONE_COUNTRIES.formatPhoneDisplay(normalized);
    }
    if (!normalized || normalized.length !== 12) return "";
    const local = normalized.slice(3);
    return "+243 " + local.slice(0, 3) + " " + local.slice(3, 6) + " " + local.slice(6);
  }

  function readPhone(inputOrId) {
    if (typeof SAC_PHONE_INPUT !== "undefined") {
      return SAC_PHONE_INPUT.getValue(inputOrId) || "";
    }
    const el =
      typeof inputOrId === "string" ? document.getElementById(inputOrId) : inputOrId;
    return el ? String(el.value || "").trim() : "";
  }

  function validatePhoneElement(inputOrId) {
    const el =
      typeof inputOrId === "string" ? document.getElementById(inputOrId) : inputOrId;
    const dial =
      typeof SAC_PHONE_INPUT !== "undefined" && el
        ? SAC_PHONE_INPUT.getDialCode(el)
        : undefined;
    return validatePhone(readPhone(el), { dialCode: dial });
  }

  function validatePhone(phone, options) {
    const preferredDial = options?.dialCode || options?.preferredDial;
    if (typeof SAC_PHONE_COUNTRIES !== "undefined") {
      return SAC_PHONE_COUNTRIES.validatePhone(phone, preferredDial);
    }
    const n = normalizePhone(phone, preferredDial);
    if (!n) {
      return {
        ok: false,
        message: "Numéro invalide. Saisissez un mobile valide (format international, ex. +243 85 184 8859).",
      };
    }
    const local = n.slice(3);
    if (!/^[89][0-9]{8}$/.test(local)) {
      return {
        ok: false,
        message:
          "Numéro non reconnu. Utilisez un mobile valide (ex. +243, commence par 08 ou 09 en local).",
      };
    }
    if (/^(\d)\1{8}$/.test(local)) {
      return { ok: false, message: "Ce numéro ne semble pas réel." };
    }
    return { ok: true, value: n, display: formatPhoneDisplay(n) };
  }

  function validatePassword(password) {
    if (typeof password !== "string" || password.length < 8 || password.length > 128) {
      return { ok: false, message: "Mot de passe : minimum 8 caractères." };
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return {
        ok: false,
        message: "Le mot de passe doit contenir au moins une lettre et un chiffre.",
      };
    }
    if (/\s/.test(password)) {
      return { ok: false, message: "Le mot de passe ne doit pas contenir d'espaces." };
    }
    return { ok: true };
  }

  function validatePersonName(value, label) {
    const v = (value || "").trim();
    if (v.length < 2) return { ok: false, message: label + " : minimum 2 caractères." };
    if (v.length > 80) return { ok: false, message: label + " trop long." };
    if (/[0-9@<>]/.test(v)) {
      return { ok: false, message: label + " : lettres uniquement (pas de chiffres ni symboles)." };
    }
    if (/^(.)\1{4,}$/i.test(v.replace(/\s/g, ""))) {
      return { ok: false, message: label + " : saisissez un nom réel." };
    }
    return { ok: true, value: v };
  }

  function personKey(profile) {
    if (profile.role === "universite") {
      return "uni:" + norm(profile.nomUniversite || profile.nom) + "|" + norm(profile.responsable);
    }
    return "person:" + norm(profile.prenom) + "|" + norm(profile.nom);
  }

  function getLocalUsers() {
    try {
      return JSON.parse(localStorage.getItem("sac_users") || "[]");
    } catch {
      return [];
    }
  }

  function checkRegistration(profile, existingUsers) {
    if (typeof SAC_UNIVERSITIES !== "undefined" && SAC_UNIVERSITIES.normalizeProfileCampus) {
      SAC_UNIVERSITIES.normalizeProfileCampus(profile);
    }
    const users = existingUsers || getLocalUsers();
    const emailCheck = validateEmail(profile.email);
    if (!emailCheck.ok) return { ok: false, field: "email", message: emailCheck.message };

    const phoneCheck = validatePhone(profile.telephone);
    if (!phoneCheck.ok) return { ok: false, field: "telephone", message: phoneCheck.message };

    const email = emailCheck.value;
    const phone = phoneCheck.value;
    const key = personKey(profile);

    for (const u of users) {
      const uEmail = normalizeEmail(u.email);
      const uPhone = u.telephone ? normalizePhone(u.telephone) : "";

      if (uEmail === email) {
        if (u.role === profile.role) {
          return {
            ok: false,
            field: "email",
            code: "EMAIL_EXISTS",
            message:
              "Cet e-mail est déjà inscrit. Connectez-vous ou utilisez « Mot de passe oublié ».",
          };
        }
        return {
          ok: false,
          field: "email",
          code: "EMAIL_OTHER_ROLE",
          message:
            "Cet e-mail est déjà utilisé pour un compte " +
            (ROLE_LABELS[u.role] || u.role) +
            ". Une seule inscription par personne : vous ne pouvez pas créer un second profil.",
        };
      }

      if (uPhone && uPhone === phone) {
        return {
          ok: false,
          field: "telephone",
          code: "PHONE_EXISTS",
          message:
            "Ce numéro de téléphone est déjà lié à un compte. Un numéro = un utilisateur.",
        };
      }

      const uKey = personKey(u);
      if (uKey === key && uEmail !== email) {
        return {
          ok: false,
          field: profile.role === "universite" ? "responsable" : "nom",
          code: "DUPLICATE_PERSON",
          message:
            "Ces informations correspondent déjà à un autre compte. Contactez le support si besoin.",
        };
      }

      if (
        uKey === key &&
        u.role !== profile.role &&
        profile.role !== "universite" &&
        u.role !== "universite"
      ) {
        return {
          ok: false,
          field: "nom",
          code: "MULTI_ROLE",
          message:
            "Vous ne pouvez pas cumuler plusieurs rôles (ex. étudiant et professeur). Un seul profil par personne.",
        };
      }
    }

    return { ok: true, email, telephone: phone, telephoneDisplay: phoneCheck.display };
  }

  function validateBankReference(ref, method) {
    const r = (ref || "").trim();
    if (r.length < 6) {
      return { ok: false, message: "Référence de virement trop courte (minimum 6 caractères)." };
    }
    if (r.length > 64) {
      return { ok: false, message: "Référence de virement trop longue." };
    }
    if (!/^[a-zA-Z0-9\-_/.\s]+$/.test(r)) {
      return {
        ok: false,
        message: "Référence invalide : utilisez uniquement lettres, chiffres et tirets.",
      };
    }
    const lower = r.toLowerCase();
    if (/^(test|fake|faux|xxx|000000|123456|12345678|aaaaaa|n\/a|na|null)$/i.test(lower.replace(/\s/g, ""))) {
      return {
        ok: false,
        message: "Indiquez la vraie référence figurant sur votre reçu bancaire ou application.",
      };
    }
    if (method === "usd" && /^0+$/.test(r.replace(/\D/g, ""))) {
      return { ok: false, message: "Référence de transaction invalide." };
    }
    return { ok: true, value: r };
  }

  function validateMatricule(matricule, users, currentEmail) {
    const m = (matricule || "").trim();
    if (!m) return { ok: true };
    if (m.length < 4 || m.length > 30) {
      return { ok: false, message: "Matricule : entre 4 et 30 caractères.", field: "matricule" };
    }
    const email = normalizeEmail(currentEmail);
    for (const u of users) {
      if (u.matricule && u.matricule.trim().toUpperCase() === m.toUpperCase() && normalizeEmail(u.email) !== email) {
        return {
          ok: false,
          message: "Ce matricule est déjà enregistré pour un autre compte.",
          field: "matricule",
        };
      }
    }
    return { ok: true };
  }

  async function hashPassword(plain) {
    if (!plain || typeof plain !== "string") return null;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltB64 = btoa(String.fromCharCode(...salt));
    const enc = new TextEncoder();
    const data = enc.encode(saltB64 + ":" + plain);
    const buf = await crypto.subtle.digest("SHA-256", data);
    const hashB64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    return saltB64 + "$" + hashB64;
  }

  async function verifyPassword(plain, storedHash) {
    if (!plain || !storedHash || typeof storedHash !== "string") return false;
    const parts = storedHash.split("$");
    if (parts.length !== 2) return false;
    const [saltB64, expectedHash] = parts;
    const enc = new TextEncoder();
    const data = enc.encode(saltB64 + ":" + plain);
    const buf = await crypto.subtle.digest("SHA-256", data);
    const computed = btoa(String.fromCharCode(...new Uint8Array(buf)));
    return computed === expectedHash;
  }

  /** Université figée à l'inscription — ne peut pas être changée à la connexion */
  function getRegisteredUniversite(user) {
    if (!user) return null;
    const raw =
      user.universiteLocked ||
      user.universite ||
      (user.role === "universite" ? user.sigle || user.codeUni : null);
    if (!raw) return null;
    if (typeof SAC_UNIVERSITIES !== "undefined" && SAC_UNIVERSITIES.resolveId) {
      return SAC_UNIVERSITIES.resolveId(raw) || raw;
    }
    return raw;
  }

  function findUserByLoginId(users, identifier) {
    const id = (identifier || "").trim();
    if (!id) return null;
    const email = normalizeEmail(id);
    return (
      users.find(
        (u) =>
          normalizeEmail(u.email) === email ||
          (u.matricule && u.matricule.trim() === id) ||
          (u.numEmploye && u.numEmploye.trim() === id) ||
          (u.numAssist && u.numAssist.trim() === id)
      ) || null
    );
  }

  async function verifyLoginCredentials(user, password) {
    const pwd = (password || "").trim();
    if (!user) {
      return { ok: false, message: "Compte introuvable. Inscrivez-vous d'abord." };
    }

    if (!user.passwordHash && user.password && user.password === pwd) {
      user.passwordHash = await hashPassword(pwd);
      delete user.password;
      const users = getLocalUsers();
      const key = normalizeEmail(user.email);
      const idx = users.findIndex((u) => normalizeEmail(u.email) === key);
      if (idx >= 0) {
        users[idx] = { ...users[idx], passwordHash: user.passwordHash };
        delete users[idx].password;
        localStorage.setItem("sac_users", JSON.stringify(users));
      }
    }

    if (!user.passwordHash) {
      return {
        ok: false,
        message:
          "Compte incomplet (mot de passe non enregistré). Demandez à l'université de recréer le compte recteur.",
      };
    }
    const pwdOk = await verifyPassword(pwd, user.passwordHash);
    if (!pwdOk) {
      return { ok: false, message: "Mot de passe incorrect. Utilisez celui défini à l'inscription." };
    }
    return { ok: true };
  }

  function assertUniversiteOnLogin(user, selectedUniversite) {
    const registered = getRegisteredUniversite(user);
    if (!registered) return { ok: true, universite: selectedUniversite || null };
    if (user.role === "universite") return { ok: true, universite: registered };
    const selected = selectedUniversite || registered;
    if (!selected) {
      return {
        ok: false,
        message: "Sélectionnez l'université enregistrée lors de votre inscription.",
      };
    }
    if (selected !== registered) {
      const same =
        typeof SAC_UNIVERSITIES !== "undefined" &&
        SAC_UNIVERSITIES.sameCampus(selected, registered);
      if (same) return { ok: true, universite: registered };
      const name =
        typeof SAC_UNIVERSITIES !== "undefined"
          ? SAC_UNIVERSITIES.getLabel(registered) || registered
          : registered;
      return {
        ok: false,
        message:
          "L'université doit être celle de votre inscription : " +
          name +
          ". Vous ne pouvez pas vous connecter avec un autre établissement.",
      };
    }
    return { ok: true, universite: registered };
  }

  function assertCodeUniOnLogin(user, codeUni) {
    if (user.role !== "universite") return { ok: true };
    const expected = (user.codeUni || "").trim();
    const given = (codeUni || "").trim();
    if (!expected) return { ok: true };
    if (!given) {
      return { ok: false, message: "Saisissez le code établissement reçu à l'inscription." };
    }
    if (given.toUpperCase() !== expected.toUpperCase()) {
      return { ok: false, message: "Code établissement incorrect." };
    }
    return { ok: true };
  }

  /** Nom affiché sans doublon de prénom (ex. évite « Marie Marie Kabongo ») */
  function formatFullName(prenom, nom) {
    const p = String(prenom || "").trim();
    let n = String(nom || "").trim();
    if (!p && !n) return "";
    if (!p) return n;
    if (!n) return p;
    const pl = p.toLowerCase();
    const nl = n.toLowerCase();
    if (nl === pl) return p;
    if (nl.startsWith(pl + " ")) return n;
    return `${p} ${n}`;
  }

  function getDisplayName(userOrSession) {
    if (!userOrSession) return "";
    if (userOrSession.nomUniversite) return userOrSession.nomUniversite;
    if (userOrSession.displayName) return userOrSession.displayName;
    return (
      formatFullName(userOrSession.prenom, userOrSession.nom) ||
      userOrSession.identifiant ||
      ""
    );
  }

  /** Prénom et nom de famille distincts (compatible anciennes sessions) */
  function resolvePersonFromRecords(session, account) {
    const prenom = String(account?.prenom ?? session?.prenom ?? "").trim();
    let nom = String(account?.nom ?? "").trim();
    if (!nom && session?.nom) {
      const sn = String(session.nom).trim();
      if (prenom) {
        const prefix = prenom + " ";
        if (sn.toLowerCase().startsWith(prefix.toLowerCase())) {
          nom = sn.slice(prefix.length).trim();
        } else if (sn.toLowerCase() !== prenom.toLowerCase()) {
          nom = sn;
        }
      } else {
        nom = sn;
      }
    }
    return {
      prenom,
      nom,
      fullName: formatFullName(prenom, nom),
    };
  }

  function repairUserCampus(user) {
    if (!user || typeof SAC_UNIVERSITIES === "undefined") return user;
    const copy = { ...user };
    SAC_UNIVERSITIES.normalizeProfileCampus(copy);
    const changed =
      copy.universite !== user.universite ||
      copy.universiteLocked !== user.universiteLocked ||
      (copy.sigle && copy.sigle !== user.sigle);
    if (!changed) return user;
    const users = getLocalUsers();
    const key = normalizeEmail(user.email);
    const idx = users.findIndex((u) => normalizeEmail(u.email) === key);
    if (idx >= 0) {
      users[idx] = {
        ...users[idx],
        universite: copy.universite,
        universiteLocked: copy.universiteLocked || copy.universite,
        sigle: copy.sigle || users[idx].sigle,
        nomUniversite: copy.nomUniversite || users[idx].nomUniversite,
      };
      localStorage.setItem("sac_users", JSON.stringify(users));
    }
    return { ...user, ...copy };
  }

  function buildSessionFromUser(user) {
    let repaired = repairUserCampus(user);
    if (
      repaired.role === "etudiant" &&
      typeof SAC_TARIFFS !== "undefined" &&
      SAC_TARIFFS.applyLatestCampusFeesToUser
    ) {
      repaired = SAC_TARIFFS.applyLatestCampusFeesToUser(repaired);
    }
    const uni = getRegisteredUniversite(repaired);
    const isUni = repaired.role === "universite";

    return {
      role: repaired.role,
      identifiant: repaired.email,
      userId: repaired.email,
      nom: isUni ? repaired.nomUniversite || repaired.email : repaired.nom || "",
      prenom: repaired.prenom || null,
      displayName: getDisplayName(repaired),
      universite: uni,
      universiteLocked: uni,
      filiere: repaired.filiere || null,
      niveau: repaired.niveau || null,
      coursClasses: repaired.coursClasses || [],
      departement: repaired.departement || null,
      service: repaired.service || null,
      codeUni: repaired.codeUni || null,
      sigle: repaired.sigle || null,
      matricule: repaired.matricule || null,
      sectionId: repaired.sectionId || null,
      classe: repaired.classe || null,
      sectionName: repaired.sectionName || null,
      sectionKind: repaired.sectionKind || null,
      isRector: repaired.isRector === true || repaired.sectionKind === "recteur",
      nomination: repaired.nomination || null,
      grade: repaired.grade || null,
      fonction: repaired.fonction || null,
      sectionApproval: repaired.sectionApproval || null,
      sectionRejectionReason: repaired.sectionRejectionReason || null,
      sectionApprovedAt: repaired.sectionApprovedAt || null,
      departement: repaired.departement || null,
      inscriptionFee: repaired.inscriptionFee || null,
      universityFees: repaired.universityFees || null,
      campusAcademicFees: repaired.campusAcademicFees || null,
      campusAcademicFeesSyncedAt: repaired.campusAcademicFeesSyncedAt || null,
      campusTariffs: repaired.campusTariffs || null,
      campusTariffsSyncedAt: repaired.campusTariffsSyncedAt || null,
      logoUrl:
        repaired.logoUrl ||
        (typeof SAC_UNIVERSITY_LOGO !== "undefined"
          ? SAC_UNIVERSITY_LOGO.getLogoUrl(uni)
          : null),
      authSource: "local",
      connectedAt: new Date().toISOString(),
    };
  }

  return {
    normalizeEmail,
    normalizePhone,
    formatPhoneDisplay,
    readPhone,
    validatePhoneElement,
    validateEmail,
    validatePhone,
    validatePassword,
    validatePersonName,
    validateBankReference,
    validateMatricule,
    checkRegistration,
    getLocalUsers,
    personKey,
    ROLE_LABELS,
    hashPassword,
    verifyPassword,
    getRegisteredUniversite,
    findUserByLoginId,
    verifyLoginCredentials,
    assertUniversiteOnLogin,
    assertCodeUniOnLogin,
    buildSessionFromUser,
    repairUserCampus,
    formatFullName,
    getDisplayName,
    resolvePersonFromRecords,
  };
})();

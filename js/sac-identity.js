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

  /** Téléphone RDC : 9 chiffres locaux → 243XXXXXXXXX */
  function normalizePhone(phone) {
    let d = String(phone || "").replace(/\D/g, "");
    if (d.startsWith("243") && d.length >= 12) d = d.slice(0, 12);
    else if (d.startsWith("00243")) d = d.slice(2, 14);
    else if (d.startsWith("0") && d.length >= 10) d = "243" + d.slice(1, 10);
    else if (d.length === 9) d = "243" + d;
    else if (d.length > 12) d = d.slice(0, 12);
    return d.length === 12 && d.startsWith("243") ? d : "";
  }

  function formatPhoneDisplay(normalized) {
    if (!normalized || normalized.length !== 12) return "";
    const local = normalized.slice(3);
    return "+243 " + local.slice(0, 3) + " " + local.slice(3, 6) + " " + local.slice(6);
  }

  function validatePhone(phone) {
    const n = normalizePhone(phone);
    if (!n) {
      return {
        ok: false,
        message: "Numéro invalide. Saisissez un mobile congolais (9 chiffres, ex. 085 184 8859).",
      };
    }
    const local = n.slice(3);
    if (!/^[89][0-9]{8}$/.test(local)) {
      return {
        ok: false,
        message:
          "Numéro non reconnu. Utilisez un numéro mobile RDC valide (commence par 08 ou 09).",
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
    if (user.universiteLocked) return user.universiteLocked;
    if (user.role === "universite") {
      return user.universite || user.sigle || user.codeUni || null;
    }
    return user.universite || null;
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
    if (!user) {
      return { ok: false, message: "Compte introuvable. Inscrivez-vous d'abord." };
    }
    if (!user.passwordHash) {
      return {
        ok: false,
        message:
          "Compte créé avant la mise à jour sécurité. Veuillez vous réinscrire ou contacter le support.",
      };
    }
    const pwdOk = await verifyPassword(password, user.passwordHash);
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
      const name =
        typeof SAC_UNIVERSITIES !== "undefined"
          ? SAC_UNIVERSITIES.NAMES[registered] || registered
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

  function buildSessionFromUser(user) {
    const uni = getRegisteredUniversite(user);
    const isUni = user.role === "universite";

    return {
      role: user.role,
      identifiant: user.email,
      userId: user.email,
      nom: isUni ? user.nomUniversite || user.email : user.nom || "",
      prenom: user.prenom || null,
      displayName: getDisplayName(user),
      universite: uni,
      universiteLocked: uni,
      filiere: user.filiere || null,
      niveau: user.niveau || null,
      coursClasses: user.coursClasses || [],
      departement: user.departement || null,
      service: user.service || null,
      codeUni: user.codeUni || null,
      sigle: user.sigle || null,
      matricule: user.matricule || null,
      sectionId: user.sectionId || null,
      classe: user.classe || null,
      sectionName: user.sectionName || null,
      sectionKind: user.sectionKind || null,
      isRector: user.isRector === true || user.sectionKind === "recteur",
      nomination: user.nomination || null,
      grade: user.grade || null,
      fonction: user.fonction || null,
      sectionApproval: user.sectionApproval || null,
      sectionRejectionReason: user.sectionRejectionReason || null,
      sectionApprovedAt: user.sectionApprovedAt || null,
      departement: user.departement || null,
      inscriptionFee: user.inscriptionFee || null,
      universityFees: user.universityFees || null,
      campusTariffs: user.campusTariffs || null,
      campusTariffsSyncedAt: user.campusTariffsSyncedAt || null,
      logoUrl:
        user.logoUrl ||
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
    formatFullName,
    getDisplayName,
    resolvePersonFromRecords,
  };
})();

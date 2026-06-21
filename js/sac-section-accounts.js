/**
 * Création de comptes déléguée aux sections — chef de section & inscriptions étudiants
 */
const SAC_SECTION_ACCOUNTS = (function () {
  function splitResponsableName(fullName) {
    const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return { prenom: parts[0], nom: parts.slice(1).join(" ") };
    }
    return { prenom: "", nom: parts[0] || "Section" };
  }

  async function createHeadAccount(uniSession, section, account) {
    const emailCheck = SAC_IDENTITY.validateEmail(account.email);
    if (!emailCheck.ok) throw new Error(emailCheck.message);

    const pwdCheck = SAC_IDENTITY.validatePassword(account.password);
    if (!pwdCheck.ok) throw new Error(pwdCheck.message);

    const phoneCheck = SAC_IDENTITY.validatePhone(account.telephone || section.telephone);
    if (!phoneCheck.ok) throw new Error(phoneCheck.message);

    const names = splitResponsableName(account.responsableNom || section.responsableNom);
    const profile = {
      role: "section",
      email: emailCheck.value,
      password: account.password,
      telephone: phoneCheck.value,
      prenom: account.prenom || names.prenom,
      nom: account.nom || names.nom,
      universite: section.universite,
      filiere: section.filiere,
      sectionId: section.id,
      sectionName: section.name,
      payment: { status: "verified", method: "university_delegate" },
    };

    const dup = SAC_IDENTITY.checkRegistration(profile);
    if (!dup.ok) throw new Error(dup.message);

    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
      await SAC_API.createSectionHeadAccount({
        email: profile.email,
        password: account.password,
        telephone: profile.telephone,
        prenom: profile.prenom,
        nom: profile.nom,
        filiere: profile.filiere,
        sectionId: section.id,
      });
    }

    const users = SAC_IDENTITY.getLocalUsers();
    const hashed = await SAC_IDENTITY.hashPassword(account.password);
    users.push({
      ...profile,
      passwordHash: hashed,
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem("sac_users", JSON.stringify(users));

    return {
      section,
      credentials: {
        email: profile.email,
        password: account.password,
        role: "section",
      },
    };
  }

  async function createRectorAccount(uniProfile, account) {
    const uniCode =
      uniProfile.universite ||
      (uniProfile.sigle || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);

    const existing = getRectorForUniversity(uniCode);
    if (existing) {
      throw new Error(
        "Un compte recteur existe déjà pour cette université (" +
          existing.email +
          "). Un seul compte recteur est autorisé — création bloquée."
      );
    }

    const emailCheck = SAC_IDENTITY.validateEmail(account.email);
    if (!emailCheck.ok) throw new Error(emailCheck.message);

    const pwdCheck = SAC_IDENTITY.validatePassword(account.password);
    if (!pwdCheck.ok) throw new Error(pwdCheck.message);

    const phoneCheck = SAC_IDENTITY.validatePhone(account.telephone || "");
    if (!phoneCheck.ok) {
      throw new Error(
        phoneCheck.message ||
          "Numéro de téléphone recteur invalide. Saisissez un mobile congolais (9 chiffres, ex. 085 184 8859)."
      );
    }
    const names = splitResponsableName(
      account.responsableNom || uniProfile.responsable || "Recteur"
    );
    const campusName = uniProfile.nomUniversite || uniProfile.nom || uniCode;

    const profile = {
      role: "section",
      sectionKind: "recteur",
      isRector: true,
      email: emailCheck.value,
      password: account.password,
      telephone: phoneCheck.value,
      prenom: account.prenom || names.prenom,
      nom: account.nom || names.nom,
      universite: uniCode,
      sectionName: "Recteur — " + campusName,
      filiere: null,
      sectionId: null,
      payment: { status: "verified", method: "university_delegate" },
    };

    const dup = SAC_IDENTITY.checkRegistration(profile);
    if (!dup.ok) throw new Error(dup.message);

    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
      try {
        await SAC_API.createSectionHeadAccount({
          email: profile.email,
          password: account.password,
          telephone: profile.telephone,
          prenom: profile.prenom,
          nom: profile.nom,
          sectionKind: "recteur",
          universite: uniCode,
        });
      } catch (err) {
        console.warn("[SAC_SECTION_ACCOUNTS] API recteur:", err.message || err);
      }
    }

    const users = SAC_IDENTITY.getLocalUsers();
    const hashed = await SAC_IDENTITY.hashPassword(account.password);
    users.push({
      ...profile,
      passwordHash: hashed,
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem("sac_users", JSON.stringify(users));

    return {
      credentials: {
        email: profile.email,
        password: account.password,
        role: "section",
        sectionKind: "recteur",
      },
    };
  }

  async function createStudentAccount(sectionSession, student) {
    const actor =
      typeof SAC_NOMINATIONS !== "undefined"
        ? SAC_NOMINATIONS.buildSectionHeadActor(sectionSession) || sectionSession
        : sectionSession;
    const emailCheck = SAC_IDENTITY.validateEmail(student.email);
    if (!emailCheck.ok) throw new Error(emailCheck.message);

    const pwdCheck = SAC_IDENTITY.validatePassword(student.password);
    if (!pwdCheck.ok) throw new Error(pwdCheck.message);

    const phoneCheck = SAC_IDENTITY.validatePhone(student.telephone);
    if (!phoneCheck.ok) throw new Error(phoneCheck.message);

    const prenomCheck = SAC_IDENTITY.validatePersonName(student.prenom, "Prénom");
    if (!prenomCheck.ok) throw new Error(prenomCheck.message);

    const nomCheck = SAC_IDENTITY.validatePersonName(student.nom, "Nom");
    if (!nomCheck.ok) throw new Error(nomCheck.message);

    if (student.matricule) {
      const matCheck = SAC_IDENTITY.validateMatricule(
        student.matricule,
        SAC_IDENTITY.getLocalUsers(),
        emailCheck.value
      );
      if (!matCheck.ok) throw new Error(matCheck.message);
    }

    const profile = {
      role: "etudiant",
      email: emailCheck.value,
      password: student.password,
      telephone: phoneCheck.value,
      prenom: prenomCheck.value,
      nom: nomCheck.value,
      matricule: (student.matricule || "").trim() || null,
      niveau: student.niveau || "l1",
      classe: (student.classe || "").trim() || null,
      dateNaissance: student.dateNaissance || null,
      universite: actor.universite,
      filiere: actor.filiere,
      sectionId: actor.sectionId,
      payment: {
        status: "verified",
        method: "section_delegate",
        verifiedAt: new Date().toISOString(),
        verifiedBy: actor.identifiant || actor.userId,
      },
    };

    const dup = SAC_IDENTITY.checkRegistration(profile);
    if (!dup.ok) throw new Error(dup.message);

    if (typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline())) {
      await SAC_API.createSectionStudent({
        email: profile.email,
        password: student.password,
        telephone: profile.telephone,
        prenom: profile.prenom,
        nom: profile.nom,
        matricule: profile.matricule,
        niveau: profile.niveau,
        classe: profile.classe,
        dateNaissance: profile.dateNaissance,
      });
    }

    const users = SAC_IDENTITY.getLocalUsers();
    const hashed = await SAC_IDENTITY.hashPassword(student.password);
    users.push({
      ...profile,
      passwordHash: hashed,
      sectionApproval: "approved",
      sectionApprovedAt: new Date().toISOString(),
      sectionApprovedBy: actor.identifiant || actor.userId || null,
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem("sac_users", JSON.stringify(users));

    return profile;
  }

  function getStudentsForSection(sectionSession) {
    const actor =
      typeof SAC_NOMINATIONS !== "undefined"
        ? SAC_NOMINATIONS.buildSectionHeadActor(sectionSession) || sectionSession
        : sectionSession;
    const users = SAC_IDENTITY.getLocalUsers();
    const sectionId = actor.sectionId;
    const uni = actor.universite;
    const filiere = (actor.filiere || "").trim().toLowerCase();

    return users.filter((u) => {
      if (u.role !== "etudiant") return false;
      if (
        typeof SAC_SECTION_APPROVAL !== "undefined" &&
        SAC_SECTION_APPROVAL.requiresApproval(u.role) &&
        !SAC_SECTION_APPROVAL.isApproved(u)
      ) {
        return false;
      }
      if (sectionId && u.sectionId === sectionId) return true;
      if (u.universite !== uni) return false;
      const uf = (u.filiere || "").trim().toLowerCase();
      return filiere && (uf === filiere || uf.includes(filiere) || filiere.includes(uf));
    });
  }

  function getRectorForUniversity(universiteCode) {
    const code = String(universiteCode || "").trim();
    if (!code || typeof SAC_IDENTITY === "undefined") return null;
    return SAC_IDENTITY.getLocalUsers().find(
      (u) =>
        u.role === "section" &&
        (u.sectionKind === "recteur" || u.isRector === true) &&
        String(u.universite || "") === code
    );
  }

  return {
    createHeadAccount,
    createRectorAccount,
    getRectorForUniversity,
    createStudentAccount,
    getStudentsForSection,
    splitResponsableName,
  };
})();

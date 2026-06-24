/**

 * Paiements académiques — compte bancaire partenaire par université

 * Sécurité : masquage compte, verrouillage, approbation multi-administration

 */

const SAC_PAYMENTS = (function () {

  const STORAGE_KEY = "sac_academic_payments";

  const BANK_STORAGE_KEY = "sac_campus_partner_banks";



  const APPROVAL_SLOTS = [

    { key: "recteur", label: "Recteur / Direction générale", roles: ["universite"] },

    { key: "daf", label: "DAF / Finances", roles: ["universite", "professeur"] },

    { key: "scolarite", label: "Scolarité / Chef de section", roles: ["section"] },

  ];



  function uid(prefix) {

    return (

      (prefix || "PAY") +

      "-" +

      new Date().getFullYear() +

      "-" +

      String(Date.now()).slice(-6)

    );

  }



  function normEmail(v) {

    return String(v || "")

      .trim()

      .toLowerCase();

  }



  function digitsOnly(v) {

    return String(v || "").replace(/\D/g, "");

  }



  function maskAccountNumber(accountNumber) {

    const digits = digitsOnly(accountNumber);

    if (!digits) return "—";

    if (digits.length <= 8) {

      const tail = digits.slice(-Math.min(4, digits.length));

      return "X".repeat(Math.max(0, digits.length - tail.length)) + tail;

    }

    const showStart = 2;

    const showEnd = 5;

    const middle = digits.length - showStart - showEnd;

    return digits.slice(0, showStart) + "X".repeat(middle) + digits.slice(-showEnd);

  }



  function resolveCampus(code) {

    if (typeof SAC_UNIVERSITIES !== "undefined" && SAC_UNIVERSITIES.resolveId) {

      return SAC_UNIVERSITIES.resolveId(code) || code;

    }

    return String(code || "").trim().toLowerCase();

  }



  function getLocalPayments() {

    try {

      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

    } catch {

      return [];

    }

  }



  function saveLocalPayments(list) {

    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));

  }



  function getLocalPartnerBanks() {

    try {

      return JSON.parse(localStorage.getItem(BANK_STORAGE_KEY) || "{}");

    } catch {

      return {};

    }

  }



  function saveLocalPartnerBank(universite, bank) {

    const code = resolveCampus(universite);

    const all = getLocalPartnerBanks();

    all[code] = { ...bank, universite: code, updatedAt: new Date().toISOString() };

    localStorage.setItem(BANK_STORAGE_KEY, JSON.stringify(all));

    return all[code];

  }



  function getLocalPartnerBank(universite) {

    const code = resolveCampus(universite);

    return getLocalPartnerBanks()[code] || null;

  }



  function maskBankForStudent(bank) {

    if (!bank) return null;

    const out = { ...bank };

    const raw = out.accountNumber || "";

    out.accountNumberMasked = out.accountNumberMasked || maskAccountNumber(raw);

    delete out.accountNumber;

    if (out.mobileOrange) {

      out.mobileOrangeMasked = maskAccountNumber(out.mobileOrange);

      delete out.mobileOrange;

    }

    if (out.mobileMpesa) {

      out.mobileMpesaMasked = maskAccountNumber(out.mobileMpesa);

      delete out.mobileMpesa;

    }

    delete out.pendingChange;

    delete out.changeHistory;

    return out;

  }



  function findUniversityAdmin(universite) {

    let users = [];

    try {

      users = JSON.parse(localStorage.getItem("sac_users") || "[]");

    } catch {

      return null;

    }

    const code = resolveCampus(universite);

    return (

      users.find((u) => {

        if (u.role !== "universite") return false;

        const keys = [u.universite, u.universiteLocked, u.sigle, u.codeUni].filter(Boolean);

        return keys.some((k) => resolveCampus(k) === code);

      }) || null

    );

  }



  function isStudentView() {

    try {

      const s = typeof SAC_SESSION !== "undefined" ? SAC_SESSION.getSession() : null;

      return s?.role === "etudiant";

    } catch {

      return true;

    }

  }



  async function fetchPartnerBank(universite, options) {

    const opts = options || {};

    const local = getLocalPartnerBank(universite);

    if (typeof SAC_API === "undefined" || !SAC_API.getCampusPartnerBank) {

      const uni = findUniversityAdmin(universite);

      const bank = local || uni?.campusPartnerBank || null;

      return opts.forStudent || isStudentView() ? maskBankForStudent(bank) : bank;

    }

    try {

      const online = await SAC_API.ensureOnline();

      if (!online) throw new Error("offline");

      const data = await SAC_API.getCampusPartnerBank(universite);

      if (data?.bank) {

        saveLocalPartnerBank(universite, data.bank);

        return data.bank;

      }

    } catch {

      /* fallback local */

    }

    const uni = findUniversityAdmin(universite);

    const bank = local || uni?.campusPartnerBank || null;

    return opts.forStudent || isStudentView() ? maskBankForStudent(bank) : bank;

  }



  async function savePartnerBank(session, bank) {

    const code = resolveCampus(session?.universite || session?.codeUni);

    if (typeof SAC_API !== "undefined" && SAC_API.updateCampusPartnerBank) {

      try {

        const data = await SAC_API.updateCampusPartnerBank(bank);

        if (data?.bank) {

          saveLocalPartnerBank(code, data.bank);

          return data.bank;

        }

      } catch (err) {

        const msg = err.message || String(err);

        if (msg.includes("BANK_LOCKED") || msg.includes("verrouillé")) {

          throw new Error(

            "Compte verrouillé. Utilisez « Demander une modification » avec l'accord de toute l'administration."

          );

        }

        throw err;

      }

    }

    const saved = saveLocalPartnerBank(code, {

      ...bank,

      locked: true,

      registeredAt: new Date().toISOString(),

      changeCount: 0,

      maxChanges: 1,

    });

    const users = JSON.parse(localStorage.getItem("sac_users") || "[]");

    const idx = users.findIndex(

      (u) =>

        u.role === "universite" &&

        (u.email === session.identifiant || resolveCampus(u.universite) === code)

    );

    if (idx >= 0) {

      users[idx].campusPartnerBank = saved;

      localStorage.setItem("sac_users", JSON.stringify(users));

    }

    return saved;

  }



  async function requestBankChange(session, bank, reason) {

    const payload = { ...bank, reason };

    if (typeof SAC_API !== "undefined" && SAC_API.requestCampusBankChange) {

      const data = await SAC_API.requestCampusBankChange(payload);

      if (data?.bank) {

        saveLocalPartnerBank(session.universite, data.bank);

        return data.bank;

      }

    }

    const code = resolveCampus(session?.universite);

    const existing = getLocalPartnerBank(code) || {};

    existing.pendingChange = {

      newBank: { ...bank, accountNumberMasked: maskAccountNumber(bank.accountNumber) },

      reason,

      requestedBy: session.identifiant || session.email,

      requestedAt: new Date().toISOString(),

      approvals: { recteur: null, daf: null, scolarite: null },

    };

    saveLocalPartnerBank(code, existing);

    return existing;

  }



  async function approveBankChange(session, slot) {

    if (typeof SAC_API !== "undefined" && SAC_API.approveCampusBankChange) {

      const data = await SAC_API.approveCampusBankChange({ slot });

      if (data?.bank) {

        saveLocalPartnerBank(session.universite || session.universiteLocked, data.bank);

        return data;

      }

    }

    throw new Error("Approbation en ligne requise.");

  }



  function bankChangeStatus(bank) {

    if (!bank) return { configured: false, locked: false, canChange: false, pending: null };

    const changeCount = Number(bank.changeCount) || 0;

    const maxChanges = Number(bank.maxChanges) || 1;

    return {

      configured: !!(bank.bankName && (bank.accountNumber || bank.accountNumberMasked)),

      locked: !!bank.locked || !!(bank.bankName && (bank.accountNumber || bank.accountNumberMasked)),

      canChange: changeCount < maxChanges && !bank.pendingChange,

      changeCount,

      maxChanges,

      pending: bank.pendingChange || null,

      history: bank.changeHistory || [],

    };

  }



  function feeKey(fee) {

    if (fee?.feeKey) return fee.feeKey;

    if (fee?.categoryKey) return fee.categoryKey;

    if (fee?.source === "platform_inscription") return "inscription";

    if (fee?.term === "Trimestre 1") return "t1";

    if (fee?.term === "Trimestre 2") return "t2";

    if (fee?.term === "Trimestre 3") return "t3";

    return String(fee?.label || "fee").toLowerCase().replace(/\s+/g, "_");

  }



  function getStudentPayments(email, universite) {

    const key = normEmail(email);

    const campus = resolveCampus(universite);

    return getLocalPayments().filter(

      (p) => normEmail(p.studentEmail) === key && resolveCampus(p.universite) === campus

    );

  }



  async function syncStudentPayments(session) {

    if (!session || session.role !== "etudiant") return getStudentPayments(session.identifiant, session.universite);

    if (typeof SAC_API === "undefined" || !SAC_API.listMyPayments) {

      return getStudentPayments(session.identifiant, session.universite);

    }

    try {

      const online = await SAC_API.ensureOnline();

      if (!online) throw new Error("offline");

      const data = await SAC_API.listMyPayments();

      const incoming = data?.payments || [];

      if (!incoming.length) return getStudentPayments(session.identifiant, session.universite);

      const list = getLocalPayments();

      const byId = new Map(list.map((p, i) => [p.id, i]));

      incoming.forEach((p) => {

        const idx = byId.get(p.id);

        if (idx != null) list[idx] = { ...list[idx], ...p };

        else list.push(p);

      });

      saveLocalPayments(list);

    } catch {

      /* local only */

    }

    return getStudentPayments(session.identifiant, session.universite);

  }



  function applyPaymentsToFees(fees, payments) {

    const confirmed = (payments || []).filter((p) => p.status === "confirmed");

    const pending = (payments || []).filter((p) => p.status === "pending");

    return (fees || []).map((fee) => {

      const key = feeKey(fee);

      const paid = confirmed.find((p) => p.feeKey === key);

      if (paid) {

        return {

          ...fee,

          status: "Payé",

          date: (paid.confirmedAt || paid.createdAt || "").slice(0, 10) || fee.date,

          paymentId: paid.id,

          paymentRef: paid.reference,

        };

      }

      const wait = pending.find((p) => p.feeKey === key);

      if (wait) {

        return {

          ...fee,

          status: "En attente de confirmation",

          date: (wait.createdAt || "").slice(0, 10) || "—",

          paymentId: wait.id,

          paymentRef: wait.reference,

        };

      }

      return fee;

    });

  }



  function summarizeFees(fees) {

    const paid = fees

      .filter((f) => f.status === "Payé")

      .reduce((s, f) => s + Number(f.amount || 0), 0);

    const pendingConfirm = fees

      .filter((f) => f.status === "En attente de confirmation")

      .reduce((s, f) => s + Number(f.amount || 0), 0);

    const due = fees

      .filter((f) => f.status !== "Payé" && f.status !== "En attente de confirmation")

      .reduce((s, f) => s + Number(f.amount || 0), 0);

    const total = paid + pendingConfirm + due;

    return {

      total,

      paid: paid + pendingConfirm,

      due,

      confirmedPaid: paid,

      pendingPay: pendingConfirm,

    };

  }



  async function submitAcademicPayment(session, payload) {

    const email = normEmail(session?.identifiant || session?.email);

    const universite = resolveCampus(session?.universite);

    if (!email || !universite) throw new Error("Session étudiant invalide.");



    const amount = Number(payload.amount);

    if (!amount || amount <= 0) throw new Error("Montant invalide.");

    if (!payload.method) throw new Error("Choisissez un mode de paiement.");

    if (!payload.reference || String(payload.reference).trim().length < 4) {

      throw new Error("Indiquez la référence bancaire ou le numéro de transaction.");

    }

    const suffix = digitsOnly(payload.accountSuffix || "");

    if (suffix.length < 4) {

      throw new Error("Confirmez les 5 derniers chiffres du compte destinataire.");

    }



    const payment = {

      id: uid("PAY"),

      studentEmail: email,

      studentNom: payload.studentNom || session.displayName || email,

      matricule: payload.matricule || session.matricule || "—",

      universite,

      feeKey: payload.feeKey || "academic",

      feeLabel: payload.feeLabel || "Frais académiques",

      amount,

      currency: payload.currency || "USD",

      method: payload.method,

      reference: String(payload.reference).trim(),

      accountSuffix: suffix,

      status: "pending",

      createdAt: new Date().toISOString(),

      confirmedAt: null,

    };



    if (typeof SAC_API !== "undefined" && SAC_API.createAcademicPayment) {

      try {

        const online = await SAC_API.ensureOnline();

        if (online) {

          const data = await SAC_API.createAcademicPayment(payment);

          if (data?.payment) Object.assign(payment, data.payment);

        }

      } catch (err) {

        const msg = err.message || String(err);

        if (msg.includes("ACCOUNT_SUFFIX") || msg.includes("chiffres")) {

          throw new Error("Les derniers chiffres du compte ne correspondent pas. Vérifiez le compte affiché.");

        }

        if (msg.includes("BANK_NOT_CONFIGURED")) {

          throw new Error("Votre université n'a pas encore configuré son compte bancaire.");

        }

        throw err;

      }

    }



    const list = getLocalPayments();

    list.unshift(payment);

    saveLocalPayments(list);

    window.dispatchEvent(new CustomEvent("sac-payments-updated", { detail: payment }));

    return payment;

  }



  async function listCampusPayments(session) {

    const campus = resolveCampus(session?.universite);

    const local = getLocalPayments().filter((p) => resolveCampus(p.universite) === campus);

    if (typeof SAC_API !== "undefined" && SAC_API.listCampusPayments) {

      try {

        const online = await SAC_API.ensureOnline();

        if (online) {

          const data = await SAC_API.listCampusPayments();

          return data?.payments || local;

        }

      } catch {

        /* local */

      }

    }

    return local;

  }



  async function confirmPayment(session, paymentId, status) {

    const list = getLocalPayments();

    const idx = list.findIndex((p) => p.id === paymentId);

    if (idx < 0) throw new Error("Paiement introuvable.");

    const next = status === "confirmed" ? "confirmed" : "rejected";

    list[idx] = {

      ...list[idx],

      status: next,

      confirmedAt: new Date().toISOString(),

      confirmedBy: session?.identifiant || session?.email || "",

    };

    saveLocalPayments(list);



    if (typeof SAC_API !== "undefined" && SAC_API.updatePaymentStatus) {

      try {

        await SAC_API.updatePaymentStatus(paymentId, { status: next });

      } catch (err) {

        console.warn("[SAC_PAYMENTS] confirm:", err.message || err);

      }

    }

    window.dispatchEvent(new CustomEvent("sac-payments-updated"));

    return list[idx];

  }



  function methodLabel(method) {

    const map = {

      bank_usd: "Banque partenaire (USD)",

      bank_cdf: "Banque partenaire (CDF)",

      orange: "Orange Money",

      mpesa: "M-Pesa",

    };

    return map[method] || method || "—";

  }



  function statusLabel(status) {

    if (status === "confirmed") return "Confirmé";

    if (status === "rejected") return "Rejeté";

    return "En attente de confirmation";

  }



  function statusClass(status) {

    if (status === "confirmed") return "pay-status--ok";

    if (status === "rejected") return "pay-status--bad";

    return "pay-status--wait";

  }



  function feeStatusClass(status) {

    if (status === "Payé") return "fee-card__status--paid";

    if (status === "En attente de confirmation") return "fee-card__status--pending";

    return "fee-card__status--due";

  }



  function percentPaid(fees) {

    const s = summarizeFees(fees || []);

    if (!s.total) return 0;

    return Math.round((s.paid / s.total) * 10000) / 100;

  }



  function computeCampusFinancialSummary(students, payments) {

    const today = new Date().toISOString().slice(0, 10);

    let todayTotal = 0;

    let confirmedCount = 0;

    let pendingAmount = 0;

    const list = payments || [];

    list.forEach((p) => {

      if (p.status === "confirmed") {

        confirmedCount += 1;

        if ((p.confirmedAt || p.createdAt || "").slice(0, 10) === today) {

          todayTotal += Number(p.amount || 0);

        }

      } else if (p.status === "pending") {

        pendingAmount += Number(p.amount || 0);

      }

    });

    const debtors = [];

    const settled = [];

    (students || []).forEach((stu) => {

      if (stu.role !== "etudiant") return;

      let fees = stu.universityFees;

      if (!fees?.length && typeof SAC_TARIFFS !== "undefined") {

        fees = SAC_TARIFFS.buildUniversityFeesForStudent(stu, stu.campusAcademicFees);

      }

      const stuPayments = list.filter(

        (p) => normEmail(p.studentEmail) === normEmail(stu.email || stu.identifiant)

      );

      const merged = applyPaymentsToFees(fees || [], stuPayments);

      const summary = summarizeFees(merged);

      const row = {

        name: [stu.prenom, stu.nom].filter(Boolean).join(" ") || stu.email,

        email: stu.email || stu.identifiant,

        matricule: stu.matricule || "—",

        total: summary.total,

        paid: summary.paid,

        due: summary.due,

      };

      if (summary.due > 0) debtors.push(row);

      else if (summary.total > 0) settled.push(row);

    });

    return {

      todayTotal,

      confirmedCount,

      pendingAmount,

      pendingCount: list.filter((p) => p.status === "pending").length,

      studentCount: (students || []).filter((s) => s.role === "etudiant").length,

      debtors,

      settled,

    };

  }



  function accountDisplay(partnerBank) {

    if (!partnerBank) return "—";

    return (

      partnerBank.accountNumberMasked ||

      maskAccountNumber(partnerBank.accountNumber) ||

      partnerBank.accountDisplay ||

      "—"

    );

  }



  function buildBankDisplay(partnerBank, method) {

    if (!partnerBank) return null;

    if (method === "orange") {

      const phone = partnerBank.mobileOrangeMasked || partnerBank.mobileOrange;

      if (!phone) return null;

      return {

        name: "Orange Money",

        phone,

        phoneMasked: partnerBank.mobileOrangeMasked || maskAccountNumber(phone),

        currency: "CDF",

      };

    }

    if (method === "mpesa") {

      const phone = partnerBank.mobileMpesaMasked || partnerBank.mobileMpesa;

      if (!phone) return null;

      return {

        name: "M-Pesa",

        phone,

        phoneMasked: partnerBank.mobileMpesaMasked || maskAccountNumber(phone),

        currency: "CDF",

      };

    }

    const masked = accountDisplay(partnerBank);

    const currency = method === "bank_cdf" ? "CDF" : partnerBank.currency || "USD";

    if (partnerBank.accountCdf && method === "bank_cdf") {

      return {

        bank: partnerBank.accountCdf.bank || partnerBank.bankName,

        accountDisplay: partnerBank.accountCdf.accountDisplay || masked,

        beneficiary: partnerBank.accountName || partnerBank.bankName,

        currency: "CDF",

      };

    }

    return {

      bank: partnerBank.bankName || "Banque partenaire",

      accountDisplay: masked,

      beneficiary: partnerBank.accountName || "—",

      currency,

      note: partnerBank.note || "",

    };

  }



  function feeIcon(fee) {

    if (typeof SAC_TARIFFS !== "undefined" && SAC_TARIFFS.FEE_CATEGORY_DEFS) {

      const def = SAC_TARIFFS.FEE_CATEGORY_DEFS.find(

        (d) => d.key === fee.categoryKey || d.key === fee.feeKey

      );

      if (def?.icon) return def.icon;

    }

    if (fee.source === "platform_inscription") return "🏛️";

    return "💳";

  }



  return {

    APPROVAL_SLOTS,

    maskAccountNumber,

    maskBankForStudent,

    accountDisplay,

    fetchPartnerBank,

    savePartnerBank,

    requestBankChange,

    approveBankChange,

    bankChangeStatus,

    getLocalPartnerBank,

    syncStudentPayments,

    getStudentPayments,

    applyPaymentsToFees,

    summarizeFees,

    percentPaid,

    computeCampusFinancialSummary,

    submitAcademicPayment,

    listCampusPayments,

    confirmPayment,

    methodLabel,

    statusLabel,

    statusClass,

    feeStatusClass,

    buildBankDisplay,

    feeKey,

    feeIcon,

  };

})();



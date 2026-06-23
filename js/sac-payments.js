/**
 * Paiements académiques — compte bancaire partenaire par université
 */
const SAC_PAYMENTS = (function () {
  const STORAGE_KEY = "sac_academic_payments";
  const BANK_STORAGE_KEY = "sac_campus_partner_banks";

  const PLATFORM_BANKS = {
    usd: {
      bank: "UBA BANK",
      currency: "USD",
      accountDisplay: "4035 2512 8823 8967",
      accountRaw: "4035251288238967",
      beneficiary: "Smart Academy of Congo",
      note: "Dollars (USD) — frais plateforme SAC",
    },
    cdf: {
      bank: "FIRST BANK",
      currency: "CDF",
      accountDisplay: "5644 1309 0100 9439 797",
      accountRaw: "5644130901009439797",
      beneficiary: "Smart Academy of Congo",
      note: "Francs congolais (CDF)",
    },
  };

  const MOBILE_MONEY = {
    orange: {
      name: "Orange Money",
      phone: "+243 85 184 8859",
      phoneRaw: "+243851848859",
      currency: "CDF",
    },
    mpesa: {
      name: "M-Pesa",
      phone: "+243 83 247 9012",
      phoneRaw: "+243832479012",
      currency: "CDF",
    },
  };

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

  async function fetchPartnerBank(universite) {
    const local = getLocalPartnerBank(universite);
    if (typeof SAC_API === "undefined" || !SAC_API.getCampusPartnerBank) {
      const uni = findUniversityAdmin(universite);
      return local || uni?.campusPartnerBank || null;
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
    return local || uni?.campusPartnerBank || null;
  }

  async function savePartnerBank(session, bank) {
    const code = resolveCampus(session?.universite || session?.codeUni);
    const saved = saveLocalPartnerBank(code, bank);
    if (typeof SAC_API !== "undefined" && SAC_API.updateCampusPartnerBank) {
      try {
        const data = await SAC_API.updateCampusPartnerBank(bank);
        if (data?.bank) return data.bank;
      } catch (err) {
        console.warn("[SAC_PAYMENTS] savePartnerBank:", err.message || err);
      }
    }
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

  function feeKey(fee) {
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
    const due = fees
      .filter((f) => f.status !== "Payé")
      .reduce((s, f) => s + Number(f.amount || 0), 0);
    return { total: paid + due, paid, due };
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
        console.warn("[SAC_PAYMENTS] submit:", err.message || err);
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

  function buildBankDisplay(partnerBank, method) {
    if (method === "orange") return MOBILE_MONEY.orange;
    if (method === "mpesa") return MOBILE_MONEY.mpesa;
    if (method === "bank_cdf") {
      return partnerBank?.accountCdf
        ? { ...partnerBank.accountCdf, bank: partnerBank.accountCdf.bank || partnerBank.bankName }
        : PLATFORM_BANKS.cdf;
    }
    return partnerBank?.accountUsd
      ? { ...partnerBank.accountUsd, bank: partnerBank.accountUsd.bank || partnerBank.bankName }
      : partnerBank?.bankName
        ? {
            bank: partnerBank.bankName,
            accountDisplay: partnerBank.accountNumber || "—",
            accountRaw: String(partnerBank.accountNumber || "").replace(/\s/g, ""),
            beneficiary: partnerBank.accountName || partnerBank.bankName,
            currency: partnerBank.currency || "USD",
            note: partnerBank.note || "",
          }
        : PLATFORM_BANKS.usd;
  }

  return {
    PLATFORM_BANKS,
    MOBILE_MONEY,
    fetchPartnerBank,
    savePartnerBank,
    getLocalPartnerBank,
    syncStudentPayments,
    getStudentPayments,
    applyPaymentsToFees,
    summarizeFees,
    submitAcademicPayment,
    listCampusPayments,
    confirmPayment,
    methodLabel,
    statusLabel,
    statusClass,
    buildBankDisplay,
    feeKey,
  };
})();

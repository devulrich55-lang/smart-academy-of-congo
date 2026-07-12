/**
 * Mobile Money EvoSU — Orange Money, M-Pesa & Airtel Money via API (sandbox ou FlexPay)
 */
const SAC_MOBILE_MONEY = (function () {
  const PROVIDERS = {
    orange: { name: "Orange Money", icon: "🟠" },
    mpesa: { name: "M-Pesa", icon: "📱" },
    airtel: { name: "Airtel Money", icon: "🔴" },
  };

  function esc(s) {
    const el = document.createElement("div");
    el.textContent = String(s || "");
    return el.innerHTML;
  }

  function providerLabel(id) {
    return PROVIDERS[id]?.name || id || "Mobile Money";
  }

  async function apiOnline() {
    return typeof SAC_API !== "undefined" && (await SAC_API.ensureOnline());
  }

  async function initiate(payload) {
    if (typeof SAC_API !== "undefined" && SAC_API.initiateMobilePayment) {
      const online = await apiOnline();
      if (online) {
        const data = await SAC_API.initiateMobilePayment(payload);
        return data?.transaction || data;
      }
    }
    throw new Error("Connexion API requise pour le paiement mobile.");
  }

  async function getStatus(txId) {
    if (typeof SAC_API !== "undefined" && SAC_API.getMobilePaymentStatus) {
      const data = await SAC_API.getMobilePaymentStatus(txId);
      return data?.transaction || data;
    }
    throw new Error("Impossible de vérifier le paiement.");
  }

  async function confirmPin(txId, pin) {
    if (typeof SAC_API !== "undefined" && SAC_API.confirmMobilePaymentPin) {
      const data = await SAC_API.confirmMobilePaymentPin(txId, pin);
      return data?.transaction || data;
    }
    throw new Error("Confirmation impossible.");
  }

  async function pollUntilComplete(txId, options) {
    const maxMs = options?.timeoutMs || 120000;
    const interval = options?.intervalMs || 2500;
    const start = Date.now();
    while Date.now() - start < maxMs) {
      const tx = await getStatus(txId);
      if (tx.status === "completed") return tx;
      if (tx.status === "failed" || tx.status === "expired") {
        throw new Error(tx.errorMessage || "Paiement refusé ou expiré.");
      }
      if (tx.status === "awaiting_pin") return tx;
      await new Promise((r) => setTimeout(r, interval));
    }
    throw new Error("Délai dépassé — vérifiez votre téléphone ou réessayez.");
  }

  /**
   * Flux complet : initiate → PIN (sandbox) ou attente opérateur (FlexPay)
   */
  async function runFlow(options) {
    const provider = options.provider;
    const phone = options.payerPhone;
    const amountCdf = options.amountCdf;
    if (!provider || !phone || !amountCdf) {
      throw new Error("Paramètres de paiement incomplets.");
    }

    if (options.onProcessing) options.onProcessing();

    const tx = await initiate({
      provider: provider,
      payerPhone: phone,
      amountCdf: amountCdf,
      amountUsd: options.amountUsd || 0,
      purpose: options.purpose || "inscription",
      email: options.email || "",
      universite: options.universite || "",
      metadata: options.metadata || {},
    });

    if (tx.providerMode === "flexpay" || tx.status === "processing") {
      if (options.onWaitingOperator) {
        options.onWaitingOperator(tx);
      }
      return await pollUntilComplete(tx.id, options);
    }

    if (tx.status === "awaiting_pin") {
      if (options.onPinPrompt) {
        const pin = await options.onPinPrompt(tx);
        if (!pin) throw new Error("Paiement annulé.");
        const confirmed = await confirmPin(tx.id, pin);
        if (confirmed.status !== "completed") {
          throw new Error("Code PIN refusé.");
        }
        return confirmed;
      }
    }

    if (tx.status === "completed") return tx;
    return await pollUntilComplete(tx.id, options);
  }

  return {
    PROVIDERS,
    providerLabel,
    initiate,
    getStatus,
    confirmPin,
    pollUntilComplete,
    runFlow,
  };
})();

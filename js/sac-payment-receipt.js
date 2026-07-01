/**
 * Reçu de paiement académique — impression / PDF via navigateur
 */
const SAC_PAYMENT_RECEIPT = (function () {
  function esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
    return d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  function buildReceiptHtml(payment, student, universityName) {
    const status =
      typeof SAC_PAYMENTS !== "undefined"
        ? SAC_PAYMENTS.statusLabel(payment.status)
        : payment.status;
    const method =
      typeof SAC_PAYMENTS !== "undefined"
        ? SAC_PAYMENTS.methodLabel(payment.method)
        : payment.method;
    const name =
      payment.studentNom ||
      [student?.prenom, student?.nom].filter(Boolean).join(" ") ||
      payment.studentEmail ||
      "Étudiant";
    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Reçu ${esc(payment.id)}</title>
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; color: #1a2b3c; margin: 0; padding: 24px; }
    .receipt { max-width: 640px; margin: 0 auto; border: 2px solid #0c3d6e; border-radius: 12px; overflow: hidden; }
    .receipt__head { background: linear-gradient(135deg, #0c3d6e, #145a9e); color: #fff; padding: 20px 24px; }
    .receipt__head h1 { margin: 0 0 4px; font-size: 1.35rem; }
    .receipt__head p { margin: 0; opacity: 0.9; font-size: 0.9rem; }
    .receipt__body { padding: 24px; }
    .receipt__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; margin-bottom: 20px; }
    .receipt__label { font-size: 0.75rem; text-transform: uppercase; color: #5a6d7e; letter-spacing: 0.04em; }
    .receipt__value { font-size: 0.95rem; font-weight: 600; margin-top: 2px; }
    .receipt__amount { text-align: center; padding: 16px; background: #f4f7fb; border-radius: 10px; margin: 16px 0; }
    .receipt__amount strong { display: block; font-size: 1.8rem; color: #0c3d6e; }
    .receipt__foot { padding: 16px 24px; border-top: 1px dashed #e2e8f0; font-size: 0.82rem; color: #5a6d7e; }
    .status-ok { color: #0d7a4a; }
    .status-wait { color: #b45309; }
    @media print { body { padding: 0; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="receipt__head">
      <h1>Reçu de paiement académique</h1>
      <p>Evo-smartUni — ${esc(universityName || payment.universite || "")}</p>
    </div>
    <div class="receipt__body">
      <div class="receipt__grid">
        <div><div class="receipt__label">Référence</div><div class="receipt__value">${esc(payment.id)}</div></div>
        <div><div class="receipt__label">Date</div><div class="receipt__value">${formatDate(payment.confirmedAt || payment.createdAt)}</div></div>
        <div><div class="receipt__label">Étudiant</div><div class="receipt__value">${esc(name)}</div></div>
        <div><div class="receipt__label">Matricule</div><div class="receipt__value">${esc(payment.matricule || student?.matricule || "—")}</div></div>
        <div><div class="receipt__label">Frais</div><div class="receipt__value">${esc(payment.feeLabel || "Frais académiques")}</div></div>
        <div><div class="receipt__label">Mode</div><div class="receipt__value">${esc(method)}</div></div>
        <div><div class="receipt__label">Réf. bancaire</div><div class="receipt__value">${esc(payment.reference)}</div></div>
        <div><div class="receipt__label">Statut</div><div class="receipt__value ${payment.status === "confirmed" ? "status-ok" : "status-wait"}">${esc(status)}</div></div>
      </div>
      <div class="receipt__amount">
        <span class="receipt__label">Montant payé</span>
        <strong>${esc(payment.amount)} ${esc(payment.currency || "USD")}</strong>
      </div>
      <p style="font-size:0.84rem;color:#5a6d7e;margin:0;">
        Ce reçu atteste du paiement déclaré sur la plateforme EvoSU. Les fonds sont versés directement
        sur le compte bancaire partenaire de votre université.
      </p>
    </div>
    <div class="receipt__foot">
      Document généré le ${formatDate(new Date().toISOString())} — Evo-smartUni
    </div>
  </div>
  <p class="no-print" style="text-align:center;margin-top:16px;">
    <button onclick="window.print()" style="padding:10px 20px;background:#0c3d6e;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;">
      Imprimer / Enregistrer en PDF
    </button>
  </p>
</body>
</html>`;
  }

  function openReceipt(payment, student, universityName) {
    const html = buildReceiptHtml(payment, student, universityName);
    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) {
      alert("Autorisez les pop-ups pour télécharger le reçu.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  function downloadReceiptHtml(payment, student, universityName) {
    const html = buildReceiptHtml(payment, student, universityName);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (payment.id || "recu") + ".html";
    a.click();
    URL.revokeObjectURL(url);
  }

  return { buildReceiptHtml, openReceipt, downloadReceiptHtml };
})();

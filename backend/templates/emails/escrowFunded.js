function escrowFundedTemplate({ escrowId, amount, currency = 'USDC', dashboardUrl }) {
  return ({ recipient, unsubscribeUrl, fromName }) => ({
    subject: `Escrow #${escrowId} has been funded`,
    text: [
      `Hello ${recipient.name || recipient.address || 'there'},`,
      '',
      `Escrow #${escrowId} has been funded with ${amount} ${currency}. Work can now begin.`,
      `View escrow details: ${dashboardUrl}`,
      '',
      `Unsubscribe: ${unsubscribeUrl}`,
      '',
      `- ${fromName}`,
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2>Escrow funded</h2>
        <p>Hello ${recipient.name || recipient.address || 'there'},</p>
        <p>
          Escrow <strong>#${escrowId}</strong> has been funded with
          <strong>${amount} ${currency}</strong>. Work can now begin.
        </p>
        <p><a href="${dashboardUrl}">View escrow details</a></p>
        <p style="font-size: 12px; color: #6b7280;">Need fewer emails? <a href="${unsubscribeUrl}">Unsubscribe</a>.</p>
      </div>
    `,
  });
}

export default escrowFundedTemplate;

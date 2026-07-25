function escrowExpiringTemplate({ escrowId, expiresAt, hoursRemaining = 24, dashboardUrl }) {
  return ({ recipient, unsubscribeUrl, fromName }) => ({
    subject: `Escrow #${escrowId} is expiring soon`,
    text: [
      `Hello ${recipient.name || recipient.address || 'there'},`,
      '',
      `Escrow #${escrowId} will expire in approximately ${hoursRemaining} hours${expiresAt ? ` (${expiresAt})` : ''}.`,
      `Take action now to avoid losing your work: ${dashboardUrl}`,
      '',
      `Unsubscribe: ${unsubscribeUrl}`,
      '',
      `- ${fromName}`,
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2>⚠️ Escrow expiring soon</h2>
        <p>Hello ${recipient.name || recipient.address || 'there'},</p>
        <p>
          Escrow <strong>#${escrowId}</strong> will expire in approximately
          <strong>${hoursRemaining} hours</strong>${expiresAt ? ` (<em>${expiresAt}</em>)` : ''}.
        </p>
        <p>Take action now to avoid losing your work.</p>
        <p><a href="${dashboardUrl}">View escrow</a></p>
        <p style="font-size: 12px; color: #6b7280;">Need fewer emails? <a href="${unsubscribeUrl}">Unsubscribe</a>.</p>
      </div>
    `,
  });
}

export default escrowExpiringTemplate;

function newEscrowMessageTemplate({ escrowId, senderAddress, preview, dashboardUrl }) {
  return ({ recipient, unsubscribeUrl, fromName }) => ({
    subject: `New message on escrow #${escrowId}`,
    text: [
      `Hello ${recipient.name || recipient.address || 'there'},`,
      '',
      `You have a new message on escrow #${escrowId}${senderAddress ? ` from ${senderAddress}` : ''}.`,
      preview ? `"${preview}"` : '',
      `View the conversation here: ${dashboardUrl}`,
      '',
      `Unsubscribe: ${unsubscribeUrl}`,
      '',
      `- ${fromName}`,
    ]
      .filter(Boolean)
      .join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2>New message on escrow #${escrowId}</h2>
        <p>Hello ${recipient.name || recipient.address || 'there'},</p>
        <p>
          You have a new message on escrow <strong>#${escrowId}</strong>${senderAddress ? ` from <strong>${senderAddress}</strong>` : ''}.
        </p>
        ${preview ? `<p style="color: #374151;">&ldquo;${preview}&rdquo;</p>` : ''}
        <p><a href="${dashboardUrl}">View conversation</a></p>
        <p style="font-size: 12px; color: #6b7280;">Need fewer emails? <a href="${unsubscribeUrl}">Unsubscribe</a>.</p>
      </div>
    `,
  });
}

export default newEscrowMessageTemplate;

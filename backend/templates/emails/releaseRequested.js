function releaseRequestedTemplate({ escrowId, milestoneIndex, requestedBy, dashboardUrl }) {
  return ({ recipient, unsubscribeUrl, fromName }) => ({
    subject: `Release requested for escrow #${escrowId}`,
    text: [
      `Hello ${recipient.name || recipient.address || 'there'},`,
      '',
      `${requestedBy || 'Your counterparty'} has requested release of funds for milestone ${milestoneIndex} on escrow #${escrowId}.`,
      `Please review and approve or raise a dispute: ${dashboardUrl}`,
      '',
      `Unsubscribe: ${unsubscribeUrl}`,
      '',
      `- ${fromName}`,
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2>Release requested</h2>
        <p>Hello ${recipient.name || recipient.address || 'there'},</p>
        <p>
          <strong>${requestedBy || 'Your counterparty'}</strong> has requested release of funds for
          milestone <strong>${milestoneIndex}</strong> on escrow <strong>#${escrowId}</strong>.
        </p>
        <p>Please review and approve or raise a dispute.</p>
        <p><a href="${dashboardUrl}">Review milestone</a></p>
        <p style="font-size: 12px; color: #6b7280;">Need fewer emails? <a href="${unsubscribeUrl}">Unsubscribe</a>.</p>
      </div>
    `,
  });
}

export default releaseRequestedTemplate;

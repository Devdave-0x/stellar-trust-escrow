function disputeResolvedTemplate({ escrowId, clientAmount, freelancerAmount, resolvedBy, dashboardUrl }) {
  return ({ recipient, unsubscribeUrl, fromName }) => ({
    subject: `Dispute resolved for escrow #${escrowId}`,
    text: [
      `Hello ${recipient.name || recipient.address || 'there'},`,
      '',
      `The dispute for escrow #${escrowId} has been resolved${resolvedBy ? ` by ${resolvedBy}` : ''}.`,
      clientAmount ? `Client receives: ${clientAmount}` : '',
      freelancerAmount ? `Freelancer receives: ${freelancerAmount}` : '',
      `View resolution details: ${dashboardUrl}`,
      '',
      `Unsubscribe: ${unsubscribeUrl}`,
      '',
      `- ${fromName}`,
    ].filter(Boolean).join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2>Dispute resolved</h2>
        <p>Hello ${recipient.name || recipient.address || 'there'},</p>
        <p>
          The dispute for escrow <strong>#${escrowId}</strong> has been resolved${resolvedBy ? ` by <strong>${resolvedBy}</strong>` : ''}.
        </p>
        ${clientAmount ? `<p>Client receives: <strong>${clientAmount}</strong></p>` : ''}
        ${freelancerAmount ? `<p>Freelancer receives: <strong>${freelancerAmount}</strong></p>` : ''}
        <p><a href="${dashboardUrl}">View resolution details</a></p>
        <p style="font-size: 12px; color: #6b7280;">Need fewer emails? <a href="${unsubscribeUrl}">Unsubscribe</a>.</p>
      </div>
    `,
  });
}

export default disputeResolvedTemplate;

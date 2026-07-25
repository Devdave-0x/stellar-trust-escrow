function loginLockoutTemplate({ lockedUntil, unlockMinutes }) {
  return ({ recipient, unsubscribeUrl, fromName }) => ({
    subject: 'Your account was temporarily locked',
    text: [
      `Hello ${recipient.name || recipient.address || 'there'},`,
      '',
      `We locked your account for ${unlockMinutes} minutes after 5 consecutive failed login attempts.`,
      lockedUntil ? `It will unlock at ${lockedUntil}.` : '',
      `If this wasn't you, consider changing your password once the account unlocks.`,
      '',
      `Unsubscribe: ${unsubscribeUrl}`,
      '',
      `- ${fromName}`,
    ]
      .filter(Boolean)
      .join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2>Your account was temporarily locked</h2>
        <p>Hello ${recipient.name || recipient.address || 'there'},</p>
        <p>
          We locked your account for <strong>${unlockMinutes} minutes</strong> after 5 consecutive
          failed login attempts.${lockedUntil ? ` It will unlock at <strong>${lockedUntil}</strong>.` : ''}
        </p>
        <p>If this wasn't you, consider changing your password once the account unlocks.</p>
        <p style="font-size: 12px; color: #6b7280;">Need fewer emails? <a href="${unsubscribeUrl}">Unsubscribe</a>.</p>
      </div>
    `,
  });
}

export default loginLockoutTemplate;

import { render, screen, waitFor } from '@testing-library/react';
import en from '../../i18n/locales/en.json';
import { I18nProvider, useI18n } from '../../i18n';

const REQUIRED_KEYS = [
  'escrow.ownershipTransfer.title',
  'escrow.ownershipTransfer.description',
  'escrow.ownershipTransfer.fields.newOwner',
  'escrow.ownershipTransfer.actions.request',
  'escrow.ownershipTransfer.actions.accept',
  'escrow.ownershipTransfer.actions.reject',
  'escrow.ownershipTransfer.actions.cancel',
  'escrow.ownershipTransfer.status.pending',
  'escrow.ownershipTransfer.status.accepted',
  'escrow.ownershipTransfer.status.rejected',
  'escrow.ownershipTransfer.status.expired',
  'escrow.ownershipTransfer.status.cancelled',
  'escrow.ownershipTransfer.messages.requested',
  'escrow.ownershipTransfer.messages.accepted',
  'escrow.ownershipTransfer.messages.rejected',
  'escrow.ownershipTransfer.messages.expired',
  'escrow.ownershipTransfer.messages.cancelled',
  'escrow.ownershipTransfer.confirm.request',
  'escrow.ownershipTransfer.confirm.accept',
  'escrow.ownershipTransfer.confirm.reject',
  'escrow.ownershipTransfer.confirm.cancel',
  'escrow.ownershipTransfer.errors.invalidAddress',
];

const lookup = (obj, key) => key.split('.').reduce((o, k) => o?.[k], obj);

describe('ownership transfer copy', () => {
  it.each(REQUIRED_KEYS)('English locale defines %s', (key) => {
    const value = lookup(en, key);
    expect(typeof value).toBe('string');
    expect(value.trim()).not.toBe('');
  });

  it('falls back to English when a locale has no translation yet', async () => {
    window.localStorage.setItem('ste_locale', 'fr');
    function Probe() {
      const { t, locale } = useI18n();
      return (
        <span data-testid="copy" data-locale={locale}>
          {t('escrow.ownershipTransfer.status.expired')}
        </span>
      );
    }
    render(
      <I18nProvider initialLocale="fr">
        <Probe />
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('copy')).toHaveAttribute('data-locale', 'fr'));
    expect(screen.getByTestId('copy')).toHaveTextContent('Request expired');
    window.localStorage.clear();
  });
});

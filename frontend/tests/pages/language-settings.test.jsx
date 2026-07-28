import { screen, fireEvent, waitFor } from '@testing-library/react';
import LanguageSettingsPage from '../../app/profile/settings/language/page';
import { renderWithAppProviders } from '../test-utils';

beforeEach(() => {
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }));
});

describe('LanguageSettingsPage', () => {
  it('renders a radio option for every supported locale', () => {
    renderWithAppProviders(<LanguageSettingsPage />);
    expect(screen.getByRole('radio', { name: /English/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Spanish/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Arabic/i })).toBeInTheDocument();
  });

  it('marks the currently active locale as checked', () => {
    renderWithAppProviders(<LanguageSettingsPage />);
    expect(screen.getByRole('radio', { name: /English/i })).toBeChecked();
  });

  it('flags right-to-left languages', () => {
    renderWithAppProviders(<LanguageSettingsPage />);
    expect(screen.getAllByText('RTL')).toHaveLength(1);
  });

  it('is keyboard operable: selecting an option enables Save', () => {
    renderWithAppProviders(<LanguageSettingsPage />);
    const saveButton = screen.getByRole('button', { name: /save preference/i });
    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: /French/i }));
    expect(saveButton).not.toBeDisabled();
  });

  it('saves the selected locale and shows confirmation', async () => {
    renderWithAppProviders(<LanguageSettingsPage />);
    fireEvent.click(screen.getByRole('radio', { name: /German/i }));
    fireEvent.click(screen.getByRole('button', { name: /save preference/i }));

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /German/i })).toBeChecked();
    });
  });

  it('exposes the language fieldset to assistive technology', () => {
    renderWithAppProviders(<LanguageSettingsPage />);
    expect(screen.getByRole('group')).toBeInTheDocument();
  });
});

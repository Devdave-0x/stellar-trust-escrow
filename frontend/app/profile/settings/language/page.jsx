'use client';

import { useCallback, useState } from 'react';
import { useI18n } from '../../../../i18n/index.jsx';
import { locales, localeNames, isRTL } from '../../../../i18n/config.js';
import { useWallet } from '../../../../hooks/useWallet';
import { useToast } from '../../../../contexts/ToastContext';

const NATIVE_LABELS = {
  en: 'English',
  es: 'Spanish (Español)',
  fr: 'French (Français)',
  de: 'German (Deutsch)',
  ar: 'Arabic (العربية) — right-to-left',
  zh: 'Chinese (中文)',
};

function LocaleOption({ code, checked, onSelect, sampleDate, sampleAmount }) {
  const id = `locale-option-${code}`;
  return (
    <label
      htmlFor={id}
      className={`flex items-center justify-between gap-4 rounded-lg border p-4 cursor-pointer transition-colors
        focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2
        focus-within:ring-offset-white dark:focus-within:ring-offset-gray-950
        ${
          checked
            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10'
            : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
        }`}
    >
      <span className="flex items-center gap-3">
        <input
          type="radio"
          id={id}
          name="locale"
          value={code}
          checked={checked}
          onChange={() => onSelect(code)}
          className="h-4 w-4 accent-indigo-600 focus:outline-none"
        />
        <span>
          <span className="block font-medium text-gray-900 dark:text-white">
            {NATIVE_LABELS[code] || localeNames[code]}
          </span>
          <span className="block text-xs text-gray-500 dark:text-gray-400">
            {sampleDate} · {sampleAmount}
          </span>
        </span>
      </span>
      {isRTL(code) && (
        <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
          RTL
        </span>
      )}
    </label>
  );
}

export default function LanguageSettingsPage() {
  const { locale, setLocale, formatDate, formatNumber } = useI18n();
  const { address } = useWallet();
  const { showToast } = useToast();
  const [pending, setPending] = useState(locale);
  const [isSaving, setIsSaving] = useState(false);

  const handleSelect = useCallback((code) => {
    setPending(code);
  }, []);

  const handleSave = useCallback(
    async (e) => {
      e.preventDefault();
      setIsSaving(true);
      try {
        setLocale(pending);

        if (address) {
          await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'}/users/${address}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ preferences: { language: pending } }),
            },
          ).catch(() => {
            // Preference already applied locally; server sync is best-effort.
          });
        }

        showToast('Language preference saved', 'success');
      } finally {
        setIsSaving(false);
      }
    },
    [pending, address, setLocale, showToast],
  );

  const hasChanges = pending !== locale;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Language & Region</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
          Choose the language used across Trustchain Escrow. Dates and amounts update to match
          your selection.
        </p>
      </div>

      <form onSubmit={handleSave} aria-labelledby="language-settings-heading">
        <h2 id="language-settings-heading" className="sr-only">
          Select display language
        </h2>
        <fieldset className="space-y-3">
          <legend className="sr-only">Available languages</legend>
          {locales.map((code) => (
            <LocaleOption
              key={code}
              code={code}
              checked={pending === code}
              onSelect={handleSelect}
              sampleDate={formatDate(new Date(), { dateStyle: 'medium' })}
              sampleAmount={formatNumber(1234.5, { style: 'decimal', maximumFractionDigits: 2 })}
            />
          ))}
        </fieldset>

        <div
          className="mt-6 flex items-center justify-between gap-4 border-t border-gray-200 dark:border-gray-800 pt-4"
          role="status"
          aria-live="polite"
        >
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {hasChanges ? `Switching to ${localeNames[pending]}` : 'Up to date'}
          </span>
          <button
            type="submit"
            disabled={!hasChanges || isSaving}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm
                       font-medium text-white hover:bg-indigo-500 disabled:opacity-50
                       disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2
                       focus-visible:ring-indigo-500 focus-visible:ring-offset-2
                       focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950"
          >
            {isSaving ? 'Saving…' : 'Save preference'}
          </button>
        </div>
      </form>
    </div>
  );
}

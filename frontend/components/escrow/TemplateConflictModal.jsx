'use client';

import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';

/**
 * Lets the user choose, per field, whether to keep what they typed or replace
 * it with the template's value when applying a template to a partially
 * filled create-escrow form.
 *
 * @param {object}   props
 * @param {boolean}  props.isOpen
 * @param {string}   props.templateName
 * @param {{ key: string, label: string, current: string, incoming: string }[]} props.conflicts
 * @param {(choices: Record<string, 'keep'|'replace'>) => void} props.onApply
 * @param {() => void} props.onCancel
 */
export default function TemplateConflictModal({ isOpen, templateName, conflicts, onApply, onCancel }) {
  const [choices, setChoices] = useState({});

  // Default every conflicting field to "keep" so nothing is lost by accident.
  useEffect(() => {
    if (isOpen) setChoices(Object.fromEntries(conflicts.map((c) => [c.key, 'keep'])));
  }, [isOpen, conflicts]);

  const setAll = (value) => setChoices(Object.fromEntries(conflicts.map((c) => [c.key, value])));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={`Apply template: ${templateName}`}
      size="lg"
      isConfirmation
      onConfirm={() => onApply(choices)}
      confirmLabel="Apply template"
      cancelLabel="Cancel"
    >
      <p className="text-sm text-gray-400 mb-4">
        You already filled in some fields. Choose what to keep for each one.
      </p>

      <div className="flex gap-2 mb-4">
        <button type="button" className="btn-secondary text-xs" onClick={() => setAll('keep')}>
          Keep all
        </button>
        <button type="button" className="btn-secondary text-xs" onClick={() => setAll('replace')}>
          Replace all
        </button>
      </div>

      <ul className="space-y-3" aria-label="Fields changed by the template">
        {conflicts.map((conflict) => (
          <li key={conflict.key} className="rounded-lg border border-gray-800 p-3">
            <p className="text-sm font-medium text-white">{conflict.label}</p>
            <fieldset className="mt-2 space-y-1 text-sm">
              <legend className="sr-only">{conflict.label}</legend>
              <label className="flex items-start gap-2 text-gray-300">
                <input
                  type="radio"
                  name={`template-conflict-${conflict.key}`}
                  checked={choices[conflict.key] === 'keep'}
                  onChange={() => setChoices((c) => ({ ...c, [conflict.key]: 'keep' }))}
                />
                <span>
                  Keep yours: <span className="text-gray-400">{conflict.current}</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-gray-300">
                <input
                  type="radio"
                  name={`template-conflict-${conflict.key}`}
                  checked={choices[conflict.key] === 'replace'}
                  onChange={() => setChoices((c) => ({ ...c, [conflict.key]: 'replace' }))}
                />
                <span>
                  Use template: <span className="text-gray-400">{conflict.incoming}</span>
                </span>
              </label>
            </fieldset>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

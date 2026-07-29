/**
 * MilestoneForm Component
 *
 * Form for adding or editing a single milestone within an escrow.
 * Used both during escrow creation and when updating milestone details.
 *
 * @param {object}   props
 * @param {object}   [props.initialValues]         - pre-populate fields for edit mode
 * @param {string}   [props.initialValues.title]
 * @param {string}   [props.initialValues.description]
 * @param {string}   [props.initialValues.amount]
 * @param {string}   [props.currency='USDC']       - display label for the amount field
 * @param {Function} props.onSubmit                - ({ title, description, amount }) => void
 * @param {Function} [props.onCancel]              - optional cancel callback
 * @param {boolean}  [props.loading]               - disable controls while saving
 */

'use client';

import { useState } from 'react';

export default function MilestoneForm({
  initialValues = {},
  currency = 'USDC',
  onSubmit,
  onCancel,
  loading = false,
}) {
  const [title, setTitle] = useState(initialValues.title ?? '');
  const [description, setDescription] = useState(initialValues.description ?? '');
  const [amount, setAmount] = useState(initialValues.amount ?? '');
  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};
    if (!title.trim()) newErrors.title = 'Title is required.';
    if (!amount || Number(amount) <= 0) newErrors.amount = 'Amount must be a positive number.';
    return newErrors;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    onSubmit({ title: title.trim(), description: description.trim(), amount });
  };

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Milestone details"
      className="space-y-4"
      data-testid="milestone-form"
      noValidate
    >
      {/* Title */}
      <div>
        <label htmlFor="milestone-title" className="block text-sm font-medium text-white mb-1">
          Title <span aria-hidden="true" className="text-red-400">*</span>
          <span className="sr-only">(required)</span>
        </label>
        <input
          id="milestone-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Initial Design Mockups"
          aria-required="true"
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? 'milestone-title-error' : undefined}
          disabled={loading}
          className={`w-full bg-gray-800 border rounded-lg px-4 py-2.5 text-white
            placeholder-gray-500 focus:outline-none transition-colors
            ${errors.title ? 'border-red-500 focus:border-red-400' : 'border-gray-700 focus:border-indigo-500'}
            disabled:opacity-50`}
        />
        {errors.title && (
          <p id="milestone-title-error" className="mt-1 text-xs text-red-400" role="alert">
            {errors.title}
          </p>
        )}
      </div>

      {/* Description */}
      <div>
        <label htmlFor="milestone-description" className="block text-sm font-medium text-white mb-1">
          Description
        </label>
        <textarea
          id="milestone-description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what will be delivered for this milestone…"
          disabled={loading}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5
                     text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500
                     resize-none transition-colors disabled:opacity-50"
        />
      </div>

      {/* Amount */}
      <div>
        <label htmlFor="milestone-amount" className="block text-sm font-medium text-white mb-1">
          Amount ({currency}) <span aria-hidden="true" className="text-red-400">*</span>
          <span className="sr-only">(required)</span>
        </label>
        <input
          id="milestone-amount"
          type="number"
          min="0"
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          aria-required="true"
          aria-invalid={!!errors.amount}
          aria-describedby={errors.amount ? 'milestone-amount-error' : undefined}
          disabled={loading}
          className={`w-full bg-gray-800 border rounded-lg px-4 py-2.5 text-white
            placeholder-gray-500 focus:outline-none transition-colors
            ${errors.amount ? 'border-red-500 focus:border-red-400' : 'border-gray-700 focus:border-indigo-500'}
            disabled:opacity-50`}
        />
        {errors.amount && (
          <p id="milestone-amount-error" className="mt-1 text-xs text-red-400" role="alert">
            {errors.amount}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 border border-gray-600 text-gray-300
                       rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          className="flex-1 px-4 py-2.5 bg-indigo-600 text-white font-medium
                     rounded-lg hover:bg-indigo-500 transition-colors disabled:opacity-50
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          {loading ? 'Saving…' : 'Save Milestone'}
        </button>
      </div>
    </form>
  );
}

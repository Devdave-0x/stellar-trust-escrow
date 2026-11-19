/**
 * Create Escrow Page — /escrow/create
 *
 * Multi-step form to create a new escrow agreement.
 *
 * Step 1: Counterparty — enter freelancer address, token, total amount
 * Step 2: Milestones  — add milestone titles, descriptions, amounts
 * Step 3: Review      — confirm all details before signing
 * Step 4: Sign & Submit — Freighter signs, broadcast to Stellar
 *
 * TODO (contributor — hard, Issue #33):
 * - Step 1: validate Stellar address format (G..., 56 chars)
 * - Step 2: validate milestone amounts sum <= total_amount
 * - Step 3: show summary with gas estimate
 * - Step 4: build Soroban transaction with stellar-sdk
 * - Step 4: invoke Freighter signTransaction()
 * - Step 4: POST signed XDR to /api/escrows/broadcast
 * - On success: redirect to /escrow/[id]
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Button from '../../../components/ui/Button';
import CharCountTextarea from '../../../components/ui/CharCountTextarea';
import FeeEstimator from '../../../components/ui/FeeEstimator';
import TemplateSelector from '../../../components/escrow/TemplateSelector';
import TemplateConflictModal from '../../../components/escrow/TemplateConflictModal';
import { findTemplateConflicts, mergeTemplate } from '../../../lib/escrow/templateConflicts';
import StellarAddressInput from '../../../components/ui/StellarAddressInput';
import XLMAmountInput from '../../../components/ui/XLMAmountInput';
import templatesData from '../../../data/templates.json';
import { useToast } from '../../../contexts/ToastContext';
import { useWallet } from '../../../hooks/useWallet';
import {
  buildCreateEscrowWithTermsHashTx,
  broadcastTransaction,
  isValidStellarAddress,
  computeTermsHash,
  validateWalletNetwork,
} from '../../../lib/stellar';

const STEPS = [
  { id: 1, label: 'Counterparty' },
  { id: 2, label: 'Milestones' },
  { id: 3, label: 'Review' },
  { id: 4, label: 'Sign' },
];

const DEFAULT_MILESTONE = { title: '', description: '', amount: '' };

const DESCRIPTION_MIN_LENGTH = 10;

function applyTemplateToForm(currentForm, template) {
  return mergeTemplate(currentForm, template);
}

/** Returns true when the amount string represents a positive number. */
function isPositiveAmount(value) {
  const n = Number(value);
  return value !== '' && !Number.isNaN(n) && n > 0;
}

export default function CreateEscrowPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateLibrary = templatesData.templates || [];

  const { address, isConnected, signTx, network: walletNetwork } = useWallet();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    clientAddress: '',
    freelancerAddress: '',
    arbiterAddress: '',
    tokenAddress: 'usdc',
    totalAmount: '',
    briefDescription: '',
    deadline: '',
    milestones: [{ ...DEFAULT_MILESTONE }],
    termsDocument: '',
  });
  const DRAFT_STORAGE_KEY = 'escrow-create-draft-v1';
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txPhase, setTxPhase] = useState('idle');
  const [txHash, setTxHash] = useState(null);
  const [error, setError] = useState(null);
  const [termsHash, setTermsHash] = useState(null);
  const [templateNotice, setTemplateNotice] = useState('');
  // Template waiting for the user to resolve conflicts with fields they filled in.
  const [pendingTemplate, setPendingTemplate] = useState(null);
  const [appliedQueryTemplateId, setAppliedQueryTemplateId] = useState(null);

  // Touched state tracks which fields the user has interacted with
  const [touched, setTouched] = useState({ totalAmount: false, briefDescription: false });

  const { showToast } = useToast();

  useEffect(() => {
    if (!formData.termsDocument) {
      setTermsHash(null);
      return;
    }
    let cancelled = false;
    computeTermsHash(formData.termsDocument).then((hash) => {
      if (!cancelled) setTermsHash(hash);
    });
    return () => {
      cancelled = true;
    };
  }, [formData.termsDocument]);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) {
        setFormData((prev) => ({ ...prev, ...JSON.parse(saved) }));
      }
    } catch {
      // ignore corrupted drafts
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(formData));
  }, [formData]);

  useEffect(() => {
    if (address && !formData.clientAddress) {
      setFormData((data) => ({ ...data, clientAddress: address }));
    }
  }, [address, formData.clientAddress]);

  useEffect(() => {
    const templateId = searchParams.get('template');
    if (!templateId || templateId === appliedQueryTemplateId) {
      return;
    }

    const template = templateLibrary.find((item) => item.id === templateId);
    if (!template) {
      return;
    }

    setFormData((previous) => applyTemplateToForm(previous, template));
    setCurrentStep(1);
    setTemplateNotice(`Applied template: ${template.name}`);
    setAppliedQueryTemplateId(templateId);
  }, [searchParams, templateLibrary, appliedQueryTemplateId]);

  // Touched state is left as is, so validation errors stay visible after the
  // template is merged.
  const commitTemplate = (template, choices) => {
    setFormData((previous) => mergeTemplate(previous, template, choices));
    setCurrentStep(1);
    setTemplateNotice(`Applied template: ${template.name}`);
  };

  const handleApplyTemplate = (template) => {
    const conflicts = findTemplateConflicts(formData, template);
    if (conflicts.length === 0) {
      commitTemplate(template);
      return;
    }
    setPendingTemplate({ template, conflicts });
  };

  const participantErrors = (() => {
    const errors = {};
    if (formData.clientAddress && !isValidStellarAddress(formData.clientAddress)) {
      errors.clientAddress = 'Client address is invalid.';
    }
    if (formData.freelancerAddress && !isValidStellarAddress(formData.freelancerAddress)) {
      errors.freelancerAddress = 'Freelancer address is invalid.';
    }
    if (formData.arbiterAddress && !isValidStellarAddress(formData.arbiterAddress)) {
      errors.arbiterAddress = 'Arbiter address is invalid.';
    }
    const participants = [
      formData.clientAddress,
      formData.freelancerAddress,
      formData.arbiterAddress,
    ].filter(Boolean);
    const unique = new Set(participants);
    if (unique.size !== participants.length) {
      errors.participants = 'Participant addresses must be unique.';
    }
    return errors;
  })();

  const canSubmit =
    isConnected &&
    isValidStellarAddress(formData.clientAddress) &&
    isValidStellarAddress(formData.freelancerAddress) &&
    isPositiveAmount(formData.totalAmount) &&
    Object.keys(participantErrors).length === 0;

  const handleSubmit = async () => {
    if (!canSubmit) {
      setError('Fix validation errors before submitting.');
      return;
    }
    if (!isConnected || !address) {
      setError('Connect your wallet before submitting.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setTxPhase('simulating');
    setTxHash(null);

    try {
      const check = validateWalletNetwork(walletNetwork || process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet');
      if (!check.ok) throw new Error(check.error);

      const briefHash = termsHash ?? (await computeTermsHash(formData.briefDescription || 'escrow'));
      const unsignedXdr = await buildCreateEscrowWithTermsHashTx({
        sourceAddress: formData.clientAddress || address,
        freelancerAddress: formData.freelancerAddress,
        tokenAddress: process.env.NEXT_PUBLIC_USDC_CONTRACT || formData.tokenAddress,
        amount: String(Math.round(Number(formData.totalAmount) * 1e7)),
        briefHash,
        termsHash: termsHash ?? undefined,
        arbiter: formData.arbiterAddress || null,
        deadline: formData.deadline ? Math.floor(new Date(formData.deadline).getTime() / 1000) : null,
      });

      setTxPhase('signing');
      const signedXdr = await signTx(unsignedXdr);
      setTxPhase('submitting');
      const result = await broadcastTransaction(signedXdr);
      setTxPhase(result.status === 'SUCCESS' ? 'confirmed' : 'pending');
      setTxHash(result.hash || result.txHash);
      if (result.escrowId) {
        sessionStorage.removeItem(DRAFT_STORAGE_KEY);
        router.push(`/escrow/${result.escrowId}`);
      }
    } catch (err) {
      const message = err.message || 'Failed to create escrow';
      const rejected =
        message.toLowerCase().includes('user') || message.toLowerCase().includes('reject');
      setTxPhase(rejected ? 'wallet_rejected' : 'simulation_failed');
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addMilestone = () => {
    setFormData((data) => ({
      ...data,
      milestones: [...data.milestones, { ...DEFAULT_MILESTONE }],
    }));
  };

  const removeMilestone = (index) => {
    setFormData((data) => {
      const nextMilestones = data.milestones.filter(
        (_, milestoneIndex) => milestoneIndex !== index,
      );
      return {
        ...data,
        milestones: nextMilestones.length > 0 ? nextMilestones : [{ ...DEFAULT_MILESTONE }],
      };
    });
  };

  const updateMilestone = (index, field, value) => {
    setFormData((data) => ({
      ...data,
      milestones: data.milestones.map((milestone, milestoneIndex) =>
        milestoneIndex === index ? { ...milestone, [field]: value } : milestone,
      ),
    }));
  };

  // Validation errors (only shown after field is touched)
  const amountError =
    touched.totalAmount && formData.totalAmount !== '' && !isPositiveAmount(formData.totalAmount)
      ? 'Amount must be a positive number.'
      : null;

  const descriptionError =
    touched.briefDescription &&
    formData.briefDescription.length > 0 &&
    formData.briefDescription.length < DESCRIPTION_MIN_LENGTH
      ? `Description must be at least ${DESCRIPTION_MIN_LENGTH} characters.`
      : null;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Create New Escrow</h1>
        <p className="text-gray-400 mt-1">Lock funds and define milestones for your project.</p>
      </div>

      <TemplateSelector
        baseTemplates={templateLibrary}
        formData={formData}
        onApplyTemplate={handleApplyTemplate}
        compact
      />

      {templateNotice && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-emerald-300 text-sm">
          {templateNotice}
        </div>
      )}

      {/* Step Indicator */}
      <nav aria-label="Progress">
        <ol className="flex items-center gap-2">
          {STEPS.map((step, i) => (
            <li key={step.id} className="flex items-center gap-2">
              <div
                aria-current={currentStep === step.id ? 'step' : undefined}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                ${
                  currentStep >= step.id ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-500'
                }`}
              >
                <span aria-label={`Step ${step.id}: ${step.label}`}>{step.id}</span>
              </div>
              <span
                className={`text-sm hidden sm:inline
                ${currentStep >= step.id ? 'text-white' : 'text-gray-500'}`}
              >
                {step.label}
              </span>
              {i < STEPS.length - 1 && (
                <div className="w-8 h-px bg-gray-700 mx-1" aria-hidden="true" />
              )}
            </li>
          ))}
        </ol>
      </nav>

      <TemplateConflictModal
        isOpen={Boolean(pendingTemplate)}
        templateName={pendingTemplate?.template.name ?? ''}
        conflicts={pendingTemplate?.conflicts ?? []}
        onApply={(choices) => {
          commitTemplate(pendingTemplate.template, choices);
          setPendingTemplate(null);
        }}
        onCancel={() => setPendingTemplate(null)}
      />

      {/* Step Content */}
      <div className="card space-y-6">
        {currentStep === 1 && (
          <StepCounterparty
            formData={formData}
            setFormData={setFormData}
            setTouched={setTouched}
            amountError={amountError}
            descriptionError={descriptionError}
          />
        )}        {currentStep === 2 && (
          <StepMilestones
            formData={formData}
            onAdd={addMilestone}
            onRemove={removeMilestone}
            onUpdate={updateMilestone}
          />
        )}
        {currentStep === 3 && (
          <StepReview formData={formData} termsHash={termsHash} network={process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet'} />
        )}
        {currentStep === 4 && (
          <StepSign
            formData={formData}
            txPhase={txPhase}
            txHash={txHash}
            isSubmitting={isSubmitting}
            error={error}
            network={process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet'}
          />
        )}
      </div>

      {/* Navigation */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <Button
          variant="secondary"
          onClick={() => setCurrentStep((step) => Math.max(1, step - 1))}
          disabled={currentStep === 1}
        >
          Back
        </Button>
        {currentStep < 4 ? (
          <Button variant="primary" onClick={() => setCurrentStep((step) => step + 1)}>
            Next →
          </Button>
        ) : (
          <Button variant="primary" onClick={handleSubmit} isLoading={isSubmitting} disabled={!canSubmit}>
            Sign & Create Escrow
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Step Sub-components ───────────────────────────────────────────────────────

/**
 * Step 1: Enter counterparty details.
 */
function StepCounterparty({ formData, setFormData, setTouched, amountError, descriptionError }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Counterparty & Funds</h2>

      <StellarAddressInput
        id="client-address"
        label="Client Stellar Address"
        placeholder="GABCD1234..."
        value={formData.clientAddress}
        onChange={(val) => setFormData((data) => ({ ...data, clientAddress: val }))}
        required
      />

      <StellarAddressInput
        id="freelancer-address"
        label="Freelancer Stellar Address"
        placeholder="GABCD1234..."
        value={formData.freelancerAddress}
        onChange={(val) => setFormData((data) => ({ ...data, freelancerAddress: val }))}
        required
      />

      <StellarAddressInput
        id="arbiter-address"
        label="Arbiter Stellar Address (optional)"
        placeholder="GABCD1234..."
        value={formData.arbiterAddress}
        onChange={(val) => setFormData((data) => ({ ...data, arbiterAddress: val }))}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="token" className="block text-sm text-gray-400 mb-1">
            Token
          </label>
          <select
            id="token"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white"
            value={formData.tokenAddress}
            onChange={(event) =>
              setFormData((data) => ({ ...data, tokenAddress: event.target.value }))
            }
          >
            <option value="usdc">USDC</option>
            <option value="xlm">XLM</option>
            <option value="custom">Custom…</option>
          </select>
        </div>
        <div>
          <label htmlFor="total-amount" className="block text-sm text-gray-400 mb-1">
            Total Amount
          </label>
          <XLMAmountInput
            id="total-amount"
            value={formData.totalAmount}
            onChange={(event) => {
              setFormData((data) => ({ ...data, totalAmount: event.target.value }));
              setTouched((t) => ({ ...t, totalAmount: true }));
            }}
            onBlur={() => setTouched((t) => ({ ...t, totalAmount: true }))}
            error={amountError}
            errorId="total-amount-error"
          />
        </div>
      </div>

      <div>
        <label htmlFor="brief-description" className="block text-sm text-gray-400 mb-1">
          Project Brief <span className="text-gray-600">(optional)</span>
        </label>
        <CharCountTextarea
          id="brief-description"
          rows={3}
          placeholder="Briefly describe the project scope and deliverables…"
          maxLength={2000}
          className={`w-full bg-gray-800 border rounded-lg px-4 py-2.5
                     text-white placeholder-gray-500 focus:outline-none resize-none transition-colors
                     ${descriptionError ? 'border-red-500 focus:border-red-400' : 'border-gray-700 focus:border-indigo-500'}`}
          value={formData.briefDescription}
          aria-invalid={!!descriptionError}
          aria-describedby={descriptionError ? 'brief-description-error' : undefined}
          onChange={(event) => {
            setFormData((data) => ({ ...data, briefDescription: event.target.value }));
            setTouched((t) => ({ ...t, briefDescription: true }));
          }}
          onBlur={() => setTouched((t) => ({ ...t, briefDescription: true }))}
        />
        {descriptionError && (
          <p id="brief-description-error" className="mt-1 text-xs text-red-400" role="alert">
            {descriptionError}
          </p>
        )}
        {/* TODO (contributor): upload to IPFS and store hash */}
      </div>

      <div>
        <label htmlFor="terms-document" className="block text-sm text-gray-400 mb-1">
          Terms Document
        </label>
        <CharCountTextarea
          id="terms-document"
          rows={5}
          placeholder="Paste the full text of your off-chain agreement here. A SHA-256 hash will be stored on-chain as a tamper-evident binding."
          maxLength={50000}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5
                     text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none
                     text-sm transition-colors"
          value={formData.termsDocument}
          onChange={(event) =>
            setFormData((data) => ({ ...data, termsDocument: event.target.value }))
          }
        />
        <p className="mt-1 text-xs text-gray-600">
          The document text is never sent to any server — only the SHA-256 hash is stored on-chain.
        </p>
      </div>
    </div>
  );
}

/**
 * Step 2: Define milestones.
 */
function StepMilestones({ formData, onAdd, onRemove, onUpdate }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Milestones</h2>
        <span className="text-sm text-gray-500">
          Total:{' '}
          {formData.milestones.reduce((sum, milestone) => sum + Number(milestone.amount || 0), 0)} /{' '}
          {formData.totalAmount || '—'} {String(formData.tokenAddress || 'USDC').toUpperCase()}
        </span>
      </div>

      {formData.milestones.map((milestone, index) => (
        <div key={index} className="bg-gray-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-300">Milestone {index + 1}</span>
            {formData.milestones.length > 1 && (
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="text-red-400 text-sm hover:text-red-300"
              >
                Remove
              </button>
            )}
          </div>
          <input
            type="text"
            placeholder="Title (e.g. Initial Design Mockups)"
            aria-label={`Milestone ${index + 1} title`}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2
                       text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
            value={milestone.title}
            onChange={(event) => onUpdate(index, 'title', event.target.value)}
          />
          <CharCountTextarea
            rows={2}
            placeholder="Milestone description"
            aria-label={`Milestone ${index + 1} description`}
            maxLength={1000}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2
                       text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 resize-none"
            value={milestone.description}
            onChange={(event) => onUpdate(index, 'description', event.target.value)}
          />
          <div className="flex gap-2 items-center">
            <XLMAmountInput
              value={milestone.amount}
              placeholder="Amount"
              aria-label={`Milestone ${index + 1} amount`}
              onChange={(event) => onUpdate(index, 'amount', event.target.value)}
              inputClassName="w-32"
              className="w-32"
            />
            <span className="text-gray-500 text-sm">
              {String(formData.tokenAddress || 'USDC').toUpperCase()}
            </span>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={onAdd}
        className="w-full border border-dashed border-gray-700 rounded-lg py-3
                   text-gray-500 hover:text-gray-400 hover:border-gray-600 text-sm transition-colors"
      >
        + Add Milestone
      </button>
    </div>
  );
}

/**
 * Step 3: Review summary before signing.
 */
function StepReview({ formData, termsHash, network }) {
  const token = String(formData.tokenAddress || 'USDC').toUpperCase();

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Review Details</h2>
      <div className="bg-gray-800 rounded-lg p-4 text-sm text-gray-400 space-y-2">
        <p>
          Network: <span className="text-white">{network}</span>
        </p>
        <p>
          Client: <span className="text-white">{formData.clientAddress || '—'}</span>
        </p>
        <p>
          Freelancer: <span className="text-white">{formData.freelancerAddress || '—'}</span>
        </p>
        {formData.arbiterAddress && (
          <p>
            Arbiter: <span className="text-white">{formData.arbiterAddress}</span>
          </p>
        )}
        <p>
          Total Amount:{' '}
          <span className="text-white">
            {formData.totalAmount || '—'} {token}
          </span>
        </p>
        <p>
          Milestones: <span className="text-white">{formData.milestones.length}</span>
        </p>
        {termsHash && (
          <div>
            <p className="mb-1">Terms Hash (SHA-256):</p>
            <code className="block break-all text-xs text-indigo-300 bg-gray-900 rounded px-2 py-1 font-mono">
              {termsHash}
            </code>
            <p className="mt-1 text-xs text-gray-600">
              This hash will be stored immutably on-chain, binding the escrow to your terms document.
            </p>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500">
        ⚠️ By proceeding, you authorize locking{' '}
        <strong className="text-white">
          {formData.totalAmount || '0'} {token}
        </strong>{' '}
        in the escrow contract. This action cannot be undone without mutual agreement.
      </p>
    </div>
  );
}

/**
 * Step 4: Sign with Freighter.
 * TODO (contributor — Issue #33): build and sign the Soroban transaction
 */
function StepSign({ formData, txPhase, txHash, isSubmitting, error, network }) {
  const token = String(formData.tokenAddress || 'USDC').toUpperCase();
  const phaseLabel = {
    idle: 'Ready to simulate, sign, and submit.',
    simulating: 'Simulating contract call…',
    signing: 'Waiting for wallet approval…',
    submitting: 'Submitting signed transaction…',
    pending: 'Transaction pending confirmation…',
    confirmed: 'Transaction confirmed on ledger.',
    wallet_rejected: 'Wallet rejected the transaction. Your form inputs were preserved.',
    simulation_failed: 'Simulation failed. You can fix inputs and retry.',
  }[txPhase];

  return (
    <div className="space-y-4 text-center">
      <h2 className="text-lg font-semibold text-white">Sign & Submit</h2>
      <div
        className="bg-gray-800 rounded-lg p-4 text-left text-sm text-gray-300 space-y-1"
        aria-live="polite"
      >
        <p>
          Network: <span className="text-white">{network}</span>
        </p>
        <p>
          Token / amount:{' '}
          <span className="text-white">
            {formData.totalAmount || '0'} {token}
          </span>
        </p>
      </div>
      <p className="text-gray-400 text-sm">{phaseLabel}</p>
      <div className="mx-auto max-w-md">
        <FeeEstimator className="mt-4" />
      </div>
      {txHash && (
        <p className="text-xs text-emerald-300 font-mono break-all" data-testid="tx-hash">
          Ledger tx: {txHash}
        </p>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm" role="alert">
          {error}
        </div>
      )}
      {isSubmitting && (
        <p className="text-xs text-gray-500" aria-live="polite">
          Please keep this tab open while the transaction is processing.
        </p>
      )}
    </div>
  );
}
